import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_RULES_BOT_PROFILE } from '../testHarness/rulesBot.js';
import { GAME_PROTOCOL_VERSION } from '../../src/protocol/version.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import { runPuzzleBaselineBatch } from './puzzleBaselineBatch.js';
import {
  DEFAULT_PUZZLE_VALIDATION_CANDIDATES,
  buildPuzzleValidationArtifact,
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

  it('builds a passed artifact with selected baseline metrics and no solution traces', () => {
    const level = cleanLevel('artifact-pass', 42);
    const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
    const artifact = buildPuzzleValidationArtifact({
      level,
      batch,
      packageVersion: '0.0.0-test',
      intendedSolutionRefs: ['intended:artifact-pass'],
    });

    assert.equal(artifact.schemaVersion, 1);
    assert.equal(artifact.puzzleId, 'artifact-pass');
    assert.equal(artifact.engineProtocolVersion, GAME_PROTOCOL_VERSION);
    assert.equal(artifact.packageVersion, '0.0.0-test');
    assert.equal(artifact.validationStatus, 'passed');
    assert.ok(artifact.selectedBaseline);
    assert.equal(artifact.selectedBaseline.solved, true);
    assert.equal(typeof artifact.selectedBaseline.score, 'number');
    assert.equal(artifact.batchSize, DEFAULT_PUZZLE_VALIDATION_CANDIDATES.length);
    assert.equal(artifact.visibilityPolicy, 'unspecified');
    assert.deepEqual(artifact.intendedSolutionRefs, ['intended:artifact-pass']);
    assert.deepEqual(artifact.solutionAlternativeRefs, []);
    assert.equal('commands' in artifact, false);
    assert.ok(artifact.contentHash.length === 64);
  });

  it('marks duplicate-only batches as invalid-batch', () => {
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
    assert.ok(artifact.duplicateProfileIdentities.length >= 1);
  });

  it('marks batches with no qualifying solve as failed', () => {
    const level = generatePuzzleLevel({
      id: 'artifact-fail',
      name: 'artifact-fail',
      seed: 3,
      garbageRows: 10,
      goal: { kind: 'survive', ticks: 60 * 60 },
    });
    const batch = runPuzzleBaselineBatch(level, [DEFAULT_RULES_BOT_PROFILE], 5);
    const artifact = buildPuzzleValidationArtifact({
      level,
      batch,
      packageVersion: '0.0.0-test',
    });
    assert.equal(artifact.validationStatus, 'failed');
    assert.equal(artifact.selectedBaseline, null);
  });
});
