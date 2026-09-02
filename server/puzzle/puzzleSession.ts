import type { ActionType, GameState, InputState, MatchEvent, PlayerState } from '../../src/types.js';
import { createPlayerRngChannels, type RngChannels } from '../../src/rng.js';
import { makePlayer } from '../puzzleEngine/engine.js';
import { matchStep } from '../puzzleEngine/matchStep.js';
import { clonePlayer, type InputDriver } from '../testHarness/inputDriver.js';
import { defaultObservationProjector } from '../testHarness/observationProjector.js';
import type { HazardKind, PuzzleGoal, PuzzleLevel, PuzzleAttempt, TimelineEvent } from './puzzleTypes.js';
import { assertSupportedPuzzleTimeline } from './puzzleHazards.js';
import { materializeTimeline } from './puzzleTimeline.js';
import { applyScriptedShopAttack } from '../shop.js';
import { applyBomberToBuyer } from '../puzzleEngine/engine.js';
import { ensureWildcardIncomingEffect, pushFieldEffect } from '../../src/shop/fieldEffects.js';
import {
  GARBAGE_ARRIVAL_DELAY_TICKS,
} from '../../src/constants.js';

/**
 * Single-player puzzle session: a deterministic scenario with one player, a
 * scripted hazard timeline standing in for the missing opponent, and a level
 * goal checked per tick.
 *
 * Reuses the Scenario harness pattern (drivers → observation → matchStep) but
 * runs a single player with no opponent, no incoming garbage, and the shop
 * gated by the level's shopPolicy.
 */

/** Command record for the attempt (replay-friendly, mirrors Scenario). */
export interface PuzzleCommandRecord {
  tick: number;
  kind: 'input' | 'action';
  detail?: unknown;
}

export interface PuzzleSessionReport extends PuzzleAttempt {
  seed: number;
  finalTick: number;
  events: MatchEvent[];
  commandRecords: PuzzleCommandRecord[];
  gameState: GameState;
}

export interface PuzzleSessionConfig {
  level: PuzzleLevel;
  driver: InputDriver;
  /** Safety cap on total ticks simulated (default 60s @ 60Hz). */
  maxTicks?: number;
}

/** Apply one scripted hazard to the player (mirrors shop attack semantics).
 *  Returns false only for wildcard when the spread-before-shape gate blocks apply
 *  (caller should defer and retry).
 */
function applyHazard(player: PlayerState, kind: HazardKind, params: Record<string, unknown> | undefined, tick: number): boolean {
  const p = params ?? {};
  switch (kind) {
    case 'poison':
      applyScriptedShopAttack('elixir-pulse', player, tick, p);
      return true;
    case 'storage-poison':
      applyScriptedShopAttack('storage-toxin', player, tick, p);
      return true;
    case 'retrim':
      applyScriptedShopAttack('retrim', player, tick, p);
      return true;
    case 'curtain':
      applyScriptedShopAttack('curtain', player, tick, p);
      return true;
    case 'freeze':
      applyScriptedShopAttack('frost-shift', player, tick, p);
      return true;
    case 'magnet':
      applyScriptedShopAttack('gravity-lure', player, tick, p);
      return true;
    case 'snag':
      applyScriptedShopAttack('fortify-frame', player, tick, p);
      return true;
    case 'sticky':
      applyScriptedShopAttack('quickstep-clock', player, tick, p);
      return true;
    case 'purge':
      applyScriptedShopAttack('vortex-step', player, tick, p);
      return true;
    case 'wildcard':
      return applyScriptedShopAttack('wildcard-four', player, tick, p);
    case 'bomber': {
      // Bomber is a self-buff in multiplayer; timeline applies it to the puzzle player.
      applyBomberToBuyer(player);
      pushFieldEffect(player, 'bomber', tick, 'Bomber', '💣', tick + 240);
      return true;
    }
    case 'garbage': {
      const lines = typeof p.lines === 'number' ? p.lines : 1;
      const arrivalTick = tick + (typeof p.delayTicks === 'number' ? p.delayTicks : GARBAGE_ARRIVAL_DELAY_TICKS);
      player.pendingGarbage.push({ lines, arrivalTick });
      return true;
    }
    case 'satellite':
    case 'tectonic':
      throw new Error(`Unsupported puzzle hazard in session: ${kind}`);
  }
}

export class PuzzleSession {
  private readonly level: PuzzleLevel;
  private readonly driver: InputDriver;
  private readonly maxTicks: number;
  private readonly gameState: GameState;
  private readonly rngChannels: RngChannels;
  private readonly events: MatchEvent[] = [];
  private readonly commandRecords: PuzzleCommandRecord[] = [];
  private readonly timeline: TimelineEvent[];
  private timelineIndex = 0;
  private pieceLocks = 0;
  private solved = false;
  private topOut = false;
  private reported: PuzzleSessionReport | null = null;
  /** Wildcard beats deferred until poison is stacked and spread has finished. */
  private deferredWildcards: Array<Record<string, unknown>> = [];

  constructor(config: PuzzleSessionConfig) {
    this.level = config.level;
    this.driver = config.driver;
    this.maxTicks = config.maxTicks ?? 60 * 60;
    assertSupportedPuzzleTimeline(config.level.timeline, `PuzzleSession(${config.level.id})`);
    this.timeline = materializeTimeline(config.level.timeline, this.maxTicks);

    this.rngChannels = createPlayerRngChannels(config.level.seed, 'puzzle');
    const player = makePlayer('puzzle', this.rngChannels);
    // Fixed initial board and queue prefix from the level definition.
    player.board = config.level.initialBoard.map((row) => [...row]);
    if (config.level.queuePrefix.length > 0) {
      player.nextQueue = [...config.level.queuePrefix, ...player.nextQueue];
    }
    player.shop.phase = config.level.shopPolicy === 'none' ? 'waiting' : player.shop.phase;
    if (config.level.allowHold === false) {
      player.canHold = false;
      player.swapCutoffRow = 0;
    }

    this.gameState = {
      players: { puzzle: player },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 0,
      seed: config.level.seed,
    };
  }

  public get tick(): number {
    return this.gameState.tick;
  }

  public get isSolved(): boolean {
    return this.solved;
  }

  public get isEnded(): boolean {
    return this.gameState.status === 'ended';
  }

  public get piecesPlaced(): number {
    return this.pieceLocks;
  }

  public getPlayerState(): PlayerState {
    return this.gameState.players.puzzle!;
  }

  /** Timeline kinds still waiting on a deferred apply (solo telegraph). */
  public getPendingHazardKinds(): string[] {
    return this.deferredWildcards.length > 0 ? ['wildcard'] : [];
  }

  public input(inputState: InputState): void {
    const player = this.getPlayerState();
    player.inputState = {
      left: !!inputState.left,
      right: !!inputState.right,
      softDrop: !!inputState.softDrop,
    };
    this.commandRecords.push({ tick: this.gameState.tick, kind: 'input', detail: player.inputState });
  }

  public action(action: ActionType): void {
    const player = this.getPlayerState();
    player.actionQueue.push(action);
    this.commandRecords.push({ tick: this.gameState.tick, kind: 'action', detail: action });
  }

  /** Goal check per tick. Returns true when the goal is reached. */
  private checkGoal(): boolean {
    const player = this.getPlayerState();
    const goal: PuzzleGoal = this.level.goal;
    switch (goal.kind) {
      case 'perfect-clear':
        return player.board.every((row) => row.every((cell) => cell === null));
      case 'survive':
        return this.gameState.tick >= goal.ticks;
      case 'clear-lines':
        return player.linesCleared >= goal.lines;
      case 'survive-clear':
        return this.gameState.tick >= goal.ticks && player.linesCleared >= goal.lines;
    }
  }

  public advance(ticks = 1): PuzzleSessionReport {
    if (ticks <= 0 || !Number.isInteger(ticks)) {
      throw new Error(`advance() expects a positive integer number of ticks, got ${ticks}`);
    }

    for (let t = 0; t < ticks; t++) {
      if (this.gameState.status !== 'playing') break;

      // Fire due timeline events (the scripted "opponent").
      while (this.timelineIndex < this.timeline.length && this.timeline[this.timelineIndex].tick <= this.gameState.tick) {
        const event = this.timeline[this.timelineIndex];
        this.timelineIndex += 1;
        if (event.kind === 'garbage') {
          applyHazard(this.getPlayerState(), 'garbage', event.params, this.gameState.tick);
        } else if (event.kind === 'wildcard') {
          const player = this.getPlayerState();
          const applied = applyHazard(player, 'wildcard', event.params, this.gameState.tick);
          if (!applied) {
            this.deferredWildcards.push(event.params ?? {});
            // Keep telegraph visible until shape actually locks (gate may delay apply).
            ensureWildcardIncomingEffect(player, this.gameState.tick);
          }
        } else {
          applyHazard(this.getPlayerState(), event.kind, event.params, this.gameState.tick);
        }
      }

      // Retry deferred wildcards once poison spread has finished (shape gate).
      if (this.deferredWildcards.length > 0) {
        const player = this.getPlayerState();
        const remaining: Array<Record<string, unknown>> = [];
        for (const params of this.deferredWildcards) {
          if (!applyScriptedShopAttack('wildcard-four', player, this.gameState.tick, params)) {
            remaining.push(params);
            ensureWildcardIncomingEffect(player, this.gameState.tick);
          }
        }
        this.deferredWildcards = remaining;
      }

      // Drive the player through the standard observation → command path.
      const playerObs = defaultObservationProjector.project(this.gameState, 'puzzle', this.driver.observationMode ?? 'omniscient');
      const cmd = this.driver.next({
        tick: playerObs.tick,
        replayTick: this.gameState.tick,
        player: playerObs,
      });

      const rawPlayer = this.getPlayerState();
      if (cmd.inputState) {
        const normalized = {
          left: !!cmd.inputState.left,
          right: !!cmd.inputState.right,
          softDrop: !!cmd.inputState.softDrop,
        };
        rawPlayer.inputState = normalized;
        this.commandRecords.push({ tick: this.gameState.tick, kind: 'input', detail: normalized });
      }
      if (cmd.actions && cmd.actions.length > 0) {
        rawPlayer.actionQueue.push(...cmd.actions);
        for (const action of cmd.actions) {
          this.commandRecords.push({ tick: this.gameState.tick, kind: 'action', detail: action });
        }
      }

      const stepRes = matchStep(this.gameState, { puzzle: this.rngChannels }, {
        enableShop: this.level.shopPolicy === 'standard',
        enableGarbage: false,
      });

      this.events.push(...stepRes.events);

      if (rawPlayer.topOut) {
        this.topOut = true;
        this.gameState.status = 'ended';
        break;
      }

      // Track piece locks for perfect-clear / clear-lines goals.
      if (stepRes.stepResults.puzzle?.locked) {
        this.pieceLocks += 1;
        if (this.level.allowHold === false) {
          rawPlayer.canHold = false;
          rawPlayer.swapCutoffRow = 0;
        }
      }

      if (this.checkGoal()) {
        this.solved = true;
        this.gameState.status = 'ended';
        break;
      }
    }

    return this.getReport();
  }

  public getReport(): PuzzleSessionReport {
    // While playing, rebuild every call so advance()/host see live solved/topOut.
    // Cache only after the session has ended (stable terminal artifact).
    if (this.reported && this.gameState.status === 'ended') {
      return this.reported;
    }
    const player = this.getPlayerState();
    const perfectClear = player.board.every((row) => row.every((cell) => cell === null));
    const report: PuzzleSessionReport = {
      levelId: this.level.id,
      solved: this.solved,
      ticksUsed: this.gameState.tick,
      piecesUsed: this.pieceLocks,
      topOut: this.topOut,
      linesCleared: player.linesCleared,
      perfectClear,
      score: player.score,
      seed: this.gameState.seed,
      finalTick: this.gameState.tick,
      events: [...this.events],
      commandRecords: [...this.commandRecords],
      gameState: JSON.parse(JSON.stringify(this.gameState)),
    };
    if (this.gameState.status === 'ended') {
      this.reported = report;
    }
    return report;
  }
}
