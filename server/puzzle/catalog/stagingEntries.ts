import { DEFAULT_PUZZLE_BENCHMARK, type PuzzleLevel } from '../puzzleTypes.js';
import { generatePuzzleLevel } from '../puzzleGenerator.js';
import { curatePuzzleLevel, type CuratedPuzzleEntry } from './curate.js';

/** Deep-freeze a generated level so catalog content is immutable after load. */
function freezeLevel(level: PuzzleLevel): PuzzleLevel {
  return JSON.parse(JSON.stringify(level)) as PuzzleLevel;
}

function boardCellCount(level: PuzzleLevel): number {
  let count = 0;
  for (const row of level.initialBoard) {
    for (const cell of row) {
      if (cell !== null) count += 1;
    }
  }
  return count;
}

/**
 * Frozen staging catalog content.
 * Boards start non-empty so validation cannot pass via a zero-piece vacuous clear.
 * Goals are clear-lines targets the default RulesBot batch can actually solve.
 */
const STAGING_CATALOG: CuratedPuzzleEntry[] = (() => {
  const cheeseLines = freezeLevel(
    generatePuzzleLevel({
      id: 'staging-cheese-clear-lines',
      name: 'Staging Cheese Clear Lines',
      seed: 42,
      garbageRows: 3,
      messyGarbage: true,
      maxHolesPerRow: 2,
      goal: { kind: 'clear-lines', lines: 2 },
      shopPolicy: 'none',
      allowHold: true,
    }),
  );
  const wellLines = freezeLevel(
    generatePuzzleLevel({
      id: 'staging-well-clear-lines',
      name: 'Staging Well Clear Lines',
      seed: 77,
      garbageRows: 4,
      variedHeights: true,
      openColumn: 4,
      goal: { kind: 'clear-lines', lines: 2 },
      shopPolicy: 'none',
      allowHold: false,
    }),
  );

  if (boardCellCount(cheeseLines) === 0 || boardCellCount(wellLines) === 0) {
    throw new Error('staging catalog levels must start with a non-empty board');
  }

  return [
    curatePuzzleLevel(cheeseLines, {
      allowHold: true,
      shopPolicy: 'none',
      benchmark: DEFAULT_PUZZLE_BENCHMARK,
      visibilityPolicy: 'revealed',
      intendedSolutionRefs: ['intended:staging-cheese-clear-lines'],
    }),
    curatePuzzleLevel(wellLines, {
      allowHold: false,
      shopPolicy: 'none',
      benchmark: {
        metric: 'ticks',
        direction: 'minimize',
        tieBreakers: [{ metric: 'pieces', direction: 'minimize' }],
      },
      visibilityPolicy: 'hidden',
      intendedSolutionRefs: ['intended:staging-well-clear-lines'],
    }),
  ];
})();

export function buildStagingCatalogEntries(): CuratedPuzzleEntry[] {
  return STAGING_CATALOG.map((entry) => ({
    level: freezeLevel(entry.level) as typeof entry.level,
    intendedSolutionRefs: [...entry.intendedSolutionRefs],
    solutionAlternativeRefs: [...entry.solutionAlternativeRefs],
  }));
}
