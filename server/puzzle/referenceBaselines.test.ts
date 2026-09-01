import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadReferenceBaseline } from './catalog/referenceBaselines.js';

describe('loadReferenceBaseline', () => {
  it('loads selected baseline metrics from validation fixtures', () => {
    const cheese = loadReferenceBaseline('authored-cheese-keyhole');
    assert.ok(cheese);
    assert.equal(typeof cheese.score, 'number');
    assert.equal(typeof cheese.ticksUsed, 'number');
    assert.equal(typeof cheese.piecesUsed, 'number');
    assert.ok(cheese.profileId.length > 0);
  });

  it('returns null for unknown puzzle ids', () => {
    assert.equal(loadReferenceBaseline('does-not-exist'), null);
  });
});
