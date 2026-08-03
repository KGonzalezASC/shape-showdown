import type { CellValue, TetrominoType } from '../types';

/**
 * Shape Showdown's presentation palette deliberately does not follow the
 * conventional falling-block shape-to-color assignments.
 */
export const SHAPE_COLORS: Record<Exclude<CellValue, null>, string> = {
  I: '#fb7185',
  J: '#facc15',
  L: '#2dd4bf',
  O: '#a78bfa',
  S: '#38bdf8',
  T: '#a3e635',
  Z: '#f97316',
  G: '#64748b',
  W: '#e879f9',
};

export const LANDING_PAGE_SHAPE_COLORS: Record<TetrominoType, string> = {
  I: SHAPE_COLORS.I,
  J: SHAPE_COLORS.J,
  L: SHAPE_COLORS.L,
  O: SHAPE_COLORS.O,
  S: SHAPE_COLORS.S,
  T: SHAPE_COLORS.T,
  Z: SHAPE_COLORS.Z,
};
