import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOARD_COLS, BOARD_ROWS } from '../constants.js';
import {
  createPublishedPuzzleV1,
  hashPublishedPuzzlePayload,
  parsePublishedPuzzleV1,
  parsePublishedPuzzlePayloadV1,
  type PublishedPuzzlePayloadV1,
  type PublishedPuzzleBaselineV1,
} from './publishedPuzzle.js';

const samplePayload: PublishedPuzzlePayloadV1 = {
  id: 'test-puzzle-1',
  name: 'Test Puzzle One',
  initialBoard: Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null)),
  finitePieceSequence: ['T', 'I', 'O', 'L', 'J', 'S', 'Z'],
  goal: { kind: 'clear-lines', lines: 1 },
  allowedMechanics: {
    allowHold: true,
  },
  timeline: [],
  visibilityPolicy: 'partial',
  benchmark: {
    metric: 'score',
    direction: 'maximize',
  },
};

const sampleBaseline: PublishedPuzzleBaselineV1 = {
  score: 1000,
  ticksUsed: 60,
  piecesUsed: 2,
  linesCleared: 1,
};

describe('publishedPuzzle contracts and hash integrity', () => {
  it('creates and parses a published puzzle with valid contentHash', async () => {
    const published = await createPublishedPuzzleV1(samplePayload, sampleBaseline);
    assert.equal(published.payload.id, 'test-puzzle-1');
    assert.equal(typeof published.contentHash, 'string');
    assert.equal(published.contentHash.length, 64);

    const parsed = await parsePublishedPuzzleV1(published);
    assert.deepEqual(parsed.payload, samplePayload);
    assert.equal(parsed.contentHash, published.contentHash);
    assert.deepEqual(parsed.publicBaseline, sampleBaseline);
  });

  it('rejects a forged or tampered contentHash', async () => {
    const published = await createPublishedPuzzleV1(samplePayload, sampleBaseline);
    const forged = {
      ...published,
      contentHash: 'f'.repeat(64),
    };

    await assert.rejects(
      async () => {
        await parsePublishedPuzzleV1(forged);
      },
      /contentHash mismatch/,
      'must reject forged contentHash that does not match computed payload hash',
    );
  });

  it('computes identical contentHash regardless of payload property insertion order', async () => {
    const reordered: PublishedPuzzlePayloadV1 = {
      benchmark: samplePayload.benchmark,
      visibilityPolicy: samplePayload.visibilityPolicy,
      timeline: samplePayload.timeline,
      allowedMechanics: samplePayload.allowedMechanics,
      goal: samplePayload.goal,
      finitePieceSequence: samplePayload.finitePieceSequence,
      initialBoard: samplePayload.initialBoard,
      name: samplePayload.name,
      id: samplePayload.id,
    };

    const hashA = await hashPublishedPuzzlePayload(samplePayload);
    const hashB = await hashPublishedPuzzlePayload(reordered);
    assert.equal(hashA, hashB, 'canonical payload hashing must be order-invariant');
  });

  it('rejects payload with invalid or negative numbers', () => {
    assert.throws(() => {
      parsePublishedPuzzlePayloadV1({
        ...samplePayload,
        benchmark: {
          metric: 'score',
          direction: 'maximize',
          tieBreakers: [{ metric: 'ticks', direction: 'invalid' as any }],
        },
      });
    });
  });
});
