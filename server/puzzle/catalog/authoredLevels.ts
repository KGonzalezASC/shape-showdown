import { BOARD_COLS, BOARD_ROWS } from '../../../src/constants.js';
import type { CellValue, ShapeType } from '../../../src/types.js';
import { DEFAULT_PUZZLE_BENCHMARK, type LegacyCuratedPuzzleLevel, type TimelineEntry, type TimelineEvent } from '../puzzleTypes.js';

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
export function buildCheeseKeyholeLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3, 7]);
  paintGarbageRow(board, 1, [4, 5, 8]);
  paintGarbageRow(board, 2, [4, 5]);
  paintGarbageRow(board, 3, [2, 6]);

  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'I', 'T', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 7, kind: 'sticky' },
    { afterPieces: 9, kind: 'curtain' },
    { afterPieces: 11, kind: 'snag' },
    { afterPieces: 13, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 15, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 17, kind: 'retrim' },
    { afterPieces: 19, kind: 'magnet', params: { stacks: 1 } },
  ];

  return freezeLevel({
    id: 'authored-cheese-keyhole',
    name: 'Cheese Keyhole',
    description: 'Downstack through the central keyhole to clear all 4 cheese rows under lateral snags and hold freezes.',
    seed: 1001,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
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
export function buildFrozenWellLevel(): LegacyCuratedPuzzleLevel {
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
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 3, kind: 'snag' },
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 7, kind: 'magnet' },
    { afterPieces: 9, kind: 'sticky' },
    { afterPieces: 11, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 13, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 15, kind: 'curtain' },
    { afterPieces: 17, kind: 'retrim' },
    { afterPieces: 19, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 21, kind: 'snag' },
    { afterPieces: 23, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 25, kind: 'sticky' },
    { afterPieces: 27, kind: 'freeze', params: { durationTicks: 360 } },
  ];

  return freezeLevel({
    id: 'authored-well-freeze',
    name: 'Frozen Well',
    description: 'Navigate an icy well with a frozen hold chamber and persistent magnetic pulls.',
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
export function buildSkewStairsLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [0, 1]);
  paintGarbageRow(board, 1, [1, 2]);
  paintGarbageRow(board, 2, [2, 3]);
  paintGarbageRow(board, 3, [3, 4, 8]);
  paintGarbageRow(board, 4, [4, 5]);
  paintColumnStack(board, 9, 3);

  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'I', 'T', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 4, kind: 'curtain' },
    { afterPieces: 6, kind: 'sticky' },
    { afterPieces: 8, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 10, kind: 'magnet' },
    { afterPieces: 12, kind: 'snag' },
    { afterPieces: 14, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 16, kind: 'retrim' },
    { afterPieces: 18, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 20, kind: 'curtain' },
    { afterPieces: 22, kind: 'sticky' },
    { afterPieces: 24, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 26, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'authored-skew-stairs',
    name: 'Skew Stairs',
    description: 'Climb the staggered stair stack while dodging snags and swap line re-trims.',
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
export function buildPulseGarbageLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [2, 7]);
  paintGarbageRow(board, 1, [3, 6]);
  paintGarbageRow(board, 2, [4, 5]);
  paintGarbageRow(board, 3, [1, 8]);

  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 8, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 11, kind: 'sticky' },
    { afterPieces: 14, kind: 'magnet' },
    { afterPieces: 17, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 20, kind: 'curtain' },
    { afterPieces: 23, kind: 'snag' },
    { afterPieces: 26, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 29, kind: 'sticky' },
    { afterPieces: 32, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 35, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 38, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'authored-pulse-garbage',
    name: 'Pulse Garbage',
    description: 'Survive successive single-line garbage pulses and hold freezes in a tense downstack scramble.',
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
export function buildCheeseLadderLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [1]);
  paintGarbageRow(board, 1, [2, 8]);
  paintGarbageRow(board, 2, [3]);
  paintGarbageRow(board, 3, [4, 0]);
  paintGarbageRow(board, 4, [5]);

  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'S', 'Z', 'I', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 4, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 6, kind: 'sticky' },
    { afterPieces: 8, kind: 'magnet' },
    { afterPieces: 10, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 12, kind: 'curtain' },
    { afterPieces: 14, kind: 'snag' },
    { afterPieces: 16, kind: 'retrim' },
    { afterPieces: 18, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 20, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 22, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 24, kind: 'sticky' },
    { afterPieces: 26, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'authored-cheese-ladder',
    name: 'Cheese Ladder',
    description: 'Clean the diagonal cheese ladder while managing shifting swap lines, freeze pressure, and sticky lock limits.',
    seed: 5103,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
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
export function buildDigShaftLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4, 8]);
  paintGarbageRow(board, 1, [4, 1]);
  paintGarbageRow(board, 2, [3, 4]);
  paintGarbageRow(board, 3, [4, 7]);
  paintGarbageRow(board, 4, [4, 2]);

  const queuePrefix: ShapeType[] = ['I', 'J', 'L', 'T', 'O', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 8, kind: 'snag' },
    { afterPieces: 11, kind: 'retrim' },
    { afterPieces: 14, kind: 'sticky' },
    { afterPieces: 17, kind: 'curtain' },
    { afterPieces: 20, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 23, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 26, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 29, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'authored-dig-shaft',
    name: 'Dig Shaft',
    description: 'Drill through column 4 and eliminate all garbage under recurring retrim and hold freeze cycles.',
    seed: 6006,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
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
export function buildTSlotSetupLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3, 4, 5]);
  paintGarbageRow(board, 1, [4]);
  paintGarbageRow(board, 2, [2, 6]);
  paintColumnStack(board, 0, 4);
  paintColumnStack(board, 9, 4);

  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'J', 'L', 'O', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 3, kind: 'snag' },
    { afterPieces: 6, kind: 'magnet' },
    { afterPieces: 9, kind: 'curtain' },
    { afterPieces: 12, kind: 'retrim' },
    { afterPieces: 15, kind: 'snag' },
    { afterPieces: 18, kind: 'sticky' },
    { afterPieces: 21, kind: 'curtain' },
    { afterPieces: 24, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 27, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 30, kind: 'sticky' },
    { afterPieces: 33, kind: 'retrim' },
    { afterPieces: 36, kind: 'sticky' },
    { afterPieces: 39, kind: 'curtain' },
    { afterPieces: 42, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'authored-tslot-setup',
    name: 'T-Slot Setup',
    description: 'Build and execute precise T-spin clears to reach the line-clear target.',
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
export function buildFourWideLevel(): LegacyCuratedPuzzleLevel {
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
  const timeline: TimelineEntry[] = [
    { afterPieces: 3, kind: 'magnet' },
    { afterPieces: 6, kind: 'sticky' },
    { afterPieces: 9, kind: 'snag' },
    { afterPieces: 12, kind: 'curtain' },
    { afterPieces: 15, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 18, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 21, kind: 'sticky' },
    { afterPieces: 24, kind: 'magnet' },
    { afterPieces: 27, kind: 'retrim' },
    { afterPieces: 30, kind: 'snag' },
    { afterPieces: 34, kind: 'sticky' },
    { afterPieces: 38, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'authored-four-wide',
    name: 'Four Wide',
    description: 'Maintain a sustained 4-wide center combo under sticky lock pressure and rising tension.',
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
export function buildHoldDisciplineLevel(): LegacyCuratedPuzzleLevel {
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
  const timeline: TimelineEntry[] = [
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 6, kind: 'sticky' },
    { afterPieces: 9, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 12, kind: 'retrim' },
    { afterPieces: 15, kind: 'magnet' },
    { afterPieces: 18, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 21, kind: 'snag' },
    { afterPieces: 24, kind: 'sticky' },
    { afterPieces: 27, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 30, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 33, kind: 'curtain' },
    { afterPieces: 36, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 39, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 42, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'authored-hold-discipline',
    name: 'Hold Discipline',
    description: 'Endure heavy hold freezes while maintaining downstack momentum and stack balance.',
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
export function buildPoisonBeatLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [1, 6]);
  paintGarbageRow(board, 1, [2, 7]);
  paintGarbageRow(board, 2, [3, 8]);
  paintGarbageRow(board, 3, [4]);

  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'T', 'S', 'Z', 'I'];
  const timeline: TimelineEntry[] = [
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    { tick: 170, kind: 'wildcard', params: { variant: 2 } },
    { afterPieces: 6, kind: 'retrim' },
    { afterPieces: 10, kind: 'curtain' },
    { afterPieces: 15, kind: 'poison', params: { variant: 2 } },
    { afterPieces: 18, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 22, kind: 'purge', params: { variant: 2 } },
    { afterPieces: 25, kind: 'sticky' },
    { afterPieces: 28, kind: 'snag' },
    { afterPieces: 32, kind: 'curtain' },
  ];

  return freezeLevel({
    id: 'authored-poison-beat',
    name: 'Poison Beat',
    description: 'Survive spreading poison minos, then cleanse the board with well-timed wildcards.',
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
 * Curtain Drop — hybrid survive + lines (compound goal).
 * Bot clears ~12 lines in ~750 ticks under sparse curtain pressure; human horizon
 * is ×3 ≈ 2250 ticks. Retrim once up front; curtains stay sparse (not a dense
 * loop); mid/late magnet escalator punishes lingering. Win = alive at horizon
 * AND linesCleared >= 12.
 */
export function buildCurtainDropLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [0, 5]);
  paintGarbageRow(board, 1, [1, 6]);
  paintGarbageRow(board, 2, [2, 7]);
  paintGarbageRow(board, 3, [3, 8]);

  const queuePrefix: ShapeType[] = ['T', 'J', 'L', 'O', 'S', 'Z', 'I'];
  // Bot clear ≈ 750 ticks with this sparse beat → human horizon 2250 (×3).
  const timeline: TimelineEntry[] = [
    { tick: 90, kind: 'retrim' },
    { tick: 520, kind: 'curtain' },
    { tick: 1280, kind: 'curtain' },
    { tick: 1850, kind: 'snag' },
    { afterPieces: 12, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { afterPieces: 20, kind: 'freeze', params: { durationTicks: 240 } },
    { afterPieces: 28, kind: 'sticky' },
    { afterPieces: 40, kind: 'retrim' },
    { afterPieces: 52, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { afterPieces: 65, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 78, kind: 'curtain' },
    { afterPieces: 90, kind: 'sticky' },
    { afterPieces: 105, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'authored-curtain-drop',
    name: 'Curtain Drop',
    description: 'Survive 2250 ticks of dense hazard loops while managing line clears under intermittent curtain blindness.',
    seed: 11770,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'survive-clear', ticks: 2250, lines: 12 },
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
export function buildLateIWellLevel(): LegacyCuratedPuzzleLevel {
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
  const timeline: TimelineEntry[] = [
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 7, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 10, kind: 'retrim' },
    { afterPieces: 13, kind: 'curtain' },
    { afterPieces: 16, kind: 'snag' },
    { afterPieces: 19, kind: 'sticky' },
    { afterPieces: 22, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 25, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 28, kind: 'retrim' },
    { afterPieces: 31, kind: 'sticky' },
    { afterPieces: 34, kind: 'retrim' },
    { afterPieces: 37, kind: 'snag' },
    { afterPieces: 40, kind: 'curtain' },
    { afterPieces: 43, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'authored-late-i-well',
    name: 'Late I Well',
    description: 'Keep the stack clean and survive without hold until the late I-piece well arrives.',
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


/**
 * Trial import — Jstris map 66 "Checkboard pattern"
 * Source: https://jstris.jezevec10.com/map/66 (API maps/api/66).
 * Famous as "theoretically hardest map to downstack." Board decoded from base64
 * `data` as 200 nibbles (20×10); non-zero cells → garbage. Upper checkerboard
 * rows omitted for spawn headroom (kept authentic bottom 8 rows from decode).
 * Original queue was null (random); authored dig-oriented prefix. finish=0
 * (default clear-map) approximated as clear-lines:4 partial dig.
 */
export function buildImportJstrisCheckboardLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  // Bottom 8 rows of decoded checkerboard (jstris rows 12–19), holes alternate.
  paintGarbageRow(board, 0, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 1, [1, 3, 5, 7, 9]);
  paintGarbageRow(board, 2, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 3, [1, 3, 5, 7, 9]);
  paintGarbageRow(board, 4, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 5, [1, 3, 5, 7, 9]);
  paintGarbageRow(board, 6, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 7, [1, 3, 5, 7, 9]);

  // Map queue was null; provide a dig-friendly bag prefix.
  const queuePrefix: ShapeType[] = ['I', 'T', 'L', 'J', 'O', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'magnet' },
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 8, kind: 'retrim' },
    { afterPieces: 10, kind: 'magnet' },
    { afterPieces: 12, kind: 'curtain' },
    { afterPieces: 14, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 16, kind: 'sticky' },
    { afterPieces: 18, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 20, kind: 'retrim' },
    { afterPieces: 22, kind: 'snag' },
    { afterPieces: 24, kind: 'curtain' },
    { afterPieces: 26, kind: 'freeze', params: { durationTicks: 360 } },
  ];

  return freezeLevel({
    id: 'import-jstris-checkboard',
    name: 'Jstris: Checkboard pattern',
    description: 'Clear alternating checkerboard garbage lines while balancing sticky and magnet interference.',
    seed: 66066,
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
 * Trial import — Jstris map 255 "Ultimate 29-combo"
 * Source: https://jstris.jezevec10.com/map/255 (API maps/api/255).
 * Board decoded from base64 `data` as 200 nibbles (20×10); non-zero → garbage.
 * Authentic bottom 2 combo rows (filled except the hole column) kept for spawn
 * headroom; full 19-row stack tops out the bot.
 * Exact API static queue as queuePrefix.
 * Goal: clear-lines (not full Jstris PC — too long/annoying for solo).
 * Timeline demos piece-scheduled beats (freeze@5, curtain@12, snag@20) mixed with
 * a couple early tick beats. Avoids poison/wildcard on this map.
 */
export function buildImportJstrisUltimate29ComboLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  // Authentic jstris bottom 2 rows (r19 hole@9, r18 hole@6): walls filled, hole open.
  paintGarbageRow(board, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  paintGarbageRow(board, 1, [0, 1, 2, 3, 4, 5, 7, 8, 9]);

  // Exact API queue: ILZSJOITLZJOITSLOTISJZJOITZSLZI
  const queuePrefix: ShapeType[] = [
    'I', 'L', 'Z', 'S', 'J', 'O', 'I', 'T', 'L', 'Z', 'J', 'O', 'I', 'T', 'S',
    'L', 'O', 'T', 'I', 'S', 'J', 'Z', 'J', 'O', 'I', 'T', 'Z', 'S', 'L', 'Z', 'I',
  ];
  // Piece-scheduled pressure + light early tick beats (no multi-minute tick slog).
  const timeline: TimelineEntry[] = [
    { tick: 100, kind: 'magnet' },
    { tick: 220, kind: 'sticky' },
    { tick: 340, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { tick: 460, kind: 'magnet' },
    { tick: 580, kind: 'sticky' },
    { tick: 720, kind: 'magnet' },
    { tick: 860, kind: 'sticky' },
    { afterPieces: 8, kind: 'curtain' },
    { afterPieces: 14, kind: 'snag' },
    { afterPieces: 22, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'import-jstris-ultimate-29-combo',
    name: 'Jstris: Ultimate 29-combo',
    description: 'Unleash a massive 29-combo chain down the central corridor under speed pressure.',
    seed: 255255,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 10 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

/**
 * Trial import — Hard Drop center 4-wide (3 residuals) dig/combo board.
 * Source: https://harddrop.com/forums/index.php?topic=7955 (published fumen;
 * editor https://harddrop.com/fumen/?v115@deC8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeD8wwA8DeC8whxwDei0whwwAtDeRpg0whBtR4BeRpglwhAtR4CeilJeAgWNAzno2AyYU5DkQ0CETBAAA).
 * Decoded via tetris-fumen; colored cells → G. Kept bottom 10 rows (3-res
 * residual + wall columns) for spawn headroom vs full 16-row source stack.
 * No quiz queue in fumen; fixed 4-wide-oriented prefix. clear-lines:6 dig goal.
 */
export function buildImportFumenC4w3resLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  // Bottom residual rows from decoded fumen (y=0 floor), then center-4 walls.
  paintGarbageRow(board, 0, [4, 5, 6]);
  paintGarbageRow(board, 1, [5, 6]);
  paintGarbageRow(board, 2, [3, 4, 5, 6]);
  paintGarbageRow(board, 3, [3, 4, 5, 6]);
  paintGarbageRow(board, 4, [3, 4, 5, 6]);
  paintGarbageRow(board, 5, [3, 4, 5, 6]);
  paintGarbageRow(board, 6, [3, 4, 5, 6]);
  paintGarbageRow(board, 7, [3, 4, 5, 6]);
  paintGarbageRow(board, 8, [3, 4, 5, 6]);
  paintGarbageRow(board, 9, [3, 4, 5, 6]);

  const queuePrefix: ShapeType[] = ['I', 'T', 'L', 'J', 'S', 'Z', 'O', 'I', 'T', 'L', 'J', 'S', 'Z', 'O'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'sticky' },
    { afterPieces: 3, kind: 'magnet' },
    { afterPieces: 5, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 7, kind: 'retrim' },
    { afterPieces: 9, kind: 'sticky' },
    { afterPieces: 11, kind: 'snag' },
    { afterPieces: 13, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 15, kind: 'curtain' },
    { afterPieces: 17, kind: 'sticky' },
    { afterPieces: 19, kind: 'magnet' },
    { afterPieces: 22, kind: 'retrim' },
    { afterPieces: 25, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'import-fumen-c4w-3res',
    name: 'Hard Drop: Center 4-wide 3-res',
    description: 'Execute high-level Hard Drop 4-wide combo downstacking against incoming garbage.',
    seed: 79557,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 6 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

// --- BEGIN JSTRIS BATCH20 ---
/**
 * Import — Jstris map 2 "Perfect clear how?"
 * Source: https://jstris.jezevec10.com/map/2 (API maps/api/2).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 4 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * PC opener; piece-scheduled curtain→snag→magnet. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisPerfectClearHowLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [2, 3, 4, 5, 7, 8]);
  paintGarbageRow(board, 1, [2, 3, 4, 5]);
  paintGarbageRow(board, 2, [2, 3, 4, 5, 7, 8]);
  paintGarbageRow(board, 3, [2, 3, 4, 5, 6, 7, 8, 9]);

  const queuePrefix: ShapeType[] = ['S', 'J', 'I', 'L', 'S', 'Z', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 7, kind: 'magnet' },
    { afterPieces: 9, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 11, kind: 'snag' },
    { afterPieces: 13, kind: 'curtain' },
    { afterPieces: 15, kind: 'retrim' },
    { afterPieces: 17, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 19, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 21, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 23, kind: 'sticky' },
    { afterPieces: 25, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'import-jstris-perfect-clear-how',
    name: 'Jstris: Perfect clear how?',
    description: 'Downstack the 4-row cheese block to clear all garbage while navigating alternating magnets, snags, and swap re-trims.',
    seed: 2002,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 15 "Clear the rainbow"
 * Source: https://jstris.jezevec10.com/map/15 (API maps/api/15).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Well dig; retrim→magnet + garbage pulse. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisClearTheRainbowLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [7, 8, 9]);
  paintGarbageRow(board, 1, [7, 8, 9]);
  paintGarbageRow(board, 2, [7, 8, 9]);
  paintGarbageRow(board, 3, [7, 8, 9]);
  paintGarbageRow(board, 4, [7, 8, 9]);
  paintGarbageRow(board, 5, [7, 8, 9]);
  paintGarbageRow(board, 6, [7, 8, 9]);
  paintGarbageRow(board, 7, [7, 8, 9]);

  const queuePrefix: ShapeType[] = ['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'sticky' },
    { afterPieces: 3, kind: 'magnet' },
    { afterPieces: 5, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 7, kind: 'snag' },
    { afterPieces: 9, kind: 'retrim' },
    { afterPieces: 11, kind: 'curtain' },
    { afterPieces: 13, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 15, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 17, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 19, kind: 'sticky' },
    { afterPieces: 21, kind: 'retrim' },
    { afterPieces: 23, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];

  return freezeLevel({
    id: 'import-jstris-clear-the-rainbow',
    name: 'Jstris: Clear the rainbow',
    description: 'Clear the entire 8-row rainbow stack using an I-piece stream while weathering magnets, stickies, and snags.',
    seed: 15015,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 24 "Lspins (Easy)"
 * Source: https://jstris.jezevec10.com/map/24 (API maps/api/24).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * L-spin stack; sticky→freeze→snag afterPieces. Goal clear-lines:5.
 */
export function buildImportJstrisLspinsEasyLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [6, 7]);
  paintGarbageRow(board, 1, [6]);
  paintGarbageRow(board, 2, [6]);
  paintGarbageRow(board, 3, [6, 7, 8]);
  paintGarbageRow(board, 4, [7, 8]);
  paintGarbageRow(board, 5, [2, 3]);
  paintGarbageRow(board, 6, [3]);
  paintGarbageRow(board, 7, [3]);

  const queuePrefix: ShapeType[] = ['L', 'T', 'S', 'J', 'T', 'T', 'L', 'T', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'curtain' },
    { afterPieces: 4, kind: 'snag' },
    { afterPieces: 6, kind: 'sticky' },
    { afterPieces: 8, kind: 'retrim' },
    { afterPieces: 10, kind: 'magnet' },
    { afterPieces: 12, kind: 'curtain' },
    { afterPieces: 14, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 16, kind: 'snag' },
    { afterPieces: 18, kind: 'sticky' },
    { afterPieces: 20, kind: 'retrim' },
    { afterPieces: 22, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 24, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-lspins-easy',
    name: 'Jstris: Lspins (Easy)',
    description: 'Execute clean L-spin twists into snug overhangs to clear lines under pressure.',
    seed: 24024,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 5 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 45 "Cheese 10"
 * Source: https://jstris.jezevec10.com/map/45 (API maps/api/45).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 10 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Cheese 10; garbage→purge→magnet ticks. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisCheese10Level(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4]);
  paintGarbageRow(board, 1, [0]);
  paintGarbageRow(board, 2, [3]);
  paintGarbageRow(board, 3, [8]);
  paintGarbageRow(board, 4, [6]);
  paintGarbageRow(board, 5, [2]);
  paintGarbageRow(board, 6, [7]);
  paintGarbageRow(board, 7, [9]);
  paintGarbageRow(board, 8, [5]);
  paintGarbageRow(board, 9, [1]);

  const queuePrefix: ShapeType[] = ['J', 'L', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'I', 'O', 'T', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 6, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 10, kind: 'snag' },
    { afterPieces: 14, kind: 'retrim' },
    { afterPieces: 18, kind: 'magnet' },
    { afterPieces: 22, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 26, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 30, kind: 'sticky' },
    { afterPieces: 34, kind: 'retrim' },
    { afterPieces: 38, kind: 'magnet', params: { stacks: 1 } },
  ];

  return freezeLevel({
    id: 'import-jstris-cheese-10',
    name: 'Jstris: Cheese 10',
    description: 'Classic 10-line Cheese Race downstack: clear all 10 lines of messy single-hole cheese while surviving hazards.',
    seed: 28028,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 53 "Clog"
 * Source: https://jstris.jezevec10.com/map/53 (API maps/api/53).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Clog chambers; snag + piece retrim/curtain. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisClogLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [1, 2]);
  paintGarbageRow(board, 1, [1, 2, 3, 4, 5, 6, 7, 8]);
  paintGarbageRow(board, 2, [1, 2, 3, 4, 5, 6, 7, 8]);
  paintGarbageRow(board, 3, [7, 8]);
  paintGarbageRow(board, 4, [7, 8]);
  paintGarbageRow(board, 5, [1, 2, 3, 4, 5, 6, 7, 8]);
  paintGarbageRow(board, 6, [1, 2, 3, 4, 5, 6, 7, 8]);
  paintGarbageRow(board, 7, [1, 2]);

  const queuePrefix: ShapeType[] = ['O', 'J', 'O', 'O', 'L', 'O', 'L', 'O', 'O', 'J', 'O', 'J', 'O', 'O', 'L', 'O', 'L', 'O', 'O', 'J', 'O'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'curtain' },
    { afterPieces: 5, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 8, kind: 'magnet' },
    { afterPieces: 11, kind: 'sticky' },
    { afterPieces: 14, kind: 'snag' },
    { afterPieces: 17, kind: 'retrim' },
    { afterPieces: 20, kind: 'curtain' },
    { afterPieces: 23, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 26, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 29, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 32, kind: 'sticky' },
    { afterPieces: 35, kind: 'snag' },
    { afterPieces: 38, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'import-jstris-clog',
    name: 'Jstris: Clog',
    description: 'Unclog a tricky garbage bottleneck under swap line shifts and lateral snags.',
    seed: 53053,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 7 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 61 "s-spin triple"
 * Source: https://jstris.jezevec10.com/map/61 (API maps/api/61).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * S-spin triple; sticky→magnet + late purge. Goal clear-lines:5.
 */
export function buildImportJstrisSSpinTripleLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3]);
  paintGarbageRow(board, 1, [3, 4]);
  paintGarbageRow(board, 2, [4]);
  paintGarbageRow(board, 3, [5]);
  paintGarbageRow(board, 4, [4, 5]);
  paintGarbageRow(board, 5, [4]);
  paintGarbageRow(board, 6, [3]);
  paintGarbageRow(board, 7, [3, 4]);

  const queuePrefix: ShapeType[] = ['S', 'Z', 'S', 'Z', 'S', 'O', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'retrim' },
    { afterPieces: 3, kind: 'snag' },
    { afterPieces: 5, kind: 'curtain' },
    { afterPieces: 7, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 9, kind: 'sticky' },
    { afterPieces: 11, kind: 'magnet' },
    { afterPieces: 13, kind: 'snag' },
    { afterPieces: 15, kind: 'sticky' },
    { afterPieces: 17, kind: 'snag' },
    { afterPieces: 19, kind: 'curtain' },
    { afterPieces: 21, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 23, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'import-jstris-s-spin-triple',
    name: 'Jstris: s-spin triple',
    description: 'Thread S-pieces into complex overhang pockets for triple line clears.',
    seed: 61061,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 5 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 70 "drilltris 1"
 * Source: https://jstris.jezevec10.com/map/70 (API maps/api/70).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Drill shaft; early garbage + mid freeze. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisDrilltris1Level(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, []);
  paintGarbageRow(board, 1, []);
  paintGarbageRow(board, 2, [4]);
  paintGarbageRow(board, 3, [4]);
  paintGarbageRow(board, 4, [4]);
  paintGarbageRow(board, 5, [4]);
  paintGarbageRow(board, 6, []);
  paintGarbageRow(board, 7, [4]);

  const queuePrefix: ShapeType[] = [
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I'
  ];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'garbage', params: { lines: 1, delayTicks: 6 } },
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 5, kind: 'curtain' },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 7, kind: 'garbage', params: { lines: 1, delayTicks: 6 } },
    { afterPieces: 8, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 9, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 10, kind: 'sticky' },
    { afterPieces: 11, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'import-jstris-drilltris-1',
    name: 'Jstris: drilltris 1',
    description: 'Drill through the central vertical channel and completely eliminate all solid garbage walls.',
    seed: 70070,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 71 "drilltris 2"
 * Source: https://jstris.jezevec10.com/map/71 (API maps/api/71).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Drill 2; retrim + sparse curtain loop + late magnet. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisDrilltris2Level(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, []);
  paintGarbageRow(board, 1, []);
  paintGarbageRow(board, 2, [4]);
  paintGarbageRow(board, 3, [4]);
  paintGarbageRow(board, 4, [4]);
  paintGarbageRow(board, 5, [4]);
  paintGarbageRow(board, 6, []);
  paintGarbageRow(board, 7, [4]);

  const queuePrefix: ShapeType[] = [
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I'
  ];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'garbage', params: { lines: 1, delayTicks: 6 } },
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 4, kind: 'snag' },
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 6, kind: 'sticky' },
    { afterPieces: 7, kind: 'garbage', params: { lines: 1, delayTicks: 6 } },
    { afterPieces: 8, kind: 'curtain' },
    { afterPieces: 9, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 10, kind: 'snag' },
    { afterPieces: 11, kind: 'freeze', params: { durationTicks: 360 } },
  ];

  return freezeLevel({
    id: 'import-jstris-drilltris-2',
    name: 'Jstris: drilltris 2',
    description: 'Drill shaft variant: drop I-pieces rapidly to eliminate all garbage before hazards lock you down.',
    seed: 71071,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 76 "SRS Tower"
 * Source: https://jstris.jezevec10.com/map/76 (API maps/api/76).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * SRS tower; poison→wildcard (+ late snag). Goal clear-lines:10.
 */
export function buildImportJstrisSrsTowerLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [7, 8]);
  paintGarbageRow(board, 1, [7]);
  paintGarbageRow(board, 2, [7]);
  paintGarbageRow(board, 3, [7, 8]);
  paintGarbageRow(board, 4, [7]);
  paintGarbageRow(board, 5, [7, 8, 9]);
  paintGarbageRow(board, 6, [7]);
  paintGarbageRow(board, 7, [7]);

  const queuePrefix: ShapeType[] = ['T', 'T', 'L', 'T', 'L', 'S', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'poison', params: { variant: 2 } },
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 5, kind: 'wildcard', params: { variant: 2 } },
    { afterPieces: 7, kind: 'curtain' },
    { afterPieces: 9, kind: 'snag' },
    { afterPieces: 12, kind: 'sticky' },
    { afterPieces: 15, kind: 'magnet' },
    { afterPieces: 18, kind: 'retrim' },
    { afterPieces: 21, kind: 'curtain' },
    { afterPieces: 24, kind: 'snag' },
    { afterPieces: 27, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 30, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'import-jstris-srs-tower',
    name: 'Jstris: SRS Tower',
    description: 'Use Super Rotation System wall kicks to navigate pieces through the high tower.',
    seed: 76076,
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
 * Import — Jstris map 89 "SRS Training"
 * Source: https://jstris.jezevec10.com/map/89 (API maps/api/89).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * SRS training; retrim→magnet→curtain. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisSrsTrainingLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [7]);
  paintGarbageRow(board, 1, [7]);
  paintGarbageRow(board, 2, [7, 8]);
  paintGarbageRow(board, 3, [7]);
  paintGarbageRow(board, 4, [7]);
  paintGarbageRow(board, 5, [7, 8]);
  paintGarbageRow(board, 6, [7]);
  paintGarbageRow(board, 7, [7, 8, 9]);

  const queuePrefix: ShapeType[] = ['J', 'Z', 'S', 'T', 'L', 'T', 'T', 'L', 'O', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 6, kind: 'curtain' },
    { afterPieces: 8, kind: 'sticky' },
    { afterPieces: 10, kind: 'snag' },
    { afterPieces: 12, kind: 'retrim' },
    { afterPieces: 14, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 16, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 18, kind: 'curtain' },
    { afterPieces: 20, kind: 'sticky' },
    { afterPieces: 22, kind: 'snag' },
    { afterPieces: 24, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'import-jstris-srs-training',
    name: 'Jstris: SRS Training',
    description: 'Master SRS kicks and spins through tight, technical geometric gaps.',
    seed: 89089,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 8 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 97 "DT Cannon Practice"
 * Source: https://jstris.jezevec10.com/map/97 (API maps/api/97).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * DT cannon; snag→curtain→magnet afterPieces. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisDtCannonPracticeLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [7]);
  paintGarbageRow(board, 1, [7]);
  paintGarbageRow(board, 2, [6, 7, 8]);
  paintGarbageRow(board, 3, [7, 8]);
  paintGarbageRow(board, 4, [7]);
  paintGarbageRow(board, 5, [7, 8, 9]);
  paintGarbageRow(board, 6, [8, 9]);
  paintGarbageRow(board, 7, [2]);

  const queuePrefix: ShapeType[] = ['T', 'T', 'T', 'T', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 4, kind: 'curtain' },
    { afterPieces: 6, kind: 'retrim' },
    { afterPieces: 8, kind: 'snag' },
    { afterPieces: 10, kind: 'magnet' },
    { afterPieces: 12, kind: 'sticky' },
    { afterPieces: 14, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 16, kind: 'curtain' },
    { afterPieces: 18, kind: 'snag' },
    { afterPieces: 21, kind: 'retrim' },
    { afterPieces: 24, kind: 'sticky' },
    { afterPieces: 27, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-dt-cannon-practice',
    name: 'Jstris: DT Cannon Practice',
    description: 'Construct and fire a classic DT Cannon setup for massive line clearing.',
    seed: 97000,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 6 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 99 "Godspin"
 * Source: https://jstris.jezevec10.com/map/99 (API maps/api/99).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Godspin; purge→sticky→garbage. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisGodspinLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [7]);
  paintGarbageRow(board, 1, [7, 8]);
  paintGarbageRow(board, 2, [6]);
  paintGarbageRow(board, 3, [6, 7]);
  paintGarbageRow(board, 4, [6, 7, 8]);
  paintGarbageRow(board, 5, [5, 6, 7, 8]);
  paintGarbageRow(board, 6, [7, 8]);
  paintGarbageRow(board, 7, [4, 5, 6, 7, 8]);

  const queuePrefix: ShapeType[] = ['Z', 'T', 'T', 'Z', 'T', 'L', 'J', 'O', 'I', 'I', 'T', 'Z', 'S'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 3, kind: 'poison', params: { variant: 2 } },
    { afterPieces: 5, kind: 'curtain' },
    { afterPieces: 7, kind: 'snag' },
    { afterPieces: 10, kind: 'purge', params: { variant: 2 } },
    { afterPieces: 12, kind: 'retrim' },
    { afterPieces: 14, kind: 'magnet' },
    { afterPieces: 16, kind: 'sticky' },
    { afterPieces: 18, kind: 'curtain' },
    { afterPieces: 21, kind: 'snag' },
    { afterPieces: 24, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 27, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 30, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'import-jstris-godspin',
    name: 'Jstris: Godspin',
    description: 'Perform the legendary Godspin T-piece twist through impossible-looking overhangs.',
    seed: 99002,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 7 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 105 "Many STSD"
 * Source: https://jstris.jezevec10.com/map/105 (API maps/api/105).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * STSD tower; magnet→snag→freeze afterPieces. Goal clear-lines:11.
 */
export function buildImportJstrisManyStsdLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [6, 7]);
  paintGarbageRow(board, 1, [6, 7]);
  paintGarbageRow(board, 2, [6]);
  paintGarbageRow(board, 3, [6, 7, 8]);
  paintGarbageRow(board, 4, [7, 8]);
  paintGarbageRow(board, 5, [7, 8]);
  paintGarbageRow(board, 6, [8]);
  paintGarbageRow(board, 7, [6, 7, 8]);

  const queuePrefix: ShapeType[] = ['T', 'T', 'T', 'T', 'T', 'T', 'T', 'T', 'O', 'J', 'L', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 4, kind: 'snag' },
    { afterPieces: 6, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 8, kind: 'magnet' },
    { afterPieces: 10, kind: 'retrim' },
    { afterPieces: 12, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 14, kind: 'snag' },
    { afterPieces: 16, kind: 'sticky' },
    { afterPieces: 18, kind: 'curtain' },
    { afterPieces: 20, kind: 'magnet', params: { stacks: 1 } },
  ];

  return freezeLevel({
    id: 'import-jstris-many-stsd',
    name: 'Jstris: Many STSD',
    description: 'Chain multiple Super T-Spin Double setups in rapid succession.',
    seed: 105008,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 11 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 216 "tripz"
 * Source: https://jstris.jezevec10.com/map/216 (API maps/api/216).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Tripz; curtain→retrim→sticky. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisTripzLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [8]);
  paintGarbageRow(board, 1, [8, 9]);
  paintGarbageRow(board, 2, [9]);
  paintGarbageRow(board, 3, [7]);
  paintGarbageRow(board, 4, [7, 8]);
  paintGarbageRow(board, 5, [8]);
  paintGarbageRow(board, 6, [3]);
  paintGarbageRow(board, 7, [3, 4]);

  const queuePrefix: ShapeType[] = ['Z', 'Z', 'Z', 'Z', 'Z', 'I', 'I', 'I', 'I', 'I', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 6, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 8, kind: 'curtain' },
    { afterPieces: 10, kind: 'sticky' },
    { afterPieces: 12, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 14, kind: 'retrim' },
    { afterPieces: 16, kind: 'snag' },
    { afterPieces: 18, kind: 'curtain' },
    { afterPieces: 21, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 24, kind: 'curtain' },
    { afterPieces: 27, kind: 'retrim' },
    { afterPieces: 30, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-tripz',
    name: 'Jstris: tripz',
    description: 'Execute triple T-spin setups back-to-back under escalating hazard tempo.',
    seed: 216022,
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
 * Import — Jstris map 305 "The Gutter"
 * Source: https://jstris.jezevec10.com/map/305 (API maps/api/305).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Gutter; freeze-primary mid-solve. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisTheGutterLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, []);
  paintGarbageRow(board, 1, [4, 5]);
  paintGarbageRow(board, 2, [5]);
  paintGarbageRow(board, 3, [4, 5, 6]);
  paintGarbageRow(board, 4, [5]);
  paintGarbageRow(board, 5, [5]);
  paintGarbageRow(board, 6, [6]);
  paintGarbageRow(board, 7, [5, 6, 7]);

  const queuePrefix: ShapeType[] = ['T', 'T', 'S', 'T', 'T', 'S', 'O'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'curtain' },
    { afterPieces: 3, kind: 'magnet' },
    { afterPieces: 5, kind: 'snag' },
    { afterPieces: 7, kind: 'retrim' },
    { afterPieces: 9, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 11, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 13, kind: 'curtain' },
    { afterPieces: 15, kind: 'sticky' },
    { afterPieces: 17, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 19, kind: 'snag' },
    { afterPieces: 21, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 23, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'import-jstris-the-gutter',
    name: 'Jstris: The Gutter',
    description: 'Dig through deep gutter garbage wells with precise lateral piece placements.',
    seed: 305014,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 6 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 355 "1v1 downstack"
 * Source: https://jstris.jezevec10.com/map/355 (API maps/api/355).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Downstack; garbage→magnet + late snag. Goal garbage-clear: clear all garbage.
 */
export function buildImportJstris1v1DownstackLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3]);
  paintGarbageRow(board, 1, [3]);
  paintGarbageRow(board, 2, [7]);
  paintGarbageRow(board, 3, [7]);
  paintGarbageRow(board, 4, [5]);
  paintGarbageRow(board, 5, [5]);
  paintGarbageRow(board, 6, [1]);
  paintGarbageRow(board, 7, [1]);

  const queuePrefix: ShapeType[] = ['O', 'I', 'J', 'T', 'L', 'L', 'J', 'S', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 6, kind: 'magnet' },
    { afterPieces: 8, kind: 'curtain' },
    { afterPieces: 10, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 12, kind: 'retrim' },
    { afterPieces: 14, kind: 'snag' },
    { afterPieces: 16, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 18, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 21, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 24, kind: 'curtain' },
    { afterPieces: 27, kind: 'retrim' },
    { afterPieces: 30, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-1v1-downstack',
    name: 'Jstris: 1v1 downstack',
    description: 'Downstack an intense 8-line opponent attack until all garbage is cleared, surviving late-game curtain and magnet spikes.',
    seed: 355064,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 368 "AAron's T-spin tower"
 * Source: https://jstris.jezevec10.com/map/368 (API maps/api/368).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * T-spin tower; sticky→curtain→snag afterPieces. Goal clear-lines:10.
 */
export function buildImportJstrisAaronSTSpinTowerLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [5, 6, 7, 8]);
  paintGarbageRow(board, 1, [6, 7, 8]);
  paintGarbageRow(board, 2, [8]);
  paintGarbageRow(board, 3, [1, 2, 3, 4, 5, 6, 7, 8]);
  paintGarbageRow(board, 4, [1, 2, 3, 4, 5, 6, 7]);
  paintGarbageRow(board, 5, [1]);
  paintGarbageRow(board, 6, [1, 2, 3]);
  paintGarbageRow(board, 7, [2, 3]);

  const queuePrefix: ShapeType[] = ['T', 'T', 'T', 'T', 'T', 'T', 'T', 'T', 'T', 'T', 'T', 'T', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'curtain' },
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 8, kind: 'sticky' },
    { afterPieces: 10, kind: 'retrim' },
    { afterPieces: 12, kind: 'curtain' },
    { afterPieces: 14, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 16, kind: 'snag' },
    { afterPieces: 18, kind: 'sticky' },
    { afterPieces: 20, kind: 'magnet', params: { stacks: 1 } },
  ];

  return freezeLevel({
    id: 'import-jstris-aaron-s-t-spin-tower',
    name: 'Jstris: AAron\'s T-spin tower',
    description: 'Scale the towering T-spin fortress while avoiding snag traps and freeze locks.',
    seed: 368077,
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
 * Import — Jstris map 410 "DHD"
 * Source: https://jstris.jezevec10.com/map/410 (API maps/api/410).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * DHD; poison→wildcard + magnet. Goal clear-lines:12.
 */
export function buildImportJstrisDhdLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4]);
  paintGarbageRow(board, 1, [3, 4, 5]);
  paintGarbageRow(board, 2, [1, 8]);
  paintGarbageRow(board, 3, [2, 7]);
  paintGarbageRow(board, 4, [1, 2, 7, 8]);
  paintGarbageRow(board, 5, [2, 7]);
  paintGarbageRow(board, 6, [1, 2, 7, 8]);
  paintGarbageRow(board, 7, [2, 7]);

  const queuePrefix: ShapeType[] = ['J', 'L', 'J', 'L', 'J', 'L', 'S', 'Z', 'I', 'I', 'O', 'T', 'S', 'S', 'Z', 'J', 'L', 'T', 'T', 'T', 'T', 'J', 'O', 'O', 'O', 'O', 'T', 'J', 'I', 'J'];
  const timeline: TimelineEntry[] = [
    { tick: 90, kind: 'poison', params: { variant: 1 } },
    { tick: 210, kind: 'wildcard', params: { variant: 1 } },
    { afterPieces: 5, kind: 'curtain' },
    { afterPieces: 10, kind: 'snag' },
    { afterPieces: 15, kind: 'magnet' },
    { afterPieces: 18, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 22, kind: 'sticky' },
    { afterPieces: 25, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 28, kind: 'retrim' },
    { afterPieces: 32, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'import-jstris-dhd',
    name: 'Jstris: DHD',
    description: 'Double Hard Drop downstacking challenge: clear high-density obstacles under poison threat.',
    seed: 410022,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 12 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Import — Jstris map 9100 "T-Spin triples!"
 * Source: https://jstris.jezevec10.com/map/9100 (API maps/api/9100).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 3 authentic TST rows for spawn headroom. Exact API queue as queuePrefix.
 * Soft afterPieces pressure (snag→curtain→magnet). Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisTSpinTriplesLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  // Bottom 3 of TST pair pattern (r17–19).
  paintGarbageRow(board, 0, [2, 8]);
  paintGarbageRow(board, 1, [2, 8]);
  paintGarbageRow(board, 2, [1, 2, 7, 8]);

  const queuePrefix: ShapeType[] = ['T', 'T', 'T', 'T', 'O', 'J', 'J', 'T', 'T', 'T', 'T', 'O', 'J', 'J', 'O', 'O'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 4, kind: 'curtain' },
    { afterPieces: 6, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 8, kind: 'magnet' },
    { afterPieces: 10, kind: 'snag' },
    { afterPieces: 12, kind: 'curtain' },
    { afterPieces: 14, kind: 'sticky' },
    { afterPieces: 16, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 18, kind: 'retrim' },
    { afterPieces: 21, kind: 'snag' },
    { afterPieces: 24, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 27, kind: 'curtain' },
    { afterPieces: 30, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-t-spin-triples',
    name: 'Jstris: T-Spin triples!',
    description: 'Execute pristine T-Spin Triples into pre-slotted overhang geometry.',
    seed: 9100079,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 4 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}
/**
 * Import — Jstris map 160 "Mash space"
 * Source: https://jstris.jezevec10.com/map/160 (API maps/api/160).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) of center-4 corridor for spawn headroom. Exact API queue.
 * Replaces unsolvable L-spin-mania (77) for RulesBot. snag→sticky→purge afterPieces.
 * Goal garbage-clear: clear all garbage.
 */
export function buildImportJstrisMashSpaceLevel(): LegacyCuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3, 4, 5, 6]);
  paintGarbageRow(board, 1, [3, 4, 5, 6]);
  paintGarbageRow(board, 2, [3, 4, 5, 6]);
  paintGarbageRow(board, 3, [3, 4, 5, 6]);
  paintGarbageRow(board, 4, [3, 4, 5, 6]);
  paintGarbageRow(board, 5, [3, 4, 5, 6]);
  paintGarbageRow(board, 6, [3, 4, 5, 6]);
  paintGarbageRow(board, 7, [3, 4, 5, 6]);

  const queuePrefix: ShapeType[] = ['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'snag' },
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 5, kind: 'sticky' },
    { afterPieces: 7, kind: 'magnet' },
    { afterPieces: 9, kind: 'curtain' },
    { afterPieces: 11, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 13, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 15, kind: 'snag' },
    { afterPieces: 17, kind: 'retrim' },
    { afterPieces: 19, kind: 'sticky' },
    { afterPieces: 21, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 23, kind: 'curtain' },
    { afterPieces: 25, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];

  return freezeLevel({
    id: 'import-jstris-mash-space',
    name: 'Jstris: Mash space',
    description: 'Fast-drop I-pieces down the central corridor to wipe out the flanking garbage walls.',
    seed: 160063,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}
// --- END JSTRIS BATCH20 ---

export function buildAuthoredLevels(): LegacyCuratedPuzzleLevel[] {
  return [
    // --- Tier 1: Novice / Warmup (Introductory downstack & drill fundamentals) ---
    buildImportJstrisDrilltris1Level(),
    buildImportJstrisDrilltris2Level(),
    buildImportJstrisMashSpaceLevel(),
    buildCheeseKeyholeLevel(),
    buildImportJstrisClearTheRainbowLevel(),
    buildSkewStairsLevel(),
    buildImportJstrisPerfectClearHowLevel(),

    // --- Tier 2: Apprentice (Hold management, ladder cheese & basic setups) ---
    buildFrozenWellLevel(),
    buildCheeseLadderLevel(),
    buildDigShaftLevel(),
    buildImportJstrisCheckboardLevel(),
    buildImportJstrisLspinsEasyLevel(),
    buildTSlotSetupLevel(),
    buildImportJstrisDtCannonPracticeLevel(),

    // --- Tier 3: Intermediate (Spin techniques, combo chains & attack recovery) ---
    buildImportJstrisTSpinTriplesLevel(),
    buildImportFumenC4w3resLevel(),
    buildImportJstrisTheGutterLevel(),
    buildImportJstrisSSpinTripleLevel(),
    buildFourWideLevel(),
    buildImportJstrisClogLevel(),
    buildImportJstris1v1DownstackLevel(),

    // --- Tier 4: Advanced (Technical kick navigation, heavy hazard pacing & hold limits) ---
    buildHoldDisciplineLevel(),
    buildPulseGarbageLevel(),
    buildImportJstrisManyStsdLevel(),
    buildImportJstrisTripzLevel(),
    buildImportJstrisSrsTrainingLevel(),
    buildImportJstrisCheese10Level(),
    buildLateIWellLevel(),

    // --- Tier 5: Master / Expert (Pinnacle execution, poison mechanics & blindness) ---
    buildImportJstrisSrsTowerLevel(),
    buildImportJstrisGodspinLevel(),
    buildImportJstrisAaronSTSpinTowerLevel(),
    buildImportJstrisUltimate29ComboLevel(),
    buildPoisonBeatLevel(),
    buildImportJstrisDhdLevel(),
    buildCurtainDropLevel(),
  ];
}

