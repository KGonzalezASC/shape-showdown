import type { Server, Socket } from 'socket.io';
import type { MatchPersistence } from '../controlPlane/matchPersistence.js';
import type { SocketSeatBinding } from '../GameManager.js';
import { MatchRunner } from './MatchRunner.js';

const LEGACY_RUNTIME_KEY = '__legacy_runtime__';

export class MatchRegistry {
  private readonly runners = new Map<string, MatchRunner>();
  private draining = false;

  public constructor(
    private readonly io: Server,
    private readonly replayKeyframeIntervalTicks: number,
    private readonly persistence: MatchPersistence | undefined,
  ) {}

  public handleConnection(
    socket: Socket,
    durablePlayerId?: string,
    seatBinding?: SocketSeatBinding,
  ): void {
    if (this.draining) {
      socket.emit('error', 'Server is draining');
      socket.disconnect(true);
      return;
    }

    const key = seatBinding?.matchId ?? LEGACY_RUNTIME_KEY;
    void this.getOrCreate(key)
      .handleConnection(socket, durablePlayerId, seatBinding)
      .catch(() => {
        socket.emit('error', 'Match checkpoint could not be restored');
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
    );
    this.runners.set(matchId, runner);
    return runner;
  }
}
