import { rngInt, makeRng } from '../rng';
import { PIECE_SEQUENCE, SHAPES, type ShapeOffset } from '../tetris/shapes';
import type { TetrominoType } from '../types';

/**
 * Landing-only adapter: it reuses the engine's canonical shapes and seeded RNG
 * while keeping the decorative page independent of the server match loop. If
 * this becomes interactive, its placement loop should move behind stepPlayer.
 */
export const NAME_DROP_COLUMNS = 32;
export const NAME_DROP_ROWS = 16;
export const NAME_DROP_GLYPH_WIDTH = 3;
export const NAME_DROP_GLYPH_HEIGHT = 5;
export const NAME_DROP_LINE_GAP = 1;
export const NAME_DROP_PIECE_GAP_MS = 92;
export const NAME_DROP_FALL_MS = 560;

type Glyph = readonly string[];

/** A compact five-row bitmap font: small enough to fit a full brand name on the showcase grid. */
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
  rotation: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  cells: NameDropCell[];
  revealCells: NameDropCell[];
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

function glyphFor(character: string): Glyph {
  return GLYPHS[character] ?? GLYPHS[' '];
}

function glyphWidth(character: string): number {
  return glyphFor(character)[0]?.length ?? NAME_DROP_GLYPH_WIDTH;
}

function lineWidth(line: string): number {
  return [...line].reduce((width, character, index) => width + glyphWidth(character) + (index > 0 ? 1 : 0), 0);
}

function maxCharactersPerLine(): number {
  return Math.max(1, Math.floor((NAME_DROP_COLUMNS + 1) / (NAME_DROP_GLYPH_WIDTH + 1)));
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

/** Wraps a name into the two-line footprint used by the landing-page board. */
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

function key(cell: NameDropCell): string {
  return `${cell.x},${cell.y}`;
}

export function nameTargetCells(lines: string[]): NameDropCell[] {
  const totalHeight = lines.length * NAME_DROP_GLYPH_HEIGHT + Math.max(0, lines.length - 1) * NAME_DROP_LINE_GAP;
  const startY = Math.max(0, Math.floor((NAME_DROP_ROWS - totalHeight) / 2));
  const cells: NameDropCell[] = [];

  lines.forEach((line, lineIndex) => {
    const startX = Math.max(0, Math.floor((NAME_DROP_COLUMNS - lineWidth(line)) / 2));
    const startYForLine = startY + lineIndex * (NAME_DROP_GLYPH_HEIGHT + NAME_DROP_LINE_GAP);
    let cursorX = startX;

    for (const character of line) {
      const glyph = glyphFor(character);
      for (let y = 0; y < glyph.length; y += 1) {
        for (let x = 0; x < glyph[y].length; x += 1) {
          if (glyph[y][x] === '1') cells.push({ x: cursorX + x, y: startYForLine + y });
        }
      }
      cursorX += glyphWidth(character) + 1;
    }
  });

  return cells;
}

function pieceCells(type: TetrominoType, rotation: 0 | 1 | 2 | 3, x: number, y: number): NameDropCell[] {
  return SHAPES[type][rotation].map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

function placementForTarget(
  target: NameDropCell,
  type: TetrominoType,
  rotation: 0 | 1 | 2 | 3,
  remaining: Set<string>,
): Omit<NameDropPiece, 'delayMs' | 'durationMs'> | null {
  const offsets: ShapeOffset[] = SHAPES[type][rotation];
  const maxX = Math.max(...offsets.map(([dx]) => dx));
  const maxY = Math.max(...offsets.map(([, dy]) => dy));
  const validAnchors = offsets.filter(([dx, dy]) => {
    const x = target.x - dx;
    const y = target.y - dy;
    return x >= 0 && x <= NAME_DROP_COLUMNS - 1 - maxX && y >= 0 && y <= NAME_DROP_ROWS - 1 - maxY;
  });
  if (validAnchors.length === 0) return null;

  const anchor = validAnchors[0];
  const x = target.x - anchor[0];
  const y = target.y - anchor[1];
  const cells = pieceCells(type, rotation, x, y);
  return {
    type,
    rotation,
    x,
    y,
    cells,
    revealCells: cells.filter((cell) => remaining.has(key(cell))),
  };
}

function randomPiecePlacement(target: NameDropCell, remaining: Set<string>, rng: { seed: number }): Omit<NameDropPiece, 'delayMs' | 'durationMs'> {
  let best: Omit<NameDropPiece, 'delayMs' | 'durationMs'> | null = null;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const type = PIECE_SEQUENCE[rngInt(rng, PIECE_SEQUENCE.length)];
    const rotation = rngInt(rng, 4) as 0 | 1 | 2 | 3;
    const candidate = placementForTarget(target, type, rotation, remaining);
    if (!candidate) continue;
    const revealCells = candidate.revealCells;
    if (!best || revealCells.length > best.revealCells.length) best = candidate;
    if (revealCells.length >= 2) break;
  }

  if (best) return best;

  // Try every canonical shape/rotation before falling back. This keeps the
  // reveal cell physically covered even when the target sits on an edge.
  for (const type of PIECE_SEQUENCE) {
    for (const rotation of [0, 1, 2, 3] as const) {
      const candidate = placementForTarget(target, type, rotation, remaining);
      if (candidate) return candidate;
    }
  }

  throw new Error(`Unable to place a tetromino over target cell ${target.x},${target.y}`);
}

/** Creates a repeatable stream of standard tetromino drops that reveals the name bitmap. */
export function createNameDropPlan(value = 'SHAPE SHOWDOWN', seed = 0x53485045): NameDropPlan {
  const lines = nameLines(value);
  const targetCells = nameTargetCells(lines);
  const remaining = new Set(targetCells.map(key));
  const rng = makeRng(seed);
  const pieces: NameDropPiece[] = [];

  while (remaining.size > 0) {
    const target = targetCells.find((cell) => remaining.has(key(cell))) ?? targetCells[0];
    const placement = randomPiecePlacement(target, remaining, rng);
    const revealCells = placement.revealCells.length > 0 ? placement.revealCells : [target];
    for (const cell of revealCells) remaining.delete(key(cell));

    const index = pieces.length;
    pieces.push({
      ...placement,
      revealCells,
      delayMs: index * NAME_DROP_PIECE_GAP_MS,
      durationMs: NAME_DROP_FALL_MS + rngInt(rng, 140),
    });
  }

  const lastPiece = pieces[pieces.length - 1];
  return {
    name: normalizeName(value),
    lines,
    targetCells,
    pieces,
    totalDurationMs: (lastPiece?.delayMs ?? 0) + (lastPiece?.durationMs ?? 0) + 1_000,
  };
}
