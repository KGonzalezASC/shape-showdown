import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  PADDLE_WIDTH, 
  PADDLE_HEIGHT, 
  BALL_RADIUS, 
  BUBBLE_RADIUS, 
  BALL_LOSS_SCORE_PENALTY,
  SHOOT_COOLDOWN_SEC,
  PlayerState 
} from '../src/types.js';

export class Physics {
  static updateBall(player: PlayerState): { allCleared: boolean } {
    if (!player.ballActive) return { allCleared: false };

    // Move ball
    player.ballPos.x += player.ballVel.x;
    player.ballPos.y += player.ballVel.y;

    // Wall collisions
    if (player.ballPos.x - BALL_RADIUS < 0 || player.ballPos.x + BALL_RADIUS > GAME_WIDTH) {
      player.ballVel.x *= -1;
      player.ballPos.x = player.ballPos.x < BALL_RADIUS ? BALL_RADIUS : GAME_WIDTH - BALL_RADIUS;
    }
    if (player.ballPos.y - BALL_RADIUS < 0) {
      player.ballVel.y *= -1;
      player.ballPos.y = BALL_RADIUS;
    }

    // Paddle collision
    if (
      player.ballPos.y + BALL_RADIUS > GAME_HEIGHT - PADDLE_HEIGHT &&
      player.ballPos.x > player.paddleX &&
      player.ballPos.x < player.paddleX + PADDLE_WIDTH
    ) {
      player.ballVel.y *= -1.05; // Slightly speed up
      const hitPoint = (player.ballPos.x - (player.paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
      player.ballVel.x = hitPoint * 10;
      player.ballPos.y = GAME_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS;
    }

    // Bubble collisions
    let allCleared = true;
    for (const bubble of player.bubbles) {
      if (!bubble.active) continue;
      allCleared = false;
      const dx = player.ballPos.x - bubble.x;
      const dy = player.ballPos.y - bubble.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < BALL_RADIUS + BUBBLE_RADIUS) {
        bubble.active = false;
        player.score += 10;
        // Simple bounce logic
        if (Math.abs(dx) > Math.abs(dy)) player.ballVel.x *= -1;
        else player.ballVel.y *= -1;
        break;
      }
    }

    // Fall out
    if (player.ballPos.y > GAME_HEIGHT) {
      player.ballActive = false;
      player.shootDelay = SHOOT_COOLDOWN_SEC;
      player.score = Math.max(0, player.score - BALL_LOSS_SCORE_PENALTY);
    }

    return { allCleared };
  }
}
