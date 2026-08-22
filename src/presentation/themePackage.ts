import type { CellValue } from '../types';
import {
  BIO_TOXIN_POISON_PALETTE,
  BLOODBUCKET_SHAPE_COLORS,
  COMIC_TOXIN_POISON_PALETTE,
  DEFAULT_POISON_PALETTE,
  SEASALT_SHAPE_COLORS,
  SHAPE_COLORS,
  type PoisonPalette,
} from './shapePalette';

export const THEME_IDS = ['default', 'bloodbucket', 'seasalt'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type ShrineKind = 'none' | 'watching-amalgam';

export type PiecePalette = Record<Exclude<CellValue, null>, string>;

/** Gray fill/stroke pairs for the Jack Rugile Voronoi tile. Invincible can retint later. */
export const DEFAULT_VORONOI_TILE_PALETTE: ReadonlyArray<readonly [number, number]> = [
  [26, 29],
  [32, 37],
  [42, 50],
  [46, 56],
  [54, 66],
];

export type ThemeBackground =
  | {
      kind: 'dispersed-voronoi';
      palette: ReadonlyArray<readonly [number, number]>;
      scrimIdle: number;
      scrimMatch: number;
    }
  | { kind: 'comic-halftone' }
  | { kind: 'solid'; color: string };

export interface ThemePackage {
  id: ThemeId;
  piecePalette: PiecePalette;
  poisonPalette: PoisonPalette;
  background: ThemeBackground;
  shrine: ShrineKind;
}

const DEFAULT_PIECE_PALETTE: PiecePalette = { ...SHAPE_COLORS };
const BLOODBUCKET_PIECE_PALETTE: PiecePalette = { ...BLOODBUCKET_SHAPE_COLORS };
const SEASALT_PIECE_PALETTE: PiecePalette = { ...SEASALT_SHAPE_COLORS };

const DISPERSED_VORONOI_BACKGROUND: ThemeBackground = {
  kind: 'dispersed-voronoi',
  palette: DEFAULT_VORONOI_TILE_PALETTE,
  scrimIdle: 0.35,
  scrimMatch: 0.72,
};

const COMIC_HALFTONE_BACKGROUND: ThemeBackground = {
  kind: 'comic-halftone',
};

export const THEME_PACKAGES: Record<ThemeId, ThemePackage> = {
  default: {
    id: 'default',
    piecePalette: DEFAULT_PIECE_PALETTE,
    poisonPalette: DEFAULT_POISON_PALETTE,
    background: DISPERSED_VORONOI_BACKGROUND,
    shrine: 'none',
  },
  /** Muted paper/crimson pieces for the Bloodbucket shrine. */
  bloodbucket: {
    id: 'bloodbucket',
    piecePalette: BLOODBUCKET_PIECE_PALETTE,
    poisonPalette: BIO_TOXIN_POISON_PALETTE,
    background: { kind: 'solid', color: '#171717' },
    shrine: 'watching-amalgam',
  },
  /** Sky/amber/magenta pieces for the Seasalt comic treatment. */
  seasalt: {
    id: 'seasalt',
    piecePalette: SEASALT_PIECE_PALETTE,
    poisonPalette: COMIC_TOXIN_POISON_PALETTE,
    background: COMIC_HALFTONE_BACKGROUND,
    shrine: 'none',
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'default';

function isThemeId(value: string): value is ThemeId {
  return THEME_IDS.some((id) => id === value);
}

export function parseThemeId(value: string | null | undefined): ThemeId {
  if (value && isThemeId(value)) return value;
  return DEFAULT_THEME_ID;
}

export function resolveThemePackage(id: ThemeId): ThemePackage {
  return THEME_PACKAGES[id];
}

export function readThemeIdFromLocation(search: string): ThemeId | null {
  const value = new URLSearchParams(search).get('theme');
  if (!value || !isThemeId(value)) return null;
  return value;
}
