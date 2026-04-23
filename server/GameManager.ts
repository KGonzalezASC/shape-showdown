import { Server, Socket } from 'socket.io';
import fs from 'fs';
import path from 'path';
import {
  ActionType,
  COUNTDOWN_SECONDS,
  GAME_DURATION,
  GameState,
  InputState,
  MatchEvent,
  PlayerState,
  REPLAY_KEYFRAME_INTERVAL_TICKS,
  ReplayData,
  ReplayDataV2,
  RESTART_DELAY_SECONDS,
} from '../src/types.js';
import {
  initialSeed,
  makePlayer,
  makeRng,
  replayDateLabel,
  stepPlayer,
  tickSeconds,
} from './tetris/engine.js';

export class GameManager {
  private io: Server;
  private gameState: GameState;
  private activeReplay: ReplayDataV2 | null = null;
  private rng = makeRng(initialSeed());

  constructor(io: Server) {
    this.io = io;
    this.gameState = {
      players: {},
      status: 'waiting',
      countdown: COUNTDOWN_SECONDS,
      remainingTime: GAME_DURATION,
      winnerId: null,
      tick: 0,
      seed: this.rng.seed,
    };

    this.startLoop();
  }

  public handleConnection(socket: Socket) {
    if (Object.keys(this.gameState.players).length < 2) {
      this.gameState.players[socket.id] = makePlayer(socket.id, this.rng);
      this.io.emit("gameState", this.gameState);
    } else {
      socket.emit("error", "Game is full");
      socket.disconnect();
      return;
    }

    socket.on('inputState', (input: InputState) => {
      const player = this.gameState.players[socket.id];
      if (!player) return;
      player.inputState = {
        left: !!input?.left,
        right: !!input?.right,
        softDrop: !!input?.softDrop,
      };
      if (this.activeReplay && this.gameState.status === 'playing') {
        this.activeReplay.inputs.push({
          tick: this.gameState.tick,
          playerId: socket.id,
          kind: 'inputState',
          inputState: player.inputState,
        });
      }
    });

    socket.on('action', (action: ActionType) => {
      const player = this.gameState.players[socket.id];
      if (!player || this.gameState.status !== 'playing') return;
      if (!['rotateCW', 'rotateCCW', 'hardDrop', 'hold'].includes(action)) return;
      player.actionQueue.push(action);
      if (this.activeReplay) {
        this.activeReplay.inputs.push({
          tick: this.gameState.tick,
          playerId: socket.id,
          kind: 'action',
          action,
        });
      }
    });

    socket.on("disconnect", () => {
      if (this.gameState.status === 'playing') {
        const remainingIds = Object.keys(this.gameState.players).filter(id => id !== socket.id);
        if (remainingIds.length === 1) {
          this.gameState.status = 'ended';
          this.gameState.winnerId = remainingIds[0];
          this.gameState.technicalVictory = true;
          this.gameState.restartTimer = RESTART_DELAY_SECONDS;
        } else {
          this.gameState.status = 'waiting';
          this.gameState.remainingTime = GAME_DURATION;
          this.gameState.restartTimer = undefined;
        }
      } else {
        this.gameState.status = 'waiting';
        this.gameState.remainingTime = GAME_DURATION;
        this.gameState.restartTimer = undefined;
      }
      delete this.gameState.players[socket.id];
      this.io.emit("gameState", this.gameState);
    });
  }

  private startLoop() {
    setInterval(() => {
      this.update();
      this.io.emit("gameState", this.gameState);
    }, 1000 / 60);
  }

  private clearInputs() {
    for (const id in this.gameState.players) {
      this.gameState.players[id].inputState = { left: false, right: false, softDrop: false };
      this.gameState.players[id].actionQueue = [];
    }
  }

  private update() {
    if (this.gameState.status === 'waiting') {
      this.clearInputs();
      if (Object.keys(this.gameState.players).length === 2) {
        this.gameState.status = 'countdown';
        this.gameState.countdown = COUNTDOWN_SECONDS;
      }
    } else if (this.gameState.status === 'countdown') {
      this.clearInputs();
      this.gameState.countdown -= tickSeconds();
      if (this.gameState.countdown <= 0) {
        this.gameState.status = 'playing';
        this.gameState.remainingTime = GAME_DURATION;
        this.gameState.tick = 0;
        this.rng = makeRng(this.gameState.seed);
        this.activeReplay = {
          version: 2,
          date: replayDateLabel(),
          seed: this.gameState.seed,
          initialState: JSON.parse(JSON.stringify(this.gameState)),
          inputs: [],
          keyframes: [
            {
              tick: 0,
              players: JSON.parse(JSON.stringify(this.gameState.players)),
            },
          ],
          events: []
        };
      }
    } else if (this.gameState.status === 'playing') {
      this.gameState.tick += 1;
      this.gameState.remainingTime -= tickSeconds();
      if (this.gameState.remainingTime <= 0) {
        this.gameState.status = 'ended';
        this.gameState.restartTimer = RESTART_DELAY_SECONDS;
        const pIds = Object.keys(this.gameState.players);
        if (pIds.length === 2) {
          const p1 = this.gameState.players[pIds[0]];
          const p2 = this.gameState.players[pIds[1]];
          this.gameState.winnerId = p1.score > p2.score ? p1.id : (p2.score > p1.score ? p2.id : 'draw');
        }
        this.saveReplay();
      }

      const matchEvents: MatchEvent[] = [];
      const pids = Object.keys(this.gameState.players);
      for (const id in this.gameState.players) {
        const player = this.gameState.players[id];
        const opponentId = pids.find((pid) => pid !== id);
        const opponent = opponentId ? this.gameState.players[opponentId] : null;
        stepPlayer(this.gameState, player, opponent, this.rng, matchEvents);
        if (player.topOut) {
          this.gameState.status = 'ended';
          this.gameState.winnerId = opponent?.id ?? null;
          this.gameState.restartTimer = RESTART_DELAY_SECONDS;
          this.saveReplay();
        }
      }

      if (this.activeReplay && matchEvents.length > 0) {
        this.activeReplay.events.push(...matchEvents);
      }
      if (matchEvents.length > 0) {
        for (const ev of matchEvents) {
          this.io.emit('matchEvent', ev);
        }
      }

      if (this.activeReplay && this.gameState.tick % REPLAY_KEYFRAME_INTERVAL_TICKS === 0) {
        this.activeReplay.keyframes.push({
          tick: this.gameState.tick,
          players: JSON.parse(JSON.stringify(this.gameState.players)),
        });
      }
    } else if (this.gameState.status === 'ended') {
      this.clearInputs();
      if (this.gameState.restartTimer !== undefined) {
        this.gameState.restartTimer -= tickSeconds();
        if (this.gameState.restartTimer <= 0) {
          this.gameState.restartTimer = undefined;
          this.gameState.technicalVictory = false;
          this.gameState.seed = initialSeed();
          this.rng = makeRng(this.gameState.seed);
          for (const id in this.gameState.players) {
            this.gameState.players[id] = makePlayer(id, this.rng);
          }
          this.gameState.status = 'countdown';
          this.gameState.countdown = COUNTDOWN_SECONDS;
        }
      }
    }
  }

  private saveReplay() {
    if (!this.activeReplay) return;
    try {
      const replaysDir = process.env.REPLAYS_DIR 
        ? path.resolve(process.env.REPLAYS_DIR)
        : path.join(process.cwd(), 'public', 'replays');

      if (!fs.existsSync(replaysDir)) {
        fs.mkdirSync(replaysDir, { recursive: true });
      }
      const filename = `replay_${this.activeReplay.date}.replay`;
      fs.writeFileSync(path.join(replaysDir, filename), JSON.stringify(this.activeReplay));
    } catch (e) {
      console.error("Failed to save replay:", e);
    }
    this.activeReplay = null;
  }
}

