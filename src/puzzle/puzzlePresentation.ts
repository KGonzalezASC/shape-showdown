export type PuzzlePresentationStatus = 'playing' | 'solved' | 'topout';

export function isPuzzleFinished(
  status: PuzzlePresentationStatus | null,
  hasEndEvent: boolean,
): boolean {
  return status !== null && (status !== 'playing' || hasEndEvent);
}
