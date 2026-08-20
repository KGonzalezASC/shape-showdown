import type {
  ActiveFieldEffect,
  CellValue,
  FieldEffectKind,
  HeldPiece,
  ItemPricingState,
  MatchEndReason,
  MatchStatus,
  PendingGarbagePacket,
  PlayerShopState,
  PoisonSpreadState,
  TetrisPiece,
  TetrominoType,
} from '../types.js';

export interface MatchChromeWire {
  status: MatchStatus;
  countdown: number;
  seed: number;
  winnerId: string | null;
  endReason?: MatchEndReason;
  technicalVictory?: boolean;
  restartTimer?: number;
  pausePlayerId: string | null;
  pauseStartedAt: number | null;
}

export interface LocalPlayerWire {
  id: string;
  board: CellValue[][];
  poisonBoard: number[][];
  activePiece: TetrisPiece | null;
  landingForecastTicksRemaining?: number;
  holdPiece: HeldPiece | null;
  canHold: boolean;
  nextQueue: TetrominoType[];
  score: number;
  funds: number;
  linesCleared: number;
  combo: number;
  backToBack: boolean;
  pendingGarbage: PendingGarbagePacket[];
  activeEffects: ActiveFieldEffect[];
  topOut: boolean;
  swapCutoffRow: number;
  curtainDefenseLevel: number;
  poisonSpread: PoisonSpreadState | null;
  customNextPieceSourceCells?: [number, number][];
  holdFrozenUntilTick?: number;
  magnetPermanentStacks?: number;
  magnetPieceBoost?: number;
  pieceHasHardDropped?: boolean;
  lastHardDropTick?: number;
  snagHardDropBlocked?: boolean;
  satelliteArmed?: boolean;
  satelliteDelayUntilTick?: number;
  tectonicShiftNextStepTick?: number | null;
  shop: Pick<
    PlayerShopState,
    'offerIds' | 'phase' | 'cycleIndex' | 'lastPurchasedItemId' | 'activeSynergySeeds' | 'pricing'
  >;
}

export interface OpponentPlayerWire {
  id: string;
  /** Visible 10×18 board (no hidden spawn rows). */
  board: CellValue[][];
  /** Visible 10×18 poison variants aligned with `board`. */
  poisonBoard: number[][];
  activePiece: TetrisPiece | null;
  score: number;
  funds: number;
  linesCleared: number;
  combo: number;
  backToBack: boolean;
  pendingGarbage: PendingGarbagePacket[];
  activeEffects: ActiveFieldEffect[];
  topOut: boolean;
  swapCutoffRow: number;
  curtainDefenseLevel: number;
  poisonSpread: PoisonSpreadState | null;
  tectonicShiftNextStepTick?: number | null;
  magnetPermanentStacks?: number;
  magnetPieceBoost?: number;
  hasHold: boolean;
  hasPoison: boolean;
}

export interface SeatWireSnapshot {
  tick: number;
  chrome: MatchChromeWire;
  local: LocalPlayerWire;
  opponent: OpponentPlayerWire;
}

export interface TectonicCellMove {
  x: number;
  fromY: number;
  toY: number;
  cell: CellValue;
  poison: number;
}

export interface TectonicStepWire {
  playerId: string;
  advanced: boolean;
  moves: TectonicCellMove[];
}

export interface TectonicCompleteWire {
  playerId: string;
  rowsCleared: number;
}

/** Client-side decoded match model (not a full GameState). */
export interface ClientMatchModel {
  tick: number;
  seed: number;
  chrome: MatchChromeWire;
  myId: string | null;
  myPlayer: import('../state/publicSnapshots.js').PublicPlayerState | null;
  opponentPlayer: import('../state/publicSnapshots.js').PublicPlayerState | null;
}

export const FIELD_EFFECT_KINDS: readonly FieldEffectKind[] = [
  'retrim',
  'curtain-warn',
  'curtain',
  'poison',
  'storage-poison',
  'purge-warn',
  'purge',
  'freeze',
  'magnet',
  'snag',
  'sticky',
  'satellite',
  'bomber',
  'taxed',
  'tax-siphon',
  'curtain-def',
  'wildcard-four',
  'tectonic-shift',
] as const;

export const SHOP_PHASE_TO_U8: Record<PlayerShopState['phase'], number> = {
  waiting: 0,
  ready: 1,
  cycling: 2,
  expired: 3,
};

export const U8_TO_SHOP_PHASE: PlayerShopState['phase'][] = [
  'waiting',
  'ready',
  'cycling',
  'expired',
];

export const MATCH_STATUS_TO_U8: Record<MatchStatus, number> = {
  waiting: 0,
  countdown: 1,
  playing: 2,
  ended: 3,
};

export const U8_TO_MATCH_STATUS: MatchStatus[] = [
  'waiting',
  'countdown',
  'playing',
  'ended',
];

export const END_REASON_TO_U8: Record<MatchEndReason, number> = {
  'top-out': 0,
  'disconnect-forfeit': 1,
  'server-void': 2,
  'allocation-cancelled': 3,
};

export const U8_TO_END_REASON: MatchEndReason[] = [
  'top-out',
  'disconnect-forfeit',
  'server-void',
  'allocation-cancelled',
];

export const DELTA_SECTION_CHROME = 1 << 0;
export const DELTA_SECTION_LOCAL_BOARD = 1 << 1;
export const DELTA_SECTION_LOCAL_POISON = 1 << 2;
export const DELTA_SECTION_LOCAL_META = 1 << 3;
export const DELTA_SECTION_LOCAL_SHOP = 1 << 4;
export const DELTA_SECTION_OPPONENT_BOARD = 1 << 5;
export const DELTA_SECTION_OPPONENT_META = 1 << 6;
export const DELTA_SECTION_OPPONENT_POISON = 1 << 7;
