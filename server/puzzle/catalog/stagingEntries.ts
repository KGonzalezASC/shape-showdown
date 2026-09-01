import { DEFAULT_PUZZLE_BENCHMARK } from '../puzzleTypes.js';
import { generatePuzzleLevel } from '../puzzleGenerator.js';
import { curatePuzzleLevel, type CuratedPuzzleEntry } from './curate.js';

/**
 * Frozen staging catalog content.
 * Boards/queues come from the deterministic generator; policy fields are explicit.
 */
export function buildStagingCatalogEntries(): CuratedPuzzleEntry[] {
  return [
    curatePuzzleLevel(
      generatePuzzleLevel({
        id: 'staging-clean-pc',
        name: 'Staging Clean Perfect Clear',
        seed: 42,
        garbageRows: 0,
        goal: { kind: 'perfect-clear', maxPieces: 40 },
        shopPolicy: 'none',
        allowHold: true,
      }),
      {
        allowHold: true,
        shopPolicy: 'none',
        benchmark: DEFAULT_PUZZLE_BENCHMARK,
        visibilityPolicy: 'revealed',
        intendedSolutionRefs: ['intended:staging-clean-pc'],
      },
    ),
    curatePuzzleLevel(
      generatePuzzleLevel({
        id: 'staging-clean-pc-hold-off',
        name: 'Staging Clean Perfect Clear (hold disabled)',
        seed: 77,
        garbageRows: 0,
        goal: { kind: 'perfect-clear', maxPieces: 40 },
        shopPolicy: 'none',
        allowHold: false,
      }),
      {
        allowHold: false,
        shopPolicy: 'none',
        benchmark: {
          metric: 'ticks',
          direction: 'minimize',
          tieBreakers: [{ metric: 'pieces', direction: 'minimize' }],
        },
        visibilityPolicy: 'hidden',
        intendedSolutionRefs: ['intended:staging-clean-pc-hold-off'],
      },
    ),
  ];
}
