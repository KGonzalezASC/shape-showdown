export const BOARD_COLS = 10;
export const BOARD_VISIBLE_ROWS = 20;
export const BOARD_HIDDEN_ROWS = 20;
export const BOARD_ROWS = BOARD_VISIBLE_ROWS + BOARD_HIDDEN_ROWS;

export const CELL_SIZE = 28;
export const GAME_WIDTH = BOARD_COLS * CELL_SIZE;
export const GAME_HEIGHT = BOARD_VISIBLE_ROWS * CELL_SIZE;

export const GAME_DURATION = 120;
export const GAME_TICK_RATE = 60;
export const COUNTDOWN_SECONDS = 3;
export const RESTART_DELAY_SECONDS = 5;

export const NEXT_PREVIEW_COUNT = 5;
export const LOCK_DELAY_TICKS = 24; // 0.4s @ 60hz
export const LOCK_RESET_CAP = 10;
export const HOLD_SWAP_CUTOFF_VISIBLE_ROW = 10;
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
