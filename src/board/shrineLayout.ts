import { seededDecorationUnit } from '../presentation/decorationSeed';

export const SHRINE_REFERENCE_CELL_SIZE_PX = 30;
export const SHRINE_PAD_PX = 30;

export type ShrineFaceSide = 'top' | 'left' | 'right';

export interface ShrineFace {
  side: ShrineFaceSide;
  centerPercent: number;
}

export interface ShrineSpark {
  side: 'left' | 'right';
  yPercent: number;
  offsetPx: number;
  opacity: number;
}

export interface ShrineLayout {
  faceCount: number;
  faces: ShrineFace[];
  sparks: ShrineSpark[];
  lineExtLeft: number[];
  lineExtRight: number[];
  lineExtTop: number[];
  lineExtBottom: number[];
}

export function buildShrineLayout(seed: number): ShrineLayout {
  const faceCount = Math.floor(seededDecorationUnit(seed, 26) * 3) + 1;
  const topCenter = ((48 + seededDecorationUnit(seed, 21) * 18 + 22) / 300) * 100;
  const rightCenter = ((88 + seededDecorationUnit(seed, 22) * 28 + 22) / 540) * 100;
  const leftCenter = 34 + seededDecorationUnit(seed, 23) * 24;

  const candidates: ShrineFace[] = [
    { side: 'top', centerPercent: topCenter },
    { side: 'right', centerPercent: rightCenter },
    { side: 'left', centerPercent: leftCenter },
  ];

  const lineExtLeft: number[] = [];
  const lineExtRight: number[] = [];
  for (let row = 0; row <= 18; row += 1) {
    lineExtLeft[row] = 12 + Math.floor(seededDecorationUnit(seed, 100 + row) * 18);
    lineExtRight[row] = 12 + Math.floor(seededDecorationUnit(seed, 140 + row) * 18);
  }
  const lineExtTop: number[] = [];
  const lineExtBottom: number[] = [];
  for (let col = 0; col <= 10; col += 1) {
    lineExtTop[col] = 12 + Math.floor(seededDecorationUnit(seed, 180 + col) * 18);
    lineExtBottom[col] = 12 + Math.floor(seededDecorationUnit(seed, 210 + col) * 18);
  }

  const sparks: ShrineSpark[] = [
    {
      side: 'right',
      yPercent: 5 + Math.floor(seededDecorationUnit(seed, 241) * 8),
      offsetPx: 18 + Math.floor(seededDecorationUnit(seed, 247) * 5),
      opacity: 0.55 + seededDecorationUnit(seed, 242) * 0.15,
    },
    {
      side: 'left',
      yPercent: 34 + Math.floor(seededDecorationUnit(seed, 243) * 22),
      offsetPx: 16 + Math.floor(seededDecorationUnit(seed, 248) * 5),
      opacity: 0.55 + seededDecorationUnit(seed, 244) * 0.15,
    },
    {
      side: 'right',
      yPercent: 68 + Math.floor(seededDecorationUnit(seed, 245) * 20),
      offsetPx: 18 + Math.floor(seededDecorationUnit(seed, 249) * 5),
      opacity: 0.55 + seededDecorationUnit(seed, 246) * 0.15,
    },
  ];

  return {
    faceCount,
    faces: candidates.slice(0, faceCount),
    sparks,
    lineExtLeft,
    lineExtRight,
    lineExtTop,
    lineExtBottom,
  };
}
