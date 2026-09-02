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

/**
 * Cheese Ladder — multi-row staggered cheese with ascending hole ladder.
 * Forced queue rewards climbing the holes in order; wrong plugs strand overhangs.
 */
export function buildCheeseLadderLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Ascending hole ladder (left→right), plus a second-pass gap on row 3.
  paintGarbageRow(board, 0, [1]);
  paintGarbageRow(board, 1, [2, 8]);
  paintGarbageRow(board, 2, [3]);
  paintGarbageRow(board, 3, [4, 0]);
  paintGarbageRow(board, 4, [5]);

  // J seats low rung, L mid, O flats, I spans the climb.
  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'S', 'Z', 'I', 'T'];

  return freezeLevel({
    id: 'authored-cheese-ladder',
    name: 'Cheese Ladder',
    seed: 5103,
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
 * Dig Shaft — deep center shaft with flanking walls. Dig down the column;
 * mid-run garbage pulse forces a replan while the shaft is still open.
 */
export function buildDigShaftLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Cheese dig with a preferred shaft lane (holes cluster near col 4) plus
  // staggered side holes so one vertical I cannot skim the goal alone.
  paintGarbageRow(board, 0, [4, 8]);
  paintGarbageRow(board, 1, [4, 1]);
  paintGarbageRow(board, 2, [3, 4]);
  paintGarbageRow(board, 3, [4, 7]);
  paintGarbageRow(board, 4, [2, 5]);
  paintColumnStack(board, 0, 3);
  paintColumnStack(board, 9, 4);

  // Openers force packing into the shaft before I arrives.
  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEvent[] = [
    // ~2s: garbage pulse mid-dig shifts the shaft geometry.
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
  ];

  return freezeLevel({
    id: 'authored-dig-shaft',
    name: 'Dig Shaft',
    seed: 6208,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

export function buildTSlotSetupLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // T-pocket: open floor under overhang at cols 3-5, walls left/right.
  // Row0 holes at 3,4,5 (T floor); row1 hole at 4 (T stem); buttresses.
  paintGarbageRow(board, 0, [3, 4, 5]);
  paintGarbageRow(board, 1, [4]);
  paintGarbageRow(board, 2, [2, 6]);
  paintColumnStack(board, 0, 4);
  paintColumnStack(board, 9, 4);

  // Early T bankable; late T after setup pieces seat the pocket.
  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'J', 'L', 'O', 'T'];

  return freezeLevel({
    id: 'authored-tslot-setup',
    name: 'T-Slot Setup',
    seed: 7331,
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
 * Four Wide — narrow 4-col corridor play. Side walls lock the player into the
 * center lane; hold disabled so every piece must commit in-corridor.
 */
export function buildFourWideLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Side walls cols 0-2 and 7-9; textured 4-wide corridor cols 3-6.
  paintColumnStack(board, 0, 7);
  paintColumnStack(board, 1, 8);
  paintColumnStack(board, 2, 6);
  paintColumnStack(board, 7, 6);
  paintColumnStack(board, 8, 8);
  paintColumnStack(board, 9, 7);
  // Corridor texture: uneven floor so a single I cannot skim 3 clears.
  paintColumnStack(board, 3, 2);
  paintColumnStack(board, 4, 1);
  paintColumnStack(board, 5, 3);
  paintColumnStack(board, 6, 1);

  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'T', 'S', 'Z', 'I'];

  return freezeLevel({
    id: 'authored-four-wide',
    name: 'Four Wide',
    seed: 8412,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
    timeline: [],
    shopPolicy: 'none',
    allowHold: false,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

export function buildHoldDisciplineLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Imperfect center well — shoulders have gaps so early I cannot skim tetrises.
  // Heights: 0:3 1:5 2:2 3:4 4:1 5:0 6:1 7:3 8:5 9:2
  paintColumnStack(board, 0, 3);
  paintColumnStack(board, 1, 5);
  paintColumnStack(board, 2, 2);
  paintColumnStack(board, 3, 4);
  paintColumnStack(board, 4, 1);
  // col 5 open well
  paintColumnStack(board, 6, 1);
  paintColumnStack(board, 7, 3);
  paintColumnStack(board, 8, 5);
  paintColumnStack(board, 9, 2);

  // Early I wants banking; S/Z/O force setup before the well is ready.
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

export function buildPoisonBeatLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [1, 6]);
  paintGarbageRow(board, 1, [2, 7]);
  paintGarbageRow(board, 2, [3, 8]);
  paintGarbageRow(board, 3, [4]);

  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'T', 'S', 'Z', 'I'];
  const timeline: TimelineEvent[] = [
    // ~2.5s: poison the active piece mid-opening.
    { tick: 150, kind: 'poison', params: { variant: 1 } },
  ];

  return freezeLevel({
    id: 'authored-poison-beat',
    name: 'Poison Beat',
    seed: 10661,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 2 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

/**
 * Curtain Drop — curtain timeline beat shrinks the playable sky mid-solve.
 * Hidden upcoming hazards; clear ≥2 with intentional cheese, not empty PC.
 */
export function buildCurtainDropLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [0, 5]);
  paintGarbageRow(board, 1, [1, 6]);
  paintGarbageRow(board, 2, [2, 7]);
  paintGarbageRow(board, 3, [3, 8]);

  const queuePrefix: ShapeType[] = ['T', 'J', 'L', 'O', 'S', 'Z', 'I'];
  const timeline: TimelineEvent[] = [
    // ~2s: curtain drops 3 rows — sky shrinks, hold still available.
    { tick: 120, kind: 'curtain', params: { rows: 3 } },
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
 * Late I Well — deep well that wants a late I. Awkward early S/Z/O force setup
 * before the I arrives; hold allowed to bank fillers incorrectly at your peril.
 */
export function buildLateIWellLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Deep well at col 4; tall shoulders. Floor hole is simply the open well column.
  paintColumnStack(board, 0, 6);
  paintColumnStack(board, 1, 7);
  paintColumnStack(board, 2, 6);
  paintColumnStack(board, 3, 5);
  // col 4 open
  paintColumnStack(board, 5, 5);
  paintColumnStack(board, 6, 6);
  paintColumnStack(board, 7, 7);
  paintColumnStack(board, 8, 6);
  paintColumnStack(board, 9, 5);

  const queuePrefix: ShapeType[] = ['S', 'Z', 'O', 'J', 'L', 'T', 'I'];

  return freezeLevel({
    id: 'authored-late-i-well',
    name: 'Late I Well',
    seed: 12880,
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
