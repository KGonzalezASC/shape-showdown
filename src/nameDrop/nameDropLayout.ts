import {
  NAME_DROP_COLUMNS,
  NAME_DROP_GLYPH_HEIGHT,
  NAME_DROP_GLYPH_WIDTH,
  NAME_DROP_LETTER_GAP,
  NAME_DROP_LINE_GAP,
  NAME_DROP_PIXEL_SCALE,
  NAME_DROP_ROWS,
  normalizeName,
  type NameDropCell,
} from './nameDropShared';

type Glyph = readonly string[];

const GLYPHS: Record<string, Glyph> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '111', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '011', '001'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '010'], V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'], '3': ['110', '001', '010', '001', '110'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '010'], '7': ['111', '001', '010', '010', '010'],
  '8': ['010', '101', '010', '101', '010'], '9': ['010', '101', '111', '001', '110'],
  '.': ['000', '000', '000', '010', '010'], ' ': ['000', '000', '000', '000', '000'],
};

interface GlyphPlacement {
  cells: NameDropCell[];
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

export function cellKey(cell: NameDropCell): string {
  return `${cell.x},${cell.y}`;
}

export function cellsKey(cells: NameDropCell[]): string {
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

export function layoutName(lines: string[]): { targetCells: NameDropCell[]; glyphs: GlyphPlacement[] } {
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
