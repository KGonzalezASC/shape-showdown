import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Server, Socket } from 'socket.io';
import { GAME_PROTOCOL_VERSION } from '../../src/protocol/version.js';
import { MatchRegistry } from './MatchRegistry.js';

class FakeSocket extends EventEmitter {
  id: string;
  disconnected = false;
  errors: unknown[] = [];

  constructor(id: string) {
    super();
    this.id = id;
  }

  emit(event: string, ...args: unknown[]): boolean {
    if (event === 'error') {
      this.errors.push(args[0]);
      return true;
    }
    return super.emit(event, ...args);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  join(): void {}
}

function createFakeIo() {
  return {
    emit: () => true,
    on: () => undefined,
  } as unknown as Server;
}

const ticket = (matchId: string, playerId: string, seat: 'A' | 'B') => ({
  matchId,
  playerId,
  seat,
  matchSeed: 123,
  protocolVersion: GAME_PROTOCOL_VERSION,
});

describe('MatchRegistry drain', () => {
  it('still accepts seat reclaim for a match already running on the draining process', async () => {
    const registry = new MatchRegistry(createFakeIo(), 30, undefined);
    const first = new FakeSocket('p1');
    registry.handleConnection(
      first as unknown as Socket,
      'durable-p1',
      ticket('match-1', 'durable-p1', 'A'),
    );
    await Promise.resolve();
    await Promise.resolve();

    registry.beginDrain();
    const reclaim = new FakeSocket('p1-reclaim');
    registry.handleConnection(
      reclaim as unknown as Socket,
      'durable-p1',
      ticket('match-1', 'durable-p1', 'A'),
    );
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(reclaim.disconnected, false);
    assert.equal(reclaim.errors.length, 0);
  });

  it('rejects new matches after drain starts', async () => {
    const registry = new MatchRegistry(createFakeIo(), 30, undefined);
    registry.beginDrain();
    const next = new FakeSocket('new-match');
    registry.handleConnection(
      next as unknown as Socket,
      'durable-p3',
      ticket('match-new', 'durable-p3', 'A'),
    );
    await Promise.resolve();

    assert.equal(next.disconnected, true);
    assert.deepEqual(next.errors[0], {
      code: 'MATCH_RUNTIME_UNAVAILABLE',
      message: 'The match runtime is draining. Try again shortly.',
    });
  });
});
