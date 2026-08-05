import type { GameState, MatchEvent } from '../../src/types.js';
import { SHOP_ITEM_BY_ID } from '../../src/shop/shopCatalog.js';
import type { DriverObservation, InputDriver } from './inputDriver.js';
import type { PlayerFixture } from './fixtures.js';
import { RulesBot, type ObservationMode } from './rulesBot.js';
import { defaultObservationProjector } from './observationProjector.js';
import { Scenario, type PlayerMetrics, type ScenarioReport } from './scenario.js';

export type BotShopPolicy = (observation: DriverObservation) => { openShop?: boolean; purchaseItemId?: string } | null;

export interface PairedRunnerConfig {
  seed: number;
  ticks?: number;
  playerIds?: readonly string[];
  players?: Record<string, PlayerFixture>;
  drivers?: Record<string, InputDriver>;
  botModes?: Record<string, ObservationMode>;
  shopPolicies?: Record<string, BotShopPolicy>;
  enableShop?: boolean;
  enableGarbage?: boolean;
}

export interface PurchaseRecord {
  tick: number;
  playerId: string;
  itemId: string;
  accepted: boolean;
  cost?: number;
}

export interface PairedRunnerReport {
  seed: number;
  ticks: number;
  status: GameState['status'];
  winnerId: string | null;
  metrics: Record<string, PlayerMetrics>;
  purchases: PurchaseRecord[];
  events: MatchEvent[];
  walletHistory: Record<string, number[]>;
  scenarioReport: ScenarioReport;
}

/** Pre-built shop policy: opens shop when score >= minScore and buys targetItem when ready/cycling. */
export function createSimpleShopPolicy(targetItem: string, minScore = 50): BotShopPolicy {
  return (obs: DriverObservation) => {
    const player = obs.player.player;
    if (player.score < minScore) return null;
    if (player.shop.phase === 'ready') {
      return { openShop: true };
    }
    if (player.shop.phase === 'cycling') {
      return { purchaseItemId: targetItem };
    }
    return null;
  };
}

export class PairedRunner {
  private readonly scenario: Scenario;
  private readonly playerIds: string[];
  private readonly shopPolicies: Record<string, BotShopPolicy>;
  private readonly purchases: PurchaseRecord[] = [];
  private readonly walletHistory: Record<string, number[]>;

  constructor(config: PairedRunnerConfig) {
    this.playerIds = config.playerIds ? [...config.playerIds] : ['p1', 'p2'];
    const drivers: Record<string, InputDriver> = { ...config.drivers };

    for (const id of this.playerIds) {
      if (!drivers[id]) {
        const mode = config.botModes?.[id] ?? 'omniscient';
        drivers[id] = new RulesBot({ mode });
      }
    }

    this.shopPolicies = config.shopPolicies ?? {};

    this.scenario = new Scenario({
      seed: config.seed,
      playerIds: this.playerIds,
      players: config.players,
      drivers,
      enableShop: config.enableShop ?? true,
      enableGarbage: config.enableGarbage ?? true,
    });
    this.walletHistory = Object.fromEntries(this.playerIds.map((id) => [id, []]));
  }

  public run(ticks = 300): PairedRunnerReport {
    for (let t = 0; t < ticks; t++) {
      const stateBefore = this.scenario.getReport().gameState;
      if (stateBefore.status !== 'playing') break;

      for (const id of this.playerIds) {
        this.walletHistory[id].push(this.scenario.getPlayerState(id).score);
      }

      // Evaluate shop policy before tick
      for (const id of this.playerIds) {
        const policy = this.shopPolicies[id];
        if (policy) {
          const obs = {
            tick: stateBefore.tick,
            player: defaultObservationProjector.project(stateBefore, id, 'omniscient'),
          };
          const decision = policy(obs);
          if (decision?.openShop) {
            this.scenario.openShop(id);
          }
          if (decision?.purchaseItemId) {
            const accepted = this.scenario.purchase(id, decision.purchaseItemId);
            this.purchases.push({
              tick: stateBefore.tick,
              playerId: id,
              itemId: decision.purchaseItemId,
              accepted,
              cost: SHOP_ITEM_BY_ID.get(decision.purchaseItemId)?.cost,
            });
          }
        }
      }

      this.scenario.advance(1);
    }

    const report = this.scenario.getReport();

    return {
      seed: report.seed,
      ticks: report.finalTick,
      status: report.status,
      winnerId: report.winnerId,
      metrics: report.metrics,
      purchases: [...this.purchases],
      events: report.events,
      walletHistory: Object.fromEntries(
        Object.entries(this.walletHistory).map(([id, values]) => [id, [...values]]),
      ),
      scenarioReport: report,
    };
  }
}
