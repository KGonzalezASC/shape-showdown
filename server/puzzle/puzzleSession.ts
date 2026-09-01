import type { ActionType, GameState, InputState, MatchEvent, PlayerState } from '../../src/types.js';
import { createPlayerRngChannels, type RngChannels } from '../../src/rng.js';
import { makePlayer } from '../puzzleEngine/engine.js';
import { matchStep } from '../puzzleEngine/matchStep.js';
import { clonePlayer, type InputDriver } from '../testHarness/inputDriver.js';
import { defaultObservationProjector } from '../testHarness/observationProjector.js';
import type { HazardKind, PuzzleGoal, PuzzleLevel, PuzzleAttempt, TimelineEvent } from './puzzleTypes.js';
import { assertSupportedPuzzleTimeline } from './puzzleHazards.js';

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

/** Apply one scripted hazard to the player (mirrors the shop handlers' semantics). */
function applyHazard(player: PlayerState, kind: HazardKind, params: Record<string, unknown> | undefined, tick: number): void {
  const p = params ?? {};
  switch (kind) {
    case 'poison': {
      // Poison the active piece (Elixir semantics): on lock it seeds wave 1.
      const variant = typeof p.variant === 'number' ? p.variant : 1;
      if (player.activePiece) {
        player.activePiece.poisoned = true;
        player.activePiece.poisonVariant = variant;
      } else {
        player.poisonNextPiece = true;
        player.poisonNextVariant = variant;
      }
      break;
    }
    case 'storage-poison': {
      if (player.holdPiece) {
        player.holdPiece.poisoned = true;
        player.holdPiece.poisonVariant = typeof p.variant === 'number' ? p.variant : 1;
      }
      break;
    }
    case 'curtain': {
      // Frost rows drop on the player's field below their swap line.
      const rows = typeof p.rows === 'number' ? p.rows : 3;
      player.curtainDefenseLevel = Math.max(0, (player.curtainDefenseLevel ?? 0) - 1);
      player.swapCutoffRow = Math.max(0, player.swapCutoffRow - rows);
      break;
    }
    case 'freeze': {
      const until = tick + (typeof p.durationTicks === 'number' ? p.durationTicks : 600);
      player.holdFrozenUntilTick = Math.max(player.holdFrozenUntilTick ?? 0, until);
      break;
    }
    case 'magnet': {
      const step = typeof p.gravityStep === 'number' ? p.gravityStep : 2;
      player.magnetPermanentStacks = Math.min(3, (player.magnetPermanentStacks ?? 0) + 1);
      player.magnetPieceBoost = (player.magnetPieceBoost ?? 0) + step;
      break;
    }
    case 'snag': {
      if (player.activePiece) {
        player.snagHardDropBlocked = true;
        player.snagNextPiece = !!player.pieceHasHardDropped;
      } else {
        player.snagNextPiece = true;
      }
      break;
    }
    case 'sticky': {
      if (player.activePiece) {
        player.pieceLockResetCap = 2;
        player.stickyNextPiece = false;
        player.lockResetsUsed = 0;
      } else {
        player.stickyNextPiece = true;
      }
      break;
    }
    case 'bomber': {
      if (player.activePiece) {
        player.activePiece.bomber = true;
        player.bomberNextPiece = false;
      } else {
        player.bomberNextPiece = true;
      }
      break;
    }
    case 'garbage': {
      const lines = typeof p.lines === 'number' ? p.lines : 1;
      const arrivalTick = tick + (typeof p.delayTicks === 'number' ? p.delayTicks : 18);
      player.pendingGarbage.push({ lines, arrivalTick });
      break;
    }
    case 'satellite':
    case 'purge':
    case 'wildcard':
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

  constructor(config: PuzzleSessionConfig) {
    this.level = config.level;
    this.driver = config.driver;
    this.maxTicks = config.maxTicks ?? 60 * 60;
    this.timeline = [...config.level.timeline].sort((a, b) => a.tick - b.tick);
    assertSupportedPuzzleTimeline(this.timeline, `PuzzleSession(${config.level.id})`);

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
        } else {
          applyHazard(this.getPlayerState(), event.kind, event.params, this.gameState.tick);
        }
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
