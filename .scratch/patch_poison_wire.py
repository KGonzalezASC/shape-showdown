from pathlib import Path

# --- puzzleHost.ts: add poison fields to snapshot interface + emitState ---
p = Path("server/puzzle/puzzleHost.ts")
s = p.read_text(encoding="utf8")

old_iface = """export interface PuzzleStateSnapshot {
  tick: number;
  board: unknown[][];
  activePiece: unknown;
  holdPiece: unknown;
  canHold: boolean;
  activeEffects?: unknown[];
  holdFrozenUntilTick?: number;
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
}"""

neu_iface = """export interface PuzzleStateSnapshot {
  tick: number;
  board: unknown[][];
  activePiece: unknown;
  holdPiece: unknown;
  canHold: boolean;
  activeEffects?: unknown[];
  holdFrozenUntilTick?: number;
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
  /** Same poison / wildcard fields multiplayer public snapshots expose. */
  poisonBoard?: number[][];
  poisonSpread?: unknown;
  customNextPieceSourceCells?: [number, number][];
  curtainDefenseLevel?: number;
}"""

if old_iface not in s:
    raise SystemExit("interface block missing")
s = s.replace(old_iface, neu_iface)

old_emit = """    const snap: PuzzleStateSnapshot = {
      tick: this.session.tick,
      board: p.board,
      activePiece: p.activePiece,
      holdPiece: p.holdPiece,
      canHold: p.canHold,
      activeEffects: p.activeEffects ?? [],
      holdFrozenUntilTick: p.holdFrozenUntilTick,
      swapCutoffRow: p.swapCutoffRow,
      allowHold: this.level.allowHold ?? true,
      nextQueue: p.nextQueue.slice(0, visibleNextQueueCount(this.level.visibilityPolicy)),
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
    };"""

neu_emit = """    const snap: PuzzleStateSnapshot = {
      tick: this.session.tick,
      board: p.board,
      activePiece: p.activePiece,
      holdPiece: p.holdPiece,
      canHold: p.canHold,
      activeEffects: p.activeEffects ?? [],
      holdFrozenUntilTick: p.holdFrozenUntilTick,
      swapCutoffRow: p.swapCutoffRow,
      allowHold: this.level.allowHold ?? true,
      nextQueue: p.nextQueue.slice(0, visibleNextQueueCount(this.level.visibilityPolicy)),
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
      // Match multiplayer toPublicPlayerState so GameField can render poison/wildcard.
      poisonBoard: p.poisonBoard,
      poisonSpread: p.poisonSpread,
      customNextPieceSourceCells: p.customNextPieceSourceCells,
      curtainDefenseLevel: p.curtainDefenseLevel ?? 0,
    };"""

if old_emit not in s:
    raise SystemExit("emit block missing")
s = s.replace(old_emit, neu_emit)
p.write_text(s, encoding="utf8")
print("patched puzzleHost.ts")

# --- authored poison-beat retune ---
p = Path("server/puzzle/catalog/authoredLevels.ts")
s = p.read_text(encoding="utf8")
old = """  const timeline: TimelineEvent[] = [
    // ~1.5s: poison active piece (variant 2).
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    // ~6s: wildcard after lock+spread so poison cells exist for +4 copy.
    { tick: 360, kind: 'wildcard', params: { variant: 2 } },
  ];"""
neu = """  const timeline: TimelineEvent[] = [
    // ~1.5s: poison active piece (variant 2).
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    // Soon after lock (~114): wildcard only applies once poison is on the stack
    // (matches multiplayer canPurchase gate). Keep before typical bot clear (~139).
    { tick: 130, kind: 'wildcard', params: { variant: 2 } },
  ];"""
if old not in s:
    raise SystemExit("poison-beat timeline missing")
# also update the docstring
s = s.replace(old, neu)
s = s.replace(
    " * Poison Beat — poison (fixed variant) then wildcard-four with the same variant\n * after enough delay that poison is on the board first.",
    " * Poison Beat — poison (fixed variant) then wildcard-four with the same variant\n * once poison is already on the stack (multiplayer prerequisite).",
)
p.write_text(s, encoding="utf8")
print("patched authoredLevels poison-beat")
