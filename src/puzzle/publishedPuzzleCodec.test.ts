import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOARD_COLS, BOARD_ROWS } from '../constants.js';
import {
  createPublishedPuzzleV1,
  type PublishedPuzzlePayloadV1,
  type PublishedPuzzleBaselineV1,
  type PublishedPuzzlePackV1,
  type PublishedPuzzleManifestV1,
  PUZZLE_RUNTIME_VERSION,
} from './publishedPuzzle.js';
import {
  decodePublishedPuzzleManifest,
  decodePublishedPuzzlePack,
  encodePublishedPuzzleManifest,
  encodePublishedPuzzlePack,
  hashPublishedPuzzlePackBytes,
} from './publishedPuzzleCodec.js';

const samplePayloadA: PublishedPuzzlePayloadV1 = {
  id: 'pack-test-1',
  name: 'Pack Test 1',
  initialBoard: Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null)),
  finitePieceSequence: ['T', 'I', 'O', 'L', 'J', 'S', 'Z'],
  goal: { kind: 'clear-lines', lines: 1 },
  allowedMechanics: { allowHold: true },
  timeline: [],
  visibilityPolicy: 'revealed',
  benchmark: { metric: 'score', direction: 'maximize' },
};

const samplePayloadB: PublishedPuzzlePayloadV1 = {
  id: 'pack-test-2',
  name: 'Pack Test 2',
  initialBoard: Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null)),
  finitePieceSequence: ['I', 'O', 'L', 'J', 'S', 'Z', 'T'],
  goal: { kind: 'garbage-clear' },
  allowedMechanics: { allowHold: false },
  timeline: [{ kind: 'atTick', tick: 60, hazard: 'poison' }],
  visibilityPolicy: 'partial',
  benchmark: { metric: 'ticks', direction: 'minimize' },
};

const baseline: PublishedPuzzleBaselineV1 = {
  score: 500,
  ticksUsed: 120,
  piecesUsed: 4,
  linesCleared: 1,
};

describe('publishedPuzzleCodec', () => {
  it('encodes and strictly decodes a pack round-trip', async () => {
    const puzzleA = await createPublishedPuzzleV1(samplePayloadA, baseline);
    const puzzleB = await createPublishedPuzzleV1(samplePayloadB, baseline);

    const pack: PublishedPuzzlePackV1 = {
      schemaVersion: 1,
      id: 'test-collection',
      puzzles: [puzzleA, puzzleB],
    };

    const bytes = encodePublishedPuzzlePack(pack);
    const sha256 = await hashPublishedPuzzlePackBytes(bytes);

    const decoded = await decodePublishedPuzzlePack(bytes, sha256);
    assert.equal(decoded.schemaVersion, 1);
    assert.equal(decoded.id, 'test-collection');
    assert.equal(decoded.puzzles.length, 2);
    assert.deepEqual(decoded.puzzles[0]?.payload, samplePayloadA);
    assert.deepEqual(decoded.puzzles[1]?.payload, samplePayloadB);
  });

  it('rejects a pack with corrupted bytes or mismatched expectedSha256', async () => {
    const puzzleA = await createPublishedPuzzleV1(samplePayloadA, baseline);
    const pack: PublishedPuzzlePackV1 = {
      schemaVersion: 1,
      id: 'test-collection',
      puzzles: [puzzleA],
    };

    const bytes = encodePublishedPuzzlePack(pack);
    const sha256 = await hashPublishedPuzzlePackBytes(bytes);

    // Mismatched expectedSha256
    await assert.rejects(
      async () => {
        await decodePublishedPuzzlePack(bytes, '0'.repeat(64));
      },
      /sha256 mismatch/,
      'must reject when expectedSha256 does not match computed hash',
    );

    // Corrupted bytes
    const corrupted = new Uint8Array(bytes);
    corrupted[10] ^= 0xff;

    await assert.rejects(
      async () => {
        await decodePublishedPuzzlePack(corrupted, sha256);
      },
      /sha256 mismatch|JSON/,
      'must reject corrupted bytes',
    );
  });

  it('encodes and decodes a published puzzle manifest', () => {
    const manifest: PublishedPuzzleManifestV1 = {
      schemaVersion: 1,
      puzzleRuntimeVersion: PUZZLE_RUNTIME_VERSION,
      releaseId: '0.0.0-test',
      packs: [
        {
          id: 'test-pack',
          url: './packs/test-pack.12345678.json',
          sha256: 'a'.repeat(64),
          byteLength: 4096,
          puzzleIds: ['pack-test-1', 'pack-test-2'],
        },
      ],
    };

    const text = encodePublishedPuzzleManifest(manifest);
    const decoded = decodePublishedPuzzleManifest(text);
    assert.deepEqual(decoded, manifest);
  });

  it('proves published pack bytes contain no forbidden engine or test harness data', async () => {
    const puzzleA = await createPublishedPuzzleV1(samplePayloadA, baseline);
    const pack: PublishedPuzzlePackV1 = {
      schemaVersion: 1,
      id: 'test-collection',
      puzzles: [puzzleA],
    };

    const bytes = encodePublishedPuzzlePack(pack);
    const text = new TextDecoder().decode(bytes);

    const forbiddenTerms = [
      'RulesBot',
      'candidateProfile',
      'intendedSolution',
      'solutionAlternative',
      'fixtures/',
      'server/',
      'seed',
      'queuePrefix',
      'shopPolicy',
    ];

    for (const term of forbiddenTerms) {
      assert.equal(
        text.includes(term),
        false,
        `published pack must not contain internal term '${term}'`,
      );
    }
  });
});
