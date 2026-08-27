import type { Socket } from 'socket.io';
import type { GameState, MatchEvent } from '../../src/types.js';
import {
  cloneSeatSnapshot,
} from '../../src/protocol/decodeMatchPacket.js';
import {
  encodeDeltaPacket,
  encodeKeyframePacket,
  encodeTectonicCompletePacket,
  encodeTectonicStepPacket,
} from '../../src/protocol/encodeMatchPacket.js';
import type { SeatWireSnapshot, TectonicCellMove, TectonicCompleteWire, TectonicStepWire } from '../../src/protocol/wireTypes.js';
import { KEYFRAME_INTERVAL_TICKS } from '../../src/protocol/version.js';
import { buildSeatWireSnapshot } from './seatProjection.js';
import { BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';
import type { CellValue } from '../../src/types.js';

interface SeatSyncState {
  generation: number;
  sequence: number;
  baseline: SeatWireSnapshot | null;
  lastKeyframeTick: number;
  lastRequestKeyframeAt: number;
}

export interface MatchPacketSyncOptions {
  netcastEveryNTicks: number;
  lobbyNetcastEveryNTicks: number;
}

export class MatchPacketSync {
  private readonly seatState = new Map<string, SeatSyncState>();
  private readonly options: MatchPacketSyncOptions;
  private sinceEmit = 0;
  private lastStatus: GameState['status'] = 'waiting';
  private preStepBoards = new Map<string, { board: CellValue[][]; poison: number[][] }>();

  constructor(options: MatchPacketSyncOptions) {
    this.options = options;
  }

  resetSeat(runtimeId: string): void {
    this.seatState.delete(runtimeId);
  }

  clear(): void {
    this.seatState.clear();
    this.preStepBoards.clear();
    this.sinceEmit = 0;
  }

  private stateFor(runtimeId: string): SeatSyncState {
    let state = this.seatState.get(runtimeId);
    if (!state) {
      state = {
        generation: 0,
        sequence: 0,
        baseline: null,
        lastKeyframeTick: -1,
        lastRequestKeyframeAt: 0,
      };
      this.seatState.set(runtimeId, state);
    }
    return state;
  }

  capturePreStepBoards(gameState: GameState): void {
    this.preStepBoards.clear();
    if (gameState.status !== 'playing') return;
    for (const [id, player] of Object.entries(gameState.players)) {
      if (player.tectonicShiftNextStepTick == null) continue;
      this.preStepBoards.set(id, {
        board: player.board.map((row) => [...row]),
        poison: (player.poisonBoard ?? []).map((row) => [...row]),
      });
    }
  }

  computeTectonicMoves(playerId: string, gameState: GameState): TectonicCellMove[] {
    const before = this.preStepBoards.get(playerId);
    const player = gameState.players[playerId];
    if (!before || !player) return [];
    const moves: TectonicCellMove[] = [];
    const poison = player.poisonBoard ?? [];
    for (let y = 0; y < BOARD_ROWS - 1; y += 1) {
      for (let x = 0; x < BOARD_COLS; x += 1) {
        const cell = before.board[y]?.[x] ?? null;
        if (cell === null) continue;
        const afterCell = player.board[y + 1]?.[x] ?? null;
        const clearedFrom = player.board[y]?.[x] ?? null;
        if (afterCell === cell && clearedFrom === null) {
          moves.push({
            x,
            fromY: y,
            toY: y + 1,
            cell,
            poison: before.poison[y]?.[x] ?? 0,
          });
        }
      }
    }
    return moves;
  }

  /**
   * Unified seat packet emitter.
   *
   * Correctness & Extensibility invariants:
   * 1. If `forceKeyframe` is true or `state.baseline === null` (e.g. fresh connection,
   *    reconnect, or status change), sends a full keyframe snapshot.
   * 2. Otherwise diffs the projected seat snapshot against `state.baseline`.
   * 3. If zero sections changed, skips emission without advancing sequence numbers
   *    (preventing sequence gaps on the client decoder).
   * 4. When a delta is emitted, advances `state.sequence`, updates `state.baseline`,
   *    and increments `state.generation` in lockstep with the client decoder.
   *
   * Adding new powerups / mechanics:
   * This function is entirely decoupled from gameplay mechanics. Powerups that modify
   * boards, pieces, shop state, active effect pills, or player meta are detected
   * automatically by `encodeDeltaPacket` diffing `snapshot` vs `state.baseline`.
   */
  private sendSeatUpdate(
    socket: Socket,
    runtimeId: string,
    gameState: GameState,
    forceKeyframe: boolean,
  ): void {
    const snapshot = buildSeatWireSnapshot(gameState, runtimeId);
    if (!snapshot) return;
    const state = this.stateFor(runtimeId);
    if (forceKeyframe || state.baseline === null) {
      this.sendKeyframe(socket, runtimeId, gameState);
      return;
    }
    const nextSequence = (state.sequence + 1) >>> 0;
    const delta = encodeDeltaPacket(snapshot, state.baseline, nextSequence, state.generation);
    if (delta === null) return;
    state.sequence = nextSequence;
    state.baseline = cloneSeatSnapshot(snapshot);
    state.generation = (state.generation + 1) >>> 0;
    socket.emit('gamePacket', delta);
  }

  sendKeyframe(socket: Socket, runtimeId: string, gameState: GameState): void {
    const snapshot = buildSeatWireSnapshot(gameState, runtimeId);
    if (!snapshot) return;
    const state = this.stateFor(runtimeId);
    state.sequence = (state.sequence + 1) >>> 0;
    state.generation = (state.generation + 1) >>> 0;
    const buffer = encodeKeyframePacket(snapshot, state.sequence, state.generation);
    state.baseline = cloneSeatSnapshot(snapshot);
    state.lastKeyframeTick = gameState.tick;
    socket.emit('gamePacket', buffer);
  }

  /**
   * Immediate event flush path.
   * Called on discrete events (piece locks, line clears, hold, shop purchases).
   * Sends delta-first to minimize egress, falling back to keyframe on status changes
   * or when a seat lacks a baseline.
   */
  sendImmediate(gameState: GameState, sockets: Map<string, Socket>, forceKeyframe = false): void {
    this.sinceEmit = 0;
    const statusChanged = gameState.status !== this.lastStatus;
    this.lastStatus = gameState.status;
    for (const [runtimeId, socket] of sockets.entries()) {
      this.sendSeatUpdate(socket, runtimeId, gameState, forceKeyframe || statusChanged);
    }
  }

  handleRequestKeyframe(socket: Socket, runtimeId: string, gameState: GameState): void {
    const state = this.stateFor(runtimeId);
    const now = Date.now();
    if (now - state.lastRequestKeyframeAt < 500) return;
    state.lastRequestKeyframeAt = now;
    this.sendKeyframe(socket, runtimeId, gameState);
  }

  onTick(
    gameState: GameState,
    sockets: Map<string, Socket>,
    events: MatchEvent[],
  ): void {
    const statusChanged = gameState.status !== this.lastStatus;
    this.lastStatus = gameState.status;
    const paused = gameState.pause !== undefined;
    const active = gameState.status === 'playing' || gameState.status === 'countdown';
    const interval = active ? this.options.netcastEveryNTicks : this.options.lobbyNetcastEveryNTicks;
    this.sinceEmit += 1;

    for (const event of events) {
      if (event.type === 'tectonicStep' && event.advanced) {
        const socket = sockets.get(event.playerId);
        if (!socket) continue;
        const moves = this.computeTectonicMoves(event.playerId, gameState);
        const step: TectonicStepWire = {
          playerId: event.playerId,
          advanced: true,
          moves,
        };
        const state = this.stateFor(event.playerId);
        state.sequence = (state.sequence + 1) >>> 0;
        const buffer = encodeTectonicStepPacket(step, state.sequence, state.generation, gameState.tick);
        socket.emit('gamePacket', buffer);
      }
      if (event.type === 'tectonicComplete') {
        const socket = sockets.get(event.playerId);
        if (!socket) continue;
        const complete: TectonicCompleteWire = {
          playerId: event.playerId,
          rowsCleared: event.rowsCleared,
        };
        const state = this.stateFor(event.playerId);
        state.sequence = (state.sequence + 1) >>> 0;
        socket.emit(
          'gamePacket',
          encodeTectonicCompletePacket(complete, state.sequence, state.generation, gameState.tick),
        );
        this.sendKeyframe(socket, event.playerId, gameState);
      }
    }

    const keyframeDue = gameState.tick > 0 && gameState.tick % KEYFRAME_INTERVAL_TICKS === 0;
    if (paused && !statusChanged) return;
    if (!statusChanged && !keyframeDue && this.sinceEmit < interval) return;

    this.sinceEmit = 0;
    for (const [runtimeId, socket] of sockets.entries()) {
      this.sendSeatUpdate(socket, runtimeId, gameState, statusChanged || keyframeDue);
    }
  }

  shouldEmitMatchEvent(event: MatchEvent): boolean {
    if (event.type === 'shopRoll') return false;
    if (event.type === 'tectonicStep' || event.type === 'tectonicComplete') return false;
    return true;
  }
}
