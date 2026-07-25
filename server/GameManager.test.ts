import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { GameManager } from './GameManager.js';
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

function createFakeIo() {
  return {
    emit: (..._args: unknown[]) => true,
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
      prevLinesCleared: Record<string, number>;
      activeReplay: unknown;
    };

    internal.gameState.status = 'playing';
    internal.lastHandledStatus = 'playing';
    internal.gameState.tick = 0;
    internal.prevLinesCleared = { p1: 0, p2: 0 };
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
});
