import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameManager } from './GameManager.js';
import { BOARD_COLS, BOARD_ROWS } from '../src/constants.js';
import type { PlayerState, ReplayDataV2 } from '../src/types.js';
import { decodeKeyframePacket } from '../src/protocol/decodeMatchPacket.js';
import { ClientPacketDecoder } from '../src/protocol/ClientPacketDecoder.js';
import { GAME_PROTOCOL_VERSION } from '../src/protocol/version.js';
import { makePlayer } from './puzzleEngine/engine.js';
import { createPlayerRngChannels } from '../src/rng.js';
import type { Server, Socket } from 'socket.io';
import type { JoinTicket, MatchRecord } from './controlPlane/matchStore.js';
import type {
  MatchPersistence,
  StartDurableMatchInput,
} from './controlPlane/matchPersistence.js';

class FakeSocket extends EventEmitter {
  id: string;
  disconnected = false;
  gamePackets: ArrayBuffer[] = [];
  matchAssignments: unknown[] = [];

  constructor(id: string) {
    super();
    this.id = id;
  }

  emit(event: string, ...args: unknown[]): boolean {
    if (event === 'gamePacket' && args[0] instanceof ArrayBuffer) {
      this.gamePackets.push(args[0]);
    }
    if (event === 'matchAssignment') {
      this.matchAssignments.push(args[0]);
    }
    return super.emit(event, ...args);
  }

  disconnect() {
    this.disconnected = true;
    this.emit('disconnect');
  }

  join(): void {}
}

function createFakeIo(emitted: unknown[][] = []) {
  return {
    emit: (...args: unknown[]) => {
      emitted.push(args);
      return true;
    },
    to: () => ({
      emit: (...args: unknown[]) => {
        emitted.push(args);
        return true;
      },
    }),
    on: () => undefined,
  } as unknown as Server;
}

class RecordingMatchPersistence implements MatchPersistence {
  readonly starts: StartDurableMatchInput[] = [];
  readonly statuses: Array<{ matchId: string; expectedStatus: string; nextStatus: string }> = [];
  readonly finalizations: Array<{
    matchId: string;
    winnerId: string | null;
    outcomeReason: string;
  }> = [];

  async startMatch(input: StartDurableMatchInput): Promise<{
    match: MatchRecord;
    tickets: { A: JoinTicket; B: JoinTicket };
  }> {
    this.starts.push(input);
    const matchId = `match-${this.starts.length}`;
    const match: MatchRecord = {
      id: matchId,
      correlationId: `correlation-${this.starts.length}`,
      matchSeed: input.matchSeed,
      playerAId: input.participants.A,
      playerBId: input.participants.B,
      gameServerUrl: 'http://localhost:3000',
      protocolVersion: GAME_PROTOCOL_VERSION,
      status: 'allocating',
      isRepeatPairing: false,
      playerASearchAttemptId: null,
      playerBSearchAttemptId: null,
    };
    const ticket = (seat: 'A' | 'B'): JoinTicket => ({
      id: `${matchId}-${seat}`,
      matchId,
      playerId: seat === 'A' ? input.participants.A : input.participants.B,
      seat,
      expiresAt: new Date(),
      ticket: `${matchId}-${seat}-ticket`,
    });
    return { match, tickets: { A: ticket('A'), B: ticket('B') } };
  }

  async advanceStatus(input: {
    matchId: string;
    expectedStatus: string;
    nextStatus: string;
  }): Promise<void> {
    this.statuses.push(input);
  }

  async finalizeMatch(input: {
    matchId: string;
    winnerId: string | null;
    outcomeReason: string;
  }): Promise<void> {
    this.finalizations.push(input);
  }

  readonly checkpoints: Array<{ matchId: string; simTick: number; stateBlob: Uint8Array }> = [];
  checkpointDelayMs = 0;

  async writeCheckpoint(input: {
    matchId: string;
    simTick: number;
    stateBlob: Uint8Array;
  }): Promise<void> {
    if (this.checkpointDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.checkpointDelayMs));
    }
    this.checkpoints.push(input);
  }
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const managers: GameManager[] = [];

afterEach(() => {
  while (managers.length > 0) {
    managers.pop()!.stopLoop();
  }
});

describe('GameManager lifecycle harness', () => {
  it('publishes a decreasing game-over countdown and starts the rematch', () => {
    let gm: GameManager | null = null;
    gm = new GameManager(
      createFakeIo(),
      60,
      undefined,
      undefined,
      undefined,
      () => gm?.dispose(),
    );
    managers.push(gm);
    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    gm.handleConnection(p1 as unknown as Socket, 'durable-p1');
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2');
    gm.stopLoop();

    const internal = gm as unknown as {
      gameState: {
        status: string;
        restartTimer?: number;
        players: Record<string, PlayerState>;
      };
      lastHandledStatus: string;
    };
    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';
    internal.gameState.players['durable-p1'].topOut = true;

    for (let frame = 0; frame < 310; frame += 1) {
      gm.tickAndEmitOnceForTests();
    }

    const decoder = new ClientPacketDecoder();
    decoder.setMyId('durable-p2');
    const terminalTimers: number[] = [];
    for (const packet of p2.gamePackets) {
      const model = decoder.decode(packet);
      if (model?.chrome.status === 'ended' && model.chrome.restartTimer !== undefined) {
        terminalTimers.push(model.chrome.restartTimer);
      }
    }

    assert.ok(terminalTimers.length > 1);
    assert.equal(Math.ceil(terminalTimers[0]), 5);
    assert.ok(Math.ceil(terminalTimers[terminalTimers.length - 1]) < 5);
    assert.equal(internal.gameState.status, 'countdown');
  });

  it('emits rematch tickets after a durable top-out timer expires', async () => {
    const createdMatchIds: string[] = [];
    const persistence = new RecordingMatchPersistence();
    const gm = new GameManager(
      createFakeIo(),
      60,
      persistence,
      (matchId) => {
        createdMatchIds.push(matchId);
      },
    );
    managers.push(gm);
    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    const ticket = (playerId: string, seat: 'A' | 'B') => ({
      matchId: 'match-prealloc',
      playerId,
      seat,
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    } as const);

    gm.handleConnection(p1 as unknown as Socket, 'durable-p1', ticket('durable-p1', 'A'));
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2', ticket('durable-p2', 'B'));
    gm.stopLoop();

    const internal = gm as unknown as {
      gameState: {
        status: string;
        endReason?: string;
        restartTimer?: number;
        players: Record<string, PlayerState>;
        pause?: { playerId: string };
      };
      lastHandledStatus: string;
      durableMatchId: string | null;
      durableMatchPreallocated: boolean;
    };
    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';
    internal.durableMatchId = 'match-prealloc';
    internal.durableMatchPreallocated = true;
    internal.gameState.players['durable-p1'].topOut = true;

    for (let frame = 0; frame < 310; frame += 1) {
      gm.tickAndEmitOnceForTests();
    }
    await flushPromises();

    assert.equal(internal.gameState.status, 'countdown');
    assert.equal(internal.gameState.pause, undefined);
    assert.equal(persistence.starts.length, 1);
    assert.equal(createdMatchIds.length, 1);
    assert.equal(p1.matchAssignments.length, 1);
    assert.equal(p2.matchAssignments.length, 1);
    assert.equal(
      (p1.matchAssignments[0] as { matchId: string }).matchId,
      createdMatchIds[0],
    );
    assert.notEqual(createdMatchIds[0], 'match-prealloc');
  });

  it('does not pause the sim when a seat disconnects during rematch countdown', async () => {
    const persistence = new RecordingMatchPersistence();
    const gm = new GameManager(createFakeIo(), 60, persistence);
    managers.push(gm);
    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    gm.handleConnection(p1 as unknown as Socket, 'durable-p1', {
      matchId: 'match-1',
      playerId: 'durable-p1',
      seat: 'A',
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    });
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2', {
      matchId: 'match-1',
      playerId: 'durable-p2',
      seat: 'B',
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    });
    gm.stopLoop();

    const internal = gm as unknown as {
      gameState: {
        status: string;
        countdown: number;
        pause?: { playerId: string };
        players: Record<string, PlayerState>;
      };
      lastHandledStatus: string;
      durableMatchId: string | null;
    };
    internal.gameState.status = 'countdown';
    internal.lastHandledStatus = 'countdown';
    internal.durableMatchId = 'match-1';
    const countdownBefore = internal.gameState.countdown;

    p1.emit('disconnect');
    assert.equal(internal.gameState.pause, undefined);
    assert.equal(Object.keys(internal.gameState.players).length, 2);

    for (let frame = 0; frame < 5; frame += 1) {
      gm.tickOnceForTests();
    }
    assert.ok(internal.gameState.countdown < countdownBefore);
  });

  it('creates a new durable match for a rematch and finalizes the prior result', async () => {
    const persistence = new RecordingMatchPersistence();
    const gm = new GameManager(createFakeIo(), 60, persistence);
    managers.push(gm);
    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    gm.handleConnection(p1 as unknown as Socket, 'durable-p1');
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2');

    for (let i = 0; i < 5; i += 1) gm.tickOnceForTests();
    await flushPromises();

    const internal = gm as unknown as {
      gameState: {
        status: string;
        winnerId: string | null;
        restartTimer?: number;
        players: Record<string, PlayerState>;
      };
      lastHandledStatus: string;
    };
    assert.equal(internal.gameState.status, 'countdown');
    assert.equal(persistence.starts.length, 1);

    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';
    internal.gameState.players['durable-p1'].topOut = true;
    gm.tickOnceForTests();
    gm.tickOnceForTests();
    await flushPromises();

    assert.equal(internal.gameState.status, 'ended');
    assert.equal(persistence.finalizations.length, 1);
    assert.equal(persistence.finalizations[0].winnerId, 'durable-p2');

    internal.gameState.restartTimer = 0;
    gm.tickOnceForTests();
    gm.tickOnceForTests();
    await flushPromises();

    assert.equal(persistence.starts.length, 2);
    assert.notEqual(persistence.starts[0].matchSeed, persistence.starts[1].matchSeed);
    assert.deepEqual(persistence.starts[1].participants, {
      A: 'durable-p1',
      B: 'durable-p2',
    });

    // A socket handoff can briefly publish waiting while the replacement
    // tickets bind. That must not cause the already-created rematch to be
    // inserted into PostgreSQL again when the state returns to countdown.
    internal.gameState.status = 'waiting';
    internal.lastHandledStatus = 'ended';
    gm.tickOnceForTests();
    gm.tickOnceForTests();
    await flushPromises();
    assert.equal(persistence.starts.length, 2);
  });

  it('pauses a durable match for disconnect and rebinds the same seat', async () => {
    const persistence = new RecordingMatchPersistence();
    const gm = new GameManager(createFakeIo(), 60, persistence);
    managers.push(gm);
    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    gm.handleConnection(p1 as unknown as Socket, 'durable-p1', {
      matchId: 'match-1',
      playerId: 'durable-p1',
      seat: 'A',
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    });
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2', {
      matchId: 'match-1',
      playerId: 'durable-p2',
      seat: 'B',
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    });

    for (let i = 0; i < 5; i += 1) gm.tickOnceForTests();
    await flushPromises();

    const internal = gm as unknown as {
      gameState: {
        status: string;
        pause?: { playerId: string };
        players: Record<string, PlayerState>;
      };
      lastHandledStatus: string;
    };
    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';
    p1.emit('disconnect');
    gm.tickOnceForTests();
    await flushPromises();

    assert.equal(persistence.finalizations.length, 0);
    assert.equal(internal.gameState.pause?.playerId, 'durable-p1');
    assert.equal(internal.gameState.players['durable-p1'] !== undefined, true);

    const replacement = new FakeSocket('p1-reconnected');
    gm.handleConnection(
      replacement as unknown as Socket,
      'durable-p1',
      {
        matchId: 'match-1',
        playerId: 'durable-p1',
        seat: 'A',
        matchSeed: 123,
        protocolVersion: GAME_PROTOCOL_VERSION,
      },
    );
    assert.equal(internal.gameState.pause, undefined);
    assert.equal(internal.gameState.players['durable-p1'] !== undefined, true);
  });

  it('keeps a restored match paused until both seats reclaim', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    const rngA = createPlayerRngChannels(54321, 0);
    const rngB = createPlayerRngChannels(54321, 1);
    const stateBlob = Buffer.from(JSON.stringify({
      version: 1,
      matchId: 'match-restore',
      state: {
        players: {
          'durable-p1': makePlayer('durable-p1', rngA),
          'durable-p2': makePlayer('durable-p2', rngB),
        },
        status: 'playing',
        countdown: 0,
        winnerId: null,
        tick: 180,
        seed: 54321,
      },
      participants: [
        { runtimeId: 'durable-p1', playerId: 'durable-p1', slot: 0, rng: rngA },
        { runtimeId: 'durable-p2', playerId: 'durable-p2', slot: 1, rng: rngB },
      ],
      disconnectBudgets: [],
    }), 'utf8');

    gm.restoreCheckpoint({ matchId: 'match-restore', stateBlob });
    const internal = gm as unknown as {
      gameState: {
        status: string;
        pause?: { playerId: string };
        tick: number;
      };
      restoredAwaitingReconnect: boolean;
    };
    const tickBefore = internal.gameState.tick;
    gm.tickOnceForTests();
    assert.equal(internal.restoredAwaitingReconnect, true);
    assert.equal(internal.gameState.pause?.playerId, 'durable-p1');
    assert.equal(internal.gameState.tick, tickBefore);

    const first = new FakeSocket('p1-restore');
    gm.handleConnection(first as unknown as Socket, 'durable-p1', {
      matchId: 'match-restore',
      playerId: 'durable-p1',
      seat: 'A',
      matchSeed: 54321,
      protocolVersion: GAME_PROTOCOL_VERSION,
    });
    gm.tickOnceForTests();
    assert.equal(internal.restoredAwaitingReconnect, true);
    assert.equal(internal.gameState.pause?.playerId, 'durable-p2');
    assert.equal(internal.gameState.tick, tickBefore);

    const second = new FakeSocket('p2-restore');
    gm.handleConnection(second as unknown as Socket, 'durable-p2', {
      matchId: 'match-restore',
      playerId: 'durable-p2',
      seat: 'B',
      matchSeed: 54321,
      protocolVersion: GAME_PROTOCOL_VERSION,
    });
    assert.equal(internal.restoredAwaitingReconnect, false);
    assert.equal(internal.gameState.pause, undefined);
  });

  it('forfeits a disconnected seat after the lease and publishes the terminal state', async () => {
    const gm = new GameManager(
      createFakeIo(),
      60,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      20,
    );
    managers.push(gm);
    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    const ticket = (playerId: string, seat: 'A' | 'B') => ({
      matchId: 'match-lease',
      playerId,
      seat,
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    } as const);

    gm.handleConnection(p1 as unknown as Socket, 'durable-p1', ticket('durable-p1', 'A'));
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2', ticket('durable-p2', 'B'));

    const internal = gm as unknown as {
      gameState: {
        status: string;
        pause?: { playerId: string };
        winnerId: string | null;
      };
      lastHandledStatus: string;
    };
    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';
    const packetsBeforeDisconnect = p1.gamePackets.length;

    p2.emit('disconnect');
    await new Promise<void>((resolve) => setTimeout(resolve, 40));

    assert.equal(internal.gameState.status, 'ended');
    assert.equal(internal.gameState.winnerId, 'durable-p1');
    assert.equal(internal.gameState.pause, undefined);
    assert.ok(p1.gamePackets.length > packetsBeforeDisconnect);
  });

  it('keeps an opponent pause when the other player refreshes', async () => {
    const persistence = new RecordingMatchPersistence();
    const gm = new GameManager(createFakeIo(), 60, persistence);
    managers.push(gm);
    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    const ticket = (playerId: string, seat: 'A' | 'B') => ({
      matchId: 'match-1',
      playerId,
      seat,
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    } as const);

    gm.handleConnection(p1 as unknown as Socket, 'durable-p1', ticket('durable-p1', 'A'));
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2', ticket('durable-p2', 'B'));

    for (let i = 0; i < 5; i += 1) gm.tickOnceForTests();
    await flushPromises();

    const internal = gm as unknown as {
      gameState: {
        status: string;
        pause?: { playerId: string };
        tick: number;
        players: Record<string, PlayerState>;
      };
      lastHandledStatus: string;
    };
    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';

    p2.emit('disconnect');
    p1.emit('disconnect');
    assert.equal(internal.gameState.pause?.playerId, 'durable-p2');

    const refreshedP1 = new FakeSocket('p1-refreshed');
    gm.handleConnection(
      refreshedP1 as unknown as Socket,
      'durable-p1',
      ticket('durable-p1', 'A'),
    );

    const tickBeforePausedUpdate = internal.gameState.tick;
    gm.tickOnceForTests();

    assert.equal(internal.gameState.pause?.playerId, 'durable-p2');
    assert.equal(internal.gameState.tick, tickBeforePausedUpdate);
    assert.ok(internal.gameState.players['durable-p2']);
  });

  it('keeps the remaining disconnect protected when the first player reconnects', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    const ticket = (playerId: string, seat: 'A' | 'B') => ({
      matchId: 'match-1',
      playerId,
      seat,
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    } as const);

    gm.handleConnection(p1 as unknown as Socket, 'durable-p1', ticket('durable-p1', 'A'));
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2', ticket('durable-p2', 'B'));

    const internal = gm as unknown as {
      gameState: {
        status: string;
        pause?: { playerId: string };
        players: Record<string, PlayerState>;
      };
      lastHandledStatus: string;
    };
    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';

    p2.emit('disconnect');
    p1.emit('disconnect');

    const refreshedP2 = new FakeSocket('p2-refreshed');
    gm.handleConnection(
      refreshedP2 as unknown as Socket,
      'durable-p2',
      ticket('durable-p2', 'B'),
    );

    assert.equal(internal.gameState.pause?.playerId, 'durable-p1');
    assert.ok(internal.gameState.players['durable-p1']);
  });

  it('clears the surviving winner board before waiting for a new opponent', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    gm.handleConnection(new FakeSocket('p1') as unknown as Socket, 'durable-p1');
    gm.handleConnection(new FakeSocket('p2') as unknown as Socket, 'durable-p2');

    const internal = gm as unknown as {
      gameState: {
        status: string;
        restartTimer?: number;
        players: Record<string, PlayerState>;
      };
      lastHandledStatus: string;
    };
    const winner = internal.gameState.players['durable-p1'];
    winner.board[BOARD_ROWS - 1][0] = 'I';
    winner.activePiece = null;
    internal.gameState.status = 'ended';
    internal.lastHandledStatus = 'ended';
    internal.gameState.restartTimer = 0;
    delete internal.gameState.players['durable-p2'];

    gm.tickOnceForTests();
    gm.tickOnceForTests();

    assert.equal(internal.gameState.status, 'waiting');
    assert.equal(
      internal.gameState.players['durable-p1'].board.some((row) => row.some((cell) => cell !== null)),
      false,
    );
    assert.notEqual(internal.gameState.players['durable-p1'].activePiece, null);
  });

  it('replaces a seat socket through a valid ticket without changing the runtime player identity', async () => {
    const persistence = new RecordingMatchPersistence();
    const gm = new GameManager(createFakeIo(), 60, persistence);
    managers.push(gm);
    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    gm.handleConnection(p1 as unknown as Socket, 'durable-p1');
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2');

    for (let i = 0; i < 5; i += 1) gm.tickOnceForTests();
    await flushPromises();

    const replacement = new FakeSocket('p1-replacement');
    const replacementSnapshots: unknown[] = [];
    replacement.on('gamePacket', (state) => replacementSnapshots.push(state));
    gm.handleConnection(
      replacement as unknown as Socket,
      'durable-p1',
      {
        matchId: 'match-1',
        playerId: 'durable-p1',
        seat: 'A',
        matchSeed: 123,
        protocolVersion: GAME_PROTOCOL_VERSION,
      },
    );

    const internal = gm as unknown as {
      gameState: {
        status: string;
        players: Record<string, PlayerState>;
      };
    };
    replacement.emit('inputState', { left: true, right: false, softDrop: false });

    assert.equal(p1.disconnected, true);
    assert.equal(internal.gameState.status, 'countdown');
    assert.ok(internal.gameState.players['durable-p1']);
    assert.equal(internal.gameState.players['durable-p1'].inputState.left, true);
    assert.equal(replacementSnapshots.length, 1);
    const keyframe = decodeKeyframePacket(replacementSnapshots[0] as ArrayBuffer);
    assert.equal(keyframe.local.id, 'durable-p1');
    assert.equal(keyframe.opponent.id, 'durable-p2');
  });

  it('rejects a third assigned socket without displacing either active seat', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    const ticket = (playerId: string, seat: 'A' | 'B') => ({
      matchId: 'match-1',
      playerId,
      seat,
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    } as const);
    const first = new FakeSocket('first');
    const second = new FakeSocket('second');
    const third = new FakeSocket('third');

    gm.handleConnection(first as unknown as Socket, 'durable-p1', ticket('durable-p1', 'A'));
    gm.handleConnection(second as unknown as Socket, 'durable-p2', ticket('durable-p2', 'B'));
    const errors: unknown[] = [];
    third.on('error', (error) => errors.push(error));
    gm.handleConnection(third as unknown as Socket, 'durable-p3', ticket('durable-p3', 'A'));

    assert.deepEqual(errors, [{
      code: 'MATCH_THIRD_SOCKET',
      message: 'This match already has two active seats.',
    }]);
    assert.equal(first.disconnected, false);
    assert.equal(second.disconnected, false);
  });

  it('rejects a wrong seat and protocol before sending a snapshot', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    const player = new FakeSocket('player');
    gm.handleConnection(player as unknown as Socket, 'durable-p1', {
      matchId: 'match-1',
      playerId: 'durable-p1',
      seat: 'A',
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    });

    const wrongSeat = new FakeSocket('wrong-seat');
    const wrongSeatErrors: unknown[] = [];
    const wrongSeatSnapshots: unknown[] = [];
    wrongSeat.on('error', (error) => wrongSeatErrors.push(error));
    wrongSeat.on('gamePacket', (state) => wrongSeatSnapshots.push(state));
    gm.handleConnection(wrongSeat as unknown as Socket, 'durable-p1', {
      matchId: 'match-1',
      playerId: 'durable-p1',
      seat: 'B',
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    });

    assert.deepEqual(wrongSeatErrors, [{
      code: 'MATCH_SEAT_REJECTED',
      message: 'The match ticket does not belong to this seat.',
    }]);
    assert.equal(wrongSeatSnapshots.length, 0);

    const wrongProtocol = new FakeSocket('wrong-protocol');
    const wrongProtocolErrors: unknown[] = [];
    wrongProtocol.on('error', (error) => wrongProtocolErrors.push(error));
    gm.handleConnection(wrongProtocol as unknown as Socket, 'durable-p1', {
      matchId: 'match-1',
      playerId: 'durable-p1',
      seat: 'A',
      matchSeed: 123,
      protocolVersion: 1,
    });

    assert.deepEqual(wrongProtocolErrors, [{
      code: 'PROTOCOL_VERSION_MISMATCH',
      message: 'Match protocol version is not supported.',
    }]);
    assert.equal(
      (gm as unknown as {
        pendingReplayDiscontinuities: Array<{ kind: string }>;
      }).pendingReplayDiscontinuities.some((marker) => marker.kind === 'protocol_mismatch'),
      true,
    );
  });

  it('records disconnect and reconnect replay markers in chronological order', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    const ticket = (playerId: string, seat: 'A' | 'B') => ({
      matchId: 'match-1',
      playerId,
      seat,
      matchSeed: 123,
      protocolVersion: GAME_PROTOCOL_VERSION,
    } as const);
    const first = new FakeSocket('first');
    const opponent = new FakeSocket('opponent');
    gm.handleConnection(first as unknown as Socket, 'durable-p1', ticket('durable-p1', 'A'));
    gm.handleConnection(opponent as unknown as Socket, 'durable-p2', ticket('durable-p2', 'B'));

    const internal = gm as unknown as {
      gameState: { status: string };
      lastHandledStatus: string;
      pendingReplayDiscontinuities: Array<{ kind: string; tick: number }>;
    };
    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';
    first.emit('disconnect');

    const replacement = new FakeSocket('replacement');
    gm.handleConnection(
      replacement as unknown as Socket,
      'durable-p1',
      ticket('durable-p1', 'A'),
    );

    assert.deepEqual(
      internal.pendingReplayDiscontinuities.map((marker) => marker.kind),
      ['disconnect_start', 'reconnect_success'],
    );
    assert.ok(
      internal.pendingReplayDiscontinuities[0].tick
      <= internal.pendingReplayDiscontinuities[1].tick,
    );
  });

  it('transitions waiting → countdown when two players connect', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    gm.handleConnection(new FakeSocket('a') as unknown as Socket);
    gm.handleConnection(new FakeSocket('b') as unknown as Socket);

    const state = (gm as unknown as { gameState: { status: string; players: Record<string, unknown> } })
      .gameState;
    assert.equal(Object.keys(state.players).length, 2);

    for (let i = 0; i < 5; i += 1) {
      gm.tickOnceForTests();
    }
    assert.equal(state.status, 'countdown');
  });

  it('first top-out ends the match without processing further players', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    gm.handleConnection(new FakeSocket('p1') as unknown as Socket);
    gm.handleConnection(new FakeSocket('p2') as unknown as Socket);

    const internal = gm as unknown as {
      gameState: {
        status: string;
        winnerId: string | null;
        tick: number;
        players: Record<string, { topOut: boolean; linesCleared: number; gravityCounter: number }>;
      };
      lastHandledStatus: string;
      activeReplay: unknown;
    };

    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';
    internal.gameState.tick = 0;
    internal.activeReplay = null;

    const ids = Object.keys(internal.gameState.players);
    const firstId = ids[0];
    const secondId = ids[1];
    internal.gameState.players[firstId].topOut = true;

    // Snapshot second-player gravity to ensure they were not stepped after end.
    const gravityBefore = internal.gameState.players[secondId].gravityCounter;
    gm.tickOnceForTests();

    assert.equal(internal.gameState.status, 'ended');
    assert.equal(internal.gameState.winnerId, secondId);
    assert.equal(internal.gameState.players[secondId].gravityCounter, gravityBefore);
  });

  it('commits attacks only after both players complete their simulation pass', () => {
    const emitted: unknown[][] = [];
    const gm = new GameManager(createFakeIo(emitted), 60);
    managers.push(gm);
    gm.handleConnection(new FakeSocket('p1') as unknown as Socket);
    gm.handleConnection(new FakeSocket('p2') as unknown as Socket);

    const internal = gm as unknown as {
      gameState: {
        status: string;
        tick: number;
        players: Record<string, PlayerState>;
      };
      lastHandledStatus: string;
      activeReplay: unknown;
    };
    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';
    internal.gameState.tick = 0;
    internal.activeReplay = null;

    const p1 = internal.gameState.players.p1;
    const p2 = internal.gameState.players.p2;
    const bottom = BOARD_ROWS - 1;
    for (let x = 1; x < BOARD_COLS; x += 1) p1.board[bottom][x] = 'I';
    p1.activePiece = { type: 'I', rotation: 0, x: -1, y: bottom - 1 };
    p1.lockDelayRemainingTicks = 0;

    gm.tickOnceForTests();

    assert.ok(p2.pendingGarbage.length > 0);
    assert.ok(emitted.some((args) => (
      args[0] === 'matchEvent'
      && (args[1] as { type?: string } | undefined)?.type === 'attackSent'
      && (args[1] as { playerId?: string } | undefined)?.playerId === 'p1'
    )));
  });

  it('records shop commands in the replay input stream', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    const p1Socket = new FakeSocket('p1');
    gm.handleConnection(p1Socket as unknown as Socket);
    gm.handleConnection(new FakeSocket('p2') as unknown as Socket);

    const internal = gm as unknown as {
      gameState: { status: string; players: Record<string, PlayerState> };
      activeReplay: { inputs: ReplayDataV2['inputs'] } | null;
    };
    internal.gameState.status = 'playing';
    internal.gameState.players.p1.shop.phase = 'ready';
    const replay = { inputs: [] as ReplayDataV2['inputs'] };
    internal.activeReplay = replay;

    p1Socket.emit('shopOpen');
    p1Socket.emit('shopPurchase', 'not-the-highlighted-offer');

    assert.deepEqual(replay.inputs.map((frame) => frame.kind), ['shopOpen', 'shopPurchase']);
    assert.deepEqual(replay.inputs.map((frame) => frame.tick), [1, 1]);
    assert.equal(replay.inputs[0].kind, 'shopOpen');
    assert.equal(replay.inputs[1].kind, 'shopPurchase');
  });

  it('records the resolved dynamic price for an accepted purchase', () => {
    const gm = new GameManager(createFakeIo(), 60);
    managers.push(gm);
    const p1Socket = new FakeSocket('p1');
    gm.handleConnection(p1Socket as unknown as Socket);
    gm.handleConnection(new FakeSocket('p2') as unknown as Socket);

    const internal = gm as unknown as {
      gameState: { status: string; players: Record<string, PlayerState> };
      activeReplay: { inputs: ReplayDataV2['inputs'] } | null;
    };
    const buyer = internal.gameState.players.p1;
    buyer.funds = 100;
    buyer.shop.offerIds = ['fortify-frame'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;
    internal.gameState.status = 'playing';
    const replay = { inputs: [] as ReplayDataV2['inputs'] };
    internal.activeReplay = replay;

    p1Socket.emit('shopPurchase', 'fortify-frame');

    assert.equal(buyer.funds, 40);
    const purchase = replay.inputs[0];
    assert.equal(purchase.kind, 'shopPurchase');
    assert.equal(purchase.accepted, true);
    assert.equal(purchase.cost, 60);
  });

  it('saves the terminal tick after its events and final keyframe are recorded', () => {
    const replayDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shape-showdown-replay-'));
    const previousReplayDir = process.env.REPLAYS_DIR;
    process.env.REPLAYS_DIR = replayDir;

    try {
      const gm = new GameManager(createFakeIo(), 60);
      managers.push(gm);
      gm.handleConnection(new FakeSocket('p1') as unknown as Socket);
      gm.handleConnection(new FakeSocket('p2') as unknown as Socket);

      const internal = gm as unknown as {
        gameState: {
          status: string;
          tick: number;
          players: Record<string, PlayerState>;
        };
        lastHandledStatus: string;
        activeReplay: ReplayDataV2 | null;
      };
      internal.gameState.status = 'playing';
      internal.lastHandledStatus = 'playing';
      internal.gameState.tick = 0;

      const p1 = internal.gameState.players.p1;
      p1.activePiece = null;
      for (let y = 0; y < 2; y += 1) {
        for (let x = 0; x < BOARD_COLS; x += 1) p1.board[y][x] = 'I';
      }
      internal.activeReplay = {
        version: 2,
        date: 'terminal-tick-test',
        seed: 1,
        initialState: JSON.parse(JSON.stringify(internal.gameState)),
        inputs: [],
        keyframes: [{
          tick: 0,
          players: JSON.parse(JSON.stringify(internal.gameState.players)),
        }],
        events: [],
      };

      gm.tickOnceForTests();

      const replayPath = path.join(replayDir, 'replay_terminal-tick-test.replay');
      assert.equal(fs.existsSync(replayPath), true);
      const saved = JSON.parse(fs.readFileSync(replayPath, 'utf8')) as ReplayDataV2;
      assert.ok(saved.events.some((event) => event.type === 'topOut' && event.playerId === 'p1'));
      assert.ok(saved.keyframes.some((keyframe) => keyframe.tick === 1));
      assert.equal(internal.activeReplay, null);
    } finally {
      if (previousReplayDir === undefined) delete process.env.REPLAYS_DIR;
      else process.env.REPLAYS_DIR = previousReplayDir;
      fs.rmSync(replayDir, { recursive: true, force: true });
    }
  });

  it('derives player RNG channels from match seed and player slot, not socket id', () => {
    const gm1 = new GameManager(createFakeIo(), 60);
    managers.push(gm1);
    const gm2 = new GameManager(createFakeIo(), 60);
    managers.push(gm2);

    (gm1 as unknown as { gameState: { seed: number } }).gameState.seed = 12345;
    (gm2 as unknown as { gameState: { seed: number } }).gameState.seed = 12345;

    gm1.handleConnection(new FakeSocket('alpha') as unknown as Socket);
    gm1.handleConnection(new FakeSocket('beta') as unknown as Socket);

    gm2.handleConnection(new FakeSocket('foo') as unknown as Socket);
    gm2.handleConnection(new FakeSocket('bar') as unknown as Socket);

    const state1 = (gm1 as unknown as { gameState: { players: Record<string, PlayerState> } }).gameState;
    const state2 = (gm2 as unknown as { gameState: { players: Record<string, PlayerState> } }).gameState;

    assert.equal(state1.players.alpha.activePiece?.type, state2.players.foo.activePiece?.type);
    assert.deepEqual(state1.players.alpha.nextQueue, state2.players.foo.nextQueue);
    assert.deepEqual(state1.players.alpha.shop.offerIds, state2.players.foo.shop.offerIds);

    assert.equal(state1.players.beta.activePiece?.type, state2.players.bar.activePiece?.type);
    assert.deepEqual(state1.players.beta.nextQueue, state2.players.bar.nextQueue);
    assert.deepEqual(state1.players.beta.shop.offerIds, state2.players.bar.shop.offerIds);
  });

  it('fixed seed and identical actions produce deterministic player states and canonical event sequences', () => {
    const emitted1: unknown[][] = [];
    const gm1 = new GameManager(createFakeIo(emitted1), 60);
    managers.push(gm1);
    (gm1 as unknown as { gameState: { seed: number } }).gameState.seed = 9999;
    const s1a = new FakeSocket('p1');
    const s1b = new FakeSocket('p2');
    gm1.handleConnection(s1a as unknown as Socket);
    gm1.handleConnection(s1b as unknown as Socket);

    const emitted2: unknown[][] = [];
    const gm2 = new GameManager(createFakeIo(emitted2), 60);
    managers.push(gm2);
    (gm2 as unknown as { gameState: { seed: number } }).gameState.seed = 9999;
    const s2a = new FakeSocket('p1');
    const s2b = new FakeSocket('p2');
    gm2.handleConnection(s2a as unknown as Socket);
    gm2.handleConnection(s2b as unknown as Socket);

    for (let i = 0; i < 200; i += 1) {
      gm1.tickOnceForTests();
      gm2.tickOnceForTests();
    }

    const state1 = (gm1 as unknown as { gameState: { tick: number; players: Record<string, PlayerState> } }).gameState;
    const state2 = (gm2 as unknown as { gameState: { tick: number; players: Record<string, PlayerState> } }).gameState;

    assert.equal(state1.tick, state2.tick);
    assert.deepEqual(state1.players.p1.board, state2.players.p1.board);
    assert.deepEqual(state1.players.p1.activePiece, state2.players.p1.activePiece);
    assert.deepEqual(state1.players.p2.board, state2.players.p2.board);
    assert.deepEqual(state1.players.p2.activePiece, state2.players.p2.activePiece);

    const events1 = emitted1.filter((args) => args[0] === 'matchEvent').map((args) => args[1]);
    const events2 = emitted2.filter((args) => args[0] === 'matchEvent').map((args) => args[1]);
    assert.deepEqual(events1, events2);
  });

  it('changes replay checkpoint density without changing authoritative match state', () => {
    const emittedEveryTick: unknown[][] = [];
    const emittedSparse: unknown[][] = [];
    const gmEveryTick = new GameManager(createFakeIo(emittedEveryTick), 1);
    const gmSparse = new GameManager(createFakeIo(emittedSparse), 30);
    managers.push(gmEveryTick, gmSparse);

    (gmEveryTick as unknown as { gameState: { seed: number } }).gameState.seed = 4242;
    (gmSparse as unknown as { gameState: { seed: number } }).gameState.seed = 4242;

    for (const gm of [gmEveryTick, gmSparse]) {
      gm.handleConnection(new FakeSocket('p1') as unknown as Socket);
      gm.handleConnection(new FakeSocket('p2') as unknown as Socket);
    }

    for (let i = 0; i < 240; i += 1) {
      gmEveryTick.tickOnceForTests();
      gmSparse.tickOnceForTests();
    }

    const everyTick = (gmEveryTick as unknown as {
      gameState: { players: Record<string, PlayerState>; tick: number };
      activeReplay: ReplayDataV2 | null;
    });
    const sparse = (gmSparse as unknown as {
      gameState: { players: Record<string, PlayerState>; tick: number };
      activeReplay: ReplayDataV2 | null;
    });
    assert.equal(everyTick.gameState.tick, sparse.gameState.tick);
    assert.deepEqual(everyTick.gameState.players, sparse.gameState.players);
    assert.deepEqual(
      emittedEveryTick
        .filter((args) => args[0] === 'matchEvent')
        .map((args) => args[1]),
      emittedSparse
        .filter((args) => args[0] === 'matchEvent')
        .map((args) => args[1]),
    );
    assert.ok(everyTick.activeReplay);
    assert.ok(sparse.activeReplay);
    assert.ok((everyTick.activeReplay?.keyframes.length ?? 0) > (sparse.activeReplay?.keyframes.length ?? 0));
    assert.equal(sparse.activeReplay?.keyframeIntervalTicks, 30);
  });

  it('coalesces intermediate checkpoints when database writes are delayed', async () => {
    const persistence = new RecordingMatchPersistence();
    persistence.checkpointDelayMs = 25;
    const gm = new GameManager(createFakeIo(), 60, persistence);
    managers.push(gm);

    const p1 = new FakeSocket('p1');
    const p2 = new FakeSocket('p2');
    gm.handleConnection(p1 as unknown as Socket, 'durable-p1');
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2');

    for (let i = 0; i < 5; i += 1) gm.tickOnceForTests();
    await flushPromises();

    const internal = gm as unknown as {
      gameState: { status: string; tick: number };
      lastHandledStatus: string;
      enqueueCheckpoint: () => void;
    };
    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';

    internal.gameState.tick = 60;
    internal.enqueueCheckpoint();
    await flushPromises();

    internal.gameState.tick = 120;
    internal.enqueueCheckpoint();
    internal.gameState.tick = 180;
    internal.enqueueCheckpoint();
    internal.gameState.tick = 240;
    internal.enqueueCheckpoint();

    await gm.stopAndFlush();

    assert.equal(persistence.checkpoints.length, 2);
    assert.equal(persistence.checkpoints[0].simTick, 60);
    assert.equal(persistence.checkpoints[1].simTick, 240);
  });

  it('voids match when allocation rendezvous timeout expires before second player arrives', async () => {
    const persistence = new RecordingMatchPersistence();
    const gm = new GameManager(createFakeIo(), 60, persistence);
    managers.push(gm);

    const p1 = new FakeSocket('p1');
    gm.handleConnection(p1 as unknown as Socket, 'durable-p1', {
      matchId: 'match-rendezvous-1',
      matchSeed: 4207,
      playerId: 'durable-p1',
      seat: 'A',
      protocolVersion: GAME_PROTOCOL_VERSION,
    });

    const internal = gm as unknown as {
      handleAllocationRendezvousTimeout: () => void;
      gameState: { status: string; endReason?: string };
    };
    internal.handleAllocationRendezvousTimeout();
    await flushPromises();

    assert.equal(internal.gameState.status, 'ended');
    assert.equal(internal.gameState.endReason, 'server-void');
    assert.equal(persistence.finalizations.length, 1);
    assert.equal(persistence.finalizations[0].matchId, 'match-rendezvous-1');
    assert.equal(persistence.finalizations[0].outcomeReason, 'void_rendezvous_timeout');
    assert.ok(p1.disconnected);
  });
});
