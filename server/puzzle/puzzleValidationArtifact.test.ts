import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_RULES_BOT_PROFILE } from '../testHarness/rulesBot.js';
import { GAME_PROTOCOL_VERSION } from '../../src/protocol/version.js';
import { loadPuzzleCatalog } from './catalog/index.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import { runPuzzleBaselineBatch } from './puzzleBaselineBatch.js';
import {
  DEFAULT_PUZZLE_VALIDATION_CANDIDATES,
  buildPuzzleValidationArtifact,
  emitPuzzleValidationArtifacts,
  hashPuzzleContent,
} from './puzzleValidationArtifact.js';
import type { PuzzleLevel } from './puzzleTypes.js';

const pcGoal = { kind: 'perfect-clear', maxPieces: 40 } as const;

function cleanLevel(id: string, seed: number): PuzzleLevel {
  return generatePuzzleLevel({
    id,
    name: `clean-${id}`,
    seed,
    garbageRows: 0,
    goal: pcGoal,
  });
}

describe('puzzleValidationArtifact', () => {
  it('hashes identical levels the same and diverges when content changes', () => {
    const a = cleanLevel('hash-a', 1);
    const b = cleanLevel('hash-a', 1);
    const c = cleanLevel('hash-a', 2);
    assert.equal(hashPuzzleContent(a), hashPuzzleContent(b));
    assert.notEqual(hashPuzzleContent(a), hashPuzzleContent(c));
  });

  it('builds a passed artifact with selected baseline metrics and catalog visibility', () => {
    const entry = loadPuzzleCatalog()[0]!;
    const batch = runPuzzleBaselineBatch(entry.level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
    const artifact = buildPuzzleValidationArtifact({
      level: entry.level,
      batch,
      packageVersion: '0.0.0-test',
      intendedSolutionRefs: entry.intendedSolutionRefs,
    });

    assert.equal(artifact.schemaVersion, 1);
    assert.equal(artifact.puzzleId, entry.level.id);
    assert.equal(artifact.engineProtocolVersion, GAME_PROTOCOL_VERSION);
    assert.equal(artifact.validationStatus, 'passed');
    assert.ok(artifact.selectedBaseline);
    assert.equal(artifact.visibilityPolicy, entry.level.visibilityPolicy);
    assert.notEqual(artifact.visibilityPolicy, 'unspecified');
    assert.deepEqual(artifact.intendedSolutionRefs, entry.intendedSolutionRefs);
    assert.equal('commands' in artifact, false);
    assert.ok(artifact.contentHash.length === 64);
  });

  it('marks duplicate-only batches as invalid-batch and exits 1 from emit', () => {
    const level = cleanLevel('artifact-dup', 9);
    const batch = runPuzzleBaselineBatch(level, [
      DEFAULT_RULES_BOT_PROFILE,
      DEFAULT_RULES_BOT_PROFILE,
    ]);
    const artifact = buildPuzzleValidationArtifact({
      level,
      batch,
      packageVersion: '0.0.0-test',
    });
    assert.equal(artifact.validationStatus, 'invalid-batch');

    const emitted = emitPuzzleValidationArtifacts(
      [{ level }],
      '0.0.0-test',
      [DEFAULT_RULES_BOT_PROFILE, DEFAULT_RULES_BOT_PROFILE],
    );
    assert.equal(emitted.exitCode, 1);
    assert.equal(emitted.artifacts[0]?.validationStatus, 'invalid-batch');
  });

  it('marks batches with no qualifying solve as failed and exits 1 from emit', () => {
    const level = generatePuzzleLevel({
      id: 'artifact-fail',
      name: 'artifact-fail',
      seed: 3,
      garbageRows: 10,
      goal: { kind: 'survive', ticks: 60 * 60 },
    });
    const emitted = emitPuzzleValidationArtifacts(
      [{ level }],
      '0.0.0-test',
      [DEFAULT_RULES_BOT_PROFILE],
      5,
    );
    assert.equal(emitted.exitCode, 1);
    assert.equal(emitted.artifacts[0]?.validationStatus, 'failed');
    assert.equal(emitted.artifacts[0]?.selectedBaseline, null);
  });

  it('emits exitCode 0 for the curated catalog', { timeout: 120_000 }, () => {
    const catalog = loadPuzzleCatalog();
    const emitted = emitPuzzleValidationArtifacts(catalog, '0.0.0-test');
    assert.equal(emitted.exitCode, 0);
    assert.ok(emitted.artifacts.every((artifact) => artifact.validationStatus === 'passed'));
  });
});

