import { makeRng, rngInt, type MutableRng } from '../rng';
import { PIECE_SEQUENCE, SHAPES, type ShapeOffset } from '../tetris/shapes';
import type { RotationState, TetrominoType } from '../types';

/**
 * Landing-only adapter: use the engine's canonical shapes and seeded RNG while
 * keeping this decorative page independent of Socket.IO and the match loop.
 */
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

type Glyph = readonly string[];

/**
 * Each lit font pixel expands to 2×2 board cells. That guarantees an O-piece
 * fallback while the exact-cover solver searches for more varied tetrominoes.
 */
const GLYPHS: Record<string, Glyph> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['110', '111', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '011', '001'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '010'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '010'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['010', '101', '010', '101', '010'],
  '9': ['010', '101', '111', '001', '110'],
  '.': ['000', '000', '000', '010', '010'],
  ' ': ['000', '000', '000', '000', '000'],
};

export interface NameDropCell {
  x: number;
  y: number;
}

export interface NameDropPiece {
  type: TetrominoType;
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

interface GlyphPlacement {
  cells: NameDropCell[];
}

interface TilingCandidate {
  type: TetrominoType;
  rotation: RotationState;
  x: number;
  y: number;
  cells: NameDropCell[];
  coveredTargetCells: NameDropCell[];
  candidatePriority: number;
}

export function normalizeName(value: string): string {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'SHAPE SHOWDOWN';
}

function glyphFor(character: string): Glyph {
  return GLYPHS[character] ?? GLYPHS[' '];
}

function scaledGlyphWidth(character: string): number {
  return (glyphFor(character)[0]?.length ?? NAME_DROP_GLYPH_WIDTH) * NAME_DROP_PIXEL_SCALE;
}

function lineWidth(line: string): number {
  return [...line].reduce(
    (width, character, index) =>
      width + scaledGlyphWidth(character) + (index > 0 ? NAME_DROP_LETTER_GAP : 0),
    0,
  );
}

function maxCharactersPerLine(): number {
  const scaledWidth = NAME_DROP_GLYPH_WIDTH * NAME_DROP_PIXEL_SCALE;
  return Math.max(
    1,
    Math.floor((NAME_DROP_COLUMNS + NAME_DROP_LETTER_GAP) / (scaledWidth + NAME_DROP_LETTER_GAP)),
  );
}

function fitWithEllipsis(value: string): string {
  const ellipsis = '...';
  let result = '';
  for (const character of value) {
    if (lineWidth(`${result}${character}${ellipsis}`) > NAME_DROP_COLUMNS) break;
    result += character;
  }
  return `${result}${ellipsis}`;
}

/** Wrap a name into the two-line footprint used by the landing-page board. */
export function nameLines(value: string): string[] {
  const normalized = normalizeName(value);
  const maxChars = maxCharactersPerLine();
  const lines: string[] = [];
  let current = '';

  for (const word of normalized.split(' ')) {
    if (!word) continue;
    const chunks = word.match(new RegExp(`.{1,${maxChars}}`, 'g')) ?? [''];
    for (const chunk of chunks) {
      const candidate = current ? `${current} ${chunk}` : chunk;
      if (current && lineWidth(candidate) > NAME_DROP_COLUMNS) {
        lines.push(current);
        current = chunk;
      } else {
        current = candidate;
      }
    }
  }

  if (current) lines.push(current);
  if (lines.length > 2) return [lines[0], fitWithEllipsis(lines.slice(1).join(' '))];
  return lines.length > 0 ? lines : ['SHAPE', 'SHOWDOWN'];
}

function cellKey(cell: NameDropCell): string {
  return `${cell.x},${cell.y}`;
}

function cellsKey(cells: NameDropCell[]): string {
  return cells.map(cellKey).sort().join('|');
}

function glyphCells(character: string, originX: number, originY: number): NameDropCell[] {
  const glyph = glyphFor(character);
  const cells: NameDropCell[] = [];

  for (let glyphY = 0; glyphY < glyph.length; glyphY += 1) {
    for (let glyphX = 0; glyphX < glyph[glyphY].length; glyphX += 1) {
      if (glyph[glyphY][glyphX] !== '1') continue;
      for (let scaleY = 0; scaleY < NAME_DROP_PIXEL_SCALE; scaleY += 1) {
        for (let scaleX = 0; scaleX < NAME_DROP_PIXEL_SCALE; scaleX += 1) {
          cells.push({
            x: originX + glyphX * NAME_DROP_PIXEL_SCALE + scaleX,
            y: originY + glyphY * NAME_DROP_PIXEL_SCALE + scaleY,
          });
        }
      }
    }
  }

  return cells;
}

function layoutName(lines: string[]): { targetCells: NameDropCell[]; glyphs: GlyphPlacement[] } {
  const scaledGlyphHeight = NAME_DROP_GLYPH_HEIGHT * NAME_DROP_PIXEL_SCALE;
  const totalHeight =
    lines.length * scaledGlyphHeight + Math.max(0, lines.length - 1) * NAME_DROP_LINE_GAP;
  const startY = Math.max(0, Math.floor((NAME_DROP_ROWS - totalHeight) / 2));
  const targetCells: NameDropCell[] = [];
  const glyphs: GlyphPlacement[] = [];

  lines.forEach((line, lineIndex) => {
    let cursorX = Math.max(0, Math.floor((NAME_DROP_COLUMNS - lineWidth(line)) / 2));
    const lineY = startY + lineIndex * (scaledGlyphHeight + NAME_DROP_LINE_GAP);

    for (const character of line) {
      const cells = glyphCells(character, cursorX, lineY);
      if (cells.length > 0) {
        targetCells.push(...cells);
        glyphs.push({ cells });
      }
      cursorX += scaledGlyphWidth(character) + NAME_DROP_LETTER_GAP;
    }
  });

  return { targetCells, glyphs };
}

export function nameTargetCells(lines: string[]): NameDropCell[] {
  return layoutName(lines).targetCells;
}

function pieceCells(
  type: TetrominoType,
  rotation: RotationState,
  x: number,
  y: number,
): NameDropCell[] {
  return SHAPES[type][rotation].map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

function isEdgeCell(
  cell: NameDropCell,
  target: Set<string>,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  if (target.has(cellKey(cell))) return true;
  const outsideBounds =
    cell.x < bounds.minX || cell.x > bounds.maxX ||
    cell.y < bounds.minY || cell.y > bounds.maxY;
  if (!outsideBounds) return false;
  return [
    { x: cell.x - 1, y: cell.y },
    { x: cell.x + 1, y: cell.y },
    { x: cell.x, y: cell.y - 1 },
    { x: cell.x, y: cell.y + 1 },
  ].some((neighbor) => target.has(cellKey(neighbor)));
}

function piecePriority(type: TetrominoType, rng: MutableRng): number {
  const varietyBias: Record<TetrominoType, number> = {
    I: 350_000,
    J: 90_000,
    L: 90_000,
    O: 500_000,
    S: 0,
    T: 0,
    Z: 0,
  };
  return varietyBias[type] + rngInt(rng, 1_000_000);
}

function generateCandidates(targetCells: NameDropCell[], rng: MutableRng): TilingCandidate[] {
  const target = new Set(targetCells.map(cellKey));
  const minX = Math.min(...targetCells.map(({ x }) => x));
  const maxX = Math.max(...targetCells.map(({ x }) => x));
  const minY = Math.min(...targetCells.map(({ y }) => y));
  const maxY = Math.max(...targetCells.map(({ y }) => y));
  const candidates = new Map<string, TilingCandidate>();
  const relaxation = NAME_DROP_EDGE_RELAXATION_ENABLED ? NAME_DROP_EDGE_RELAXATION_CELLS : 0;

  for (const type of PIECE_SEQUENCE) {
    for (const rotation of [0, 1, 2, 3] as const) {
      const offsets: ShapeOffset[] = SHAPES[type][rotation];
      const minDx = Math.min(...offsets.map(([dx]) => dx));
      const maxDx = Math.max(...offsets.map(([dx]) => dx));
      const minDy = Math.min(...offsets.map(([, dy]) => dy));
      const maxDy = Math.max(...offsets.map(([, dy]) => dy));

      for (let y = minY - maxDy - relaxation; y <= maxY - minDy + relaxation; y += 1) {
        for (let x = minX - maxDx - relaxation; x <= maxX - minDx + relaxation; x += 1) {
          const cells = pieceCells(type, rotation, x, y);
          if (!cells.every((cell) => (
            cell.x >= 0 && cell.x < NAME_DROP_COLUMNS &&
            cell.y >= 0 && cell.y < NAME_DROP_ROWS &&
            isEdgeCell(cell, target, { minX, maxX, minY, maxY })
          ))) continue;
          const coveredTargetCells = cells.filter((cell) => target.has(cellKey(cell)));
          if (coveredTargetCells.length < (relaxation > 0 ? 3 : 4)) continue;
          const occupied = cellsKey(cells);
          const existing = candidates.get(occupied);
          const candidatePriority = piecePriority(type, rng);
          if (!existing || candidatePriority < existing.candidatePriority) {
            candidates.set(occupied, {
              type,
              rotation,
              x,
              y,
              cells,
              coveredTargetCells,
              candidatePriority,
            });
          }
        }
      }
    }
  }

  return [...candidates.values()];
}

function tileGlyph(
  targetCells: NameDropCell[],
  rng: MutableRng,
  occupiedBeforeGlyph: Set<string>,
): TilingCandidate[] {
  const candidates = generateCandidates(targetCells, rng);
  const candidatesByCell = new Map<string, TilingCandidate[]>();

  for (const candidate of candidates) {
    for (const cell of candidate.cells) {
      const id = cellKey(cell);
      const list = candidatesByCell.get(id);
      if (list) list.push(candidate);
      else candidatesByCell.set(id, [candidate]);
    }
  }
  for (const list of candidatesByCell.values()) {
    list.sort((a, b) => a.candidatePriority - b.candidatePriority);
  }

  const remaining = new Set(targetCells.map(cellKey));
  const occupied = new Set(occupiedBeforeGlyph);
  const solution: TilingCandidate[] = [];

  const search = (): boolean => {
    if (remaining.size === 0) return true;

    let options: TilingCandidate[] | null = null;
    for (const id of remaining) {
      const valid = (candidatesByCell.get(id) ?? []).filter((candidate) =>
        candidate.coveredTargetCells.every((cell) => remaining.has(cellKey(cell))) &&
        candidate.cells.every((cell) => !occupied.has(cellKey(cell))),
      );
      if (valid.length === 0) return false;
      if (!options || valid.length < options.length) {
        options = valid;
        if (valid.length === 1) break;
      }
    }

    for (const candidate of options ?? []) {
      const removed = candidate.coveredTargetCells.map(cellKey);
      const added = candidate.cells.map(cellKey);
      removed.forEach((id) => remaining.delete(id));
      added.forEach((id) => occupied.add(id));
      solution.push(candidate);
      if (search()) return true;
      solution.pop();
      removed.forEach((id) => remaining.add(id));
      added.forEach((id) => occupied.delete(id));
    }
    return false;
  };

  if (!search()) {
    throw new Error(`Unable to tile glyph target containing ${targetCells.length} cells`);
  }
  return solution;
}

/** Create a deterministic exact-cover plan made exclusively from playable tetrominoes. */
export function createNameDropPlan(
  value = 'SHAPE SHOWDOWN',
  seed = 0x53485045,
): NameDropPlan {
  const lines = nameLines(value);
  const layout = layoutName(lines);
  const rng = makeRng(seed);
  const occupied = new Set<string>();
  const tiled = layout.glyphs.flatMap((glyph) => {
    const pieces = tileGlyph(glyph.cells, rng, occupied);
    pieces.flatMap((piece) => piece.cells).forEach((cell) => occupied.add(cellKey(cell)));
    return pieces;
  });
  const ordered = tiled
    .map((piece) => ({ piece, tieBreak: rngInt(rng, 1_000_000) }))
    .sort((a, b) => {
      const aBottom = Math.max(...a.piece.cells.map(({ y }) => y));
      const bBottom = Math.max(...b.piece.cells.map(({ y }) => y));
      return bBottom - aBottom || a.piece.x - b.piece.x || a.tieBreak - b.tieBreak;
    });

  const pieces: NameDropPiece[] = ordered.map(({ piece }, index) => ({
    type: piece.type,
    rotation: piece.rotation,
    x: piece.x,
    y: piece.y,
    cells: piece.cells,
    delayMs: index * NAME_DROP_PIECE_GAP_MS,
    durationMs: NAME_DROP_FALL_MS + rngInt(rng, 180),
  }));
  const lastPiece = pieces[pieces.length - 1];

  return {
    name: normalizeName(value),
    lines,
    targetCells: layout.targetCells,
    pieces,
    totalDurationMs:
      (lastPiece?.delayMs ?? 0) + (lastPiece?.durationMs ?? 0) + 1_800,
  };
}
