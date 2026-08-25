import { Server, Socket } from 'socket.io';
import fs from 'fs';
import path from 'path';
import {
  ActionType,
  CHECKPOINT_INTERVAL_TICKS,
  COUNTDOWN_SECONDS,
  GameState,
  InputState,
  MatchAssignment,
  REPLAY_KEYFRAME_INTERVAL_TICKS,
  ReplayDiscontinuity,
  ReplayDataV2,
  ReplayInputFrame,
  RESTART_DELAY_SECONDS,
  SocketAuthErrorPayload,
} from '../src/types.js';
import {
  initialSeed,
  makePlayer,
  replayDateLabel,
  tickSeconds,
} from './puzzleEngine/engine.js';
import { matchStep } from './puzzleEngine/matchStep.js';
import { createPlayerRngChannels, type RngChannels } from '../src/rng.js';
import { SHOP_ITEM_BY_ID } from '../src/shop/shopCatalog.js';
import { getPricingView, PRICING_POLICY_VERSION } from '../src/shop/shopPricing.js';
import {
  applyShopPurchase,
  openPlayerShop,
  resetPlayerShop,
} from './shop.js';
import type { MatchPersistence } from './controlPlane/matchPersistence.js';
import type { JoinTicket } from './controlPlane/matchStore.js';
import { logError, logInfo, logWarn } from './observability/logger.js';
import type {
  MatchOutcomeReason,
  MatchResultStats,
} from './controlPlane/matchResultStore.js';
import { GAME_PROTOCOL_VERSION } from '../src/protocol/version.js';
import { MatchPacketSync } from './sync/MatchPacketSync.js';
import { DISCONNECT_SEAT_LEASE_MS } from '../src/constants.js';

export type SocketSeatBinding = Omit<MatchAssignment, 'ticket'>;

export class GameManager {
  private io: Server;
  private gameState: GameState;
  private activeReplay: ReplayDataV2 | null = null;
  private pendingReplayDiscontinuities: ReplayDiscontinuity[] = [];
  private readonly matchSeed = initialSeed();
  private readonly playerSlots = new Map<string, number>();
  private rngChannelsByPlayer = new Map<string, RngChannels>();
  private readonly replayKeyframeIntervalTicks: number;
  private readonly netcastEveryNTicks: number;
  private readonly lobbyNetcastEveryNTicks: number;
  private readonly packetSync: MatchPacketSync;
  private lastTickEvents: import('../src/types.js').MatchEvent[] = [];
  private lastHandledStatus: GameState['status'] = 'waiting';
  private readonly persistence?: MatchPersistence;
  private readonly onMatchCreated?: (matchId: string) => void;
  private readonly onRecoveryReady?: () => void;
  private readonly onTerminal?: () => void;
  private readonly disconnectLeaseMs: number;
  private readonly durablePlayerIds = new Map<string, string>();
  private readonly runtimeIdBySocketId = new Map<string, string>();
  private readonly activeSocketByRuntimeId = new Map<string, Socket>();
  private readonly terminalPlayerStats = new Map<string, MatchResultStats>();
  private durableMatchId: string | null = null;
  private durableMatchPreallocated = false;
  private restoredAwaitingReconnect = false;
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disconnectedAtByRuntimeId = new Map<string, number>();
  private readonly disconnectBudgets = new Map<string, {
    episodes: number;
    totalPausedMs: number;
  }>();
  private abandoning = false;
  private pendingAbandonSockets: Socket[] = [];
  private persistenceTail: Promise<void> = Promise.resolve();
  private isCheckpointWriting = false;
  private pendingCheckpoint: PendingCheckpoint | null = null;
  private coalescedCheckpointCount = 0;
  private terminalNotified = false;

  constructor(
    io: Server,
    replayKeyframeIntervalTicks = REPLAY_KEYFRAME_INTERVAL_TICKS,
    persistence?: MatchPersistence,
    onMatchCreated?: (matchId: string) => void,
    onRecoveryReady?: () => void,
    onTerminal?: () => void,
    preallocatedMatch?: { matchId: string; matchSeed: number },
    disconnectLeaseMs = DISCONNECT_SEAT_LEASE_MS,
  ) {
    this.io = io;
    this.persistence = persistence;
    this.onMatchCreated = onMatchCreated;
    this.onRecoveryReady = onRecoveryReady;
    this.onTerminal = onTerminal;
    this.disconnectLeaseMs = Math.max(1, Math.floor(disconnectLeaseMs));
    this.replayKeyframeIntervalTicks = Math.max(1, Math.floor(replayKeyframeIntervalTicks));

    // Decouple the network broadcast rate from the 60Hz simulation. Emitting
    // full state 60x/sec is brutal on phones (radio wake-ups, JSON.parse,
    // React renders). Default to 30Hz during play, ~5Hz in the lobby. The
    // simulation stays authoritative at 60Hz. Tunable live via NETCAST_HZ.
    const hz = Number(process.env.NETCAST_HZ);
    this.netcastEveryNTicks = Number.isFinite(hz) && hz > 0 ? Math.max(1, Math.round(60 / hz)) : 2;
    this.lobbyNetcastEveryNTicks = Math.max(this.netcastEveryNTicks, 12);
    this.packetSync = new MatchPacketSync({
      netcastEveryNTicks: this.netcastEveryNTicks,
      lobbyNetcastEveryNTicks: this.lobbyNetcastEveryNTicks,
    });
    this.gameState = {
      players: {},
      status: 'waiting',
      countdown: COUNTDOWN_SECONDS,
      winnerId: null,
      tick: 0,
      seed: this.matchSeed,
    };
    if (preallocatedMatch !== undefined) {
      this.durableMatchId = preallocatedMatch.matchId;
      this.durableMatchPreallocated = true;
      this.gameState.seed = preallocatedMatch.matchSeed;
      this.startAllocationRendezvousTimer();
    }

    this.loopHandle = this.startLoop();
  }

  private emitGameplayPackets(immediate = false): void {
    if (immediate) {
      this.packetSync.sendImmediate(this.gameState, this.activeSocketByRuntimeId);
      return;
    }
    this.packetSync.onTick(this.gameState, this.activeSocketByRuntimeId, []);
  }

  /** Test / shutdown hook — stops the 60Hz interval. */
  public stopLoop() {
    this.clearAllDisconnectForfeitures();
    this.clearAllocationRendezvousTimer();
    this.enqueueCheckpoint();
    if (this.loopHandle !== null) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }

  public async stopAndFlush(): Promise<void> {
    this.stopLoop();
    await this.persistenceTail;
  }

  public dispose(): void {
    this.clearAllDisconnectForfeitures();
    this.clearAllocationRendezvousTimer();
    if (this.loopHandle !== null) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
    for (const socket of this.activeSocketByRuntimeId.values()) {
      socket.disconnect(true);
    }
    this.runtimeIdBySocketId.clear();
    this.activeSocketByRuntimeId.clear();
  }

  public restoreCheckpoint(input: {
    matchId: string;
    stateBlob: Uint8Array;
  }): void {
    const envelope: unknown = JSON.parse(Buffer.from(input.stateBlob).toString('utf8'));
    if (!isCheckpointEnvelope(envelope) || envelope.matchId !== input.matchId) {
      throw new Error('Checkpoint envelope is incompatible');
    }

    this.gameState = envelope.state;
    this.durableMatchId = input.matchId;
    this.durableMatchPreallocated = true;
    this.restoredAwaitingReconnect = true;
    this.lastHandledStatus = this.gameState.status;
    this.playerSlots.clear();
    this.durablePlayerIds.clear();
    this.rngChannelsByPlayer.clear();
    this.clearAllDisconnectForfeitures();
    const restoredAt = Date.now();
    for (const participant of envelope.participants) {
      this.playerSlots.set(participant.runtimeId, participant.slot);
      this.durablePlayerIds.set(participant.runtimeId, participant.playerId);
      this.rngChannelsByPlayer.set(participant.runtimeId, participant.rng);
      this.disconnectedAtByRuntimeId.set(participant.runtimeId, restoredAt);
    }
    this.gameState.pause = envelope.participants[0] === undefined
      ? undefined
      : {
          playerId: envelope.participants[0].runtimeId,
          startedAt: restoredAt,
        };
    this.disconnectBudgets.clear();
    for (const budget of envelope.disconnectBudgets) {
      this.disconnectBudgets.set(budget.runtimeId, {
        episodes: budget.episodes,
        totalPausedMs: budget.totalPausedMs,
      });
    }
    this.recordReplayDiscontinuity({
      tick: this.gameState.tick,
      kind: 'restore_ok',
    });
  }

  public voidForRecovery(): void {
    if (!this.restoredAwaitingReconnect || this.durableMatchId === null) return;
    const participants = this.captureDurableParticipantsForResult();
    if (participants === null || this.persistence?.finalizeMatch === undefined) return;

    const matchId = this.durableMatchId;
    this.restoredAwaitingReconnect = false;
    this.durableMatchPreallocated = false;
    this.gameState.status = 'ended';
    this.gameState.winnerId = null;
    this.gameState.endReason = 'server-void';
    this.gameState.technicalVictory = false;
    this.lastHandledStatus = 'ended';
    this.recordReplayDiscontinuity({
      tick: this.gameState.tick,
      kind: 'match_voided_runtime',
      reason: 'restore_timeout',
    });
    this.emitToMatch(matchId, 'error', {
      code: 'MATCH_VOIDED',
      message: 'The server voided this match. No player won.',
      reason: 'restore_timeout',
      nextAction: 'user-retry',
    } satisfies SocketAuthErrorPayload);
    this.emitGameplayPackets(true);
    logInfo('match_voided_runtime', { matchId });
    logInfo('match_voided_after_restore_timeout', { matchId });
    this.enqueuePersistence(async () => {
      try {
        await this.persistence!.finalizeMatch({
          matchId,
          winnerId: null,
          loserId: null,
          outcomeReason: 'void_server_crash',
          durationSeconds: Math.floor(this.gameState.tick * tickSeconds()),
          playerAStats: this.capturePlayerStats(participants[0].runtimeId),
          playerBStats: this.capturePlayerStats(participants[1].runtimeId),
        });
      } finally {
        this.notifyTerminal();
      }
    });
  }

  private loopHandle: ReturnType<typeof setInterval> | null = null;
  private allocationRendezvousTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly ALLOCATION_RENDEZVOUS_MS = 15_000;

  private startAllocationRendezvousTimer(): void {
    this.clearAllocationRendezvousTimer();
    this.allocationRendezvousTimer = setTimeout(() => {
      this.allocationRendezvousTimer = null;
      this.handleAllocationRendezvousTimeout();
    }, GameManager.ALLOCATION_RENDEZVOUS_MS);
  }

  private clearAllocationRendezvousTimer(): void {
    if (this.allocationRendezvousTimer !== null) {
      clearTimeout(this.allocationRendezvousTimer);
      this.allocationRendezvousTimer = null;
    }
  }

  private handleAllocationRendezvousTimeout(): void {
    if (this.gameState.status !== 'waiting' || Object.keys(this.gameState.players).length >= 2) return;
    const matchId = this.durableMatchId;
    const requeuePlayerId = [...this.activeSocketByRuntimeId.keys()]
      .map((runtimeId) => this.durablePlayerIds.get(runtimeId))
      .find((playerId): playerId is string => playerId !== undefined);
    logInfo('match_allocation_rendezvous_timeout', { matchId });
    this.clearAllDisconnectForfeitures();
    this.durableMatchPreallocated = false;
    this.durableMatchId = null;
    this.gameState.status = 'ended';
    this.gameState.winnerId = null;
    this.gameState.endReason = 'server-void';
    this.gameState.technicalVictory = false;
    this.lastHandledStatus = 'ended';
    const sockets = [...this.activeSocketByRuntimeId.values()];
    const finishRendezvous = (): void => {
      this.emitToMatch(matchId, 'error', {
        code: 'MATCH_VOIDED',
        message: 'Opponent failed to connect in time. Returning to queue.',
        reason: 'rendezvous_timeout',
        nextAction: 'automatic-search',
      } satisfies SocketAuthErrorPayload);
      this.emitGameplayPackets(true);
      for (const socket of sockets) socket.disconnect(true);
      this.notifyTerminal();
    };
    if (matchId !== null && this.persistence) {
      this.enqueuePersistence(async () => {
        try {
          await this.persistence!.finalizeMatch({
            matchId,
            winnerId: null,
            loserId: null,
            outcomeReason: 'void_rendezvous_timeout',
            durationSeconds: 0,
            playerAStats: { score: 0, linesCleared: 0, topOut: false },
            playerBStats: { score: 0, linesCleared: 0, topOut: false },
            ...(requeuePlayerId === undefined ? {} : { requeuePlayerId }),
          });
        } finally {
          finishRendezvous();
        }
      });
    } else {
      finishRendezvous();
    }
  }

  public handleConnection(
    socket: Socket,
    durablePlayerId?: string,
    seatBinding?: SocketSeatBinding,
  ) {
    if (seatBinding !== undefined) {
      this.bindTicketSocket(socket, seatBinding);
      return;
    }

    if (Object.keys(this.gameState.players).length >= 2) {
      this.rejectSocket(socket, 'MATCH_THIRD_SOCKET', 'This match already has two active seats.');
      return;
    }

    const runtimeId = durablePlayerId ?? socket.id;
    if (this.gameState.players[runtimeId] !== undefined) {
      this.rejectSocket(socket, 'MATCH_SEAT_REJECTED', 'This player already has an active seat.');
      return;
    }

    const slot = this.assignPlayerSlot(runtimeId);
    const channels = createPlayerRngChannels(this.gameState.seed, slot);
    this.rngChannelsByPlayer.set(runtimeId, channels);
    this.gameState.players[runtimeId] = makePlayer(runtimeId, channels);
    if (durablePlayerId !== undefined) {
      this.durablePlayerIds.set(runtimeId, durablePlayerId);
    }

    this.bindSocket(socket, runtimeId);
    socket.emit('playerIdentity', runtimeId);
    this.emitGameplayPackets(true);
  }

  public async abandonMatch(runtimeId: string): Promise<boolean> {
    const player = this.gameState.players[runtimeId];
    if (player === undefined || this.gameState.status === 'ended') return false;

    const matchId = this.durableMatchId;
    if (matchId !== null && this.persistence !== undefined) {
      const participants = this.captureDurableParticipantsForResult();
      if (participants === null) return false;
      await this.persistence.finalizeMatch({
        matchId,
        winnerId: null,
        loserId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
        outcomeReason: 'forfeit_resignation',
        durationSeconds: Math.floor(this.gameState.tick * tickSeconds()),
        playerAStats: this.capturePlayerStats(participants[0].runtimeId),
        playerBStats: this.capturePlayerStats(participants[1].runtimeId),
      });
    }

    const sockets = [...this.activeSocketByRuntimeId.values()];
    this.clearAllDisconnectForfeitures();
    this.gameState.pause = undefined;
    this.gameState.restartTimer = undefined;
    this.gameState.winnerId = null;
    this.gameState.technicalVictory = false;
    this.gameState.endReason = 'allocation-cancelled';
    this.gameState.status = 'ended';
    this.lastHandledStatus = 'ended';
    this.durableMatchPreallocated = false;
    this.abandoning = true;
    this.recordReplayDiscontinuity({
      tick: this.gameState.tick,
      kind: 'forfeit_abandon',
      playerId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
      reason: 'player_cancelled',
    });
    this.emitGameplayPackets(true);
    this.pendingAbandonSockets = sockets;
    if (matchId === null) {
      this.clearAllocationRendezvousTimer();
      this.gameState = {
        players: {},
        status: 'waiting',
        countdown: COUNTDOWN_SECONDS,
        winnerId: null,
        tick: 0,
        seed: initialSeed(),
      };
      this.playerSlots.clear();
      this.durablePlayerIds.clear();
      this.rngChannelsByPlayer.clear();
      this.runtimeIdBySocketId.clear();
      this.activeSocketByRuntimeId.clear();
      this.terminalPlayerStats.clear();
      this.activeReplay = null;
      this.lastTickEvents = [];
      this.lastHandledStatus = 'waiting';
      this.abandoning = false;
      return true;
    }
    this.notifyTerminal();
    return true;
  }

  private bindTicketSocket(socket: Socket, binding: SocketSeatBinding): void {
    if (binding.protocolVersion !== GAME_PROTOCOL_VERSION) {
      this.recordReplayDiscontinuity({
        tick: this.gameState.tick,
        kind: 'protocol_mismatch',
        playerId: binding.playerId,
        reason: 'unsupported_version',
      });
      this.rejectSocket(
        socket,
        'PROTOCOL_VERSION_MISMATCH',
        'Match protocol version is not supported.',
      );
      return;
    }

    if (this.durableMatchId === null) {
      if (this.gameState.status !== 'waiting' || Object.keys(this.gameState.players).length !== 0) {
        this.rejectSocket(
          socket,
          'MATCH_RUNTIME_UNAVAILABLE',
          'The match runtime is not ready for this assignment.',
        );
        return;
      }
      this.durableMatchId = binding.matchId;
      this.durableMatchPreallocated = true;
      this.gameState.seed = binding.matchSeed;
      this.gameState.tick = 0;
      this.gameState.winnerId = null;
      this.gameState.endReason = undefined;
      this.gameState.technicalVictory = false;
      this.gameState.restartTimer = undefined;
    } else if (this.durableMatchId !== binding.matchId) {
      this.rejectSocket(
        socket,
        'MATCH_TICKET_REJECTED',
        'The match ticket does not belong to this runtime.',
      );
      return;
    }

    const participant = [...this.durablePlayerIds.entries()]
      .find(([, playerId]) => playerId === binding.playerId);
    let runtimeId = participant?.[0];
    if (runtimeId === undefined) {
      if (Object.keys(this.gameState.players).length >= 2) {
        this.rejectSocket(socket, 'MATCH_THIRD_SOCKET', 'This match already has two active seats.');
        return;
      }
      runtimeId = binding.playerId;
      const slot = binding.seat === 'A' ? 0 : 1;
      if (!this.isSlotAvailable(slot)) {
        this.rejectSocket(socket, 'MATCH_SEAT_REJECTED', 'The requested match seat is occupied.');
        return;
      }
      const channels = createPlayerRngChannels(this.gameState.seed, slot);
      this.playerSlots.set(runtimeId, slot);
      this.rngChannelsByPlayer.set(runtimeId, channels);
      this.durablePlayerIds.set(runtimeId, binding.playerId);
      this.gameState.players[runtimeId] = makePlayer(runtimeId, channels);
    }

    const expectedSlot = binding.seat === 'A' ? 0 : 1;
    if (this.playerSlots.get(runtimeId) !== expectedSlot) {
      this.rejectSocket(
        socket,
        'MATCH_SEAT_REJECTED',
        'The match ticket does not belong to this seat.',
      );
      return;
    }

    const previousSocket = this.activeSocketByRuntimeId.get(runtimeId);
    if (previousSocket !== undefined && previousSocket !== socket) {
      this.runtimeIdBySocketId.delete(previousSocket.id);
      previousSocket.disconnect(true);
      logInfo('socket_rebound', {
        matchId: binding.matchId,
        playerId: binding.playerId,
        seat: binding.seat,
      });
    }

    this.bindSocket(socket, runtimeId);
    socket.emit('playerIdentity', runtimeId);
    this.packetSync.sendKeyframe(socket, runtimeId, this.gameState);
    this.clearDisconnectForfeiture(runtimeId);
    if (this.gameState.pause?.playerId === runtimeId || this.restoredAwaitingReconnect) {
      const pausedForMs = this.gameState.pause === undefined
        ? 0
        : Math.max(0, Date.now() - this.gameState.pause.startedAt);
      if (this.gameState.pause?.playerId === runtimeId) {
        const budget = this.disconnectBudgets.get(runtimeId) ?? { episodes: 0, totalPausedMs: 0 };
        budget.totalPausedMs += pausedForMs;
        this.disconnectBudgets.set(runtimeId, budget);
        if (budget.episodes >= 3 || budget.totalPausedMs >= 90_000) {
          this.forfeitDisconnectedPlayer(runtimeId);
          return;
        }
      }
      const nextPausedRuntimeId = this.findDisconnectedRuntimeId();
      this.gameState.pause = nextPausedRuntimeId === null
        ? undefined
        : {
            playerId: nextPausedRuntimeId,
            startedAt: this.disconnectedAtByRuntimeId.get(nextPausedRuntimeId) ?? Date.now(),
          };
      logInfo('socket_reconnected', {
        matchId: this.durableMatchId,
        playerId: runtimeId,
        pauseEpisodes: this.disconnectBudgets.get(runtimeId)?.episodes ?? 0,
        pausedMs: pausedForMs,
      });
      logInfo('reconnect_success', {
        matchId: this.durableMatchId,
        playerId: binding.playerId,
      });
      this.recordReplayDiscontinuity({
        tick: this.gameState.tick,
        kind: 'reconnect_success',
        playerId: binding.playerId,
      });
      this.emitGameplayPackets(true);
    } else if (previousSocket !== undefined && previousSocket !== socket) {
      this.recordReplayDiscontinuity({
        tick: this.gameState.tick,
        kind: 'reconnect_success',
        playerId: binding.playerId,
      });
    }
    if (
      this.restoredAwaitingReconnect
      && this.activeSocketByRuntimeId.size >= Object.keys(this.gameState.players).length
    ) {
      this.restoredAwaitingReconnect = false;
      this.gameState.pause = undefined;
      this.onRecoveryReady?.();
    }

    if (this.durableMatchPreallocated && this.gameState.status === 'waiting') {
      if (this.activeSocketByRuntimeId.size === 1) {
        this.startAllocationRendezvousTimer();
      } else if (this.activeSocketByRuntimeId.size >= 2) {
        this.clearAllocationRendezvousTimer();
      }
    }
  }

  private isSlotAvailable(slot: number): boolean {
    return ![...this.playerSlots.values()].includes(slot);
  }

  private bindSocket(socket: Socket, runtimeId: string): void {
    if (this.durableMatchId !== null && typeof socket.join === 'function') {
      void socket.join(`match:${this.durableMatchId}`);
    }
    this.runtimeIdBySocketId.set(socket.id, runtimeId);
    this.activeSocketByRuntimeId.set(runtimeId, socket);
    this.registerSocketHandlers(socket);
  }

  private registerSocketHandlers(socket: Socket): void {
    socket.on('inputState', (input: InputState) => {
      const runtimeId = this.runtimeIdBySocketId.get(socket.id);
      if (runtimeId === undefined) return;
      const player = this.gameState.players[runtimeId];
      if (!player) return;
      player.inputState = {
        left: !!input?.left,
        right: !!input?.right,
        softDrop: !!input?.softDrop,
      };
      if (this.activeReplay && this.gameState.status === 'playing') {
        this.recordReplayInput({
          tick: this.gameState.tick,
          playerId: runtimeId,
          kind: 'inputState',
          inputState: player.inputState,
        });
      }
    });

    socket.on('action', (action: ActionType) => {
      const runtimeId = this.runtimeIdBySocketId.get(socket.id);
      if (runtimeId === undefined) return;
      const player = this.gameState.players[runtimeId];
      if (!player || this.gameState.status !== 'playing') return;
      if (!['rotateCW', 'rotateCCW', 'hardDrop', 'hold'].includes(action)) return;
      player.actionQueue.push(action);
      if (this.activeReplay) {
        this.recordReplayInput({
          tick: this.gameState.tick,
          playerId: runtimeId,
          kind: 'action',
          action,
        });
      }
    });

    socket.on('shopOpen', () => {
      const runtimeId = this.runtimeIdBySocketId.get(socket.id);
      if (runtimeId === undefined || this.gameState.status !== 'playing') return;
      const buyer = this.gameState.players[runtimeId];
      if (!buyer) return;
      const accepted = openPlayerShop(buyer, this.gameState.tick);
      this.recordReplayInput({
        tick: this.gameState.tick,
        playerId: runtimeId,
        kind: 'shopOpen',
        accepted,
      });
    });

    socket.on('requestKeyframe', () => {
      const runtimeId = this.runtimeIdBySocketId.get(socket.id);
      if (runtimeId === undefined) return;
      this.packetSync.handleRequestKeyframe(socket, runtimeId, this.gameState);
    });

    socket.on('abandonMatch', (ack?: (result: { ok: boolean }) => void) => {
      const runtimeId = this.runtimeIdBySocketId.get(socket.id);
      if (runtimeId === undefined) {
        ack?.({ ok: false });
        return;
      }
      void this.abandonMatch(runtimeId)
        .then((ok) => {
          ack?.({ ok });
          if (!ok) return;
          const sockets = this.pendingAbandonSockets;
          this.pendingAbandonSockets = [];
          for (const activeSocket of sockets) {
            activeSocket.disconnect(true);
          }
          this.abandoning = false;
        })
        .catch((error: unknown) => {
          logError('match_abandon_failed', error, {
            matchId: this.durableMatchId,
            playerId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
          });
          ack?.({ ok: false });
        });
    });

    socket.on('shopPurchase', (itemId: string) => {
      const runtimeId = this.runtimeIdBySocketId.get(socket.id);
      if (runtimeId === undefined || this.gameState.status !== 'playing') return;
      if (typeof itemId !== 'string') return;
      const buyer = this.gameState.players[runtimeId];
      if (!buyer) return;

      const pids = Object.keys(this.gameState.players);
      const opponentId = pids.find((id) => id !== runtimeId);
      const opponent = opponentId ? this.gameState.players[opponentId] : null;
      const catalogItem = SHOP_ITEM_BY_ID.get(itemId);
      const resolvedCost = catalogItem
        ? getPricingView(itemId, buyer.shop.pricing?.[itemId], this.gameState.tick).currentPrice
        : undefined;
      const accepted = applyShopPurchase(this.gameState, buyer, opponent, itemId, this.playerRng(runtimeId));
      this.recordReplayInput({
        tick: this.gameState.tick,
        playerId: runtimeId,
        kind: 'shopPurchase',
        itemId,
        accepted,
        ...(resolvedCost === undefined ? {} : { cost: resolvedCost }),
      });
      // Flush immediately so cascade / pills aren't held back by the 30Hz netcast.
      this.emitGameplayPackets(true);
    });

    socket.on('disconnect', () => {
      const runtimeId = this.runtimeIdBySocketId.get(socket.id);
      if (runtimeId === undefined || this.activeSocketByRuntimeId.get(runtimeId) !== socket) return;
      if (this.abandoning) {
        this.runtimeIdBySocketId.delete(socket.id);
        this.activeSocketByRuntimeId.delete(runtimeId);
        return;
      }
      if (this.loopHandle === null) return;

      const disconnectedPlayer = this.gameState.players[runtimeId];
      if (disconnectedPlayer) {
        this.terminalPlayerStats.set(runtimeId, {
          score: disconnectedPlayer.score,
          linesCleared: disconnectedPlayer.linesCleared,
          topOut: disconnectedPlayer.topOut,
        });
      }
      this.runtimeIdBySocketId.delete(socket.id);
      this.activeSocketByRuntimeId.delete(runtimeId);
      // Only mid-play disconnects pause the sim. Waiting/countdown (including
      // rematch ticket handoff) must keep the loop running so seats can rebind.
      // Top-out rematch windows also keep both seats until the rematch starts.
      if (this.gameState.status === 'playing') {
        const budget = this.disconnectBudgets.get(runtimeId) ?? {
          episodes: 0,
          totalPausedMs: 0,
        };
        budget.episodes += 1;
        this.disconnectBudgets.set(runtimeId, budget);
        const disconnectedAt = Date.now();
        this.disconnectedAtByRuntimeId.set(runtimeId, disconnectedAt);
        this.scheduleDisconnectForfeiture(runtimeId);
        if (this.gameState.pause === undefined) {
          this.gameState.pause = {
            playerId: runtimeId,
            startedAt: disconnectedAt,
          };
        }
        logInfo('socket_disconnected_paused', {
          matchId: this.durableMatchId,
          playerId: runtimeId,
          pauseEpisodes: budget.episodes,
        });
        logInfo('disconnect_start', {
          matchId: this.durableMatchId,
          playerId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
        });
        this.recordReplayDiscontinuity({
          tick: this.gameState.tick,
          kind: 'disconnect_start',
          playerId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
        });
        this.enqueueCheckpoint();
      } else if (
        this.gameState.status === 'ended'
        && this.gameState.endReason === 'top-out'
        && this.gameState.restartTimer !== undefined
        && Object.keys(this.gameState.players).length === 2
      ) {
        logInfo('socket_disconnected_rematch_window', {
          matchId: this.durableMatchId,
          playerId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
        });
      } else if (
        this.gameState.status === 'waiting'
        || this.gameState.status === 'countdown'
      ) {
        logInfo('socket_disconnected_lobby', {
          matchId: this.durableMatchId,
          playerId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
          status: this.gameState.status,
        });
      } else {
        this.forfeitDisconnectedPlayer(runtimeId);
      }
      this.emitGameplayPackets(true);
    });
  }

  private rejectSocket(
    socket: Socket,
    code: SocketAuthErrorPayload['code'],
    message: string,
  ): void {
    socket.emit('error', { code, message } satisfies SocketAuthErrorPayload);
    socket.disconnect(true);
  }

  private forfeitDisconnectedPlayer(runtimeId: string): void {
    const disconnectedPlayer = this.gameState.players[runtimeId];
    if (disconnectedPlayer === undefined) return;
    this.clearDisconnectForfeiture(runtimeId);
    if (this.gameState.status === 'ended' && this.gameState.endReason === 'server-void') {
      delete this.gameState.players[runtimeId];
      this.rngChannelsByPlayer.delete(runtimeId);
      this.playerSlots.delete(runtimeId);
      this.durablePlayerIds.delete(runtimeId);
      return;
    }
    const remainingIds = Object.keys(this.gameState.players).filter(id => id !== runtimeId);
    if (remainingIds.length !== 1) {
      this.gameState.status = 'waiting';
      this.gameState.restartTimer = undefined;
    } else {
      this.gameState.status = 'ended';
      this.gameState.winnerId = remainingIds[0];
      this.gameState.endReason = 'disconnect-forfeit';
      this.gameState.technicalVictory = true;
      this.gameState.restartTimer = RESTART_DELAY_SECONDS;
    }
    delete this.gameState.players[runtimeId];
    this.rngChannelsByPlayer.delete(runtimeId);
    if (this.gameState.status !== 'ended') {
      this.playerSlots.delete(runtimeId);
      this.durablePlayerIds.delete(runtimeId);
      const nextPausedRuntimeId = this.findDisconnectedRuntimeId();
      this.gameState.pause = nextPausedRuntimeId === null
        ? undefined
        : {
            playerId: nextPausedRuntimeId,
            startedAt: this.disconnectedAtByRuntimeId.get(nextPausedRuntimeId) ?? Date.now(),
          };
    } else {
      this.gameState.pause = undefined;
      this.clearAllDisconnectForfeitures();
    }
    this.enqueueCheckpoint();
    logInfo('match_disconnect_forfeit', {
      matchId: this.durableMatchId,
      playerId: runtimeId,
    });
    logInfo('forfeit_abandon', {
      matchId: this.durableMatchId,
      playerId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
    });
    this.recordReplayDiscontinuity({
      tick: this.gameState.tick,
      kind: 'forfeit_abandon',
      playerId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
      reason: 'disconnect_budget_exhausted',
    });
  }

  private scheduleDisconnectForfeiture(runtimeId: string): void {
    const previousTimer = this.disconnectTimers.get(runtimeId);
    if (previousTimer !== undefined) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(runtimeId);
      this.forfeitDisconnectedPlayer(runtimeId);
      this.emitGameplayPackets(true);
    }, this.disconnectLeaseMs);
    this.disconnectTimers.set(runtimeId, timer);
  }

  private clearDisconnectForfeiture(runtimeId: string): void {
    const timer = this.disconnectTimers.get(runtimeId);
    if (timer !== undefined) clearTimeout(timer);
    this.disconnectTimers.delete(runtimeId);
    this.disconnectedAtByRuntimeId.delete(runtimeId);
  }

  private clearAllDisconnectForfeitures(): void {
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
    this.disconnectedAtByRuntimeId.clear();
  }

  private findDisconnectedRuntimeId(): string | null {
    for (const runtimeId of this.disconnectedAtByRuntimeId.keys()) {
      if (
        this.gameState.players[runtimeId] !== undefined
        && !this.activeSocketByRuntimeId.has(runtimeId)
      ) {
        return runtimeId;
      }
    }
    return null;
  }

  private startLoop() {
    return setInterval(() => {
      this.tickAndEmit();
    }, 1000 / 60);
  }

  /** Exposed for interface-level lifecycle harnesses. */
  public tickOnceForTests() {
    this.update();
  }

  /** Runs one complete server frame, including outgoing gameplay packets. */
  public tickAndEmitOnceForTests() {
    this.tickAndEmit();
  }

  private tickAndEmit(): void {
    this.packetSync.capturePreStepBoards(this.gameState);
    this.update();
    this.packetSync.onTick(this.gameState, this.activeSocketByRuntimeId, this.lastTickEvents);
    this.lastTickEvents = [];
  }

  private assignPlayerSlot(playerId: string): number {
    const used = new Set(this.playerSlots.values());
    for (let slot = 0; slot < 2; slot += 1) {
      if (!used.has(slot)) {
        this.playerSlots.set(playerId, slot);
        return slot;
      }
    }
    throw new Error('No player slot available');
  }

  private playerRng(playerId: string): RngChannels {
    const channels = this.rngChannelsByPlayer.get(playerId);
    if (!channels) throw new Error(`No RNG channels for player ${playerId}`);
    return channels;
  }

  private resetMatchRngChannels(): void {
    const next = new Map<string, RngChannels>();
    for (const playerId of Object.keys(this.gameState.players)) {
      const slot = this.playerSlots.get(playerId);
      if (slot === undefined) throw new Error(`No slot for player ${playerId}`);
      next.set(playerId, createPlayerRngChannels(this.gameState.seed, slot));
    }
    this.rngChannelsByPlayer = next;
  }

  private recordReplayInput(frame: ReplayInputFrame): void {
    if (this.activeReplay) {
      // Socket events received between simulation ticks take effect on the
      // next integer tick. Keep replay frames aligned with matchStep().
      this.activeReplay.inputs.push({
        ...frame,
        tick: this.gameState.tick + 1,
      });
    }
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

    const previousStatus = this.lastHandledStatus;
    this.lastHandledStatus = status;
    this.enqueueDurableStatusTransition(status);
    if (status === 'waiting' || status === 'countdown') {
      if (status === 'waiting') {
        if (previousStatus === 'ended') {
          this.gameState.endReason = undefined;
        }
        for (const [runtimeId] of this.playerSlots) {
          if (this.gameState.players[runtimeId] === undefined) {
            this.playerSlots.delete(runtimeId);
            this.durablePlayerIds.delete(runtimeId);
            this.terminalPlayerStats.delete(runtimeId);
          }
        }
        if (previousStatus === 'ended' && Object.keys(this.gameState.players).length === 1) {
          this.gameState.seed = initialSeed();
          this.gameState.tick = 0;
          this.gameState.winnerId = null;
          this.gameState.endReason = undefined;
          this.gameState.technicalVictory = false;
          this.activeReplay = null;
          this.resetMatchRngChannels();
          for (const id in this.gameState.players) {
            this.gameState.players[id] = makePlayer(id, this.playerRng(id));
          }
        }
      }
      for (const id in this.gameState.players) {
        resetPlayerShop(this.gameState.players[id], this.playerRng(id).shop);
      }
    }

  }

  private enqueueDurableStatusTransition(status: GameState['status']): void {
    if (!this.persistence) return;

    if (status === 'countdown') {
      const participants = this.captureDurableParticipants();
      if (participants === null) return;

      if (this.durableMatchId !== null && this.durableMatchPreallocated) {
        const matchId = this.durableMatchId;
        this.enqueuePersistence(async () => {
          await this.persistence!.advanceStatus({
            matchId,
            expectedStatus: 'allocating',
            nextStatus: 'countdown',
          });
        });
        return;
      }

      const matchSeed = this.gameState.seed;

      this.enqueuePersistence(async () => {
        this.durableMatchId = null;
        this.durableMatchPreallocated = false;
        const allocation = await this.persistence!.startMatch({
          matchSeed,
          participants: {
            A: participants.A.playerId,
            B: participants.B.playerId,
          },
        });
        this.durableMatchId = allocation.match.id;
        this.durableMatchPreallocated = true;
        this.terminalNotified = false;
        this.onMatchCreated?.(allocation.match.id);
        await this.persistence!.advanceStatus({
          matchId: allocation.match.id,
          expectedStatus: 'allocating',
          nextStatus: 'countdown',
        });
        this.emitMatchAssignments(
          allocation.match.id,
          allocation.match.matchSeed,
          allocation.match.protocolVersion,
          allocation.tickets,
        );
      });
      return;
    }

    if (status === 'playing') {
      this.enqueuePersistence(async () => {
        if (this.durableMatchId === null) return;
        await this.persistence!.advanceStatus({
          matchId: this.durableMatchId,
          expectedStatus: 'countdown',
          nextStatus: 'playing',
        });
      });
      return;
    }

    if (status === 'ended') {
      const finalization = this.captureDurableFinalization();
      if (finalization === null) return;
      const matchId = this.durableMatchId;
      if (matchId === null) return;
      this.durableMatchPreallocated = false;

      this.enqueuePersistence(async () => {
        await this.persistence!.finalizeMatch({
          matchId,
          ...finalization,
        });
      });
    }
  }

  private enqueuePersistence(operation: () => Promise<void>): void {
    this.persistenceTail = this.persistenceTail
      .then(operation)
      .catch((error: unknown) => {
        logError('durable_match_persistence_failed', error, {
          matchId: this.durableMatchId,
        });
      });
  }

  private emitMatchAssignments(
    matchId: string,
    matchSeed: number,
    protocolVersion: number,
    tickets: { A: JoinTicket; B: JoinTicket },
  ): void {
    for (const ticket of [tickets.A, tickets.B]) {
      const runtimeEntry = [...this.durablePlayerIds.entries()]
        .find(([, playerId]) => playerId === ticket.playerId);
      if (runtimeEntry === undefined) continue;
      const socket = this.activeSocketByRuntimeId.get(runtimeEntry[0]);
      if (socket === undefined) continue;
      socket.emit('matchAssignment', {
        matchId,
        playerId: ticket.playerId,
        seat: ticket.seat,
        ticket: ticket.ticket,
        matchSeed,
        protocolVersion,
      } satisfies MatchAssignment);
    }
  }

  private captureDurableParticipants(): {
    A: { runtimeId: string; playerId: string };
    B: { runtimeId: string; playerId: string };
  } | null {
    if (Object.keys(this.gameState.players).length !== 2) return null;

    const participants: {
      A?: { runtimeId: string; playerId: string };
      B?: { runtimeId: string; playerId: string };
    } = {};

    for (const [runtimeId, slot] of this.playerSlots) {
      const playerId = this.durablePlayerIds.get(runtimeId);
      if (playerId === undefined || this.gameState.players[runtimeId] === undefined) continue;
      if (slot === 0) participants.A = { runtimeId, playerId };
      if (slot === 1) participants.B = { runtimeId, playerId };
    }

    if (participants.A === undefined || participants.B === undefined) return null;
    return { A: participants.A, B: participants.B };
  }

  private captureDurableFinalization(): {
    winnerId: string | null;
    loserId: string | null;
    outcomeReason: MatchOutcomeReason;
    durationSeconds: number;
    playerAStats: MatchResultStats;
    playerBStats: MatchResultStats;
  } | null {
    const participants = this.captureDurableParticipantsForResult();
    if (participants === null) return null;

    const winnerRuntimeId = this.gameState.winnerId;
    const winner = winnerRuntimeId === null
      ? null
      : participants.find((participant) => participant.runtimeId === winnerRuntimeId) ?? null;
    const loser = winner === null
      ? null
      : participants.find((participant) => participant.runtimeId !== winner.runtimeId) ?? null;

    return {
      winnerId: winner?.playerId ?? null,
      loserId: loser?.playerId ?? null,
      outcomeReason: this.gameState.technicalVictory
        ? 'forfeit_disconnect'
        : 'top_out',
      durationSeconds: Math.floor(this.gameState.tick * tickSeconds()),
      playerAStats: this.capturePlayerStats(participants[0].runtimeId),
      playerBStats: this.capturePlayerStats(participants[1].runtimeId),
    };
  }

  private captureDurableParticipantsForResult(): Array<{
    runtimeId: string;
    playerId: string;
    slot: number;
  }> | null {
    const participants: Array<{ runtimeId: string; playerId: string; slot: number }> = [];
    for (const [runtimeId, slot] of this.playerSlots) {
      const playerId = this.durablePlayerIds.get(runtimeId);
      if (playerId !== undefined && slot < 2) {
        participants.push({ runtimeId, playerId, slot });
      }
    }
    participants.sort((left, right) => left.slot - right.slot);
    return participants.length === 2 ? participants : null;
  }

  private capturePlayerStats(runtimeId: string): MatchResultStats {
    const player = this.gameState.players[runtimeId];
    const terminalStats = this.terminalPlayerStats.get(runtimeId);
    if (player === undefined && terminalStats !== undefined) return terminalStats;
    return {
      score: player?.score ?? 0,
      linesCleared: player?.linesCleared ?? 0,
      topOut: player?.topOut ?? false,
    };
  }

  private update() {
    if (this.restoredAwaitingReconnect || this.gameState.pause !== undefined) return;
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
        this.gameState.tick = 0;
        this.resetMatchRngChannels();
        this.activeReplay = {
          version: 2,
          date: replayDateLabel(),
          seed: this.gameState.seed,
          pricingPolicyVersion: PRICING_POLICY_VERSION,
          playerSlots: Object.fromEntries(this.playerSlots.entries()),
          keyframeIntervalTicks: this.replayKeyframeIntervalTicks,
          discontinuities: [...this.pendingReplayDiscontinuities],
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
        this.pendingReplayDiscontinuities = [];
      }
    } else if (this.gameState.status === 'playing') {
      if (this.gameState.pause !== undefined) {
        return;
      }
      const stepResult = matchStep(this.gameState, (id) => this.playerRng(id));

      if (this.activeReplay && stepResult.events.length > 0) {
        this.activeReplay.events.push(...stepResult.events);
      }
      if (stepResult.events.length > 0) {
        for (const ev of stepResult.events) {
          if (this.packetSync.shouldEmitMatchEvent(ev)) {
            if (this.durableMatchId === null) {
              this.io.emit('matchEvent', ev);
            } else {
              this.emitToMatch(this.durableMatchId, 'matchEvent', ev);
            }
          }
        }
        this.lastTickEvents.push(...stepResult.events);
      }

      if (this.activeReplay && (
        this.gameState.tick % this.replayKeyframeIntervalTicks === 0 || stepResult.matchEnded
      )) {
        this.activeReplay.keyframes.push({
          tick: this.gameState.tick,
          players: JSON.parse(JSON.stringify(this.gameState.players)),
        });
      }
      if (this.gameState.tick > 0 && this.gameState.tick % CHECKPOINT_INTERVAL_TICKS === 0) {
        this.enqueueCheckpoint();
      }
      if (stepResult.matchEnded) {
        this.gameState.endReason = 'top-out';
        this.gameState.pause = undefined;
        this.clearAllDisconnectForfeitures();
        this.saveReplay();
      }
    } else if (this.gameState.status === 'ended') {
      this.clearInputs();
      if (this.gameState.restartTimer !== undefined) {
        this.gameState.restartTimer -= tickSeconds();
        if (this.gameState.restartTimer <= 0) {
          this.restartAfterTerminal();
        }
      }
    }
  }

  private restartAfterTerminal(): void {
    this.gameState.restartTimer = undefined;
    this.gameState.endReason = undefined;
    this.gameState.technicalVictory = false;
    this.gameState.pause = undefined;
    this.clearAllDisconnectForfeitures();
    if (Object.keys(this.gameState.players).length === 2) {
      this.gameState.seed = initialSeed();
      this.resetMatchRngChannels();
      for (const id in this.gameState.players) {
        this.gameState.players[id] = makePlayer(id, this.playerRng(id));
      }
      this.gameState.status = 'countdown';
      this.gameState.countdown = COUNTDOWN_SECONDS;
    } else {
      this.gameState.status = 'waiting';
    }
    // Durable rematch tickets must enqueue on this transition, not on the next
    // tick — clients may already be rebinding when the countdown packet lands.
    this.handleStatusTransitions();
  }

  private saveReplay() {
    if (!this.activeReplay) return;
    try {
      const replaysDir = process.env.REPLAYS_DIR
        ? path.resolve(process.env.REPLAYS_DIR)
        : path.join(process.cwd(), 'fixtures', 'replays');

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

  private recordReplayDiscontinuity(marker: ReplayDiscontinuity): void {
    if (this.activeReplay === null) {
      this.pendingReplayDiscontinuities.push(marker);
      return;
    }
    this.activeReplay.discontinuities ??= [];
    this.activeReplay.discontinuities.push(marker);
  }

  private enqueueCheckpoint(): void {
    const matchId = this.durableMatchId;
    const writeCheckpoint = this.persistence?.writeCheckpoint;
    if (matchId === null || writeCheckpoint === undefined) return;

    const stateBlob = Buffer.from(JSON.stringify({
      version: 1,
      matchId,
      state: this.gameState,
      participants: [...this.playerSlots.entries()].map(([runtimeId, slot]) => ({
        runtimeId,
        playerId: this.durablePlayerIds.get(runtimeId) ?? runtimeId,
        slot,
        rng: this.rngChannelsByPlayer.get(runtimeId),
      })),
      disconnectBudgets: [...this.disconnectBudgets.entries()].map(([runtimeId, budget]) => ({
        runtimeId,
        ...budget,
      })),
    }), 'utf8');
    const simTick = this.gameState.tick;
    const checkpoint: PendingCheckpoint = {
      matchId,
      simTick,
      stateBlob,
      enqueuedAt: Date.now(),
    };

    if (this.isCheckpointWriting) {
      if (this.pendingCheckpoint !== null) {
        this.coalescedCheckpointCount += 1;
        logInfo('checkpoint_write_coalesced', {
          matchId,
          skippedSimTick: this.pendingCheckpoint.simTick,
          nextSimTick: simTick,
          totalCoalesced: this.coalescedCheckpointCount,
        });
      }
      this.pendingCheckpoint = checkpoint;
      return;
    }

    this.isCheckpointWriting = true;
    this.pendingCheckpoint = checkpoint;

    this.enqueuePersistence(async () => {
      try {
        while (this.pendingCheckpoint !== null) {
          const current: PendingCheckpoint = this.pendingCheckpoint;
          this.pendingCheckpoint = null;
          const writeStart = Date.now();
          await writeCheckpoint.call(this.persistence, {
            matchId: current.matchId,
            simTick: current.simTick,
            stateBlob: current.stateBlob,
          });
          const writeDurationMs = Date.now() - writeStart;
          const totalQueueDurationMs = Date.now() - current.enqueuedAt;
          if (totalQueueDurationMs > 1_000) {
            logWarn('checkpoint_write_stale', {
              matchId: current.matchId,
              simTick: current.simTick,
              writeDurationMs,
              totalQueueDurationMs,
            });
          }
        }
      } finally {
        this.isCheckpointWriting = false;
      }
    });
  }

  private emitToMatch(matchId: string | null, event: string, payload: unknown): void {
    if (matchId === null) return;
    if (typeof this.io.to === 'function') {
      this.io.to(`match:${matchId}`).emit(event, payload);
      return;
    }

    for (const [runtimeId, socket] of this.activeSocketByRuntimeId) {
      if (this.durablePlayerIds.has(runtimeId)) socket.emit(event, payload);
    }
  }

  private notifyTerminal(): void {
    if (this.terminalNotified) return;
    this.terminalNotified = true;
    this.onTerminal?.();
  }
}

type PendingCheckpoint = {
  matchId: string;
  simTick: number;
  stateBlob: Uint8Array;
  enqueuedAt: number;
};

type CheckpointEnvelope = {
  version: 1;
  matchId: string;
  state: GameState;
  participants: Array<{
    runtimeId: string;
    playerId: string;
    slot: number;
    rng: RngChannels;
  }>;
  disconnectBudgets: Array<{
    runtimeId: string;
    episodes: number;
    totalPausedMs: number;
  }>;
};

function isCheckpointEnvelope(value: unknown): value is CheckpointEnvelope {
  if (!isRecord(value) || value.version !== 1 || typeof value.matchId !== 'string') {
    return false;
  }
  if (!isRecord(value.state) || !isRecord(value.state.players)) return false;
  if (!Array.isArray(value.participants) || !Array.isArray(value.disconnectBudgets)) return false;
  if (!value.participants.every((participant) => {
    if (!isRecord(participant)) return false;
    if (
      typeof participant.runtimeId !== 'string'
      || typeof participant.playerId !== 'string'
      || typeof participant.slot !== 'number'
      || !isRecord(participant.rng)
    ) {
      return false;
    }
    return ['pieces', 'garbage', 'shop', 'effects'].every((channel) => {
      const rng = participant.rng[channel];
      return isRecord(rng) && typeof rng.seed === 'number';
    });
  })) {
    return false;
  }
  return value.disconnectBudgets.every((budget) => (
    isRecord(budget)
    && typeof budget.runtimeId === 'string'
    && typeof budget.episodes === 'number'
    && typeof budget.totalPausedMs === 'number'
  ));
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
