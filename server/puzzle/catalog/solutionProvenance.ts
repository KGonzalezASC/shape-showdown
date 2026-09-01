import { derivePuzzleSolution } from '../puzzleSolution.js';
import type { PuzzleSolution } from '../puzzleTypes.js';
import { loadPuzzleCatalog } from './index.js';

export interface PuzzleSolutionProvenanceRecord {
  refId: string;
  levelId: string;
  kind: 'intended' | 'alternative';
  /** Metrics-only provenance; command traces stay server-side for diagnostics. */
  solved: boolean;
  score: number;
  ticksUsed?: number;
  piecesUsed?: number;
  /** Full derived solution for server validation / reveal tooling. */
  solution: PuzzleSolution;
}

const CACHE = new Map<string, PuzzleSolutionProvenanceRecord>();

function ensureCache(): void {
  if (CACHE.size > 0) return;
  for (const entry of loadPuzzleCatalog()) {
    const solution = derivePuzzleSolution(entry.level);
    for (const refId of entry.intendedSolutionRefs) {
      CACHE.set(refId, {
        refId,
        levelId: entry.level.id,
        kind: 'intended',
        solved: solution.solved,
        score: solution.score,
        ticksUsed: solution.ticksUsed,
        piecesUsed: solution.piecesUsed,
        solution,
      });
    }
    for (const refId of entry.solutionAlternativeRefs) {
      CACHE.set(refId, {
        refId,
        levelId: entry.level.id,
        kind: 'alternative',
        solved: solution.solved,
        score: solution.score,
        ticksUsed: solution.ticksUsed,
        piecesUsed: solution.piecesUsed,
        solution,
      });
    }
  }
}

export function resolveSolutionProvenance(refId: string): PuzzleSolutionProvenanceRecord | undefined {
  ensureCache();
  return CACHE.get(refId);
}

export function listSolutionProvenanceForLevel(levelId: string): PuzzleSolutionProvenanceRecord[] {
  ensureCache();
  return [...CACHE.values()].filter((record) => record.levelId === levelId);
}
