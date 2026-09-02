import {
  getCuratedPuzzleEntry,
  loadPuzzleCatalog,
  type CuratedPuzzleEntry,
} from './index.js';

/** Puzzle daily challenge calendar timezone (US Eastern). */
export const PUZZLE_DAILY_TIMEZONE = 'America/New_York';

/**
 * Explicit date → puzzleId overrides for the daily challenge.
 * Empty entries fall through to deterministic catalog rotation.
 * Seeded for near-term dates once authored ids exist.
 */
export const DAILY_SCHEDULE: Record<string, string> = {
  // ~2 weeks starting 2026-09-01 ET, rotating all 12 authored ids.
  '2026-09-01': 'authored-cheese-keyhole',
  '2026-09-02': 'authored-well-freeze',
  '2026-09-03': 'authored-skew-stairs',
  '2026-09-04': 'authored-pulse-garbage',
  '2026-09-05': 'authored-cheese-ladder',
  '2026-09-06': 'authored-dig-shaft',
  '2026-09-07': 'authored-tslot-setup',
  '2026-09-08': 'authored-four-wide',
  '2026-09-09': 'authored-hold-discipline',
  '2026-09-10': 'authored-poison-beat',
  '2026-09-11': 'authored-curtain-drop',
  '2026-09-12': 'authored-late-i-well',
  '2026-09-13': 'authored-cheese-keyhole',
  '2026-09-14': 'authored-well-freeze',
};

/** YYYY-MM-DD in America/New_York. */
export function calendarDateKey(now: Date = new Date()): string {
  // en-CA yields ISO-like YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PUZZLE_DAILY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Stable unsigned hash of a date key for catalog rotation. */
function hashDateKey(dateKey: string): number {
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Resolve which catalog puzzle is the daily for `dateKey`.
 * Prefer DAILY_SCHEDULE; otherwise rotate deterministically over catalogIds.
 */
export function resolveDailyPuzzleId(
  dateKey: string,
  catalogIds: readonly string[],
): string {
  if (catalogIds.length === 0) {
    throw new Error('Cannot resolve daily puzzle: catalog is empty');
  }
  const scheduled = DAILY_SCHEDULE[dateKey];
  if (scheduled !== undefined) {
    return scheduled;
  }
  return catalogIds[hashDateKey(dateKey) % catalogIds.length]!;
}

export interface DailyChallenge {
  dateKey: string;
  puzzleId: string;
  entry: CuratedPuzzleEntry;
}

/** Today's daily challenge (or for `now`) from the curated catalog. */
export function getDailyChallenge(now: Date = new Date()): DailyChallenge {
  const dateKey = calendarDateKey(now);
  const catalog = loadPuzzleCatalog();
  const catalogIds = catalog.map((entry) => entry.level.id);
  const puzzleId = resolveDailyPuzzleId(dateKey, catalogIds);
  const entry = getCuratedPuzzleEntry(puzzleId);
  if (!entry) {
    throw new Error(`Daily puzzle id missing from catalog: ${puzzleId}`);
  }
  return { dateKey, puzzleId, entry };
}

/** Wire payload for puzzle:catalog daily field. */
export function getDailyChallengeSummary(now?: Date): {
  dateKey: string;
  puzzleId: string;
  name: string;
} {
  const challenge = getDailyChallenge(now);
  return {
    dateKey: challenge.dateKey,
    puzzleId: challenge.puzzleId,
    name: challenge.entry.level.name,
  };
}
