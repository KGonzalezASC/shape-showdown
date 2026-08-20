import type { CellValue, TetrominoType } from '../types.js';

const CELL_TO_NIBBLE: Record<string, number> = {
  '': 0,
  I: 1,
  J: 2,
  L: 3,
  O: 4,
  S: 5,
  T: 6,
  Z: 7,
  G: 8,
  W: 9,
};

const NIBBLE_TO_CELL: (CellValue)[] = [
  null, 'I', 'J', 'L', 'O', 'S', 'T', 'Z', 'G', 'W',
];

export function cellToNibble(cell: CellValue): number {
  if (cell === null) return 0;
  return CELL_TO_NIBBLE[cell] ?? 0;
}

export function nibbleToCell(nibble: number): CellValue {
  return NIBBLE_TO_CELL[nibble & 0x0f] ?? null;
}

export function tetrominoToNibble(type: TetrominoType): number {
  return CELL_TO_NIBBLE[type] ?? 0;
}

export function nibbleToTetromino(nibble: number): TetrominoType {
  const cell = nibbleToCell(nibble);
  if (cell === null || cell === 'G' || cell === 'W') {
    throw new Error(`Invalid tetromino nibble: ${nibble}`);
  }
  return cell;
}

/** Pack one row of cells (length must be even for pairs). */
export function packCellRow(cells: readonly CellValue[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(cells.length / 2));
  for (let i = 0; i < cells.length; i += 2) {
    const hi = cellToNibble(cells[i] ?? null);
    const lo = cellToNibble(cells[i + 1] ?? null);
    out[i / 2] = (hi << 4) | lo;
  }
  return out;
}

export function unpackCellRow(packed: Uint8Array, cols: number): CellValue[] {
  const row: CellValue[] = [];
  for (let i = 0; i < cols; i += 1) {
    const byte = packed[Math.floor(i / 2)] ?? 0;
    const nibble = (i % 2 === 0) ? (byte >> 4) : (byte & 0x0f);
    row.push(nibbleToCell(nibble));
  }
  return row;
}

export function packPoisonRow(cells: readonly number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(cells.length / 2));
  for (let i = 0; i < cells.length; i += 2) {
    const hi = (cells[i] ?? 0) & 0x0f;
    const lo = (cells[i + 1] ?? 0) & 0x0f;
    out[i / 2] = (hi << 4) | lo;
  }
  return out;
}

export function unpackPoisonRow(packed: Uint8Array, cols: number): number[] {
  const row: number[] = [];
  for (let i = 0; i < cols; i += 1) {
    const byte = packed[Math.floor(i / 2)] ?? 0;
    row.push((i % 2 === 0) ? ((byte >> 4) & 0x0f) : (byte & 0x0f));
  }
  return row;
}
