export const ACTIVE_PIECE_MOTION_MS = 90;

export interface ActivePiecePoint {
  x: number;
  y: number;
}

export interface IndexedActivePiecePoint extends ActivePiecePoint {
  offsetIndex: number;
}

/**
 * Normal play snapshots can be two simulation ticks apart while soft drop is
 * held (60Hz simulation versus the 30Hz play netcast). Keep that movement
 * continuous; only larger discontinuities should snap.
 */
export function shouldSnapActivePieceMotion(
  from: ActivePiecePoint,
  to: ActivePiecePoint,
): boolean {
  return Math.abs(from.x - to.x) > 2 || Math.abs(from.y - to.y) > 2;
}

export function shouldRestartActivePieceVisualLifetime(
  previous: readonly IndexedActivePiecePoint[],
  next: readonly IndexedActivePiecePoint[],
): boolean {
  if (next.length === 0) return false;
  if (previous.length === 0) return true;
  const previousByOffset = new Map(previous.map((cell) => [cell.offsetIndex, cell]));
  let matched = 0;
  for (const cell of next) {
    const prior = previousByOffset.get(cell.offsetIndex);
    if (!prior) continue;
    matched += 1;
    if (shouldSnapActivePieceMotion(prior, cell)) return true;
  }
  return matched === 0;
}

export function interpolateActivePiecePoint(
  from: ActivePiecePoint,
  to: ActivePiecePoint,
  progress: number,
): ActivePiecePoint {
  const clamped = Math.max(0, Math.min(1, progress));
  const eased = 1 - Math.pow(1 - clamped, 3);
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
  };
}
