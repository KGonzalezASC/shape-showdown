import type {
  CuratedPuzzleLevel,
  PuzzleBenchmarkPolicy,
  PuzzleLevel,
  PuzzleVisibilityPolicy,
} from '../puzzleTypes.js';

export interface CuratePuzzleOptions {
  allowHold: boolean;
  benchmark: PuzzleBenchmarkPolicy;
  visibilityPolicy: PuzzleVisibilityPolicy;
  shopPolicy?: 'none' | 'standard';
  intendedSolutionRefs?: string[];
  solutionAlternativeRefs?: string[];
}

export interface CuratedPuzzleEntry {
  level: CuratedPuzzleLevel;
  intendedSolutionRefs: string[];
  solutionAlternativeRefs: string[];
}

/** Promote a generated or authored PuzzleLevel into a curated catalog entry. */
export function curatePuzzleLevel(
  level: PuzzleLevel,
  options: CuratePuzzleOptions,
): CuratedPuzzleEntry {
  const curated: CuratedPuzzleLevel = {
    ...level,
    shopPolicy: options.shopPolicy ?? level.shopPolicy,
    allowHold: options.allowHold,
    benchmark: options.benchmark,
    visibilityPolicy: options.visibilityPolicy,
  };
  return {
    level: curated,
    intendedSolutionRefs: [...(options.intendedSolutionRefs ?? [])],
    solutionAlternativeRefs: [...(options.solutionAlternativeRefs ?? [])],
  };
}
