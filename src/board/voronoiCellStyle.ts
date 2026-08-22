/**
 * Falling cells must not change polygon topology just because their board
 * position changed. Their shape-local offset is stable for their lifetime.
 */
export const ACTIVE_VORONOI_SHAPE_HOLD_SECONDS = 1.6;
export const ACTIVE_VORONOI_SHAPE_MORPH_SECONDS = 0.8;

export interface ActiveVoronoiCellMorph {
  fromSides: number;
  toSides: number;
  progress: number;
}

export interface ActiveVoronoiCellHandoff {
  sourceMorph: ActiveVoronoiCellMorph;
  sourceWobblePhase: number;
  targetSides: number;
  targetWobblePhase: number;
}

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

/**
 * Preserves the current active-cell identity, then gently advances it through
 * 5 → 6 → 7 sides without coupling the transition to movement/network ticks.
 */
export function activeVoronoiCellMorph(
  lifetimeSeconds: number,
  activeOffsetIndex: number,
): ActiveVoronoiCellMorph {
  const stageSeconds = ACTIVE_VORONOI_SHAPE_HOLD_SECONDS + ACTIVE_VORONOI_SHAPE_MORPH_SECONDS;
  const safeLifetime = Math.max(0, lifetimeSeconds);
  const stage = Math.floor(safeLifetime / stageSeconds);
  const stageElapsed = safeLifetime - stage * stageSeconds;
  const fromSides = 5 + ((activeOffsetIndex + stage) % 3);

  if (stageElapsed < ACTIVE_VORONOI_SHAPE_HOLD_SECONDS) {
    return { fromSides, toSides: fromSides, progress: 0 };
  }

  const rawProgress =
    (stageElapsed - ACTIVE_VORONOI_SHAPE_HOLD_SECONDS) / ACTIVE_VORONOI_SHAPE_MORPH_SECONDS;
  const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
  return {
    fromSides,
    toSides: 5 + ((activeOffsetIndex + stage + 1) % 3),
    progress,
  };
}

export function activeVoronoiCellHandoff(
  row: number,
  column: number,
  activeOffsetIndex: number,
  lifetimeSeconds: number,
): ActiveVoronoiCellHandoff {
  return {
    sourceMorph: activeVoronoiCellMorph(lifetimeSeconds, activeOffsetIndex),
    sourceWobblePhase: voronoiCellWobblePhase(row, activeOffsetIndex),
    targetSides: voronoiCellSides(row, column),
    targetWobblePhase: voronoiCellWobblePhase(row),
  };
}
