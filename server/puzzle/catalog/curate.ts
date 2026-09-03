import { assertSupportedPuzzleTimeline } from '../puzzleHazards.js';
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
function initialFilledCells(level: PuzzleLevel): number {
  let count = 0;
  for (const row of level.initialBoard) {
    for (const cell of row) {
      if (cell !== null) count += 1;
    }
  }
  return count;
}

export function curatePuzzleLevel(
  level: PuzzleLevel,
  options: CuratePuzzleOptions,
): CuratedPuzzleEntry {
  if (
    (level.goal.kind === 'garbage-clear' || level.goal.kind === 'perfect-clear' || level.goal.kind === 'clear-lines' || level.goal.kind === 'survive-clear') &&
    initialFilledCells(level) === 0
  ) {
    throw new Error(
      `curated level "${level.id}" has an empty board for goal ${level.goal.kind}; refuse vacuous zero-piece clears`,
    );
  }
  assertSupportedPuzzleTimeline(level.timeline, `curatePuzzleLevel(${level.id})`);
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
