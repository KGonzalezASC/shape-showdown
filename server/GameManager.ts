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
  PendingShopEffect,
  PlayerState,
  REPLAY_KEYFRAME_INTERVAL_TICKS,
  ReplayData,
  ReplayDataV2,
  RESTART_DELAY_SECONDS,
  RETRIM_ACTIVATION_TICKS,
  RETRIM_COST,
  CURTAIN_COST,
  CURTAIN_TELEGRAPH_TICKS,
  POISON_COST,
  POISON_GENERATIONS,
  POISON_PURGE_COST,
  POISON_PURGE_TELEGRAPH_TICKS,
  FREEZE_COST,
  FREEZE_DURATION_TICKS,
  STICKY_COST,
  MAGNET_COST,
  SNAG_COST,
  SATELLITE_COST,
  BOMBER_COST,
} from '../src/types.js';
import {
  initialSeed,
  makePlayer,
  makeRng,
  replayDateLabel,
  applyMagnetToOpponent,
  applySnagToOpponent,
  armSatelliteToBuyer,
  applyBomberToBuyer,
  applyStickyToActivePiece,
  stepPlayer,
  tickSeconds,
} from './tetris/engine.js';

export class GameManager {
  private io: Server;
  private gameState: GameState;
  private activeReplay: ReplayDataV2 | null = null;
  private rng = makeRng(initialSeed());
  private readonly replayKeyframeIntervalTicks: number;
  private readonly netcastEveryNTicks: number;
  private readonly lobbyNetcastEveryNTicks: number;

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

    socket.on('shopPurchase', (itemId: string) => {
      if (this.gameState.status !== 'playing') return;
      const buyer = this.gameState.players[socket.id];
      if (!buyer) return;

      const SELF_SHOP_ITEMS = new Set(['satellite-link', 'nova-charge']);

      // Authoritative cost per item (mirrors the client SHOP_MOCK_POOL costs).
      const COSTS: Record<string, number> = {
        retrim: RETRIM_COST,
        curtain: CURTAIN_COST,
        'elixir-pulse': POISON_COST,
        'vortex-step': POISON_PURGE_COST,
        'frost-shift': FREEZE_COST,
        'quickstep-clock': STICKY_COST,
        'gravity-lure': MAGNET_COST,
        'fortify-frame': SNAG_COST,
        'satellite-link': SATELLITE_COST,
        'nova-charge': BOMBER_COST,
      };
      const cost = COSTS[itemId];
      if (cost === undefined) return; // Unknown / not-yet-implemented item.
      if (buyer.score < cost) return;

      const pids = Object.keys(this.gameState.players);
      const opponentId = pids.find((id) => id !== socket.id);
      const opponent = opponentId ? this.gameState.players[opponentId] : null;
      if (!SELF_SHOP_ITEMS.has(itemId) && !opponent) return;
      // Deduct cost from the server's authoritative score so it can't be spammed.
      buyer.score -= cost;
      if (!buyer.activeEffects) buyer.activeEffects = [];
      if (opponent && !opponent.activeEffects) opponent.activeEffects = [];

      if (itemId === 'retrim') {
        opponent.pendingShopEffects.push({
          itemId: 'retrim',
          activationTick: this.gameState.tick + RETRIM_ACTIVATION_TICKS,
        });
        // Show a visual warning pill to the opponent
        opponent.activeEffects.push({
          id: `retrim-${this.gameState.tick}`,
          label: 'Retrimmed',
          icon: '✂️',
          bgClass: 'bg-rose-900/80',
          borderClass: 'border-rose-400',
          textClass: 'text-rose-100',
          glowClass: 'shadow-[0_0_10px_rgba(244,63,94,0.7)]',
          expiresAtTick: this.gameState.tick + 240, // Shows for 4 seconds
        });
      } else if (itemId === 'curtain') {
        // Telegraph first; the engine drops the real overlay at activationTick.
        opponent.pendingShopEffects.push({
          itemId: 'curtain',
          activationTick: this.gameState.tick + CURTAIN_TELEGRAPH_TICKS,
        });
        // Warning pill during the telegraph window, then the overlay takes over.
        opponent.activeEffects.push({
          id: `curtain-warn-${this.gameState.tick}`,
          label: 'Curtain incoming',
          icon: '🎭',
          bgClass: 'bg-indigo-900/80',
          borderClass: 'border-indigo-400',
          textClass: 'text-indigo-100',
          glowClass: 'shadow-[0_0_10px_rgba(129,140,248,0.7)]',
          expiresAtTick: this.gameState.tick + CURTAIN_TELEGRAPH_TICKS,
        });
      } else if (itemId === 'elixir-pulse') {
        // The poison's colour is rolled randomly — a 1-in-4 chance per variant.
        // Whatever lands is the single colour the piece spreads through the stack.
        const variant = Math.floor(Math.random() * 4) + 1;

        // Apply immediately to the active piece, or flag the next spawn.
        if (opponent.activePiece) {
          opponent.activePiece.poisoned = true;
          opponent.activePiece.poisonVariant = variant;
        } else {
          const stackEmpty = opponent.board.every((row) => row.every((cell) => cell === null));
          if (!stackEmpty) {
            opponent.poisonNextPiece = true;
            opponent.poisonNextVariant = variant;
          }
        }
        // Warning pill so the victim sees the poison land.
        opponent.activeEffects.push({
          id: `poison-${this.gameState.tick}`,
          label: 'Poisoned',
          icon: '🧪',
          bgClass: 'bg-fuchsia-900/80',
          borderClass: 'border-fuchsia-400',
          textClass: 'text-fuchsia-100',
          glowClass: 'shadow-[0_0_10px_rgba(217,70,239,0.7)]',
          expiresAtTick: this.gameState.tick + 180, // ~3s
        });
      } else if (itemId === 'vortex-step') {
        const variant = Math.floor(Math.random() * POISON_GENERATIONS) + 1;
        opponent.pendingShopEffects.push({
          itemId: 'vortex-step',
          activationTick: this.gameState.tick + POISON_PURGE_TELEGRAPH_TICKS,
          poisonVariant: variant,
        });
        const variantLabels = ['Magenta', 'Lime', 'Indigo', 'Teal'] as const;
        opponent.activeEffects.push({
          id: `purge-warn-${this.gameState.tick}`,
          label: `Wild ${variantLabels[variant - 1]}`,
          icon: '🃏',
          bgClass: 'bg-fuchsia-900/80',
          borderClass: 'border-fuchsia-400',
          textClass: 'text-fuchsia-100',
          glowClass: 'shadow-[0_0_10px_rgba(217,70,239,0.7)]',
          expiresAtTick: this.gameState.tick + POISON_PURGE_TELEGRAPH_TICKS,
        });
      } else if (itemId === 'frost-shift') {
        const until = this.gameState.tick + FREEZE_DURATION_TICKS;
        opponent.holdFrozenUntilTick = Math.max(opponent.holdFrozenUntilTick ?? 0, until);
        opponent.activeEffects.push({
          id: `freeze-active-${this.gameState.tick}`,
          label: 'Frozen',
          icon: '❄️',
          bgClass: 'bg-sky-900/80',
          borderClass: 'border-sky-300',
          textClass: 'text-sky-100',
          glowClass: 'shadow-[0_0_10px_rgba(56,189,248,0.7)]',
          expiresAtTick: until,
        });
      } else if (itemId === 'gravity-lure') {
        applyMagnetToOpponent(opponent);
        const permanent = opponent.magnetPermanentStacks ?? 0;
        const pieceBoost = opponent.magnetPieceBoost ?? 0;
        const pull = permanent * 2 + pieceBoost;
        const label = pieceBoost > 0 ? `Magnet +${pull}` : `Magnet ×${permanent} (+${pull})`;
        opponent.activeEffects.push({
          id: `magnet-${this.gameState.tick}`,
          label,
          icon: '🧲',
          bgClass: 'bg-violet-900/80',
          borderClass: 'border-violet-400',
          textClass: 'text-violet-100',
          glowClass: 'shadow-[0_0_10px_rgba(167,139,250,0.7)]',
          expiresAtTick: this.gameState.tick + 180,
        });
      } else if (itemId === 'fortify-frame') {
        applySnagToOpponent(opponent!);
        opponent.activeEffects.push({
          id: `snag-${this.gameState.tick}`,
          label: 'Snagged',
          icon: '🪝',
          bgClass: 'bg-orange-900/80',
          borderClass: 'border-orange-400',
          textClass: 'text-orange-100',
          glowClass: 'shadow-[0_0_10px_rgba(251,146,60,0.7)]',
          expiresAtTick: this.gameState.tick + 180,
        });
      } else if (itemId === 'quickstep-clock') {
        applyStickyToActivePiece(opponent!);
        opponent!.activeEffects!.push({
          id: `sticky-${this.gameState.tick}`,
          label: 'Sticky',
          icon: '⏱️',
          bgClass: 'bg-teal-900/80',
          borderClass: 'border-teal-300',
          textClass: 'text-teal-100',
          glowClass: 'shadow-[0_0_10px_rgba(45,212,191,0.7)]',
          expiresAtTick: this.gameState.tick + 180,
        });
      } else if (itemId === 'satellite-link') {
        armSatelliteToBuyer(buyer, this.gameState.tick);
        const activated = (buyer.satelliteDelayUntilTick ?? 0) > this.gameState.tick;
        buyer.activeEffects.push({
          id: `satellite-${this.gameState.tick}`,
          label: activated ? 'Satellite' : 'Satellite armed',
          icon: '🛰️',
          bgClass: 'bg-zinc-800/90',
          borderClass: 'border-zinc-300',
          textClass: 'text-zinc-100',
          glowClass: 'shadow-[0_0_10px_rgba(212,212,216,0.5)]',
          expiresAtTick: activated
            ? buyer.satelliteDelayUntilTick!
            : this.gameState.tick + 3600,
        });
      } else if (itemId === 'nova-charge') {
        applyBomberToBuyer(buyer);
        buyer.activeEffects.push({
          id: `bomber-${this.gameState.tick}`,
          label: 'Bomber',
          icon: '💣',
          bgClass: 'bg-rose-900/80',
          borderClass: 'border-rose-400',
          textClass: 'text-rose-100',
          glowClass: 'shadow-[0_0_10px_rgba(251,113,133,0.7)]',
          expiresAtTick: this.gameState.tick + 240,
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
    let sinceEmit = 0;
    let prevStatus = this.gameState.status;
    setInterval(() => {
      this.update();
      sinceEmit += 1;

      // Always flush immediately on a status transition so lobby/countdown/
      // ended changes aren't held back by the slower lobby cadence.
      const statusChanged = this.gameState.status !== prevStatus;
      prevStatus = this.gameState.status;

      const active = this.gameState.status === 'playing' || this.gameState.status === 'countdown';
      const interval = active ? this.netcastEveryNTicks : this.lobbyNetcastEveryNTicks;
      if (statusChanged || sinceEmit >= interval) {
        sinceEmit = 0;
        this.io.emit('gameState', this.gameState);
      }
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
