import type { LegacyCuratedPuzzleLevel } from '../puzzleTypes.js';
import { curatePuzzleLevel, type CuratedPuzzleEntry } from './curate.js';
import { buildAuthoredLevels } from './authoredLevels.js';

function freezeLevel<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Authored curated catalog (TS source of truth).
 * Replaces generator dump frozenStagingLevels.json.
 */
const AUTHORED_CATALOG: CuratedPuzzleEntry[] = (() => {
  return buildAuthoredLevels().map((level: LegacyCuratedPuzzleLevel) =>
    curatePuzzleLevel(level, {
      allowHold: level.allowHold,
      shopPolicy: level.shopPolicy,
      benchmark: level.benchmark,
      visibilityPolicy: level.visibilityPolicy,
      intendedSolutionRefs: [`intended:${level.id}`],
    }),
  );
})();

/** @deprecated name kept for loadPuzzleCatalog stability; returns authored curated entries. */
export function buildStagingCatalogEntries(): CuratedPuzzleEntry[] {
  return AUTHORED_CATALOG.map((entry) => ({
    level: freezeLevel(entry.level),
    intendedSolutionRefs: [...entry.intendedSolutionRefs],
    solutionAlternativeRefs: [...entry.solutionAlternativeRefs],
  }));
}

export function buildAuthoredCatalogEntries(): CuratedPuzzleEntry[] {
  return buildStagingCatalogEntries();
}
