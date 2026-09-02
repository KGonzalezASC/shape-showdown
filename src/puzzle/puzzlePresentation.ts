export type PuzzlePresentationStatus = 'playing' | 'solved' | 'topout';

export type PuzzleVisibilityPolicy = 'hidden' | 'partial' | 'revealed';

export function isPuzzleFinished(
  status: PuzzlePresentationStatus | null,
  hasEndEvent: boolean,
): boolean {
  return status !== null && (status !== 'playing' || hasEndEvent);
}

export interface PuzzleTimelineHint {
  /** Absolute tick for tick-scheduled beats; -1 when piece-based, pending, or partial. */
  tick: number;
  /** Present for piece-scheduled beats (fire when piecesPlaced reaches this count). */
  afterPieces?: number;
  kind: string;
}

/**
 * Apply visibility policy to upcoming scripted events for client presentation.
 * revealed: full timeline (tick seconds and/or after-N-pieces)
 * partial: kinds only (ticks / piece counts hidden)
 * hidden: no timeline hints
 */
export function presentTimelineHints(
  events: PuzzleTimelineHint[],
  policy: PuzzleVisibilityPolicy | 'unspecified' | undefined,
  currentTick: number,
  pendingKinds: string[] = [],
  piecesPlaced = 0,
): PuzzleTimelineHint[] {
  const upcoming = events.filter((event) => {
    if (typeof event.afterPieces === 'number') {
      return event.afterPieces > piecesPlaced;
    }
    return event.tick > currentTick;
  });
  // Keep deferred hazards in the telegraph until they actually apply.
  const pendingHints: PuzzleTimelineHint[] = [];
  for (const kind of pendingKinds) {
    if (!upcoming.some((event) => event.kind === kind) && !pendingHints.some((h) => h.kind === kind)) {
      pendingHints.push({ tick: -1, kind });
    }
  }
  const combined = [...upcoming, ...pendingHints];
  if (!policy || policy === 'unspecified' || policy === 'hidden') {
    return [];
  }
  if (policy === 'partial') {
    return combined.map((event) => ({ tick: -1, kind: event.kind }));
  }
  return combined;
}

/** How many next-queue previews the player may see under the policy. */
export function visibleNextQueueCount(
  policy: PuzzleVisibilityPolicy | 'unspecified' | undefined,
): number {
  if (policy === 'hidden') return 1;
  if (policy === 'partial') return 3;
  return 5;
}
