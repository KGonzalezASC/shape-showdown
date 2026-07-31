export const ACTIVE_PIECE_MOTION_MS = 90;

export interface ActivePiecePoint {
  x: number;
  y: number;
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
