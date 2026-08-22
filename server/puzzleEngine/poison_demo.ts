/**
 * Poison Spread Variation Demo
 *
 * Simulates all valid landing positions & rotations for each piece type on a
 * fixed sample board, seeds poison at the lock cells, runs 4-generation BFS
 * spread, and prints every unique final poison group as an ASCII board.
 *
 * Run: bun run server/puzzleEngine/poison_demo.ts
 */

import { SHAPES } from './pieces.js';
import {
  BOARD_COLS,
  BOARD_ROWS,
  POISON_GENERATIONS,
} from '../../src/constants.js';
import type { CellValue, ShapeType, RotationState } from '../../src/types.js';
import { createEmptyBoard, createEmptyPoisonBoard, spreadPoisonWaveOnce } from './engine.js';

function getCells(piece: { type: ShapeType; rotation: RotationState; x: number; y: number }) {
  return SHAPES[piece.type][piece.rotation].map(([dx, dy]) => ({
    x: piece.x + dx,
    y: piece.y + dy,
  }));
}

function collides(board: CellValue[][], piece: { type: ShapeType; rotation: RotationState; x: number; y: number }): boolean {
  for (const cell of getCells(piece)) {
    if (cell.x < 0 || cell.x >= BOARD_COLS || cell.y >= BOARD_ROWS) return true;
    if (cell.y >= 0 && board[cell.y][cell.x] !== null) return true;
  }
  return false;
}

/** Drop a piece straight down (hard drop) and return the landing Y, or null if invalid spawn. */
function hardDropY(board: CellValue[][], type: ShapeType, rotation: RotationState, x: number, startY: number): number | null {
  const piece = { type, rotation, x, y: startY };
  if (collides(board, piece)) return null;
  let y = startY;
  while (!collides(board, { type, rotation, x, y: y + 1 })) y++;
  return y;
}

/** Run the full 4-generation BFS poison spread using the production wave helper. */
export function runPoisonSpread(board: CellValue[][], poisonBoard: number[][], variant: number): void {
  const generations = POISON_GENERATIONS - 1; // wave 0 = lock-seed; remaining are spread waves
  for (let gen = 0; gen < generations; gen++) {
    if (spreadPoisonWaveOnce(board, poisonBoard, variant) === 0) break;
  }
}

/** Return a canonical string key for the set of poisoned coordinates. */
export function poisonKey(poisonBoard: number[][]): string {
  const coords: string[] = [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (poisonBoard[y][x] !== 0) coords.push(`${y},${x}`);
    }
  }
  return coords.join('|');
}

/** Enumerate all unique poison variations for a piece type on a board. */
export function enumerateVariations(
  baseBoard: CellValue[][],
  type: ShapeType,
): Map<string, { rotation: RotationState; x: number; y: number }> {
  const seen = new Map<string, { rotation: RotationState; x: number; y: number }>();
  const ROTATIONS: RotationState[] = [0, 1, 2, 3];
  const VARIANT = 1;

  for (const rot of ROTATIONS) {
    for (let x = -2; x < BOARD_COLS + 2; x++) {
      const landY = hardDropY(baseBoard, type, rot, x, 0);
      if (landY === null) continue;

      const board = baseBoard.map((row) => [...row]);
      const poison = createEmptyPoisonBoard();

      const cells = getCells({ type, rotation: rot, x, y: landY });
      let valid = true;
      for (const cell of cells) {
        if (cell.y < 0 || cell.y >= BOARD_ROWS || cell.x < 0 || cell.x >= BOARD_COLS) {
          valid = false;
          break;
        }
        board[cell.y][cell.x] = type;
        poison[cell.y][cell.x] = VARIANT;
      }
      if (!valid) continue;

      runPoisonSpread(board, poison, VARIANT);

      const key = poisonKey(poison);
      if (!seen.has(key)) {
        seen.set(key, { rotation: rot, x, y: landY });
      }
    }
  }
  return seen;
}

// ── Build a sample board with a step-pyramid stack ──────────────────────

export function buildSampleBoard(): CellValue[][] {
  const board = createEmptyBoard();
  const bottom = BOARD_ROWS - 1;
  // Row 0 (bottom): full except col 4
  for (let x = 0; x < BOARD_COLS; x++) {
    if (x !== 4) board[bottom][x] = 'T';
  }
  // Row 1: cols 1-8
  for (let x = 1; x <= 8; x++) {
    board[bottom - 1][x] = 'J';
  }
  // Row 2: cols 2-7
  for (let x = 2; x <= 7; x++) {
    board[bottom - 2][x] = 'L';
  }
  // Row 3: cols 3-6
  for (let x = 3; x <= 6; x++) {
    board[bottom - 3][x] = 'S';
  }
  return board;
}

// ── Print helpers ───────────────────────────────────────────────────────

function printBoard(board: CellValue[][], poisonBoard: number[][], startRow: number, endRow: number): void {
  for (let y = startRow; y <= endRow; y++) {
    let line = '  │';
    for (let x = 0; x < BOARD_COLS; x++) {
      if (poisonBoard[y][x] !== 0) line += 'X';
      else if (board[y][x] !== null) line += '#';
      else line += '.';
    }
    line += '│';
    console.log(line);
  }
  console.log('  └' + '─'.repeat(BOARD_COLS) + '┘');
}

// ── Main (only runs when executed directly) ─────────────────────────────

const isMainModule = typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].replace(/\\/g, '/').endsWith('poison_demo.ts') ||
   process.argv[1].replace(/\\/g, '/').endsWith('poison_demo.js'));

if (isMainModule) {
  const TYPES: ShapeType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const VARIANT = 1;
  const baseBoard = buildSampleBoard();
  const bottomRow = BOARD_ROWS - 1;
  const printStart = bottomRow - 8;

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Poison Spread Variation Demo               ║');
  console.log('║   Legend: . = empty  # = block  X = poisoned ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  console.log('─── Base Board (bottom 9 rows) ───');
  printBoard(baseBoard, createEmptyPoisonBoard(), printStart, bottomRow);
  console.log('');

  let totalVariations = 0;

  for (const type of TYPES) {
    const seen = enumerateVariations(baseBoard, type);

    console.log(`═══ ${type}-Piece: ${seen.size} unique poison variation(s) ═══`);
    let i = 0;
    for (const [, pos] of seen) {
      i++;
      const board = baseBoard.map((row) => [...row]);
      const poison = createEmptyPoisonBoard();
      const cells = getCells({ type, rotation: pos.rotation, x: pos.x, y: pos.y });
      for (const cell of cells) {
        if (cell.y >= 0 && cell.y < BOARD_ROWS && cell.x >= 0 && cell.x < BOARD_COLS) {
          board[cell.y][cell.x] = type;
          poison[cell.y][cell.x] = VARIANT;
        }
      }
      runPoisonSpread(board, poison, VARIANT);

      const poisonCount = poison.flat().filter((v) => v !== 0).length;
      console.log(`  Variation ${i}: rot=${pos.rotation} x=${pos.x} y=${pos.y} → ${poisonCount} cells poisoned`);
      printBoard(board, poison, printStart, bottomRow);
    }
    console.log('');
    totalVariations += seen.size;
  }

  console.log(`════════════════════════════════════════════`);
  console.log(`Total unique poison variations across all pieces: ${totalVariations}`);
  console.log(`════════════════════════════════════════════`);
}
