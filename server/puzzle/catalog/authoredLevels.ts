import { BOARD_COLS, BOARD_ROWS } from '../../../src/constants.js';
import type { CellValue, ShapeType } from '../../../src/types.js';
import { DEFAULT_PUZZLE_BENCHMARK, type CuratedPuzzleLevel, type TimelineEvent } from '../puzzleTypes.js';

/** Empty 20x10 board. */
export function emptyBoard(): CellValue[][] {
  return Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null));
}

/** Paint a bottom-up garbage row with holes. `rowFromBottom` 0 = floor. */
export function paintGarbageRow(
  board: CellValue[][],
  rowFromBottom: number,
  holeCols: readonly number[],
): void {
  const y = BOARD_ROWS - 1 - rowFromBottom;
  if (y < 0 || y >= BOARD_ROWS) throw new Error(`rowFromBottom out of range: ${rowFromBottom}`);
  const holes = new Set(holeCols);
  for (let x = 0; x < BOARD_COLS; x++) {
    board[y][x] = holes.has(x) ? null : 'G';
  }
}

function freezeLevel<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Cheese Keyhole — staggered multi-row cheese with a 2x2 keyhole and side wells.
 * Intended path leans on O into the keyhole, then J/L to plug remaining holes;
 * wrong order leaves awkward overhangs.
 */
export function buildCheeseKeyholeLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Bottom → top (rowFromBottom): staggered cheese + central 2x2 keyhole at cols 4-5.
  // r0: holes 3, 7        — side notches
  // r1: holes 4, 5, 8     — keyhole bottom + right well
  // r2: holes 4, 5        — keyhole top (O pocket with r1)
  // r3: holes 2, 6        — upper stagger (forces follow-up after O)
  paintGarbageRow(board, 0, [3, 7]);
  paintGarbageRow(board, 1, [4, 5, 8]);
  paintGarbageRow(board, 2, [4, 5]);
  paintGarbageRow(board, 3, [2, 6]);

  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'I', 'T', 'S', 'Z'];

  return freezeLevel({
    id: 'authored-cheese-keyhole',
    name: 'Cheese Keyhole',
    seed: 1042,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
    timeline: [],
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

/**
 * Frozen Well — open center well with a T-slot floor. Hold is useful for the
 * late T; a mid-puzzle freeze locks the hold chamber so timing matters.
 */
export function buildFrozenWellLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Center well (col 4) three deep, with a T-flat pocket on the floor (cols 3-5)
  // and supporting side stacks. No floating cells.
  // r0: holes 3, 4, 5     — T-slot / well mouth
  // r1: hole 4            — well
  // r2: hole 4            — well
  // r3: holes 4, 8        — well + right cheese hole (second clear target)
  // r4: hole 8            — stacked over r3 hole (supported column)
  paintGarbageRow(board, 0, [3, 4, 5]);
  paintGarbageRow(board, 1, [4]);
  paintGarbageRow(board, 2, [4]);
  paintGarbageRow(board, 3, [4, 8]);
  paintGarbageRow(board, 4, [8]);

  // Awkward early T: better held for the floor slot; I plugs the well.
  // Freeze mid-run so hold-before-freeze is the intended beat.
  const queuePrefix: ShapeType[] = ['T', 'I', 'L', 'J', 'S', 'Z', 'O'];
  const timeline: TimelineEvent[] = [
    { tick: 100, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'authored-well-freeze',
    name: 'Frozen Well',
    seed: 2077,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 2 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: {
      metric: 'ticks',
      direction: 'minimize',
      tieBreakers: [{ metric: 'pieces', direction: 'minimize' }],
    },
    visibilityPolicy: 'partial',
  });
}

export function buildAuthoredLevels(): CuratedPuzzleLevel[] {
  return [buildCheeseKeyholeLevel(), buildFrozenWellLevel()];
}
