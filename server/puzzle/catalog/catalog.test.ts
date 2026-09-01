import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPuzzleContent } from '../puzzleValidationArtifact.js';
import {
  getCuratedPuzzleEntry,
  listCuratedPuzzleLevels,
  loadPuzzleCatalog,
} from './index.js';

describe('puzzle catalog', () => {
  it('loads curated levels with required policy fields', () => {
    const catalog = loadPuzzleCatalog();
    assert.ok(catalog.length >= 2);
    for (const entry of catalog) {
      assert.equal(typeof entry.level.id, 'string');
      assert.ok(entry.level.benchmark);
      assert.equal(typeof entry.level.allowHold, 'boolean');
      assert.ok(entry.level.shopPolicy === 'none' || entry.level.shopPolicy === 'standard');
      assert.ok(
        entry.level.visibilityPolicy === 'hidden' ||
          entry.level.visibilityPolicy === 'partial' ||
          entry.level.visibilityPolicy === 'revealed',
      );
    }
  });

  it('is deterministic across repeated loads', () => {
    const a = loadPuzzleCatalog();
    const b = loadPuzzleCatalog();
    assert.deepEqual(
      a.map((entry) => ({
        id: entry.level.id,
        seed: entry.level.seed,
        allowHold: entry.level.allowHold,
        shopPolicy: entry.level.shopPolicy,
        benchmark: entry.level.benchmark,
        visibilityPolicy: entry.level.visibilityPolicy,
        board: entry.level.initialBoard,
        queue: entry.level.queuePrefix,
        refs: entry.intendedSolutionRefs,
      })),
      b.map((entry) => ({
        id: entry.level.id,
        seed: entry.level.seed,
        allowHold: entry.level.allowHold,
        shopPolicy: entry.level.shopPolicy,
        benchmark: entry.level.benchmark,
        visibilityPolicy: entry.level.visibilityPolicy,
        board: entry.level.initialBoard,
        queue: entry.level.queuePrefix,
        refs: entry.intendedSolutionRefs,
      })),
    );
  });

  it('keeps contentHash stable for the same curated level', () => {
    const first = listCuratedPuzzleLevels();
    const second = listCuratedPuzzleLevels();
    assert.deepEqual(
      first.map((level) => hashPuzzleContent(level)),
      second.map((level) => hashPuzzleContent(level)),
    );
    const holdOff = getCuratedPuzzleEntry('staging-clean-pc-hold-off');
    assert.ok(holdOff);
    assert.equal(holdOff.level.visibilityPolicy, 'hidden');
    assert.equal(holdOff.level.benchmark.metric, 'ticks');
  });
});
