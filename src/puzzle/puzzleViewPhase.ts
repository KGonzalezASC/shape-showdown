export type PuzzleViewPhase =
  | { kind: 'picker' }
  | { kind: 'starting'; puzzleId: string | null }
  | { kind: 'playing'; puzzleId: string }
  | { kind: 'finished'; puzzleId: string; solved: boolean };

export interface PuzzleViewPhaseInputs {
  picking: boolean;
  selectedPuzzleId: string | null;
  startedPuzzleId: string | null;
  stateStatus: 'playing' | 'solved' | 'topout' | null;
  ended: boolean;
  endSolved: boolean | null;
}

export function derivePuzzleViewPhase({
  picking,
  selectedPuzzleId,
  startedPuzzleId,
  stateStatus,
  ended,
  endSolved,
}: PuzzleViewPhaseInputs): PuzzleViewPhase {
  if (picking) return { kind: 'picker' };

  const puzzleId = startedPuzzleId ?? selectedPuzzleId;
  if (puzzleId === null) return { kind: 'starting', puzzleId: null };

  if (ended || stateStatus === 'solved' || stateStatus === 'topout') {
    return {
      kind: 'finished',
      puzzleId,
      solved: endSolved ?? stateStatus === 'solved',
    };
  }

  if (startedPuzzleId === null || stateStatus === null) {
    return { kind: 'starting', puzzleId };
  }

  return { kind: 'playing', puzzleId };
}
