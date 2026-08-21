import type { Server, Socket } from 'socket.io';
import { GameManager, type SocketSeatBinding } from '../GameManager.js';
import type { MatchPersistence } from '../controlPlane/matchPersistence.js';
import { DISCONNECT_SEAT_LEASE_MS, RESTORE_READY_TIMEOUT_MS } from '../../src/constants.js';
import { logError, logInfo } from '../observability/logger.js';

export class MatchRunner {
  private readonly manager: GameManager;
  private readonly ready: Promise<void>;
  private recoveryVoidTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly recoveryVoidTimeoutMs: number;

  public constructor(
    io: Server,
    replayKeyframeIntervalTicks: number,
    persistence: MatchPersistence | undefined,
    onMatchCreated: (matchId: string) => void,
    matchId: string,
    recoveryVoidTimeoutMs = DISCONNECT_SEAT_LEASE_MS,
  ) {
    this.recoveryVoidTimeoutMs = recoveryVoidTimeoutMs;
    this.manager = new GameManager(
      io,
      replayKeyframeIntervalTicks,
      persistence,
      onMatchCreated,
      () => {
        if (this.recoveryVoidTimer !== null) {
          clearTimeout(this.recoveryVoidTimer);
          this.recoveryVoidTimer = null;
        }
      },
    );
    this.ready = this.restore(persistence, matchId);
  }

  public async handleConnection(
    socket: Socket,
    durablePlayerId?: string,
    seatBinding?: SocketSeatBinding,
  ): Promise<void> {
    await this.ready;
    this.manager.handleConnection(socket, durablePlayerId, seatBinding);
  }

  public async stop(): Promise<void> {
    if (this.recoveryVoidTimer !== null) {
      clearTimeout(this.recoveryVoidTimer);
      this.recoveryVoidTimer = null;
    }
    await this.manager.stopAndFlush();
  }

  private async restore(
    persistence: MatchPersistence | undefined,
    matchId: string,
  ): Promise<void> {
    if (persistence?.getLatestCheckpoint === undefined || matchId === '__legacy_runtime__') {
      return;
    }
    logInfo('restore_start', { matchId });
    const checkpoint = await withTimeout(
      persistence.getLatestCheckpoint(matchId),
      RESTORE_READY_TIMEOUT_MS,
      `Checkpoint restore exceeded ${RESTORE_READY_TIMEOUT_MS}ms`,
    );
    if (checkpoint !== null) {
      try {
        this.manager.restoreCheckpoint({
          matchId,
          stateBlob: checkpoint.stateBlob,
        });
        logInfo('restore_ok', {
          matchId,
          simTick: checkpoint.simTick,
        });
      } catch (error) {
        logError('match_checkpoint_restore_failed', error, { matchId });
        if (persistence.finalizeMatch !== undefined) {
          await persistence.finalizeMatch({
            matchId,
            winnerId: null,
            loserId: null,
            outcomeReason: 'void_server_crash',
            durationSeconds: 0,
            playerAStats: { score: 0, linesCleared: 0, topOut: false },
            playerBStats: { score: 0, linesCleared: 0, topOut: false },
          });
        }
        throw error;
      }
      this.recoveryVoidTimer = setTimeout(() => {
        this.recoveryVoidTimer = null;
        this.manager.voidForRecovery();
      }, this.recoveryVoidTimeoutMs);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
