import type { CellValue } from '../types';

/**
 * Shape Showdown's default presentation palette deliberately does not follow
 * the conventional falling-block shape-to-color assignments.
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

/**
 * Bloodbucket's paper, faded-crimson, and shaft-gray palette. The intentionally
 * non-rainbow mapping keeps the pieces in the shrine's 1-bit visual language.
 */
export const BLOODBUCKET_SHAPE_COLORS: Record<Exclude<CellValue, null>, string> = {
  I: '#dedede',
  J: '#9e5259',
  L: '#dedede',
  O: '#b8b8b8',
  S: '#9e5259',
  T: '#dedede',
  Z: '#b86a70',
  G: '#777777',
  W: '#f4f4f5',
};

/**
 * Seasalt's dark comic palette: sky-blue, amber, magenta, and ink. It is
 * deliberately distinct from conventional Guideline shape-to-color mappings.
 */
export const SEASALT_SHAPE_COLORS: Record<Exclude<CellValue, null>, string> = {
  I: '#7bafe9',
  J: '#4f77c9',
  L: '#f1b467',
  O: '#f7d17b',
  S: '#5aaacb',
  T: '#ed5577',
  Z: '#b64266',
  G: '#1e3a5f',
  W: '#fff3da',
};

/** Poison V1–V4 keyed by variant number. */
export type PoisonPalette = Record<number, string>;

/**
 * Default-theme poison ramp — off every SHAPE_COLORS hue
 * (especially Wild fuchsia): crimson → deep indigo → bone → umber.
 */
export const DEFAULT_POISON_PALETTE: PoisonPalette = {
  1: '#DC2626',
  2: '#312E81',
  3: '#F8FAFC',
  4: '#92400E',
};

/** Downwell bio-toxin poison: faded crimson → paper → shaft gray → chalk. */
export const BIO_TOXIN_POISON_PALETTE: PoisonPalette = {
  1: '#b86a70',
  2: '#dedede',
  3: '#777777',
  4: '#f4f4f5',
};

/** Invincible comic-toxin poison: magenta → sky → amber → ink. */
export const COMIC_TOXIN_POISON_PALETTE: PoisonPalette = {
  1: '#ed5577',
  2: '#7bafe9',
  3: '#f1b467',
  4: '#1e3a5f',
};

export function poisonColor(palette: PoisonPalette, variant: number): string {
  return palette[variant] || palette[1] || '#DC2626';
}
