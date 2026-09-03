import type { ActionType, GameState, InputState, MatchEvent, PlayerState } from '../../src/types.js';
import { createPlayerRngChannels, type RngChannels } from '../../src/rng.js';
import {
  advancePuzzle,
  createPuzzleRuntimeState,
  preparePuzzleTick,
  stableSeedForPuzzle,
  type PuzzleRuntimeState,
} from '../../src/puzzle/runtime/PuzzleRuntime.js';
import type { PuzzleRuntimeCommand } from '../../src/puzzle/runtime/puzzleCommands.js';
import { defaultObservationProjector } from '../testHarness/observationProjector.js';
import type { InputDriver } from '../testHarness/inputDriver.js';
import type { PuzzleLevel, PuzzleAttempt } from './puzzleTypes.js';
import { assertSupportedPuzzleTimeline } from './puzzleHazards.js';
import { migratePuzzleLevelToPublishedPuzzlePayload } from './publishedPuzzleAdapter.js';

/**
 * Single-player puzzle session wrapper. RulesBot observation and human/server
 * input adaptation stay here; deterministic simulation belongs to the shared
 * browser-safe PuzzleRuntime.
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

function normalizeInput(inputState: Partial<InputState>): InputState {
  return {
    left: !!inputState.left,
    right: !!inputState.right,
    softDrop: !!inputState.softDrop,
  };
}

function runtimeCommandForInput(inputState: Partial<InputState>): Extract<PuzzleRuntimeCommand, { kind: 'input' }> {
  return {
    kind: 'input',
    inputState: normalizeInput(inputState),
  };
}

export class PuzzleSession {
  private readonly level: PuzzleLevel;
  private readonly driver: InputDriver;
  private readonly maxTicks: number;
  private readonly rngChannels: RngChannels;
  private readonly runtimeState: PuzzleRuntimeState;
  private readonly events: MatchEvent[] = [];
  private readonly commandRecords: PuzzleCommandRecord[] = [];
  private reported: PuzzleSessionReport | null = null;

  constructor(config: PuzzleSessionConfig) {
    this.level = config.level;
    this.driver = config.driver;
    this.maxTicks = config.maxTicks ?? 60 * 60;
    if (!Number.isSafeInteger(this.maxTicks) || this.maxTicks < 1) {
      throw new Error(`PuzzleSession maxTicks must be a positive safe integer, got ${this.maxTicks}`);
    }

    // Keep the legacy allowlist at this server boundary during migration. The
    // shared published runtime can support more hazards without changing the
    // existing PuzzleHost/catalog contract in this phase.
    assertSupportedPuzzleTimeline(config.level.timeline, `PuzzleSession(${config.level.id})`);

    const seed = stableSeedForPuzzle(config.level.id);
    this.rngChannels = createPlayerRngChannels(seed, 'puzzle');
    const payload = migratePuzzleLevelToPublishedPuzzlePayload(config.level, {
      // A server wrapper must not run out of pieces before its legacy horizon.
      pieceCount: Math.max(256, this.maxTicks + 1),
      timelineHorizonTicks: this.maxTicks,
    });
    this.runtimeState = createPuzzleRuntimeState({
      payload,
      seed,
      rngChannels: this.rngChannels,
      maxTicks: this.maxTicks,
    });
  }

  private get gameState(): GameState {
    return this.runtimeState.gameState;
  }

  public get tick(): number {
    return this.gameState.tick;
  }

  public get isSolved(): boolean {
    return this.runtimeState.status === 'solved';
  }

  public get isEnded(): boolean {
    return this.gameState.status === 'ended';
  }

  public get piecesPlaced(): number {
    return this.runtimeState.piecesPlaced;
  }

  public getPlayerState(): PlayerState {
    const player = this.gameState.players.puzzle;
    if (!player) throw new Error('PuzzleSession has no puzzle player');
    return player;
  }

  /** Timeline kinds still waiting on a deferred apply (solo telegraph). */
  public getPendingHazardKinds(): string[] {
    return this.runtimeState.deferredWildcards.length > 0 ? ['wildcard'] : [];
  }

  public input(inputState: InputState): void {
    const player = this.getPlayerState();
    player.inputState = normalizeInput(inputState);
    this.commandRecords.push({ tick: this.gameState.tick, kind: 'input', detail: player.inputState });
  }

  public action(action: ActionType): void {
    const player = this.getPlayerState();
    player.actionQueue.push(action);
    this.commandRecords.push({ tick: this.gameState.tick, kind: 'action', detail: action });
  }

  public advance(ticks = 1): PuzzleSessionReport {
    if (ticks <= 0 || !Number.isInteger(ticks)) {
      throw new Error(`advance() expects a positive integer number of ticks, got ${ticks}`);
    }

    for (let index = 0; index < ticks; index += 1) {
      if (this.runtimeState.status !== 'playing') break;

      // Legacy drivers must observe the same pre-command state as the old
      // session: tick hazards and deferred wildcard retries happen first.
      preparePuzzleTick(this.runtimeState);
      const playerObs = defaultObservationProjector.project(
        this.gameState,
        'puzzle',
        this.driver.observationMode ?? 'omniscient',
      );
      const cmd = this.driver.next({
        tick: playerObs.tick,
        replayTick: this.gameState.tick,
        player: playerObs,
      });

      const commands: PuzzleRuntimeCommand[] = [];
      if (cmd.inputState) {
        const inputCommand = runtimeCommandForInput(cmd.inputState);
        commands.push(inputCommand);
        this.commandRecords.push({
          tick: this.gameState.tick,
          kind: 'input',
          detail: inputCommand.inputState,
        });
      }
      for (const action of cmd.actions ?? []) {
        commands.push({ kind: 'action', action });
        this.commandRecords.push({ tick: this.gameState.tick, kind: 'action', detail: action });
      }

      const transition = advancePuzzle(this.runtimeState, commands, this.rngChannels);
      this.events.push(...transition.events);
    }

    return this.getReport();
  }

  public getReport(): PuzzleSessionReport {
    // While playing, rebuild every call so advance()/host see live metrics.
    // Cache only after the session has ended (stable terminal artifact).
    if (this.reported && this.gameState.status === 'ended') {
      return this.reported;
    }
    const player = this.getPlayerState();
    const perfectClear = player.board.every((row) => row.every((cell) => cell === null));
    const report: PuzzleSessionReport = {
      levelId: this.level.id,
      solved: this.runtimeState.status === 'solved',
      ticksUsed: this.gameState.tick,
      piecesUsed: this.runtimeState.piecesPlaced,
      topOut: this.runtimeState.status === 'top-out',
      linesCleared: player.linesCleared,
      perfectClear,
      score: player.score,
      seed: this.gameState.seed,
      finalTick: this.gameState.tick,
      events: [...this.events],
      commandRecords: [...this.commandRecords],
      gameState: structuredClone(this.gameState),
    };
    if (this.gameState.status === 'ended') {
      this.reported = report;
    }
    return report;
  }
}
