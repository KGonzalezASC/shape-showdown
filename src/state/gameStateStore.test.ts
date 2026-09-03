import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createPlayerRngChannels } from '../rng';
import type { GameState } from '../types';
import { makePlayer } from '../puzzle/runtime/engine';
import {
  getChromeSnapshot,
  getRawGameState,
  setGameStateStore,
} from './gameStateStore';

afterEach(() => {
  setGameStateStore(null, null);
});

describe('authoritative recovery snapshots', () => {
  it('replaces stale local state while preserving pause and outcome fields', () => {
    const playingState = createState({
      status: 'playing',
      tick: 120,
      pause: {
        playerId: 'opponent',
        startedAt: 1_000,
      },
    });
    setGameStateStore(playingState, 'me');

    assert.equal(getChromeSnapshot().pausePlayerId, 'opponent');
    assert.equal(getChromeSnapshot().pauseStartedAt, 1_000);
    assert.equal(getChromeSnapshot().tick, 120);

    const voidedState = createState({
      status: 'ended',
      tick: 121,
      winnerId: null,
      endReason: 'server-void',
      pause: undefined,
    });
    setGameStateStore(voidedState, 'me');

    assert.equal(getRawGameState(), voidedState);
    assert.equal(getChromeSnapshot().tick, 121);
    assert.equal(getChromeSnapshot().pausePlayerId, null);
    assert.equal(getChromeSnapshot().pauseStartedAt, null);
    assert.equal(getChromeSnapshot().winnerId, null);
    assert.equal(getChromeSnapshot().endReason, 'server-void');
  });
});

function createState(overrides: Partial<GameState>): GameState {
  return {
    players: {
      me: makePlayer('me', createPlayerRngChannels(123, 'A')),
      opponent: makePlayer('opponent', createPlayerRngChannels(123, 'B')),
    },
    status: 'waiting',
    countdown: 0,
    winnerId: null,
    tick: 0,
    seed: 123,
    ...overrides,
  };
}
