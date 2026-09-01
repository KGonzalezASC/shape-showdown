export type PuzzlePresentationStatus = 'playing' | 'solved' | 'topout';

export type PuzzleVisibilityPolicy = 'hidden' | 'partial' | 'revealed';

export function isPuzzleFinished(
  status: PuzzlePresentationStatus | null,
  hasEndEvent: boolean,
): boolean {
  return status !== null && (status !== 'playing' || hasEndEvent);
}

export interface PuzzleTimelineHint {
  tick: number;
  kind: string;
}

/**
 * Apply visibility policy to upcoming scripted events for client presentation.
 * revealed: full timeline
 * partial: kinds only (ticks hidden)
 * hidden: no timeline hints
 */
export function presentTimelineHints(
  events: PuzzleTimelineHint[],
  policy: PuzzleVisibilityPolicy | 'unspecified' | undefined,
  currentTick: number,
): PuzzleTimelineHint[] {
  const upcoming = events.filter((event) => event.tick > currentTick);
  if (!policy || policy === 'unspecified' || policy === 'hidden') {
    return [];
  }
  if (policy === 'partial') {
    return upcoming.map((event) => ({ tick: -1, kind: event.kind }));
  }
  return upcoming;
}

/** How many next-queue previews the player may see under the policy. */
export function visibleNextQueueCount(
  policy: PuzzleVisibilityPolicy | 'unspecified' | undefined,
): number {
  if (policy === 'hidden') return 1;
  if (policy === 'partial') return 3;
  return 5;
}
