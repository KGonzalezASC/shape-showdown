import type { Server, Socket } from 'socket.io';
import type { MatchPersistence } from '../controlPlane/matchPersistence.js';
import type { SocketSeatBinding } from '../GameManager.js';
import type { SocketAuthErrorPayload } from '../../src/types.js';
import { DISCONNECT_SEAT_LEASE_MS } from '../../src/constants.js';
import { MatchRunner } from './MatchRunner.js';

const LEGACY_RUNTIME_KEY = '__legacy_runtime__';

export class MatchRegistry {
  private readonly runners = new Map<string, MatchRunner>();
  private draining = false;

  public constructor(
    private readonly io: Server,
    private readonly replayKeyframeIntervalTicks: number,
    private readonly persistence: MatchPersistence | undefined,
    private readonly recoveryVoidTimeoutMs: number = DISCONNECT_SEAT_LEASE_MS,
  ) {}

  public handleConnection(
    socket: Socket,
    durablePlayerId?: string,
    seatBinding?: SocketSeatBinding,
  ): void {
    const key = seatBinding?.matchId ?? LEGACY_RUNTIME_KEY;
    if (this.draining && !this.runners.has(key)) {
      emitSocketError(socket, {
        code: 'MATCH_RUNTIME_UNAVAILABLE',
        message: 'The match runtime is draining. Try again shortly.',
      });
      socket.disconnect(true);
      return;
    }

    void this.getOrCreate(key)
      .handleConnection(socket, durablePlayerId, seatBinding)
      .catch(() => {
        emitSocketError(socket, {
          code: 'MATCH_RUNTIME_UNAVAILABLE',
          message: 'The match runtime is restoring. Try again shortly.',
        });
        socket.disconnect(true);
      });
  }

  public beginDrain(): void {
    this.draining = true;
  }

  public async stop(): Promise<void> {
    await Promise.all(
      [...new Set(this.runners.values())].map((runner) => runner.stop()),
    );
    this.runners.clear();
  }

  private getOrCreate(matchId: string): MatchRunner {
    const existing = this.runners.get(matchId);
    if (existing !== undefined) return existing;

    let runner: MatchRunner;
    runner = new MatchRunner(
      this.io,
      this.replayKeyframeIntervalTicks,
      this.persistence,
      (createdMatchId) => {
        this.runners.set(createdMatchId, runner);
      },
      matchId,
      this.recoveryVoidTimeoutMs,
    );
    this.runners.set(matchId, runner);
    return runner;
  }
}

function emitSocketError(socket: Socket, payload: SocketAuthErrorPayload): void {
  socket.emit('error', payload);
}
