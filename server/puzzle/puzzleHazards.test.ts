import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSupportedPuzzleTimeline,
  isSupportedPuzzleHazard,
  SUPPORTED_PUZZLE_HAZARDS,
  UNSUPPORTED_PUZZLE_HAZARDS,
} from './puzzleHazards.js';
import { PuzzleSession } from './puzzleSession.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import { RulesBot } from '../testHarness/rulesBot.js';

describe('puzzle hazard allowlist', () => {
  it('marks satellite/tectonic unsupported; allows purge/wildcard/retrim', () => {
    for (const kind of UNSUPPORTED_PUZZLE_HAZARDS) {
      assert.equal(isSupportedPuzzleHazard(kind), false);
    }
    for (const kind of ['purge', 'wildcard', 'retrim', 'poison', 'curtain', 'magnet'] as const) {
      assert.equal(isSupportedPuzzleHazard(kind), true, kind);
    }
    assert.ok(SUPPORTED_PUZZLE_HAZARDS.includes('wildcard'));
    assert.ok(SUPPORTED_PUZZLE_HAZARDS.includes('purge'));
  });

  it('rejects unsupported timeline events at session construction', () => {
    const level = generatePuzzleLevel({
      id: 'bad-hazard',
      name: 'bad-hazard',
      seed: 1,
      garbageRows: 1,
      goal: { kind: 'clear-lines', lines: 1 },
    });
    level.timeline = [{ tick: 10, kind: 'satellite' }];
    assert.throws(
      () =>
        new PuzzleSession({
          level,
          driver: new RulesBot({ mode: 'omniscient' }),
          maxTicks: 60,
        }),
      /unsupported hazard/i,
    );
  });

  it('assertSupportedPuzzleTimeline throws on unsupported kinds', () => {
    assert.throws(
      () => assertSupportedPuzzleTimeline([{ tick: 1, kind: 'tectonic' }]),
      /unsupported hazard/i,
    );
  });
});
