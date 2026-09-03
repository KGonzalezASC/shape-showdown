export interface PuzzleProgressRecord {
  puzzleId: string;
  contentHash?: string;
  bestStars: number;
  bestPieces?: number;
  bestScore?: number;
  bestTicks?: number;
  clearedAt: number;
}

const STORAGE_KEY = 'shape_showdown_puzzle_progress_v1';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadAllPuzzleRecords(): Record<string, PuzzleProgressRecord> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PuzzleProgressRecord>;
  } catch {
    return {};
  }
}

export function getPuzzleRecord(puzzleId: string): PuzzleProgressRecord | null {
  const all = loadAllPuzzleRecords();
  return all[puzzleId] ?? null;
}

export function savePuzzleRecord(
  puzzleId: string,
  stars: number,
  pieces: number,
  score?: number,
  ticks?: number,
  contentHash?: string,
): PuzzleProgressRecord {
  const all = loadAllPuzzleRecords();
  const existing = all[puzzleId];

  const shouldUpdate =
    !existing ||
    stars > existing.bestStars ||
    (stars === existing.bestStars &&
      ((typeof pieces === 'number' && typeof existing.bestPieces === 'number' && pieces < existing.bestPieces) ||
        (typeof score === 'number' && typeof existing.bestScore === 'number' && score > existing.bestScore)));

  if (!shouldUpdate && existing) {
    return existing;
  }

  const updated: PuzzleProgressRecord = {
    puzzleId,
    bestStars: Math.max(stars, existing?.bestStars ?? 0),
    bestPieces:
      typeof existing?.bestPieces === 'number'
        ? Math.min(pieces, existing.bestPieces)
        : pieces,
    bestScore:
      typeof existing?.bestScore === 'number' && typeof score === 'number'
        ? Math.max(score, existing.bestScore)
        : score ?? existing?.bestScore,
    bestTicks:
      typeof existing?.bestTicks === 'number' && typeof ticks === 'number'
        ? Math.min(ticks, existing.bestTicks)
        : ticks ?? existing?.bestTicks,
    ...(contentHash ? { contentHash } : existing?.contentHash ? { contentHash: existing.contentHash } : {}),
    clearedAt: Date.now(),
  };

  all[puzzleId] = updated;

  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Ignore quota errors
    }
  }

  return updated;
}

export function getTotalStarsEarned(records: Record<string, PuzzleProgressRecord>): number {
  return Object.values(records).reduce((sum, r) => sum + (r.bestStars || 0), 0);
}
