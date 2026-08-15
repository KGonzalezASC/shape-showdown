export const SHRINE_GROWTH_BRIDGE_PATH =
  'M -36 -1.5 C -30 -1.5 -27 -2.5 -22 -3.5 C -16 -5 16 -5 22 -3.5 C 27 -2.5 30 -1.5 36 -1.5 V 1.5 C 30 1.5 27 2.5 22 3.5 C 16 5 -16 5 -22 3.5 C -27 2.5 -30 1.5 -36 1.5 Z';

export const SHRINE_FACE_PATH =
  'M -22 0 C -22 -8 -13 -14 0 -14 C 13 -14 22 -8 22 0 C 22 4 13 6 0 6 C -13 6 -22 4 -22 0 Z';

export type ShrineGrowthAnchor =
  | 'top-left'
  | 'top-right'
  | 'right-top'
  | 'right-bottom';

export interface ShrineGrowthSegment {
  anchor: ShrineGrowthAnchor;
  d: string;
  goopD: string;
}

const EDGE_HALF = 1.5;
const JOIN_HALF = 5;

export const HORIZONTAL_GROWTH_SEGMENTS: ShrineGrowthSegment[] = [
  {
    anchor: 'top-left',
    d: `M -24 -${EDGE_HALF} C -20 -${EDGE_HALF} -17 -2 -14 -2.8 C -10 -3.7 -7 -4.8 -5 -4.9 C -3 -5 -1 -${JOIN_HALF} 0 -${JOIN_HALF} L 0 ${JOIN_HALF} C -1 ${JOIN_HALF} -3 5 -5 4.9 C -7 4.8 -10 3.7 -14 2.8 C -17 2 -20 ${EDGE_HALF} -24 ${EDGE_HALF} Z`,
    goopD: `M -24 -${EDGE_HALF} C -20 -${EDGE_HALF} -17 -2 -14 -2.8 C -11 -3.5 -8 -4.7 -5 -4.9 C -2 -5 2 -4.5 3 -2 C 4 0 3 2 2 4 C 1 5 -2 5 -5 4.9 C -8 4.7 -11 3.5 -14 2.8 C -17 2 -20 ${EDGE_HALF} -24 ${EDGE_HALF} Z`,
  },
  {
    anchor: 'top-right',
    d: `M 24 -${EDGE_HALF} C 20 -${EDGE_HALF} 17 -2 14 -2.8 C 10 -3.7 7 -4.8 5 -4.9 C 3 -5 1 -${JOIN_HALF} 0 -${JOIN_HALF} L 0 ${JOIN_HALF} C 1 ${JOIN_HALF} 3 5 5 4.9 C 7 4.8 10 3.7 14 2.8 C 17 2 20 ${EDGE_HALF} 24 ${EDGE_HALF} Z`,
    goopD: `M 24 -${EDGE_HALF} C 20 -${EDGE_HALF} 17 -2 14 -2.8 C 11 -3.5 8 -4.7 5 -4.9 C 2 -5 -2 -4.5 -3 -2 C -4 0 -3 2 -2 4 C -1 5 2 5 5 4.9 C 8 4.7 11 3.5 14 2.8 C 17 2 20 ${EDGE_HALF} 24 ${EDGE_HALF} Z`,
  },
];

export const SIDE_GROWTH_SEGMENTS: ShrineGrowthSegment[] = [
  {
    anchor: 'top-left',
    d: `M -30 -${EDGE_HALF} C -26 -${EDGE_HALF} -23 -1.9 -20 -2.8 C -16 -3.7 -13 -4.8 -10 -4.9 C -5 -5 -1 -5 0 -5 L 0 5 C -1 5 -5 5 -10 4.9 C -13 4.8 -16 3.7 -20 2.8 C -23 1.9 -26 ${EDGE_HALF} -30 ${EDGE_HALF} Z`,
    goopD: `M -30 -${EDGE_HALF} C -26 -${EDGE_HALF} -23 -1.9 -20 -2.8 C -17 -3.5 -14 -4.7 -10 -4.9 C -6 -5 -2 -5 1 -2 C 2 0 1 2 0 4 C -1 5 -6 5 -10 4.9 C -14 4.7 -17 3.5 -20 2.8 C -23 1.9 -26 ${EDGE_HALF} -30 ${EDGE_HALF} Z`,
  },
  {
    anchor: 'top-right',
    d: `M 30 -${EDGE_HALF} C 26 -${EDGE_HALF} 23 -1.9 20 -2.8 C 16 -3.7 13 -4.8 10 -4.9 C 5 -5 1 -5 0 -5 L 0 5 C 1 5 5 5 10 4.9 C 13 4.8 16 3.7 20 2.8 C 23 1.9 26 ${EDGE_HALF} 30 ${EDGE_HALF} Z`,
    goopD: `M 30 -${EDGE_HALF} C 26 -${EDGE_HALF} 23 -1.9 20 -2.8 C 17 -3.5 14 -4.7 10 -4.9 C 6 -5 2 -5 -1 -2 C -2 0 -1 2 0 4 C 1 5 6 5 10 4.9 C 14 4.7 17 3.5 20 2.8 C 23 1.9 26 ${EDGE_HALF} 30 ${EDGE_HALF} Z`,
  },
];

export const SHRINE_FACE_GROWTH_STAGGER_MS = 140;

/**
 * Keeps a face entrance on its original semantic timeline when responsive
 * layout changes remount the board. A negative delay resumes the animation at
 * the elapsed point instead of replaying it from the frame edge.
 */
export function shrineGrowthAnimationDelayMs(
  staggerMs: number,
  startedAtMs: number,
  nowMs: number,
): number {
  return staggerMs - Math.max(0, nowMs - startedAtMs);
}
