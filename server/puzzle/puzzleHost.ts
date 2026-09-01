import type { Socket } from 'socket.io';
import type { ActionType, InputState } from '../../src/types.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import { PuzzleSession } from './puzzleSession.js';
import type { PuzzleLevel, PuzzleVisibilityPolicy } from './puzzleTypes.js';
import { getCuratedPuzzleEntry, loadPuzzleCatalog } from './catalog/index.js';
import type { InputDriver, DriverObservation, PlayerCommand } from '../testHarness/inputDriver.js';

/**
 * Server-side host for single-player puzzle sessions.
 *
 * Default product path loads curated catalog levels by `puzzleId` (or a random
 * catalog entry). Generated archetypes remain available only via mode=generated.
 */

const TICK_MS = 1000 / 60;
const MAX_TICKS = 60 * 60 * 10; // 10 minute safety cap

/** Optional generated practice archetypes (not the curated catalog). */
const GENERATED_ARCHETYPES = [
  {
    name: 'dig',
    goal: { kind: 'clear-lines', lines: 5 } as const,
    garbageRows: 4,
    messyGarbage: true,
    maxHolesPerRow: 2,
    allowHold: true,
  },
  {
    name: 'cheese',
    goal: { kind: 'clear-lines', lines: 8 } as const,
    garbageRows: 6,
    messyGarbage: true,
    maxHolesPerRow: 3,
    allowHold: true,
  },
  {
    name: 'well-run',
    goal: { kind: 'clear-lines', lines: 4 } as const,
    garbageRows: 6,
    openColumn: 'random' as const,
    allowHold: true,
  },
  {
    name: 'stacked',
    goal: { kind: 'clear-lines', lines: 10 } as const,
    garbageRows: 7,
    variedHeights: true,
    allowHold: true,
  },
  {
    name: 'clean',
    goal: { kind: 'clear-lines', lines: 3 } as const,
    garbageRows: 0,
    allowHold: true,
  },
] as const;

export type PuzzleStartPayload = {
  /** Curated catalog id. Preferred product path. */
  puzzleId?: string;
  /**
   * catalog: require puzzleId
   * random: pick a random curated entry
   * generated: legacy archetype generator (practice only)
   */
  mode?: 'catalog' | 'random' | 'generated';
  /** Seed for generated mode only. Catalog levels keep their frozen seed. */
  seed?: number;
  /** Generated archetype name when mode=generated. */
  level?: string;
};

/** Wire-safe player snapshot for the client (strip sim internals). */
export interface PuzzleStateSnapshot {
  tick: number;
  board: unknown[][];
  activePiece: unknown;
  holdPiece: unknown;
  canHold: boolean;
  swapCutoffRow: number;
  allowHold: boolean;
  nextQueue: string[];
  score: number;
  linesCleared: number;
  piecesPlaced: number;
  pendingGarbage: number;
  topOut: boolean;
  status: 'playing' | 'solved' | 'topout';
  goal: PuzzleLevel['goal'];
  levelId: string;
  levelName: string;
  visibilityPolicy?: PuzzleVisibilityPolicy;
}

/** InputDriver that drains socket-originated input each tick (replaces RulesBot). */
class HumanInputDriver implements InputDriver {
  private pendingInput: InputState = { left: false, right: false, softDrop: false };
  private pendingActions: ActionType[] = [];

  public setInput(state: Partial<InputState>): void {
    this.pendingInput = {
      left: !!state.left,
      right: !!state.right,
      softDrop: !!state.softDrop,
    };
  }

  public pushAction(action: ActionType): void {
    this.pendingActions.push(action);
  }

  public next(_observation: DriverObservation): PlayerCommand {
    const actions = this.pendingActions;
    this.pendingActions = [];
    return { inputState: this.pendingInput, actions };
  }
}

export class PuzzleHost {
  private session: PuzzleSession | null = null;
  private driver: HumanInputDriver | null = null;
  private level: PuzzleLevel | null = null;
  private loopHandle: ReturnType<typeof setInterval> | null = null;
  private readonly socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  public start(payload?: PuzzleStartPayload): void {
    this.stop();
    this.level = this.resolveLevel(payload);
    this.driver = new HumanInputDriver();
    this.session = new PuzzleSession({
      level: this.level,
      driver: this.driver,
      maxTicks: MAX_TICKS,
    });
    this.socket.emit('puzzle:started', {
      levelId: this.level.id,
      name: this.level.name,
      seed: this.level.seed,
      goal: this.level.goal,
      allowHold: this.level.allowHold ?? true,
      visibilityPolicy: this.level.visibilityPolicy,
      puzzleId: this.level.id,
    });
    this.emitState();
    this.loopHandle = setInterval(() => this.tick(), TICK_MS);
  }

  public setInput(state: Partial<InputState>): void {
    this.driver?.setInput(state);
  }

  public pushAction(action: ActionType): void {
    this.driver?.pushAction(action);
  }

  public stop(): void {
    if (this.loopHandle !== null) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
    this.session = null;
    this.driver = null;
  }

  public get active(): boolean {
    return this.session !== null;
  }

  private tick(): void {
    if (!this.session) {
      this.stop();
      return;
    }
    const report = this.session.advance(1);
    this.emitState();
    if (report.solved || report.topOut || this.session.tick >= MAX_TICKS) {
      this.socket.emit('puzzle:end', {
        solved: report.solved,
        topOut: report.topOut,
        ticksUsed: report.ticksUsed,
        piecesUsed: report.piecesUsed,
        linesCleared: report.linesCleared,
        perfectClear: report.perfectClear,
        score: report.score,
        levelId: this.level?.id,
      });
      this.stop();
    }
  }

  private emitState(): void {
    if (!this.session || !this.level) return;
    const p = this.session.getPlayerState();
    const snap: PuzzleStateSnapshot = {
      tick: this.session.tick,
      board: p.board,
      activePiece: p.activePiece,
      holdPiece: p.holdPiece,
      canHold: p.canHold,
      swapCutoffRow: p.swapCutoffRow,
      allowHold: this.level.allowHold ?? true,
      nextQueue: p.nextQueue.slice(0, 5),
      score: p.score,
      linesCleared: p.linesCleared,
      piecesPlaced: this.session.piecesPlaced,
      pendingGarbage: p.pendingGarbage.length,
      topOut: p.topOut,
      status: p.topOut ? 'topout' : this.session.isSolved ? 'solved' : 'playing',
      goal: this.level.goal,
      levelId: this.level.id,
      levelName: this.level.name,
      visibilityPolicy: this.level.visibilityPolicy,
    };
    this.socket.emit('puzzle:state', snap);
  }

  private resolveLevel(payload?: PuzzleStartPayload): PuzzleLevel {
    const mode =
      payload?.mode ??
      (payload?.puzzleId ? 'catalog' : 'random');

    if (mode === 'generated') {
      return this.pickGeneratedLevel(payload?.seed, payload?.level);
    }

    if (mode === 'catalog') {
      const puzzleId = payload?.puzzleId;
      if (!puzzleId) {
        throw new Error('puzzle:start mode=catalog requires puzzleId');
      }
      const entry = getCuratedPuzzleEntry(puzzleId);
      if (!entry) {
        throw new Error(`Unknown puzzleId: ${puzzleId}`);
      }
      return entry.level;
    }

    // random curated entry
    const catalog = loadPuzzleCatalog();
    if (catalog.length === 0) {
      throw new Error('Curated puzzle catalog is empty');
    }
    if (payload?.puzzleId) {
      const entry = getCuratedPuzzleEntry(payload.puzzleId);
      if (!entry) {
        throw new Error(`Unknown puzzleId: ${payload.puzzleId}`);
      }
      return entry.level;
    }
    const index = Math.floor(Math.random() * catalog.length);
    return catalog[index]!.level;
  }

  private pickGeneratedLevel(seed?: number, archetype?: string): PuzzleLevel {
    const chosen = archetype
      ? GENERATED_ARCHETYPES.find((a) => a.name === archetype)
      : GENERATED_ARCHETYPES[Math.floor(Math.random() * GENERATED_ARCHETYPES.length)];
    const template = chosen ?? GENERATED_ARCHETYPES[0]!;
    const levelSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
    return generatePuzzleLevel({
      id: `${template.name}-${levelSeed}`,
      name: template.name,
      seed: levelSeed,
      garbageRows: template.garbageRows,
      messyGarbage: 'messyGarbage' in template ? template.messyGarbage : false,
      maxHolesPerRow: 'maxHolesPerRow' in template ? template.maxHolesPerRow : undefined,
      openColumn: 'openColumn' in template ? template.openColumn : undefined,
      variedHeights: 'variedHeights' in template ? template.variedHeights : false,
      allowHold: 'allowHold' in template ? template.allowHold : true,
      timeline: [],
      goal: { ...template.goal },
    });
  }
}
