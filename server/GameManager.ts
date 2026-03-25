import { Server, Socket } from "socket.io";
import { 
  GameState, 
  PlayerState, 
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
  Bubble
} from "../src/types.js";
import { Physics } from "./Physics.js";

export class GameManager {
  private io: Server;
  private gameState: GameState;

  constructor(io: Server) {
    this.io = io;
    this.gameState = {
      players: {},
      status: 'waiting',
      countdown: 3,
      remainingTime: GAME_DURATION,
      winnerId: null
    };

    this.startLoop();
  }

  private createBubbles(): Bubble[] {
    const bubbles: Bubble[] = [];
    const padding = 10;
    const startY = 50;
    const spacingX = (GAME_WIDTH - padding * 2) / BUBBLE_COLS;
    const spacingY = 40;

    for (let row = 0; row < BUBBLE_ROWS; row++) {
      for (let col = 0; col < BUBBLE_COLS; col++) {
        bubbles.push({
          id: `b-${row}-${col}`,
          x: padding + spacingX / 2 + col * spacingX,
          y: startY + row * spacingY,
          radius: BUBBLE_RADIUS,
          color: `hsl(${Math.random() * 360}, 70%, 60%)`,
          active: true
        });
      }
    }
    return bubbles;
  }

  private resetPlayer(id: string): PlayerState {
    const paddleX = (GAME_WIDTH - PADDLE_WIDTH) / 2;
    return {
      id,
      paddleX,
      paddleInputDir: 0,
      paddleWidth: PADDLE_WIDTH,
      paddleHeight: PADDLE_HEIGHT,
      ballPos: { x: paddleX + PADDLE_WIDTH / 2, y: GAME_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS - 5 },
      ballVel: { x: 0, y: 0 },
      ballActive: false,
      bubbles: this.createBubbles(),
      score: 0,
      isReady: false,
      canShoot: true,
      shootDelay: 0
    };
  }

  public handleConnection(socket: Socket) {
    if (Object.keys(this.gameState.players).length < 2) {
      this.gameState.players[socket.id] = this.resetPlayer(socket.id);
      this.io.emit("gameState", this.gameState);
    } else {
      socket.emit("error", "Game is full");
      socket.disconnect();
      return;
    }

    socket.on("paddleInput", (dir: number) => {
      const player = this.gameState.players[socket.id];
      if (!player) return;
      const d = dir === -1 || dir === 1 ? dir : 0;
      player.paddleInputDir = d;
    });

    socket.on("shootBall", () => {
      const player = this.gameState.players[socket.id];
      if (player && player.canShoot && !player.ballActive && this.gameState.status === 'playing') {
        player.ballActive = true;
        player.ballPos = { x: player.paddleX + PADDLE_WIDTH / 2, y: GAME_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS - 5 };
        player.ballVel = { x: (Math.random() - 0.5) * 10, y: -8 };
        player.canShoot = false;
      }
    });

    socket.on("disconnect", () => {
      delete this.gameState.players[socket.id];
      this.gameState.status = 'waiting';
      this.gameState.remainingTime = GAME_DURATION;
      this.io.emit("gameState", this.gameState);
    });
  }

  private startLoop() {
    setInterval(() => {
      this.update();
      this.io.emit("gameState", this.gameState);
    }, 1000 / 60);
  }

  private zeroPaddleInputs() {
    for (const id in this.gameState.players) {
      this.gameState.players[id].paddleInputDir = 0;
    }
  }

  private update() {
    if (this.gameState.status === 'waiting') {
      this.zeroPaddleInputs();
      if (Object.keys(this.gameState.players).length === 2) {
        this.gameState.status = 'countdown';
        this.gameState.countdown = 3;
      }
    } else if (this.gameState.status === 'countdown') {
      this.zeroPaddleInputs();
      this.gameState.countdown -= 1/60;
      if (this.gameState.countdown <= 0) {
        this.gameState.status = 'playing';
        this.gameState.remainingTime = GAME_DURATION;
      }
    } else if (this.gameState.status === 'playing') {
      this.gameState.remainingTime -= 1/60;
      if (this.gameState.remainingTime <= 0) {
        this.gameState.status = 'ended';
        const pIds = Object.keys(this.gameState.players);
        if (pIds.length === 2) {
          const p1 = this.gameState.players[pIds[0]];
          const p2 = this.gameState.players[pIds[1]];
          this.gameState.winnerId = p1.score > p2.score ? p1.id : (p2.score > p1.score ? p2.id : 'draw');
        }
      }

      const dt = 1 / 60;
      for (const id in this.gameState.players) {
        const player = this.gameState.players[id];

        const dir = player.paddleInputDir === -1 || player.paddleInputDir === 1 ? player.paddleInputDir : 0;
        player.paddleX = Math.max(
          0,
          Math.min(GAME_WIDTH - PADDLE_WIDTH, player.paddleX + dir * PADDLE_SPEED * dt)
        );

        if (!player.ballActive) {
          if (player.shootDelay > 0) {
            player.shootDelay -= dt;
            player.canShoot = false;
          }
          if (player.shootDelay <= 0) {
            player.shootDelay = 0;
            player.canShoot = true;
            player.ballPos = {
              x: player.paddleX + PADDLE_WIDTH / 2,
              y: GAME_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS - 5,
            };
          }
          continue;
        }

        const { allCleared } = Physics.updateBall(player);
        if (allCleared) {
          this.gameState.status = 'ended';
          this.gameState.winnerId = player.id;
        }
      }
    } else if (this.gameState.status === 'ended') {
      this.zeroPaddleInputs();
    }
  }
}
