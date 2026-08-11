import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAnimateBomberExplosion } from './replayVisualEffects.js';

describe('replay visual effect policy', () => {
  it('keeps live Bomber transitions enabled', () => {
    assert.equal(shouldAnimateBomberExplosion(false, { bomber: true }), true);
  });

  it('suppresses Bomber transitions synthesized from sparse replay snapshots', () => {
    assert.equal(shouldAnimateBomberExplosion(true, { bomber: true }), false);
  });

  it('does not animate a non-Bomber transition', () => {
    assert.equal(shouldAnimateBomberExplosion(false, { bomber: false }), false);
    assert.equal(shouldAnimateBomberExplosion(false, null), false);
  });
});
