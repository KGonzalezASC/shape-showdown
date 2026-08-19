import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameManager } from './GameManager.js';
import { BOARD_COLS, BOARD_ROWS } from '../src/constants.js';
import type { PlayerState, ReplayDataV2 } from '../src/types.js';
import type { Server, Socket } from 'socket.io';
import type { JoinTicket, MatchRecord } from './controlPlane/matchStore.js';
import type {
  MatchPersistence,
  StartDurableMatchInput,
} from './controlPlane/matchPersistence.js';

class FakeSocket extends EventEmitter {
  id: string;
  disconnected = false;

  constructor(id: string) {
    super();
    this.id = id;
  }

  disconnect() {
    this.disconnected = true;
    this.emit('disconnect');
  }
}

function createFakeIo(emitted: unknown[][] = []) {
  return {
    emit: (...args: unknown[]) => {
      emitted.push(args);
      return true;
    },
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
      protocolVersion: 1,
      status: 'allocating',
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
      protocolVersion: 1,
    });
    gm.handleConnection(p2 as unknown as Socket, 'durable-p2', {
      matchId: 'match-1',
      playerId: 'durable-p2',
      seat: 'B',
      matchSeed: 123,
      protocolVersion: 1,
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
        protocolVersion: 1,
      },
    );
    assert.equal(internal.gameState.pause, undefined);
    assert.equal(internal.gameState.players['durable-p1'] !== undefined, true);
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
    gm.handleConnection(
      replacement as unknown as Socket,
      'durable-p1',
      {
        matchId: 'match-1',
        playerId: 'durable-p1',
        seat: 'A',
        matchSeed: 123,
        protocolVersion: 1,
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
});
