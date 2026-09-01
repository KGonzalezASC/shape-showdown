import type { CuratedPuzzleLevel } from '../puzzleTypes.js';
import type { CuratedPuzzleEntry } from './curate.js';
import { buildStagingCatalogEntries } from './stagingEntries.js';

export type { CuratedPuzzleEntry } from './curate.js';
export { curatePuzzleLevel } from './curate.js';

/** Load the curated puzzle catalog (deterministic, pure). */
export function loadPuzzleCatalog(): CuratedPuzzleEntry[] {
  return buildStagingCatalogEntries();
}

export function listCuratedPuzzleLevels(): CuratedPuzzleLevel[] {
  return loadPuzzleCatalog().map((entry) => entry.level);
}

export function getCuratedPuzzleEntry(id: string): CuratedPuzzleEntry | undefined {
  return loadPuzzleCatalog().find((entry) => entry.level.id === id);
}
