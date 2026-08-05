import {
  ATTACK_TABLE,
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  BOARD_VISIBLE_ROWS,
  CELL_SIZE,
  COMBO_BONUS_TABLE,
  COUNTDOWN_SECONDS,
  DAS_TICKS,
  GAME_DURATION,
  GAME_HEIGHT,
  GAME_TICK_RATE,
  GAME_WIDTH,
  GARBAGE_ARRIVAL_DELAY_TICKS,
  GRAVITY_TICKS_PER_CELL,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
  HORIZONTAL_SPEED_THRESHOLDS,
  LOCK_DELAY_TICKS,
  LOCK_RESET_CAP,
  LANDING_FORECAST_TICKS,
  NEXT_PREVIEW_COUNT,
  REPLAY_KEYFRAME_INTERVAL_TICKS,
  RESTART_DELAY_SECONDS,
  RETRIM_ACTIVATION_TICKS,
  RETRIM_COST,
  CURTAIN_COST,
  CURTAIN_TELEGRAPH_TICKS,
  CURTAIN_DURATION_TICKS,
  POISON_COST,
  POISON_SPREAD_INTERVAL_TICKS,
  POISON_GENERATIONS,
  STORAGE_POISON_COST,
  POISON_PURGE_COST,
  POISON_PURGE_TELEGRAPH_TICKS,
  WILDCARD_FOUR_COST,
  FREEZE_COST,
  FREEZE_DURATION_TICKS,
  STICKY_LOCK_RESET_CAP,
  STICKY_COST,
  MAGNET_COST,
  MAGNET_PERMANENT_MAX,
  MAGNET_PERMANENT_GRAVITY_STEP,
  MAGNET_PIECE_GRAVITY_STEP,
  MAGNET_GRAVITY_TICK_REDUCTION,
  MAGNET_MIN_GRAVITY_TICKS,
  SNAG_COST,
  TECTONIC_SHIFT_COST,
  TECTONIC_SHIFT_MIN_DURATION_MS,
  TECTONIC_SHIFT_MIN_DURATION_TICKS,
  TECTONIC_SHIFT_STEP_MS,
  TECTONIC_SHIFT_STEP_TICKS,
  BOUNTY_TAX_COST,
  BOUNTY_TAX_PERCENT,
  POISON_LINE_CLEAR_PENALTY_MAX_RATIO,
  SATELLITE_COST,
  SATELLITE_PACKET_DELAY_TICKS,
  SATELLITE_INCOMING_DELAY_TICKS,
  SATELLITE_DURATION_TICKS,
  BOMBER_COST,
  BOMBER_BLAST_RADIUS,
  SCORE_FLOAT_DURATION_SEC,
  SOFT_DROP_CELLS_PER_TICK,
  ARR_TICKS,
} from './constants';

export type MatchStatus = 'waiting' | 'countdown' | 'playing' | 'ended';
export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export type RotationState = 0 | 1 | 2 | 3;
export type CellValue = TetrominoType | 'G' | 'W' | null;
export type ActionType = 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

/** Who the purchased effect primarily affects. */
export type ShopItemTarget = 'self' | 'opponent';

export interface ShopItem {
  id: string;
  name: string;
  icon: string;
  cost: number;
  tier: 1 | 2;
  baseWeight: number;
  /** When false, item may exist for docs/UI stubs but never appears in rolls. */
  purchasable: boolean;
  target: ShopItemTarget;
  colorClass: string;
  borderColorClass: string;
  description: string;
  synergyTargetId?: string;
  synergyBoost?: number;
}

/**
 * Semantic field-effect kinds. Presentation (Tailwind) lives in a client adapter;
 * the server only emits kind + label + timing.
 */
export type FieldEffectKind =
  | 'retrim'
  | 'curtain-warn'
  | 'curtain'
  | 'poison'
  | 'storage-poison'
  | 'purge-warn'
  | 'purge'
  | 'freeze'
  | 'magnet'
  | 'snag'
  | 'sticky'
  | 'satellite'
  | 'bomber'
  | 'taxed'
  | 'tax-siphon'
  | 'wildcard-four'
  | 'tectonic-shift';

export type ShopPhase = 'waiting' | 'ready' | 'cycling' | 'expired';

export interface ShopBagState {
  tier1Bag: string[];
  tier2Bag: string[];
}

/** Authoritative per-player shop state (rolled and advanced on the server). */
export interface PlayerShopState {
  offerIds: string[];
  bagState: ShopBagState;
  phase: ShopPhase;
  cycleIndex: number;
  cycleStartTick: number | null;
  lastPurchasedItemId: string | null;
  activeSynergySeeds: string[];
}

/**
 * An effect currently being applied to a player's field.
 * Styling is owned by the client adapter (`effectStyles`); the wire payload is semantic.
 */
export interface ActiveFieldEffect {
  /** Unique instance id (kind + tick), not necessarily ShopItem.id */
  id: string;
  kind: FieldEffectKind;
  /** Short display label shown in the pill (e.g. "Frost", "Nova") */
  label: string;
  /** Optional emoji / icon prefix */
  icon?: string;
  /** Tick at which this effect expires (for countdown / prune) */
  expiresAtTick?: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  softDrop: boolean;
}

export interface TetrisPiece {
  type: TetrominoType;
  rotation: RotationState;
  x: number;
  y: number;
  /** When true, this piece poisons the cells it connects to on lock (Elixir effect). */
  poisoned?: boolean;
  /**
   * Which colour variant (1–4) this poison event belongs to. All cells seeded
   * by the same Elixir purchase share this value so the colour is consistent.
   */
  poisonVariant?: number;
  /** Bomber shop item: detonates in a circle when this piece locks. */
  bomber?: boolean;
  /** Custom block offsets override when this piece has a custom shape. */
  customOffsets?: [number, number][];
  /** When true, this is a wildcard/puzzle piece with custom shape. */
  isWildcard?: boolean;
  /** Increments when a wildcard rotation is rejected because it would collide. */
  rotationBlockedNonce?: number;
}

/** Piece parked in storage — carries type plus piece-level flags that survive hold. */
export interface HeldPiece {
  type: TetrominoType;
  poisoned?: boolean;
  poisonVariant?: number;
  bomber?: boolean;
}

/**
 * Tracks an in-progress poison spread on a player's board. Poison seeds at the
 * locked piece (wave 1) and spreads to orthogonally-adjacent filled cells once
 * per interval. After POISON_GENERATIONS waves it stops spreading, but the
 * poisoned cells remain poisoned permanently (this state goes null, the
 * poisonBoard marks are never cleared).
 */
export interface PoisonSpreadState {
  /** Waves still to apply after the initial lock wave. */
  generationsRemaining: number;
  /** Game tick at which the next wave spreads. */
  nextSpreadTick: number;
  /** Colour variant (1–4) shared by every cell seeded from this event. */
  variant: number;
}

export interface PendingGarbagePacket {
  lines: number;
  arrivalTick: number;
}

/**
 * A shop effect that has been purchased and is scheduled to activate
 * at a specific future game tick.
 */
export interface PendingShopEffect {
  /** Matches ShopItem.id */
  itemId: string;
  /** The game tick at which this effect triggers */
  activationTick: number;
  /** Rolled poison colour (1–4) for Wild Purge activation. */
  poisonVariant?: number;
}

export interface PlayerState {
  id: string;
  board: CellValue[][];
  activePiece: TetrisPiece | null;
  /** Server-tick countdown for the temporary Landing Forecast UI. */
  landingForecastTicksRemaining?: number;
  holdPiece: HeldPiece | null;
  canHold: boolean;
  nextQueue: TetrominoType[];
  bag: TetrominoType[];
  score: number;
  linesCleared: number;
  combo: number;
  backToBack: boolean;
  inputState: InputState;
  actionQueue: ActionType[];
  shiftDirection: -1 | 0 | 1;
  dasCounter: number;
  arrCounter: number;
  gravityCounter: number;
  lockDelayRemainingTicks: number;
  lockResetsUsed: number;
  lowestY: number;
  /** Increments when a rotation succeeds using a non-zero SRS kick offset (debug / UI). */
  srsKickNonce?: number;
  /** Last SRS kick offset (kick table kx, ky); null if none since spawn or after lock/hold. */
  lastSrsKick?: { kx: number; ky: number } | null;
  lastActionWasRotate: boolean;
  pendingGarbage: PendingGarbagePacket[];
  /** Active visual effects applied to this player's field */
  activeEffects?: ActiveFieldEffect[];
  topOut: boolean;
  /**
   * Current swap-line row (visible row index). Starts at HOLD_SWAP_CUTOFF_VISIBLE_ROW;
   * modified permanently by re-trim and similar effects.
   */
  swapCutoffRow: number;
  /** Shop effects queued and waiting for their activationTick. */
  pendingShopEffects: PendingShopEffect[];
  /**
   * Parallel to `board`; same dimensions. 0 = clean, 1..POISON_GENERATIONS marks
   * a poisoned cell and which spread wave reached it (also selects its colour
   * variant). Mutated in lockstep with `board` on line clears / garbage.
   */
  poisonBoard?: number[][];
  /** Active spread scheduler; null when no spread is in progress. */
  poisonSpread?: PoisonSpreadState | null;
  /** One-shot: poison the next piece that spawns (set when no active piece existed at purchase). */
  poisonNextPiece?: boolean;
  /** Colour variant to assign to the next deferred poison spawn. */
  poisonNextVariant?: number;
  /** Offsets for the next piece if transformed by Wildcard +4. */
  customNextPieceOffsets?: [number, number][];
  /** Poison colour variant for the next custom piece. */
  customNextPieceVariant?: number;
  /** Absolute board cells currently outlined as the source for a queued Wildcard +4 piece. */
  customNextPieceSourceCells?: [number, number][];
  /** Last Wildcard +4 seed/shape, used to avoid repeating the same puzzle piece. */
  wildcardLastSeed?: [number, number];
  wildcardLastShapeKey?: string;
  /** Game tick until hold/store/swap is blocked (Freeze shop item). */
  holdFrozenUntilTick?: number;
  /** Per-piece lock reset cap override (Sticky shop item); cleared on lock/hold. */
  pieceLockResetCap?: number;
  /** Apply sticky cap to the next piece that spawns (purchase while no active piece). */
  stickyNextPiece?: boolean;
  /** Permanent magnet gravity steps applied by opponent (0–MAGNET_PERMANENT_MAX). */
  magnetPermanentStacks?: number;
  /** Extra magnet gravity on the current piece only; cleared on lock/hold. */
  magnetPieceBoost?: number;
  /** True after a successful hard drop on the current active piece. */
  pieceHasHardDropped?: boolean;
  /** Last simulation tick containing a successful hard drop; retained for visual consumers. */
  lastHardDropTick?: number;
  /** Snag: hard drop blocked on this piece until lock/hold. */
  snagHardDropBlocked?: boolean;
  /** Snag: apply block to the next spawned piece. */
  snagNextPiece?: boolean;
  /** Purchased Satellite waiting for first incoming garbage before it takes effect. */
  satelliteArmed?: boolean;
  /** Game tick until newly queued garbage gets SATELLITE_INCOMING_DELAY_TICKS. */
  satelliteDelayUntilTick?: number;
  /** Bomber: arm the next spawned piece. */
  bomberNextPiece?: boolean;
  /**
   * Tectonic Shift cascade: next tick to advance one-row gravity (all columns).
   * Null/undefined when idle. While set, the active piece is paused.
   */
  tectonicShiftNextStepTick?: number | null;
  /** Tick when the cascade started (for min-duration floor). */
  tectonicShiftStartTick?: number | null;
  /** Per-cascade spacing between gravity steps (scaled so short falls still last ≥ min duration). */
  tectonicShiftStepTicks?: number | null;
  /** Server-authoritative shop offers and cycle state. */
  shop: PlayerShopState;
}

export interface GameState {
  players: Record<string, PlayerState>;
  status: MatchStatus;
  countdown: number;
  remainingTime: number;
  winnerId: string | null;
  restartTimer?: number;
  technicalVictory?: boolean;
  tick: number;
  seed: number;
}

export type TSpinType = 'full' | 'mini' | false;

export type MatchEvent =
  | { tick: number; type: 'lineClear'; playerId: string; lines: number; tSpin: TSpinType }
  | { tick: number; type: 'attackSent'; playerId: string; lines: number }
  | { tick: number; type: 'garbageApplied'; playerId: string; lines: number }
  | { tick: number; type: 'topOut'; playerId: string }
  | { tick: number; type: 'poisonSpread'; playerId: string; newCells: number }
  | { tick: number; type: 'shopRoll'; playerId: string; offerIds: string[] }
  | { tick: number; type: 'tectonicStep'; playerId: string; advanced: boolean }
  | { tick: number; type: 'tectonicComplete'; playerId: string; rowsCleared: number };

export type ReplayInputFrame =
  | {
      tick: number;
      playerId: string;
      kind: 'inputState';
      inputState: InputState;
    }
  | {
      tick: number;
      playerId: string;
      kind: 'action';
      action: ActionType;
    }
  | {
      tick: number;
      playerId: string;
      kind: 'shopOpen';
      accepted: boolean;
    }
  | {
      tick: number;
      playerId: string;
      kind: 'shopPurchase';
      itemId: string;
      accepted: boolean;
      cost?: number;
    };

export interface ReplayKeyframe {
  tick: number;
  players: Record<string, PlayerState>;
}

export interface ReplayDataV2 {
  version: 2;
  date: string;
  seed: number;
  /** Stable player-slot mapping used to derive independent RNG channels. */
  playerSlots?: Record<string, number>;
  /** Optional snapshot cadence in ticks for frame-by-frame or sparse replays. */
  keyframeIntervalTicks?: number;
  initialState: GameState;
  inputs: ReplayInputFrame[];
  keyframes: ReplayKeyframe[];
  events: MatchEvent[];
}

// Legacy support for historical replay files.
export interface ReplayDataV1 {
  version: 1;
  date: string;
  initialState: GameState;
  frames: Array<{ tick: number; players: Record<string, Partial<PlayerState>> }>;
  events: Array<Record<string, unknown>>;
}

export type ReplayData = ReplayDataV2 | ReplayDataV1;

export {
  ATTACK_TABLE,
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  BOARD_VISIBLE_ROWS,
  CELL_SIZE,
  COMBO_BONUS_TABLE,
  COUNTDOWN_SECONDS,
  DAS_TICKS,
  GAME_DURATION,
  GAME_HEIGHT,
  GAME_TICK_RATE,
  GAME_WIDTH,
  GARBAGE_ARRIVAL_DELAY_TICKS,
  GRAVITY_TICKS_PER_CELL,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
  HORIZONTAL_SPEED_THRESHOLDS,
  LOCK_DELAY_TICKS,
  LOCK_RESET_CAP,
  LANDING_FORECAST_TICKS,
  NEXT_PREVIEW_COUNT,
  REPLAY_KEYFRAME_INTERVAL_TICKS,
  RESTART_DELAY_SECONDS,
  RETRIM_ACTIVATION_TICKS,
  RETRIM_COST,
  CURTAIN_COST,
  CURTAIN_TELEGRAPH_TICKS,
  CURTAIN_DURATION_TICKS,
  POISON_COST,
  POISON_SPREAD_INTERVAL_TICKS,
  POISON_GENERATIONS,
  STORAGE_POISON_COST,
  POISON_PURGE_COST,
  POISON_PURGE_TELEGRAPH_TICKS,
  WILDCARD_FOUR_COST,
  FREEZE_COST,
  FREEZE_DURATION_TICKS,
  STICKY_LOCK_RESET_CAP,
  STICKY_COST,
  MAGNET_COST,
  MAGNET_PERMANENT_MAX,
  MAGNET_PERMANENT_GRAVITY_STEP,
  MAGNET_PIECE_GRAVITY_STEP,
  MAGNET_GRAVITY_TICK_REDUCTION,
  MAGNET_MIN_GRAVITY_TICKS,
  SNAG_COST,
  TECTONIC_SHIFT_COST,
  TECTONIC_SHIFT_MIN_DURATION_MS,
  TECTONIC_SHIFT_MIN_DURATION_TICKS,
  TECTONIC_SHIFT_STEP_MS,
  TECTONIC_SHIFT_STEP_TICKS,
  BOUNTY_TAX_COST,
  BOUNTY_TAX_PERCENT,
  POISON_LINE_CLEAR_PENALTY_MAX_RATIO,
  SATELLITE_COST,
  SATELLITE_PACKET_DELAY_TICKS,
  SATELLITE_INCOMING_DELAY_TICKS,
  SATELLITE_DURATION_TICKS,
  BOMBER_COST,
  BOMBER_BLAST_RADIUS,
  SCORE_FLOAT_DURATION_SEC,
  SOFT_DROP_CELLS_PER_TICK,
  ARR_TICKS,
};
