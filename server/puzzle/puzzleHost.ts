import type { Socket } from 'socket.io';
import type { ActionType, InputState } from '../../src/types.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import { PuzzleSession } from './puzzleSession.js';
import type { PuzzleLevel } from './puzzleTypes.js';
import type { InputDriver, DriverObservation, PlayerCommand } from '../testHarness/inputDriver.js';

/**
 * Server-side host for single-player puzzle sessions.
 *
 * One PuzzleHost per connected socket (created lazily on `puzzle:start`).
 * Runs a PuzzleSession on a 60Hz timer, streaming compact player snapshots
 * to the client via `puzzle:state`. Human input arrives via `puzzle:input`
 * (continuous) and `puzzle:action` (discrete), buffered in a driver that
 * the session drains each tick.
 */

const TICK_MS = 1000 / 60;
const MAX_TICKS = 60 * 60 * 10; // 10 minute safety cap

/** Level archetypes offered on `puzzle:start` (random pick with random seed). */
const LEVEL_ARCHETYPES = [
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
  {
    name: 'hazard-run',
    goal: { kind: 'survive', ticks: 60 * 45 } as const,
    garbageRows: 2,
    allowHold: true,
    timeline: [
      { tick: 600, kind: 'garbage' as const, params: { lines: 1 } },
      { tick: 1500, kind: 'poison' as const },
      { tick: 2400, kind: 'magnet' as const },
    ],
  },
] as const;

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

  // ---- public API (called from socket handlers) ----

  public start(payload?: { seed?: number; level?: string }): void {
    this.stop();
    this.level = this.pickLevel(payload?.seed, payload?.level);
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
    });
    this.emitState(); // initial state immediately
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

  // ---- internals ----

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
    };
    this.socket.emit('puzzle:state', snap);
  }

  private pickLevel(seed?: number, archetype?: string): PuzzleLevel {
    const chosen = archetype
      ? LEVEL_ARCHETYPES.find((a) => a.name === archetype)
      : LEVEL_ARCHETYPES[Math.floor(Math.random() * LEVEL_ARCHETYPES.length)];
    const template = chosen ?? LEVEL_ARCHETYPES[0];
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
      timeline: 'timeline' in template ? [...template.timeline] : [],
      goal: { ...template.goal },
    });
  }
}
