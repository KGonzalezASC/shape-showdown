import { BOARD_COLS, BOARD_ROWS } from '../../../src/constants.js';
import type { CellValue, ShapeType } from '../../../src/types.js';
import { DEFAULT_PUZZLE_BENCHMARK, type CuratedPuzzleLevel, type TimelineEntry, type TimelineEvent } from '../puzzleTypes.js';

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
 * Cheese Keyhole - staggered multi-row cheese with a 2x2 keyhole and side wells.
 * Freeze mid-opening forces early O/J/L commitment into the keyhole.
 */
export function buildCheeseKeyholeLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3, 7]);
  paintGarbageRow(board, 1, [4, 5, 8]);
  paintGarbageRow(board, 2, [4, 5]);
  paintGarbageRow(board, 3, [2, 6]);

  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'I', 'T', 'S', 'Z'];
  const timeline: TimelineEvent[] = [
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'authored-cheese-keyhole',
    name: 'Cheese Keyhole',
    seed: 1042,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 4 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

/**
 * Frozen Well - left ramp + right stub basin. Freeze at tick 360 (~6s) locks hold
 * mid-human-solve so early holds matter.
 */
export function buildFrozenWellLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintColumnStack(board, 0, 5);
  paintColumnStack(board, 1, 6);
  paintColumnStack(board, 2, 5);
  paintColumnStack(board, 3, 2);
  paintColumnStack(board, 5, 1);
  paintColumnStack(board, 6, 2);
  paintColumnStack(board, 7, 4);
  paintColumnStack(board, 8, 5);
  paintColumnStack(board, 9, 5);

  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'L', 'J', 'I', 'O'];
  const timeline: TimelineEvent[] = [
    { tick: 360, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'authored-well-freeze',
    name: 'Frozen Well',
    seed: 2077,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 5 },
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
 * Skew Stairs - diagonal cheese stairs with retrim→magnet swap-line / speed pressure
 * while ascending the holes in order.
 */
export function buildSkewStairsLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [0, 1]);
  paintGarbageRow(board, 1, [1, 2]);
  paintGarbageRow(board, 2, [2, 3]);
  paintGarbageRow(board, 3, [3, 4, 8]);
  paintGarbageRow(board, 4, [4, 5]);
  paintColumnStack(board, 9, 3);

  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'I', 'T', 'S', 'Z'];
  const timeline: TimelineEvent[] = [
    { tick: 60, kind: 'retrim' },
    { tick: 180, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'authored-skew-stairs',
    name: 'Skew Stairs',
    seed: 3110,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 6 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

/**
 * Pulse Garbage - cheese dig with retrim + magnet synergy (swap-line / speed pressure)
 * plus a mid-run garbage pulse.
 */
export function buildPulseGarbageLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [2, 7]);
  paintGarbageRow(board, 1, [3, 6]);
  paintGarbageRow(board, 2, [4, 5]);
  paintGarbageRow(board, 3, [1, 8]);

  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEvent[] = [
    // Retrim first so swap-line pressure is live before magnet speed.
    { tick: 60, kind: 'retrim' },
    { tick: 150, kind: 'magnet' },
    { tick: 240, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];

  return freezeLevel({
    id: 'authored-pulse-garbage',
    name: 'Pulse Garbage',
    seed: 4201,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 7 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'hidden',
  });
}

/**
 * Cheese Ladder - multi-row staggered cheese with ascending hole ladder.
 * Snag (fortify) mid-climb clamps movement while ascending holes.
 */
export function buildCheeseLadderLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [1]);
  paintGarbageRow(board, 1, [2, 8]);
  paintGarbageRow(board, 2, [3]);
  paintGarbageRow(board, 3, [4, 0]);
  paintGarbageRow(board, 4, [5]);

  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'S', 'Z', 'I', 'T'];
  const timeline: TimelineEvent[] = [
    { tick: 200, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'authored-cheese-ladder',
    name: 'Cheese Ladder',
    seed: 5103,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 8 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

/**
 * Dig Shaft - cheese dig with a preferred shaft lane, garbage pulse, and freeze
 * so the dig must continue under locked-hold pressure.
 */
export function buildDigShaftLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4, 8]);
  paintGarbageRow(board, 1, [4, 1]);
  paintGarbageRow(board, 2, [3, 4]);
  paintGarbageRow(board, 3, [4, 7]);
  paintGarbageRow(board, 4, [2, 5]);
  paintColumnStack(board, 0, 3);
  paintColumnStack(board, 9, 4);

  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEvent[] = [
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { tick: 240, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'authored-dig-shaft',
    name: 'Dig Shaft',
    seed: 6208,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 9 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * T-Slot Setup - T-oriented pocket; early T bankable, late T finishes.
 * Sticky (quickstep) clock pressure while the pocket is prepared.
 */
export function buildTSlotSetupLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3, 4, 5]);
  paintGarbageRow(board, 1, [4]);
  paintGarbageRow(board, 2, [2, 6]);
  paintColumnStack(board, 0, 4);
  paintColumnStack(board, 9, 4);

  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'J', 'L', 'O', 'T'];
  const timeline: TimelineEvent[] = [
    { tick: 180, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'authored-tslot-setup',
    name: 'T-Slot Setup',
    seed: 7331,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 11 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

/**
 * Four Wide - narrow 4-col corridor; hold disabled so every piece commits in-lane.
 * Retrim→magnet adds swap-line / speed pressure inside the corridor (freeze would be
 * a weak beat with hold already off).
 */
export function buildFourWideLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintColumnStack(board, 0, 7);
  paintColumnStack(board, 1, 8);
  paintColumnStack(board, 2, 6);
  paintColumnStack(board, 7, 6);
  paintColumnStack(board, 8, 8);
  paintColumnStack(board, 9, 7);
  paintColumnStack(board, 3, 1);
  paintColumnStack(board, 4, 2);
  paintColumnStack(board, 5, 2);
  paintColumnStack(board, 6, 1);

  const queuePrefix: ShapeType[] = ['I', 'O', 'J', 'L', 'T', 'S', 'Z'];
  const timeline: TimelineEvent[] = [
    { tick: 60, kind: 'retrim' },
    { tick: 150, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'authored-four-wide',
    name: 'Four Wide',
    seed: 8412,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 12 },
    timeline,
    shopPolicy: 'none',
    allowHold: false,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

/** Hold Discipline - center well; freeze at 360 punishes late holds. */
export function buildHoldDisciplineLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintColumnStack(board, 0, 4);
  paintColumnStack(board, 1, 5);
  paintColumnStack(board, 2, 4);
  paintColumnStack(board, 3, 3);
  paintColumnStack(board, 4, 2);
  paintColumnStack(board, 6, 2);
  paintColumnStack(board, 7, 4);
  paintColumnStack(board, 8, 5);
  paintColumnStack(board, 9, 4);

  const queuePrefix: ShapeType[] = ['I', 'S', 'Z', 'O', 'J', 'L', 'T'];
  const timeline: TimelineEvent[] = [
    { tick: 360, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'authored-hold-discipline',
    name: 'Hold Discipline',
    seed: 9550,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 13 },
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
 * Poison Beat - poison (fixed variant) then wildcard-four with the same variant
 * once poison is on the stack and spread has finished (multiplayer prerequisite).
 */
export function buildPoisonBeatLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [1, 6]);
  paintGarbageRow(board, 1, [2, 7]);
  paintGarbageRow(board, 2, [3, 8]);
  paintGarbageRow(board, 3, [4]);

  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'T', 'S', 'Z', 'I'];
  const timeline: TimelineEvent[] = [
    // ~1.5s: poison active piece (variant 2).
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    // Earliest wildcard attempt after lock (~114). Session defers shape lock until
    // poisonSpread finishes (same gate as multiplayer canPurchase). Goal is 10
    // lines so baselines run past full spread + wildcard.
    { tick: 170, kind: 'wildcard', params: { variant: 2 } },
  ];

  return freezeLevel({
    id: 'authored-poison-beat',
    name: 'Poison Beat',
    seed: 10661,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 10 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Curtain Drop - retrim once, then curtain that loops with 200 clear ticks after each curtain ends.
 * Goal stays at 2 lines (short blackout-pressure beat).
 */
export function buildCurtainDropLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [0, 5]);
  paintGarbageRow(board, 1, [1, 6]);
  paintGarbageRow(board, 2, [2, 7]);
  paintGarbageRow(board, 3, [3, 8]);

  const queuePrefix: ShapeType[] = ['T', 'J', 'L', 'O', 'S', 'Z', 'I'];
  const timeline: TimelineEntry[] = [
    // Retrim once (synergy setup before first curtain).
    { tick: 60, kind: 'retrim' },
    // First curtain at 180; after curtain finishes, 200 idle ticks, then curtain again.
    {
      loop: {
        startTick: 180,
        periodTicks: 200,
        sequence: [{ at: 0, kind: 'curtain' }],
      },
    },
  ];

  return freezeLevel({
    id: 'authored-curtain-drop',
    name: 'Curtain Drop',
    seed: 11770,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 2 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'hidden',
  });
}

/**
 * Late I Well - deep well that wants a late I; awkward early S/Z/O force setup.
 * Freeze mid-setup punishes banking the I too late.
 */
export function buildLateIWellLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintColumnStack(board, 0, 6);
  paintColumnStack(board, 1, 7);
  paintColumnStack(board, 2, 6);
  paintColumnStack(board, 3, 5);
  paintColumnStack(board, 5, 5);
  paintColumnStack(board, 6, 6);
  paintColumnStack(board, 7, 7);
  paintColumnStack(board, 8, 6);
  paintColumnStack(board, 9, 5);

  const queuePrefix: ShapeType[] = ['S', 'Z', 'O', 'J', 'L', 'T', 'I'];
  const timeline: TimelineEvent[] = [
    { tick: 360, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'authored-late-i-well',
    name: 'Late I Well',
    seed: 12880,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 15 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

export function buildAuthoredLevels(): CuratedPuzzleLevel[] {
  return [
    buildCheeseKeyholeLevel(),
    buildFrozenWellLevel(),
    buildSkewStairsLevel(),
    buildPulseGarbageLevel(),
    buildCheeseLadderLevel(),
    buildDigShaftLevel(),
    buildTSlotSetupLevel(),
    buildFourWideLevel(),
    buildHoldDisciplineLevel(),
    buildPoisonBeatLevel(),
    buildCurtainDropLevel(),
    buildLateIWellLevel(),
  ];
}

