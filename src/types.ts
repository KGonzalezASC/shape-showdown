import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  PADDLE_WIDTH, 
  PADDLE_HEIGHT, 
  BALL_RADIUS, 
  BUBBLE_RADIUS, 
  BUBBLE_ROWS, 
  BUBBLE_COLS, 
  GAME_DURATION,
  PADDLE_SPEED,
  BALL_LOSS_SCORE_PENALTY,
  SHOOT_COOLDOWN_SEC
} from './constants';

export interface Vector2 {
  x: number;
  y: number;
}

export interface Bubble {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  active: boolean;
}

export interface PlayerState {
  id: string;
  paddleX: number;
  /** -1 left, 0 none, 1 right — from client, applied each server tick */
  paddleInputDir: number;
  paddleWidth: number;
  paddleHeight: number;
  ballPos: Vector2;
  ballVel: Vector2;
  ballActive: boolean;
  bubbles: Bubble[];
  score: number;
  isReady: boolean;
  canShoot: boolean;
  shootDelay: number;
}

export interface GameState {
  players: { [id: string]: PlayerState };
  status: 'waiting' | 'countdown' | 'playing' | 'ended';
  countdown: number;
  remainingTime: number;
  winnerId: string | null;
}

export { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  PADDLE_WIDTH, 
  PADDLE_HEIGHT, 
  BALL_RADIUS, 
  BUBBLE_RADIUS, 
  BUBBLE_ROWS, 
  BUBBLE_COLS, 
  GAME_DURATION,
  PADDLE_SPEED,
  BALL_LOSS_SCORE_PENALTY,
  SHOOT_COOLDOWN_SEC
};
