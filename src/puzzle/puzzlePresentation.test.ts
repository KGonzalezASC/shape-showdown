import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPuzzleFinished } from './puzzlePresentation';

describe('puzzle presentation state', () => {
  it('does not show a terminal session before the first snapshot arrives', () => {
    assert.equal(isPuzzleFinished(null, false), false);
  });

  it('keeps a playing session active until it receives an end event', () => {
    assert.equal(isPuzzleFinished('playing', false), false);
    assert.equal(isPuzzleFinished('playing', true), true);
  });

  it('shows terminal state for solved and top-out snapshots', () => {
    assert.equal(isPuzzleFinished('solved', false), true);
    assert.equal(isPuzzleFinished('topout', false), true);
  });
});
