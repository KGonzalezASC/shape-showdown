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
import {
  applyShopPurchase,
  openPlayerShop,
  resetPlayerShop,
  rollShopOnLineClear,
  tickPlayerShop,
} from './shop.js';

export class GameManager {
  private io: Server;
  private gameState: GameState;
  private activeReplay: ReplayDataV2 | null = null;
  private rng = makeRng(initialSeed());
  private readonly replayKeyframeIntervalTicks: number;
  private readonly netcastEveryNTicks: number;
  private readonly lobbyNetcastEveryNTicks: number;
  private lastHandledStatus: GameState['status'] = 'waiting';
  private prevLinesCleared: Record<string, number> = {};

  constructor(io: Server, replayKeyframeIntervalTicks = REPLAY_KEYFRAME_INTERVAL_TICKS) {
    this.io = io;
    this.replayKeyframeIntervalTicks = Math.max(1, Math.floor(replayKeyframeIntervalTicks));

    // Decouple the network broadcast rate from the 60Hz simulation. Emitting
    // full state 60x/sec is brutal on phones (radio wake-ups, JSON.parse,
    // React renders). Default to 30Hz during play, ~5Hz in the lobby. The
    // simulation stays authoritative at 60Hz. Tunable live via NETCAST_HZ.
    const hz = Number(process.env.NETCAST_HZ);
    this.netcastEveryNTicks = Number.isFinite(hz) && hz > 0 ? Math.max(1, Math.round(60 / hz)) : 2;
    this.lobbyNetcastEveryNTicks = Math.max(this.netcastEveryNTicks, 12);
    this.gameState = {
      players: {},
      status: 'waiting',
      countdown: COUNTDOWN_SECONDS,
      remainingTime: GAME_DURATION,
      winnerId: null,
      tick: 0,
      seed: this.rng.seed,
    };

    this.loopHandle = this.startLoop();
  }

  /** Test / shutdown hook — stops the 60Hz interval. */
  public stopLoop() {
    if (this.loopHandle !== null) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }

  private loopHandle: ReturnType<typeof setInterval> | null = null;

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

    socket.on('shopOpen', () => {
      if (this.gameState.status !== 'playing') return;
      const buyer = this.gameState.players[socket.id];
      if (!buyer) return;
      openPlayerShop(buyer, this.gameState.tick);
    });

    socket.on('shopPurchase', (itemId: string) => {
      if (this.gameState.status !== 'playing') return;
      if (typeof itemId !== 'string') return;
      const buyer = this.gameState.players[socket.id];
      if (!buyer) return;

      const pids = Object.keys(this.gameState.players);
      const opponentId = pids.find((id) => id !== socket.id);
      const opponent = opponentId ? this.gameState.players[opponentId] : null;
      applyShopPurchase(this.gameState, buyer, opponent, itemId, this.rng);
      // Flush immediately so cascade / pills aren't held back by the 30Hz netcast.
      this.io.emit('gameState', this.gameState);
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
    let sinceEmit = 0;
    let prevStatus = this.gameState.status;
    return setInterval(() => {
      this.update();
      sinceEmit += 1;

      // Always flush immediately on a status transition so lobby/countdown/
      // ended changes aren't held back by the slower lobby cadence.
      const statusChanged = this.gameState.status !== prevStatus;
      prevStatus = this.gameState.status;

      const active = this.gameState.status === 'playing' || this.gameState.status === 'countdown';
      const cascading = Object.values(this.gameState.players).some(
        (p) => p.tectonicShiftNextStepTick != null,
      );
      // Cascade is only readable if clients see every gravity step (60Hz while active).
      const interval = cascading ? 1 : active ? this.netcastEveryNTicks : this.lobbyNetcastEveryNTicks;
      if (statusChanged || sinceEmit >= interval) {
        sinceEmit = 0;
        this.io.emit('gameState', this.gameState);
      }
    }, 1000 / 60);
  }

  /** Exposed for interface-level lifecycle harnesses. */
  public tickOnceForTests() {
    this.update();
  }

  private clearInputs() {
    for (const id in this.gameState.players) {
      this.gameState.players[id].inputState = { left: false, right: false, softDrop: false };
      this.gameState.players[id].actionQueue = [];
    }
  }

  private handleStatusTransitions() {
    const status = this.gameState.status;
    if (status === this.lastHandledStatus) return;

    const prev = this.lastHandledStatus;
    this.lastHandledStatus = status;

    if (status === 'waiting' || status === 'countdown') {
      for (const id in this.gameState.players) {
        resetPlayerShop(this.gameState.players[id], this.rng);
      }
      this.prevLinesCleared = {};
    }

    if (status === 'playing' && prev !== 'playing') {
      for (const id in this.gameState.players) {
        this.prevLinesCleared[id] = 0;
      }
    }
  }

  private update() {
    this.handleStatusTransitions();
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
          keyframeIntervalTicks: this.replayKeyframeIntervalTicks,
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
      this.gameState.remainingTime = Math.max(0, this.gameState.remainingTime - tickSeconds());


      const matchEvents: MatchEvent[] = [];
      const pids = Object.keys(this.gameState.players);
      for (const id in this.gameState.players) {
        if (this.gameState.status !== 'playing') break;
        const player = this.gameState.players[id];
        const opponentId = pids.find((pid) => pid !== id);
        const opponent = opponentId ? this.gameState.players[opponentId] : null;
        const prevLines = this.prevLinesCleared[id] ?? player.linesCleared;
        stepPlayer(this.gameState, player, opponent, this.rng, matchEvents);
        if (player.linesCleared > prevLines) {
          rollShopOnLineClear(player, this.rng);
        }
        this.prevLinesCleared[id] = player.linesCleared;
        tickPlayerShop(player, this.gameState.tick);
        if (player.topOut) {
          this.gameState.status = 'ended';
          this.gameState.winnerId = opponent?.id ?? null;
          this.gameState.restartTimer = RESTART_DELAY_SECONDS;
          this.saveReplay();
          break;
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

      if (this.activeReplay && this.gameState.tick % this.replayKeyframeIntervalTicks === 0) {
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
