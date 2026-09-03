import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOARD_COLS, BOARD_ROWS } from '../../constants.js';
import {
  createPuzzleRuntimeState,
  advancePuzzle,
  stableSeedForPuzzle,
  type PuzzleRuntimeState,
} from './PuzzleRuntime.js';
import { createPlayerRngChannels } from '../../rng.js';
import { PuzzleSession } from '../../../server/puzzle/puzzleSession.js';
import { migratePuzzleLevelToPublishedPuzzlePayload } from '../../../server/puzzle/publishedPuzzleAdapter.js';
import type { PuzzleLevel } from '../../../server/puzzle/puzzleTypes.js';
import type { InputDriver } from '../../../server/testHarness/inputDriver.js';

const testLevel: PuzzleLevel = {
  id: 'parity-test-level-1',
  name: 'Parity Test Level',
  seed: 424242,
  initialBoard: Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => null),
  ),
  queuePrefix: ['T', 'I', 'O', 'L', 'J', 'S', 'Z'],
  goal: { kind: 'clear-lines', lines: 1 },
  timeline: [],
  shopPolicy: 'none',
  allowHold: true,
};

describe('PuzzleRuntime core and parity', () => {
  it('enforces enableShop=false in runtime state and transition', () => {
    const payload = migratePuzzleLevelToPublishedPuzzlePayload(testLevel);
    const state = createPuzzleRuntimeState({ payload });
    assert.equal(state.enableShop, false, 'curated solo runtime state must have enableShop=false');

    const seed = stableSeedForPuzzle(payload.id);
    const rng = createPlayerRngChannels(seed, 'puzzle');
    const transition = advancePuzzle(state, [], rng);
    assert.equal(transition.state.enableShop, false);
  });

  it('guarantees identical seed and simulation parity with PuzzleSession', () => {
    const payload = migratePuzzleLevelToPublishedPuzzlePayload(testLevel);
    const expectedSeed = stableSeedForPuzzle(testLevel.id);

    // 1. Standalone runtime
    const runtimeState = createPuzzleRuntimeState({ payload });
    assert.equal(runtimeState.gameState.seed, expectedSeed, 'PuzzleRuntime must default seed to stableSeedForPuzzle');

    // 2. PuzzleSession wrapper
    class DirectDriver implements InputDriver {
      next(): { actions?: ('hardDrop')[]; inputState?: { left?: boolean; right?: boolean; softDrop?: boolean } } {
        return { actions: ['hardDrop'] };
      }
    }

    const session = new PuzzleSession({
      level: testLevel,
      driver: new DirectDriver(),
      maxTicks: 300,
    });

    const sessionReport = session.advance(60);
    assert.equal(sessionReport.seed, expectedSeed, 'PuzzleSession seed must match stableSeedForPuzzle');

    // Advance standalone runtime by same command pattern
    const rng = createPlayerRngChannels(expectedSeed, 'puzzle');
    const standaloneState = createPuzzleRuntimeState({ payload });
    for (let t = 0; t < 60; t++) {
      advancePuzzle(standaloneState, [{ kind: 'action', action: 'hardDrop' }], rng);
    }

    // Both must match
    assert.equal(standaloneState.gameState.seed, sessionReport.seed);
    assert.equal(standaloneState.piecesPlaced, sessionReport.piecesUsed);
    assert.equal(standaloneState.gameState.tick, sessionReport.finalTick);
  });
});
