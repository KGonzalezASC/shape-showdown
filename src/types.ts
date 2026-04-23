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
  HORIZONTAL_SPEED_THRESHOLDS,
  LOCK_DELAY_TICKS,
  LOCK_RESET_CAP,
  NEXT_PREVIEW_COUNT,
  REPLAY_KEYFRAME_INTERVAL_TICKS,
  RESTART_DELAY_SECONDS,
  SCORE_FLOAT_DURATION_SEC,
  SOFT_DROP_CELLS_PER_TICK,
  ARR_TICKS,
} from './constants';

export type MatchStatus = 'waiting' | 'countdown' | 'playing' | 'ended';
export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export type RotationState = 0 | 1 | 2 | 3;
export type CellValue = TetrominoType | 'G' | null;
export type ActionType = 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

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
}

export interface PendingGarbagePacket {
  lines: number;
  arrivalTick: number;
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
  lastActionWasRotate: boolean;
  pendingGarbage: PendingGarbagePacket[];
  topOut: boolean;
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
  HORIZONTAL_SPEED_THRESHOLDS,
  LOCK_DELAY_TICKS,
  LOCK_RESET_CAP,
  NEXT_PREVIEW_COUNT,
  REPLAY_KEYFRAME_INTERVAL_TICKS,
  RESTART_DELAY_SECONDS,
  SCORE_FLOAT_DURATION_SEC,
  SOFT_DROP_CELLS_PER_TICK,
  ARR_TICKS,
};
