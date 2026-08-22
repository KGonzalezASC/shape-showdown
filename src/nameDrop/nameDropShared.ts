import type { RotationState, ShapeType } from '../types';

export const NAME_DROP_COLUMNS = 64;
export const NAME_DROP_ROWS = 28;
export const NAME_DROP_GLYPH_WIDTH = 3;
export const NAME_DROP_GLYPH_HEIGHT = 5;
export const NAME_DROP_PIXEL_SCALE = 2;
export const NAME_DROP_LETTER_GAP = 2;
export const NAME_DROP_LINE_GAP = 4;
export const NAME_DROP_PIECE_GAP_MS = 96;
export const NAME_DROP_FALL_MS = 760;
/** Small edge-only relaxation keeps the word legible while opening more tilings. */
export const NAME_DROP_EDGE_RELAXATION_ENABLED = true;
export const NAME_DROP_EDGE_RELAXATION_CELLS = 1;

export interface NameDropCell {
  x: number;
  y: number;
}

export interface NameDropPiece {
  type: ShapeType;
  rotation: RotationState;
  x: number;
  y: number;
  cells: NameDropCell[];
  delayMs: number;
  durationMs: number;
}

export interface NameDropPlan {
  name: string;
  lines: string[];
  targetCells: NameDropCell[];
  pieces: NameDropPiece[];
  totalDurationMs: number;
}

export function normalizeName(value: string): string {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'SHAPE SHOWDOWN';
}
