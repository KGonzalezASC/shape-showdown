import type { ActionType, GameState, InputState, MatchEvent, PlayerState } from '../../src/types.js';
import { createPlayerRngChannels, type RngChannels } from '../../src/rng.js';
import { makePlayer } from '../puzzleEngine/engine.js';
import { matchStep } from '../puzzleEngine/matchStep.js';
import { applyShopPurchase, openPlayerShop } from '../shop.js';
import { SHOP_ITEM_BY_ID } from '../../src/shop/shopCatalog.js';
import { getPricingView } from '../../src/shop/shopPricing.js';
import { clonePlayer, type InputDriver } from './inputDriver.js';
import { defaultObservationProjector, type ObservationMode } from './observationProjector.js';
import type { PlayerFixture } from './fixtures.js';

export interface ScenarioConfig {
  seed: number;
  playerIds?: readonly string[];
  players?: Record<string, PlayerFixture>;
  drivers?: Record<string, InputDriver>;
  enableShop?: boolean;
  enableGarbage?: boolean;
}

export interface PlayerMetrics {
  score: number;
  linesCleared: number;
  topOut: boolean;
  pendingGarbageLines: number;
}

export interface ScenarioCommandRecord {
  tick: number;
  playerId: string;
  kind: 'input' | 'action' | 'openShop' | 'purchase' | 'fixture';
  detail?: unknown;
  accepted?: boolean;
}

export interface ScenarioReport {
  seed: number;
  finalTick: number;
  status: GameState['status'];
  winnerId: string | null;
  metrics: Record<string, PlayerMetrics>;
  events: MatchEvent[];
  commandRecords: ScenarioCommandRecord[];
  gameState: GameState;
}

export class Scenario {
  private readonly gameState: GameState;
  private readonly rngChannelsByPlayer = new Map<string, RngChannels>();
  private readonly drivers: Record<string, InputDriver>;
  private readonly enableShop: boolean;
  private readonly enableGarbage: boolean;
  private readonly events: MatchEvent[] = [];
  private readonly commandRecords: ScenarioCommandRecord[] = [];

  constructor(config: ScenarioConfig) {
    const playerIds = config.playerIds ?? ['p1', 'p2'];
    if (playerIds.length !== 2) {
      throw new Error(`Scenario harness currently requires exactly 2 players, got ${playerIds.length}`);
    }

    this.drivers = config.drivers ?? {};
    this.enableShop = config.enableShop ?? true;
    this.enableGarbage = config.enableGarbage ?? true;

    const players: Record<string, PlayerState> = {};
    playerIds.forEach((id, index) => {
      const channels = createPlayerRngChannels(config.seed, index);
      this.rngChannelsByPlayer.set(id, channels);
      const player = makePlayer(id, channels);
      if (config.players?.[id]) {
        config.players[id](player);
      }
      players[id] = player;
    });

    this.gameState = {
      players,
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 0,
      seed: config.seed,
    };
  }

  public get playerIds(): string[] {
    return Object.keys(this.gameState.players);
  }

  public get tick(): number {
    return this.gameState.tick;
  }

  public getPlayerState(playerId: string): PlayerState {
    const player = this.gameState.players[playerId];
    if (!player) throw new Error(`Player ${playerId} not found in scenario`);
    return player;
  }

  public setPlayer(playerId: string, fixture: PlayerFixture): void {
    const player = this.getPlayerState(playerId);
    fixture(player);
    this.commandRecords.push({
      tick: this.gameState.tick,
      playerId,
      kind: 'fixture',
    });
  }

  public input(playerId: string, inputState: InputState): void {
    const player = this.getPlayerState(playerId);
    player.inputState = {
      left: !!inputState.left,
      right: !!inputState.right,
      softDrop: !!inputState.softDrop,
    };
    this.commandRecords.push({
      tick: this.gameState.tick,
      playerId,
      kind: 'input',
      detail: player.inputState,
    });
  }

  public action(playerId: string, action: ActionType): void {
    const player = this.getPlayerState(playerId);
    player.actionQueue.push(action);
    this.commandRecords.push({
      tick: this.gameState.tick,
      playerId,
      kind: 'action',
      detail: action,
    });
  }

  public openShop(playerId: string): boolean {
    const player = this.getPlayerState(playerId);
    const accepted = openPlayerShop(player, this.gameState.tick);
    this.commandRecords.push({
      tick: this.gameState.tick,
      playerId,
      kind: 'openShop',
      accepted,
    });
    return accepted;
  }

  public purchase(
    playerId: string,
    itemId: string,
    options?: { overrideCost?: number; bypassAffordabilityCheck?: boolean },
  ): boolean {
    const buyer = this.getPlayerState(playerId);
    const opponentId = this.playerIds.find((id) => id !== playerId);
    const opponent = opponentId ? this.gameState.players[opponentId] : null;
    const channels = this.rngChannelsByPlayer.get(playerId);
    if (!channels) throw new Error(`No RNG channels for player ${playerId}`);

    const catalogItem = SHOP_ITEM_BY_ID.get(itemId);
    const actualCost = options?.overrideCost !== undefined
      ? Math.max(0, options.overrideCost)
      : catalogItem
        ? getPricingView(itemId, buyer.shop.pricing?.[itemId], this.gameState.tick).currentPrice
        : undefined;
    const accepted = applyShopPurchase(this.gameState, buyer, opponent, itemId, channels.shop, options);
    this.commandRecords.push({
      tick: this.gameState.tick,
      playerId,
      kind: 'purchase',
      detail: { itemId, overrideCost: options?.overrideCost, cost: actualCost },
      accepted,
    });
    return accepted;
  }

  public advance(ticks = 1): ScenarioReport {
    if (ticks <= 0 || !Number.isInteger(ticks)) {
      throw new Error(`advance() expects a positive integer number of ticks, got ${ticks}`);
    }

    for (let t = 0; t < ticks; t++) {
      if (this.gameState.status !== 'playing') break;

      for (const id of this.playerIds) {
        const driver = this.drivers[id];
        if (driver) {
          const mode: ObservationMode = driver.observationMode ?? 'omniscient';
          const playerObs = defaultObservationProjector.project(this.gameState, id, mode);
          const driverTick = mode === 'player-limited' ? 0 : this.gameState.tick;
          const cmd = driver.next({
            tick: driverTick,
            replayTick: this.gameState.tick,
            player: playerObs,
          });

          const rawPlayer = this.gameState.players[id];
          if (cmd.inputState) {
            rawPlayer.inputState = {
              left: !!cmd.inputState.left,
              right: !!cmd.inputState.right,
              softDrop: !!cmd.inputState.softDrop,
            };
          }
          if (cmd.actions && cmd.actions.length > 0) {
            rawPlayer.actionQueue.push(...cmd.actions);
          }
        }
      }

      const stepRes = matchStep(this.gameState, this.rngChannelsByPlayer, {
        enableShop: this.enableShop,
        enableGarbage: this.enableGarbage,
      });

      this.events.push(...stepRes.events);

      if (stepRes.matchEnded) {
        break;
      }
    }

    return this.getReport();
  }

  public getReport(): ScenarioReport {
    const metrics: Record<string, PlayerMetrics> = {};
    for (const id of this.playerIds) {
      const p = this.gameState.players[id];
      metrics[id] = {
        score: p.score,
        linesCleared: p.linesCleared,
        topOut: p.topOut,
        pendingGarbageLines: p.pendingGarbage.reduce((sum, pack) => sum + pack.lines, 0),
      };
    }

    return {
      seed: this.gameState.seed,
      finalTick: this.gameState.tick,
      status: this.gameState.status,
      winnerId: this.gameState.winnerId,
      metrics,
      events: [...this.events],
      commandRecords: [...this.commandRecords],
      gameState: JSON.parse(JSON.stringify(this.gameState)),
    };
  }
}
