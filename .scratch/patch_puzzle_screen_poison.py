from pathlib import Path

p = Path("src/components/PuzzleScreen.tsx")
s = p.read_text(encoding="utf8")

old_wire = """interface PuzzleWireState {
  tick: number;
  board: unknown[][];
  activePiece: unknown;
  holdPiece: unknown;
  canHold: boolean;
  swapCutoffRow?: number;
  allowHold?: boolean;
  holdFrozenUntilTick?: number;
  activeEffects?: PublicPlayerState['activeEffects'];
  nextQueue: string[];
  score: number;
  linesCleared: number;
  piecesPlaced?: number;
  pendingGarbage: number;
  topOut: boolean;
  status: 'playing' | 'solved' | 'topout';
  goal: { kind: string; lines?: number; ticks?: number };
  levelId: string;
  levelName: string;
}"""

neu_wire = """interface PuzzleWireState {
  tick: number;
  board: unknown[][];
  activePiece: unknown;
  holdPiece: unknown;
  canHold: boolean;
  swapCutoffRow?: number;
  allowHold?: boolean;
  holdFrozenUntilTick?: number;
  activeEffects?: PublicPlayerState['activeEffects'];
  nextQueue: string[];
  score: number;
  linesCleared: number;
  piecesPlaced?: number;
  pendingGarbage: number;
  topOut: boolean;
  status: 'playing' | 'solved' | 'topout';
  goal: { kind: string; lines?: number; ticks?: number };
  levelId: string;
  levelName: string;
  poisonBoard?: PublicPlayerState['poisonBoard'];
  poisonSpread?: PublicPlayerState['poisonSpread'];
  customNextPieceSourceCells?: PublicPlayerState['customNextPieceSourceCells'];
  curtainDefenseLevel?: number;
}"""

if old_wire not in s:
    raise SystemExit("wire interface missing")
s = s.replace(old_wire, neu_wire)

old_map = """  return {
    id: myId,
    board: snap.board as PublicPlayerState['board'],
    activePiece: snap.activePiece as PublicPlayerState['activePiece'],
    holdPiece: (snap.holdPiece ?? null) as PublicPlayerState['holdPiece'],
    canHold: allowHold && snap.canHold,
    holdFrozenUntilTick: snap.holdFrozenUntilTick,
    activeEffects: snap.activeEffects ?? [],
    nextQueue: (Array.isArray(snap.nextQueue) ? snap.nextQueue : []) as PublicPlayerState['nextQueue'],
    score: snap.score,
    funds: 0,
    linesCleared: snap.linesCleared,
    combo: 0,
    backToBack: false,
    pendingGarbage: [],
    topOut: snap.topOut,
    swapCutoffRow: allowHold ? (snap.swapCutoffRow ?? HOLD_SWAP_CUTOFF_VISIBLE_ROW) : 0,
    shop: {
      offerIds: [],
      phase: 'waiting',
      cycleIndex: -1,
      lastPurchasedItemId: null,
      activeSynergySeeds: [],
      pricing: {},
    },
  };
}"""

neu_map = """  return {
    id: myId,
    board: snap.board as PublicPlayerState['board'],
    activePiece: snap.activePiece as PublicPlayerState['activePiece'],
    holdPiece: (snap.holdPiece ?? null) as PublicPlayerState['holdPiece'],
    canHold: allowHold && snap.canHold,
    holdFrozenUntilTick: snap.holdFrozenUntilTick,
    activeEffects: snap.activeEffects ?? [],
    nextQueue: (Array.isArray(snap.nextQueue) ? snap.nextQueue : []) as PublicPlayerState['nextQueue'],
    score: snap.score,
    funds: 0,
    linesCleared: snap.linesCleared,
    combo: 0,
    backToBack: false,
    pendingGarbage: [],
    topOut: snap.topOut,
    swapCutoffRow: allowHold ? (snap.swapCutoffRow ?? HOLD_SWAP_CUTOFF_VISIBLE_ROW) : 0,
    poisonBoard: snap.poisonBoard,
    poisonSpread: snap.poisonSpread ?? null,
    customNextPieceSourceCells: snap.customNextPieceSourceCells,
    curtainDefenseLevel: snap.curtainDefenseLevel ?? 0,
    shop: {
      offerIds: [],
      phase: 'waiting',
      cycleIndex: -1,
      lastPurchasedItemId: null,
      activeSynergySeeds: [],
      pricing: {},
    },
  };
}"""

if old_map not in s:
    raise SystemExit("toPublicPlayerState map missing")
s = s.replace(old_map, neu_map)
p.write_text(s, encoding="utf8")
print("patched PuzzleScreen.tsx")
