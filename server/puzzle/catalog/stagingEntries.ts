import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CuratedPuzzleLevel } from '../puzzleTypes.js';
import { curatePuzzleLevel, type CuratedPuzzleEntry } from './curate.js';

function freezeLevel<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const here = dirname(fileURLToPath(import.meta.url));
const frozen = JSON.parse(
  readFileSync(join(here, 'frozenStagingLevels.json'), 'utf8'),
) as { cheese: CuratedPuzzleLevel; well: CuratedPuzzleLevel };

/**
 * Checked-in frozen staging catalog.
 * Boards/queues come from frozenStagingLevels.json (generator-independent).
 */
const STAGING_CATALOG: CuratedPuzzleEntry[] = (() => {
  const cheese = freezeLevel(frozen.cheese);
  const well = freezeLevel(frozen.well);
  return [
    curatePuzzleLevel(cheese, {
      allowHold: cheese.allowHold,
      shopPolicy: cheese.shopPolicy,
      benchmark: cheese.benchmark,
      visibilityPolicy: cheese.visibilityPolicy,
      intendedSolutionRefs: ['intended:staging-cheese-clear-lines'],
    }),
    curatePuzzleLevel(well, {
      allowHold: well.allowHold,
      shopPolicy: well.shopPolicy,
      benchmark: well.benchmark,
      visibilityPolicy: well.visibilityPolicy,
      intendedSolutionRefs: ['intended:staging-well-clear-lines'],
    }),
  ];
})();

export function buildStagingCatalogEntries(): CuratedPuzzleEntry[] {
  return STAGING_CATALOG.map((entry) => ({
    level: freezeLevel(entry.level),
    intendedSolutionRefs: [...entry.intendedSolutionRefs],
    solutionAlternativeRefs: [...entry.solutionAlternativeRefs],
  }));
}
