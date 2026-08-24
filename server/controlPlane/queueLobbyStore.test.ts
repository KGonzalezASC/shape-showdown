import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickAvoidingPair, type QueueCandidate } from './queueLobbyStore.js';

function candidate(
  id: string,
  playerId: string,
  avoidPlayerId: string | null = null,
): QueueCandidate {
  return {
    id,
    playerId,
    sessionId: `session-${id}`,
    avoidPlayerId,
    createdAtMs: Number(id),
  };
}

describe('pickAvoidingPair', () => {
  it('returns null for fewer than two candidates', () => {
    assert.equal(pickAvoidingPair([]), null);
    assert.equal(pickAvoidingPair([candidate('1', 'p1')]), null);
  });

  it('pairs two strangers without a repeat flag', () => {
    const picked = pickAvoidingPair([candidate('1', 'p1'), candidate('2', 'p2')]);
    assert.deepEqual(picked?.pair.map((c) => c.playerId), ['p1', 'p2']);
    assert.equal(picked?.isRepeatPairing, false);
  });

  it('skips a one-directionally avoided candidate and pairs the next fresh one', () => {
    const picked = pickAvoidingPair([
      candidate('1', 'p1', 'p2'),
      candidate('2', 'p2'),
      candidate('3', 'p3'),
    ]);
    assert.deepEqual(picked?.pair.map((c) => c.playerId), ['p1', 'p3']);
    assert.equal(picked?.isRepeatPairing, false);
  });

  it('respects avoidance in both directions', () => {
    const picked = pickAvoidingPair([
      candidate('1', 'p1'),
      candidate('2', 'p2', 'p1'),
      candidate('3', 'p3'),
    ]);
    assert.deepEqual(picked?.pair.map((c) => c.playerId), ['p1', 'p3']);
    assert.equal(picked?.isRepeatPairing, false);
  });

  it('falls back to the second-oldest candidate and flags the repeat', () => {
    const picked = pickAvoidingPair([
      candidate('1', 'p1', 'p2'),
      candidate('2', 'p2', 'p1'),
    ]);
    assert.deepEqual(picked?.pair.map((c) => c.playerId), ['p1', 'p2']);
    assert.equal(picked?.isRepeatPairing, true);
  });
});
