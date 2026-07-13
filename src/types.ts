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
  POISON_PURGE_COST,
  POISON_PURGE_TELEGRAPH_TICKS,
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
export type CellValue = TetrominoType | 'G' | null;
export type ActionType = 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

export interface ShopItem {
  id: string;
  name: string;
  icon: string;
  cost: number;
  tier: 1 | 2;
  baseWeight: number;
  colorClass: string;
  borderColorClass: string;
  description: string;
  synergyTargetId?: string;
  synergyBoost?: number;
}

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
  ownedIds: string[];
}

/**
 * An effect currently being applied to a player's field by the opponent.
 * All styling is driven by Tailwind class strings so each shop item can
 * have its own visual identity without hard-coding colours in the component.
 */
export interface ActiveFieldEffect {
  /** Unique ID matching the originating ShopItem.id */
  id: string;
  /** Short display label shown in the pill (e.g. "Frost", "Nova") */
  label: string;
  /** Optional emoji / icon prefix */
  icon?: string;
  /**
   * Tailwind bg class(es) for the pill body.
   * Supports gradients: e.g. "bg-gradient-to-r from-sky-600 to-cyan-400"
   * or simple: "bg-rose-600/80"
   */
  bgClass: string;
  /** Border colour class, e.g. "border-sky-300/60" */
  borderClass: string;
  /** Text colour class, defaults to "text-white" when omitted */
  textClass?: string;
  /**
   * Optional glow / shadow class applied to the pill wrapper.
   * e.g. "shadow-[0_0_10px_rgba(56,189,248,0.7)]"
   */
  glowClass?: string;
  /** Tick at which this effect expires (for future countdown display) */
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
  holdPiece: TetrominoType | null;
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
  | { tick: number; type: 'topOut'; playerId: string };

export interface ReplayInputFrame {
  tick: number;
  playerId: string;
  kind: 'inputState' | 'action';
  inputState?: InputState;
  action?: ActionType;
}

export interface ReplayKeyframe {
  tick: number;
  players: Record<string, PlayerState>;
}

export interface ReplayDataV2 {
  version: 2;
  date: string;
  seed: number;
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
  POISON_PURGE_COST,
  POISON_PURGE_TELEGRAPH_TICKS,
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
