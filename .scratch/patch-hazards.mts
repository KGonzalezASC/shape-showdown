import fs from 'node:fs';

// --- puzzleTypes: add retrim ---
const typesPath = 'server/puzzle/puzzleTypes.ts';
let types = fs.readFileSync(typesPath, 'utf8');
if (!types.includes("| 'retrim'")) {
  types = types.replace("| 'poison'\n  | 'storage-poison'", "| 'poison'\n  | 'storage-poison'\n  | 'retrim'");
  fs.writeFileSync(typesPath, types);
  console.log('added retrim to HazardKind');
} else {
  console.log('retrim already in HazardKind');
}

// --- puzzleHazards allowlist ---
const hazPath = 'server/puzzle/puzzleHazards.ts';
fs.writeFileSync(hazPath, `import type { HazardKind, TimelineEvent } from './puzzleTypes.js';

/** Hazards the puzzle session runner actually applies today. */
export const SUPPORTED_PUZZLE_HAZARDS = [
  'poison',
  'storage-poison',
  'retrim',
  'curtain',
  'freeze',
  'magnet',
  'snag',
  'sticky',
  'bomber',
  'garbage',
  'purge',
  'wildcard',
] as const satisfies readonly HazardKind[];

export type SupportedPuzzleHazard = (typeof SUPPORTED_PUZZLE_HAZARDS)[number];

const SUPPORTED_SET = new Set<string>(SUPPORTED_PUZZLE_HAZARDS);

/** Hazards that exist in the type union but are not implemented for solo timelines. */
export const UNSUPPORTED_PUZZLE_HAZARDS = [
  'satellite',
  'tectonic',
] as const satisfies readonly HazardKind[];

export function isSupportedPuzzleHazard(kind: HazardKind): kind is SupportedPuzzleHazard {
  return SUPPORTED_SET.has(kind);
}

export function assertSupportedPuzzleTimeline(
  timeline: TimelineEvent[],
  context = 'puzzle timeline',
): void {
  for (const event of timeline) {
    if (!isSupportedPuzzleHazard(event.kind)) {
      throw new Error(
        \`\${context}: unsupported hazard "\${event.kind}" (supported: \${SUPPORTED_PUZZLE_HAZARDS.join(', ')})\`,
      );
    }
  }
}
`);
console.log('wrote puzzleHazards.ts');

// --- puzzleHazards.test.ts ---
fs.writeFileSync('server/puzzle/puzzleHazards.test.ts', `import { describe, it } from 'node:test';
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
`);
console.log('wrote puzzleHazards.test.ts');
