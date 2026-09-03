import type { LegacyCuratedPuzzleLevel, PuzzleGoal, PuzzleVisibilityPolicy } from '../puzzleTypes.js';
import type { CuratedPuzzleEntry } from './curate.js';
import { buildStagingCatalogEntries } from './stagingEntries.js';

export type { CuratedPuzzleEntry } from './curate.js';
export { curatePuzzleLevel } from './curate.js';

export interface PuzzleCatalogSummary {
  id: string;
  name: string;
  description?: string;
  goal: PuzzleGoal;
  allowHold: boolean;
  visibilityPolicy: PuzzleVisibilityPolicy;
}

/** Load the curated puzzle catalog (deterministic, pure). */
export function loadPuzzleCatalog(): CuratedPuzzleEntry[] {
  return buildStagingCatalogEntries();
}

export function listCuratedPuzzleLevels(): LegacyCuratedPuzzleLevel[] {
  return loadPuzzleCatalog().map((entry) => entry.level);
}

export function listPuzzleCatalogSummaries(): PuzzleCatalogSummary[] {
  return loadPuzzleCatalog().map((entry) => ({
    id: entry.level.id,
    name: entry.level.name,
    description: entry.level.description,
    goal: entry.level.goal,
    allowHold: entry.level.allowHold,
    visibilityPolicy: entry.level.visibilityPolicy,
  }));
}

export function getCuratedPuzzleEntry(id: string): CuratedPuzzleEntry | undefined {
  return loadPuzzleCatalog().find((entry) => entry.level.id === id);
}
