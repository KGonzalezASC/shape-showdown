import type { Server, Socket } from 'socket.io';
import { GameManager, type SocketSeatBinding } from '../GameManager.js';
import type { MatchPersistence } from '../controlPlane/matchPersistence.js';

export class MatchRunner {
  private readonly manager: GameManager;
  private readonly ready: Promise<void>;
  private recoveryVoidTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    io: Server,
    replayKeyframeIntervalTicks: number,
    persistence: MatchPersistence | undefined,
    onMatchCreated: (matchId: string) => void,
    matchId: string,
  ) {
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
    const checkpoint = await persistence.getLatestCheckpoint(matchId);
    if (checkpoint !== null) {
      this.manager.restoreCheckpoint({
        matchId,
        stateBlob: checkpoint.stateBlob,
      });
      this.recoveryVoidTimer = setTimeout(() => {
        this.recoveryVoidTimer = null;
        this.manager.voidForRecovery();
      }, 15_000);
    }
  }
}
