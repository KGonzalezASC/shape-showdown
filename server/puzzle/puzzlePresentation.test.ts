import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  presentTimelineHints,
  visibleNextQueueCount,
} from '../../src/puzzle/puzzlePresentation.js';

describe('puzzle visibility presentation', () => {
  const events = [
    { tick: 10, kind: 'poison' },
    { tick: 40, kind: 'garbage' },
  ];

  it('hides timeline when policy is hidden', () => {
    assert.deepEqual(presentTimelineHints(events, 'hidden', 0), []);
  });

  it('shows kinds without ticks for partial', () => {
    assert.deepEqual(presentTimelineHints(events, 'partial', 0), [
      { tick: -1, kind: 'poison' },
      { tick: -1, kind: 'garbage' },
    ]);
  });

  it('reveals full upcoming timeline', () => {
    assert.deepEqual(presentTimelineHints(events, 'revealed', 15), [
      { tick: 40, kind: 'garbage' },
    ]);
  });


  it('keeps deferred pending kinds visible after authored tick', () => {
    assert.deepEqual(presentTimelineHints(events, 'partial', 40, ['wildcard']), [
      { tick: -1, kind: 'wildcard' },
    ]);
    assert.deepEqual(presentTimelineHints(events, 'revealed', 40, ['wildcard']), [
      { tick: -1, kind: 'wildcard' },
    ]);
  });

  it('limits next-queue preview by policy', () => {
    assert.equal(visibleNextQueueCount('hidden'), 1);
    assert.equal(visibleNextQueueCount('partial'), 3);
    assert.equal(visibleNextQueueCount('revealed'), 5);
  });
});

