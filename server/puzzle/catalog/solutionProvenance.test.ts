import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadPuzzleCatalog } from './index.js';
import {
  listSolutionProvenanceForLevel,
  resolveSolutionProvenance,
} from './solutionProvenance.js';

describe('solution provenance', () => {
  // Catalog grew with Jstris batch imports; RulesBot derive can exceed default 5s under suite load.
  it('resolves intended solution refs to derived metrics', { timeout: 30_000 }, () => {
    const entry = loadPuzzleCatalog()[0]!;
    const refId = entry.intendedSolutionRefs[0]!;
    const record = resolveSolutionProvenance(refId);
    assert.ok(record);
    assert.equal(record.levelId, entry.level.id);
    assert.equal(record.kind, 'intended');
    assert.equal(typeof record.solved, 'boolean');
    assert.equal(typeof record.score, 'number');
    assert.equal(record.solution.levelId, entry.level.id);
  });

  it('lists provenance for a catalog level', () => {
    const entry = loadPuzzleCatalog()[0]!;
    const rows = listSolutionProvenanceForLevel(entry.level.id);
    assert.ok(rows.length >= 1);
    assert.ok(rows.every((row) => row.levelId === entry.level.id));
  });
});
