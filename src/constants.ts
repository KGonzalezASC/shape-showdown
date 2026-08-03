// Shape Showdown uses a compact 10×18 visible arena with two hidden spawn rows.
// The hidden buffer provides spawn/kick space while keeping the internal board
// at 10×20 rows.
export const BOARD_COLS = 10;
export const BOARD_VISIBLE_ROWS = 18;
export const BOARD_HIDDEN_ROWS = 2;
export const BOARD_ROWS = BOARD_VISIBLE_ROWS + BOARD_HIDDEN_ROWS;

export const CELL_SIZE = 28;
export const GAME_WIDTH = BOARD_COLS * CELL_SIZE;
export const GAME_HEIGHT = BOARD_VISIBLE_ROWS * CELL_SIZE;

export const GAME_DURATION = 120;
export const GAME_TICK_RATE = 60;
export const COUNTDOWN_SECONDS = 3;
export const RESTART_DELAY_SECONDS = 5;

export const NEXT_PREVIEW_COUNT = 5;
/** Server ticks for the temporary Landing Forecast shown after a piece spawns. */
export const LANDING_FORECAST_TICKS = 40;
export const LOCK_DELAY_TICKS = 24; // 0.4s @ 60hz
export const LOCK_RESET_CAP = 10;
export const HOLD_SWAP_CUTOFF_VISIBLE_ROW = 8;
export const GARBAGE_ARRIVAL_DELAY_TICKS = 18; // 300ms @ 60hz
export const RETRIM_ACTIVATION_TICKS = 60; // 2 rows of gravity (1s @ 60Hz)
export const RETRIM_COST = 120;
// Curtain: a timed frost overlay dropped on the opponent's field below their swap line.
export const CURTAIN_COST = 140;
export const CURTAIN_TELEGRAPH_TICKS = 60; // 1s warning pill before the curtain drops
export const CURTAIN_DURATION_TICKS = 240; // 4s blackout once active
// Poison (Elixir): poisons the opponent's active piece. On lock it seeds wave 1
// and spreads to orthogonally-adjacent stack/garbage cells once per interval,
// up to POISON_GENERATIONS total waves. Poison is permanent — it only stops
// spreading; afflicted cells stay poisoned for the rest of the match.
export const POISON_COST = 55;
export const POISON_SPREAD_INTERVAL_TICKS = 60; // ~1s between waves @ 60Hz
export const POISON_GENERATIONS = 4; // total waves incl. the lock wave (also = # of color variants)
// Contagion (storage-toxin): poisons the opponent's held piece; gated on non-empty storage.
export const STORAGE_POISON_COST = 50;
// Wild Purge (Uno-style): rolls one poison colour, then after a telegraph removes every
// opponent cell of that variant as holes (no gravity, no line-clear score for the victim).
export const POISON_PURGE_COST = 70;
export const POISON_PURGE_TELEGRAPH_TICKS = 60; // ~1s warning @ 60Hz
// Wildcard +4: copies the largest 4-connected poison blotch (≤6 cells) onto opponent's next piece.
export const WILDCARD_FOUR_COST = 60;
// Freeze (Frost): opponent cannot store into or swap from hold for the duration.
export const FREEZE_COST = 45;
export const FREEZE_DURATION_TICKS = 600; // 10s @ 60Hz
// Sticky: opponent's current piece only gets this many lock-delay move/rotate resets (default cap is 10).
export const STICKY_LOCK_RESET_CAP = 2;
export const STICKY_COST = 50; // Freeze + 5
// Magnet: opponent falls faster — 3 permanent buys (+2 gravity each, max +6), then +1 temp per buy until lock.
export const MAGNET_COST = 125;
export const MAGNET_PERMANENT_MAX = 3;
/** Gravity level added per permanent magnet purchase (×3 max = 6). */
export const MAGNET_PERMANENT_GRAVITY_STEP = 2;
/** Gravity level added per post-cap purchase on the current piece until lock. */
export const MAGNET_PIECE_GRAVITY_STEP = 1;
/** Ticks shaved off GRAVITY_TICKS_PER_CELL per gravity level. */
export const MAGNET_GRAVITY_TICK_REDUCTION = 5;
export const MAGNET_MIN_GRAVITY_TICKS = 12;
// Snag (fortify-frame id): opponent cannot hard-drop current/next piece until lock or hold.
export const SNAG_COST = 48;
// Tectonic Shift: animated column gravity; cleared lines don't score, send garbage, or shop-roll.
export const TECTONIC_SHIFT_COST = 140;
/** Floor for the full cascade (start → silent clear / unpause). */
export const TECTONIC_SHIFT_MIN_DURATION_MS = 300;
/** Fallback / minimum spacing between one-row gravity steps when the fall is deep. */
export const TECTONIC_SHIFT_STEP_MS = 75;
export const TECTONIC_SHIFT_MIN_DURATION_TICKS = Math.max(
  1,
  Math.round((GAME_TICK_RATE * TECTONIC_SHIFT_MIN_DURATION_MS) / 1000),
);
export const TECTONIC_SHIFT_STEP_TICKS = Math.max(
  1,
  Math.round((GAME_TICK_RATE * TECTONIC_SHIFT_STEP_MS) / 1000),
);
// Tax Siphon: steals a percentage of the opponent's score/funds if they are ahead.
export const BOUNTY_TAX_COST = 50;
export const BOUNTY_TAX_PERCENT = 0.30;
// Poison Line Clear Penalty Max Ratio: max percentage score is reduced by if lines contain poison
export const POISON_LINE_CLEAR_PENALTY_MAX_RATIO = 0.50;
// Satellite (self): delays incoming garbage — immediate push on queued packets + bonus delay on new garbage for a window.
export const SATELLITE_COST = 80;
export const SATELLITE_PACKET_DELAY_TICKS = 90; // ~1.5s added per packet on purchase
export const SATELLITE_INCOMING_DELAY_TICKS = 90; // extra delay on newly queued garbage while active
export const SATELLITE_DURATION_TICKS = 600; // 10s @ 60Hz
// Bomber (self): next piece detonates in a circle on lock; blast holes only (no gravity / no blast score).
export const BOMBER_COST = 110;
export const BOMBER_BLAST_RADIUS = 2; // Euclidean circle in cells
export const GRAVITY_TICKS_PER_CELL = 30;
export const SOFT_DROP_CELLS_PER_TICK = 1;
export const DAS_TICKS = 10;
export const ARR_TICKS = 2;
export const REPLAY_KEYFRAME_INTERVAL_TICKS = 30;
export const HORIZONTAL_SPEED_THRESHOLDS = [
  { minScore: 0, dasTicks: 16, arrTicks: 6 },
  { minScore: 600, dasTicks: 14, arrTicks: 5 },
  { minScore: 1600, dasTicks: 12, arrTicks: 4 },
  { minScore: 3000, dasTicks: DAS_TICKS, arrTicks: ARR_TICKS },
] as const;

export const SCORE_FLOAT_DURATION_SEC = 1;

export const ATTACK_TABLE = {
  single: 1,
  double: 1,
  triple: 2,
  tetris: 4,
  tSpinMiniSingle: 1,
  tSpinMiniDouble: 2,
  tSpinSingle: 2,
  tSpinDouble: 4,
  tSpinTriple: 6,
  perfectClear: 10,
  backToBackBonus: 1,
} as const;

export const COMBO_BONUS_TABLE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
