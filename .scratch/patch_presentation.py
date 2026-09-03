from pathlib import Path
root = Path(r"C:\Users\Keithythefrog\source\BubbleBlitzers")

(root / "src/puzzle/puzzlePresentation.ts").write_text('''export type PuzzlePresentationStatus = 'playing' | 'solved' | 'topout';

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
''', encoding='utf-8')
print('presentation ok')

# --- PuzzleScreen.tsx ---
ps = (root / "src/components/PuzzleScreen.tsx").read_text(encoding="utf-8")
ps = ps.replace(
"  timeline?: Array<{ tick: number; kind: string }>;\n",
"  timeline?: Array<{ tick?: number; afterPieces?: number; kind: string }>;\n",
)

old_hints = '''  const timelineHints = presentTimelineHints(
    started?.timeline ?? [],
    started?.visibilityPolicy,
    state?.tick ?? 0,
    state?.pendingHazardKinds ?? [],
  );
'''
new_hints = '''  const timelineHints = presentTimelineHints(
    (started?.timeline ?? []).map((event) => ({
      tick: typeof event.tick === 'number' ? event.tick : -1,
      ...(typeof event.afterPieces === 'number' ? { afterPieces: event.afterPieces } : {}),
      kind: event.kind,
    })),
    started?.visibilityPolicy,
    state?.tick ?? 0,
    state?.pendingHazardKinds ?? [],
    state?.piecesPlaced ?? 0,
  );
'''
if old_hints not in ps:
    raise SystemExit('hints call not found')
ps = ps.replace(old_hints, new_hints)

old_li = '''                      {hint.tick < 0
                        ? hint.kind
                        : `${hint.kind} @ ${Math.floor(hint.tick / 60)}s`}
'''
new_li = '''                      {typeof hint.afterPieces === 'number'
                        ? `${hint.kind} after ${hint.afterPieces} pcs`
                        : hint.tick < 0
                          ? hint.kind
                          : `${hint.kind} @ ${Math.floor(hint.tick / 60)}s`}
'''
if old_li not in ps:
    raise SystemExit('hint li not found')
ps = ps.replace(old_li, new_li)
(root / "src/components/PuzzleScreen.tsx").write_text(ps, encoding='utf-8')
print('PuzzleScreen ok')
