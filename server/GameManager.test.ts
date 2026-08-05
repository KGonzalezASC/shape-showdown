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

const managers: GameManager[] = [];

afterEach(() => {
  while (managers.length > 0) {
    managers.pop()!.stopLoop();
  }
});

describe('GameManager lifecycle harness', () => {
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
    assert.equal(replay.inputs[0].kind, 'shopOpen');
    assert.equal(replay.inputs[1].kind, 'shopPurchase');
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
});
