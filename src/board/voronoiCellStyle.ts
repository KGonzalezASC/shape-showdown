/**
 * Falling cells must not change polygon topology just because their board
 * position changed. Their tetromino-local offset is stable for their lifetime.
 */
export function voronoiCellSides(
  row: number,
  column: number,
  activeOffsetIndex?: number,
): number {
  const seed = activeOffsetIndex ?? row + column;
  return 5 + (seed % 3);
}

export function voronoiCellWobblePhase(
  row: number,
  activeOffsetIndex?: number,
): number {
  return activeOffsetIndex ?? row;
}
