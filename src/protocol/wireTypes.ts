import { SHOP_CATALOG } from '../shop/shopCatalog.js';
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
  GamePiece,
  ShapeType,
} from '../types.js';

/**
 * Powerup & Protocol Extension Guide:
 *
 * 1. Standard Shop Item (Mechanic already exists or only affects board/shop/pills):
 *    - Append the new item to `SHOP_CATALOG` in `src/shop/shopCatalog.ts`.
 *    - `U8_TO_SHOP_ITEM_ID` and `SHOP_ITEM_ID_TO_U8` update automatically.
 *    - Register the purchase handler in `server/shop.ts`.
 *
 * 2. Visual Active Field Effect Pill (Buff/Debuff/Timer):
 *    - Add the kind name to `FieldEffectKind` in `src/types.ts`.
 *    - Append the kind name to `FIELD_EFFECT_KINDS` below.
 *    - Add Tailwind styling in `src/shop/effectStyles.ts`.
 *    - (Optional) Append static labels/icons to `EFFECT_LABEL_INTERN`/`EFFECT_ICON_INTERN`
 *      for varint byte optimization. Un-interned labels/icons fall back to literal strings safely.
 *
 * 3. New Persistent State Variable on PlayerState:
 *    - Add property to `PlayerState` in `src/types.ts`.
 *    - Add property to `LocalPlayerWire` below (and `OpponentPlayerWire` if visible to opponent).
 *    - Project it in `server/sync/seatProjection.ts`.
 *    - Add presence bitmask flag in `src/protocol/codecShared.ts` (`PRESENCE_*`) and write/read in meta codec.
 *    - Map it in `src/protocol/clientMatchModel.ts`.
 *    - `encodeDeltaPacket()` detects the change automatically via meta diffing.
 */

/**
 * Wire garbage entry. All tick fields are ABSOLUTE simulation ticks; decoders
 * relativize against the packet header tick so client models stay relative.
 */
export interface PendingGarbageWire {
  lines: number;
  /** Absolute simulation tick at which the packet lands. */
  arrivalTick?: number;
}

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

/**
 * Local seat wire snapshot. Tick-bearing fields (`expiresAtTick`,
 * `nextSpreadTick`, `*UntilTick`, `landingForecastAtTick`, `arrivalTick`)
 * carry ABSOLUTE simulation ticks on the wire.
 */
export interface LocalPlayerWire {
  id: string;
  board: CellValue[][];
  poisonBoard: number[][];
  activePiece: GamePiece | null;
  /** Absolute simulation tick at which the landing forecast expires. */
  landingForecastAtTick?: number;
  holdPiece: HeldPiece | null;
  canHold: boolean;
  nextQueue: ShapeType[];
  score: number;
  funds: number;
  linesCleared: number;
  combo: number;
  backToBack: boolean;
  pendingGarbage: PendingGarbageWire[];
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

/** Opponent seat wire snapshot; same absolute-tick convention as {@link LocalPlayerWire}. */
export interface OpponentPlayerWire {
  id: string;
  /** Visible 10×18 board (no hidden spawn rows). */
  board: CellValue[][];
  /** Visible 10×18 poison variants aligned with `board`. */
  poisonBoard: number[][];
  activePiece: GamePiece | null;
  score: number;
  funds: number;
  linesCleared: number;
  combo: number;
  backToBack: boolean;
  pendingGarbage: PendingGarbageWire[];
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

/**
 * Client-side decoded seat model. Identical to the pre-v3 relative contract:
 * every tick field is RELATIVE to the carrying packet's tick, so downstream
 * consumers never see the wire's absolute-tick encoding.
 */
export type DecodedLocalPlayerWire = Omit<LocalPlayerWire, 'landingForecastAtTick' | 'pendingGarbage'> & {
  landingForecastTicksRemaining?: number;
  pendingGarbage: PendingGarbagePacket[];
};

/** Client-side decoded opponent model (relative tick semantics). */
export type DecodedOpponentPlayerWire = Omit<OpponentPlayerWire, 'pendingGarbage'> & {
  pendingGarbage: PendingGarbagePacket[];
};

export interface DecodedSeatSnapshot {
  tick: number;
  chrome: MatchChromeWire;
  local: DecodedLocalPlayerWire;
  opponent: DecodedOpponentPlayerWire;
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
export const DELTA_SECTION_LOCAL_PIECE = 1 << 8;
export const DELTA_SECTION_OPPONENT_PIECE = 1 << 9;

/** Canonical shop item id ↔ byte enum, ordered by {@link SHOP_CATALOG}. */
export const U8_TO_SHOP_ITEM_ID: readonly string[] = SHOP_CATALOG.map((item) => item.id);
export const SHOP_ITEM_ID_TO_U8: ReadonlyMap<string, number> = new Map(
  U8_TO_SHOP_ITEM_ID.map((id, index) => [id, index]),
);

/** Code for a literal length-prefixed string in the effect label/id streams. */
export const EFFECT_STRING_LITERAL = 0;
/** Base code for templated (numeric-argument) effect labels. */
export const EFFECT_LABEL_TEMPLATE_BASE = 200;
/** Code for a literal length-prefixed effect icon; 0 means absent. */
export const EFFECT_ICON_LITERAL = 255;

/**
 * Fixed effect label strings interned on the wire (encoded as index + 1).
 * Order is wire-stable; only append.
 */
export const EFFECT_LABEL_INTERN: readonly string[] = [
  'Retrimmed',
  'Curtain incoming',
  'Curtain',
  'Poisoned',
  'Storage poisoned',
  'Purged',
  'Frozen',
  'Snagged',
  'Sticky',
  'Satellite',
  'Satellite armed',
  'Bomber',
  'Wildcard +4',
  'Tectonic Shift',
] as const;

/** Fixed effect icon strings interned on the wire (encoded as index + 1). */
export const EFFECT_ICON_INTERN: readonly string[] = [
  '🛡️',
  '✂️',
  '🎭',
  '🧪',
  '🦠',
  '🃏',
  '❄️',
  '🧲',
  '🪝',
  '⏱️',
  '🛰️',
  '💣',
  '💸',
  '🧩',
  '🪐',
] as const;
