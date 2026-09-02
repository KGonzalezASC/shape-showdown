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

/** Solid garbage column stack of `height` resting on the floor (no floating cells). */
export function paintColumnStack(board: CellValue[][], col: number, height: number): void {
  if (col < 0 || col >= BOARD_COLS) throw new Error(`col out of range: ${col}`);
  if (height < 0 || height >= BOARD_ROWS) throw new Error(`height out of range: ${height}`);
  for (let i = 0; i < height; i++) {
    board[BOARD_ROWS - 1 - i][col] = 'G';
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
 * Frozen Well — left ramp + right stub basin. Early T is worth holding for the
 * basin floor; freeze at tick 360 (~6s) locks hold mid-human-solve so early holds matter.
 */
export function buildFrozenWellLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Messy basin: deep left ramp, narrow center gaps, right stub wall.
  // Not a clean I-well — needs several packs to reach 3 line clears.
  // Heights (supported): 0:5 1:6 2:5 3:2 4:0 5:1 6:2 7:4 8:5 9:5
  paintColumnStack(board, 0, 5);
  paintColumnStack(board, 1, 6);
  paintColumnStack(board, 2, 5);
  paintColumnStack(board, 3, 2);
  paintColumnStack(board, 5, 1);
  paintColumnStack(board, 6, 2);
  paintColumnStack(board, 7, 4);
  paintColumnStack(board, 8, 5);
  paintColumnStack(board, 9, 5);

  // Hold the early T for a later floor tuck; S/Z force setup work first.
  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'L', 'J', 'I', 'O'];
  const timeline: TimelineEvent[] = [
    // ~6s in at 60Hz: several pieces in before hold freezes for ~15s.
    { tick: 360, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'authored-well-freeze',
    name: 'Frozen Well',
    seed: 2077,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
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


/**
 * Skew Stairs — diagonal cheese stairs with a forced queue that rewards
 * committing to the ascending holes in order (J/L plugs, then O/I finish).
 * Wrong order leaves unreachable overhangs. No timeline.
 */
export function buildSkewStairsLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Diagonal cheese stairs: holes march right; upper row adds a second skew lane.
  paintGarbageRow(board, 0, [0, 1]);
  paintGarbageRow(board, 1, [1, 2]);
  paintGarbageRow(board, 2, [2, 3]);
  paintGarbageRow(board, 3, [3, 4, 8]);
  paintGarbageRow(board, 4, [4, 5]);
  // Soft right buttress so clears favor the stair lane.
  paintColumnStack(board, 9, 3);

  // Forced order: J seats the low left step, L the mid skew, O flats, I cleans height.
  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'I', 'T', 'S', 'Z'];

  return freezeLevel({
    id: 'authored-skew-stairs',
    name: 'Skew Stairs',
    seed: 3110,
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
 * Pulse Garbage — shallow-to-mid cheese dig with a mid-run garbage timeline
 * beat. Hold allowed; upcoming hazards / queue stay hidden.
 */
export function buildPulseGarbageLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Messy 4-row cheese: needs several packs to reach 3 clears.
  paintGarbageRow(board, 0, [2, 7]);
  paintGarbageRow(board, 1, [3, 6]);
  paintGarbageRow(board, 2, [4, 5]);
  paintGarbageRow(board, 3, [1, 8]);

  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEvent[] = [
    // ~1.5s: garbage pulse lands mid-opening so the player must replan.
    { tick: 90, kind: 'garbage', params: { lines: 2, delayTicks: 12 } },
  ];

  return freezeLevel({
    id: 'authored-pulse-garbage',
    name: 'Pulse Garbage',
    seed: 4201,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'hidden',
  });
}

export function buildAuthoredLevels(): CuratedPuzzleLevel[] {
  return [
    buildCheeseKeyholeLevel(),
    buildFrozenWellLevel(),
    buildSkewStairsLevel(),
    buildPulseGarbageLevel(),
  ];
}
