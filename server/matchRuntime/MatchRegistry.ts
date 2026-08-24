import type { Server, Socket } from 'socket.io';
import type { MatchPersistence } from '../controlPlane/matchPersistence.js';
import type { SocketSeatBinding } from '../GameManager.js';
import type { SocketAuthErrorPayload } from '../../src/types.js';
import { DISCONNECT_SEAT_LEASE_MS, RESTART_DELAY_SECONDS } from '../../src/constants.js';
import { MatchRunner } from './MatchRunner.js';

const LEGACY_RUNTIME_KEY = '__legacy_runtime__';

export class MatchRegistry {
  private readonly runners = new Map<string, MatchRunner>();
  private readonly terminalCleanupTimers = new Map<MatchRunner, ReturnType<typeof setTimeout>>();
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

    const runner = this.getOrCreate(key, seatBinding?.matchSeed);
    void runner.handleConnection(socket, durablePlayerId, seatBinding)
      .catch(() => {
        void this.disposeRunner(key, runner);
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
    this.clearTerminalCleanupTimers();
    await Promise.all(
      [...new Set(this.runners.values())].map((runner) => runner.stop()),
    );
    this.runners.clear();
  }

  public prepareMatch(matchId: string, matchSeed: number): void {
    if (this.draining) return;
    this.getOrCreate(matchId, matchSeed);
  }

  private getOrCreate(matchId: string, matchSeed?: number): MatchRunner {
    const existing = this.runners.get(matchId);
    if (existing !== undefined) return existing;

    let runner: MatchRunner;
    runner = new MatchRunner(
      this.io,
      this.replayKeyframeIntervalTicks,
      this.persistence,
      (createdMatchId) => {
        this.clearTerminalCleanupTimer(runner);
        this.runners.set(createdMatchId, runner);
      },
      matchId,
      this.recoveryVoidTimeoutMs,
      () => {
        const timer = setTimeout(() => {
          this.terminalCleanupTimers.delete(runner);
          this.disposeRunner(matchId, runner);
        }, RESTART_DELAY_SECONDS * 1_000 + 250);
        this.terminalCleanupTimers.set(runner, timer);
      },
      matchSeed === undefined ? undefined : { matchId, matchSeed },
    );
    this.runners.set(matchId, runner);
    return runner;
  }

  private disposeRunner(matchId: string, runner: MatchRunner): void {
    if (this.runners.get(matchId) !== runner) return;
    this.clearTerminalCleanupTimer(runner);
    for (const [key, value] of this.runners) {
      if (value === runner) this.runners.delete(key);
    }
    runner.dispose();
  }

  private clearTerminalCleanupTimer(runner: MatchRunner): void {
    const timer = this.terminalCleanupTimers.get(runner);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.terminalCleanupTimers.delete(runner);
  }

  private clearTerminalCleanupTimers(): void {
    for (const timer of this.terminalCleanupTimers.values()) clearTimeout(timer);
    this.terminalCleanupTimers.clear();
  }
}

function emitSocketError(socket: Socket, payload: SocketAuthErrorPayload): void {
  socket.emit('error', payload);
}
