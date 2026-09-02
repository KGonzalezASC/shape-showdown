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
 * Curtain Drop — hybrid survive + lines (compound goal).
 * Bot clears ~12 lines in ~750 ticks under sparse curtain pressure; human horizon
 * is ×3 ≈ 2250 ticks. Retrim once up front; curtains stay sparse (not a dense
 * loop); mid/late magnet escalator punishes lingering. Win = alive at horizon
 * AND linesCleared >= 12.
 */
export function buildCurtainDropLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [0, 5]);
  paintGarbageRow(board, 1, [1, 6]);
  paintGarbageRow(board, 2, [2, 7]);
  paintGarbageRow(board, 3, [3, 8]);

  const queuePrefix: ShapeType[] = ['T', 'J', 'L', 'O', 'S', 'Z', 'I'];
  // Bot clear ≈ 750 ticks with this sparse beat → human horizon 2250 (×3).
  const timeline: TimelineEntry[] = [
    { tick: 60, kind: 'retrim' },
    { tick: 480, kind: 'curtain' },
    { tick: 1200, kind: 'curtain' },
    // Escalator: lingering players eat magnet pressure near the horizon.
    { tick: 1800, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'authored-curtain-drop',
    name: 'Curtain Drop',
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


/**
 * Trial import — Jstris map 66 "Checkboard pattern"
 * Source: https://jstris.jezevec10.com/map/66 (API maps/api/66).
 * Famous as "theoretically hardest map to downstack." Board decoded from base64
 * `data` as 200 nibbles (20×10); non-zero cells → garbage. Upper checkerboard
 * rows omitted for spawn headroom (kept authentic bottom 8 rows from decode).
 * Original queue was null (random); authored dig-oriented prefix. finish=0
 * (default clear-map) approximated as clear-lines:4 partial dig.
 */
export function buildImportJstrisCheckboardLevel(): CuratedPuzzleLevel {
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
  const timeline: TimelineEvent[] = [
    // Thematic mid-solve freeze (no fake jstris powerups).
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'import-jstris-checkboard',
    name: 'Jstris: Checkboard pattern',
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
export function buildImportJstrisUltimate29ComboLevel(): CuratedPuzzleLevel {
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
    { tick: 120, kind: 'retrim' },
    { tick: 480, kind: 'magnet' },
    { afterPieces: 5, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 12, kind: 'curtain' },
    { afterPieces: 20, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-ultimate-29-combo',
    name: 'Jstris: Ultimate 29-combo',
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
export function buildImportFumenC4w3resLevel(): CuratedPuzzleLevel {
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
  const timeline: TimelineEvent[] = [
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'import-fumen-c4w-3res',
    name: 'Hard Drop: Center 4-wide 3-res',
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
 * PC opener; piece-scheduled curtain→snag→magnet. Goal clear-lines:4.
 */
export function buildImportJstrisPerfectClearHowLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [2, 3, 4, 5, 7, 8]);
  paintGarbageRow(board, 1, [2, 3, 4, 5]);
  paintGarbageRow(board, 2, [2, 3, 4, 5, 7, 8]);
  paintGarbageRow(board, 3, [2, 3, 4, 5, 6, 7, 8, 9]);

  const queuePrefix: ShapeType[] = ['S', 'J', 'I', 'L', 'S', 'Z', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 3, kind: 'curtain' },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 9, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'import-jstris-perfect-clear-how',
    name: 'Jstris: Perfect clear how?',
    seed: 2002,
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
 * Import — Jstris map 15 "Clear the rainbow"
 * Source: https://jstris.jezevec10.com/map/15 (API maps/api/15).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Well dig; retrim→magnet + garbage pulse. Goal clear-lines:6.
 */
export function buildImportJstrisClearTheRainbowLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [7, 8, 9]);
  paintGarbageRow(board, 1, [7, 8, 9]);
  paintGarbageRow(board, 2, [7, 8, 9]);
  paintGarbageRow(board, 3, [7, 8, 9]);
  paintGarbageRow(board, 4, [7, 8, 9]);
  paintGarbageRow(board, 5, [7, 8, 9]);
  paintGarbageRow(board, 6, [7, 8, 9]);
  paintGarbageRow(board, 7, [7, 8, 9]);

  const queuePrefix: ShapeType[] = ['L', 'O', 'J', 'J', 'Z', 'J', 'O', 'O', 'I'];
  const timeline: TimelineEntry[] = [
    { tick: 90, kind: 'retrim' },
    { tick: 180, kind: 'magnet' },
    { tick: 300, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];

  return freezeLevel({
    id: 'import-jstris-clear-the-rainbow',
    name: 'Jstris: Clear the rainbow',
    seed: 15015,
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
 * Import — Jstris map 24 "Lspins (Easy)"
 * Source: https://jstris.jezevec10.com/map/24 (API maps/api/24).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * L-spin stack; sticky→freeze→snag afterPieces. Goal clear-lines:5.
 */
export function buildImportJstrisLspinsEasyLevel(): CuratedPuzzleLevel {
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
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 8, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 12, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-lspins-easy',
    name: 'Jstris: Lspins (Easy)',
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
 * Cheese 10; garbage→purge→magnet ticks. Goal clear-lines:8.
 */
export function buildImportJstrisCheese10Level(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [6]);
  paintGarbageRow(board, 1, [7]);
  paintGarbageRow(board, 2, [8]);
  paintGarbageRow(board, 3, [9]);
  paintGarbageRow(board, 4, [9]);
  paintGarbageRow(board, 5, [6]);
  paintGarbageRow(board, 6, [6]);
  paintGarbageRow(board, 7, [5]);
  paintGarbageRow(board, 8, [2]);
  paintGarbageRow(board, 9, [0]);

  const queuePrefix: ShapeType[] = ['T', 'Z', 'S', 'J', 'L', 'O', 'I', 'T', 'S', 'I', 'J', 'O', 'L', 'Z', 'S', 'O', 'O', 'O', 'O', 'O', 'O', 'O', 'O', 'O', 'O'];
  const timeline: TimelineEntry[] = [
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { tick: 240, kind: 'purge', params: { variant: 2 } },
    { tick: 420, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'import-jstris-cheese-10',
    name: 'Jstris: Cheese 10',
    seed: 45045,
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
 * Import — Jstris map 53 "Clog"
 * Source: https://jstris.jezevec10.com/map/53 (API maps/api/53).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Clog chambers; snag + piece retrim/curtain. Goal clear-lines:7.
 */
export function buildImportJstrisClogLevel(): CuratedPuzzleLevel {
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
    { tick: 150, kind: 'snag' },
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 10, kind: 'curtain' },
  ];

  return freezeLevel({
    id: 'import-jstris-clog',
    name: 'Jstris: Clog',
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
export function buildImportJstrisSSpinTripleLevel(): CuratedPuzzleLevel {
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
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 7, kind: 'magnet' },
    { tick: 480, kind: 'purge', params: { variant: 2 } },
  ];

  return freezeLevel({
    id: 'import-jstris-s-spin-triple',
    name: 'Jstris: s-spin triple',
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
 * Drill shaft; early garbage + mid freeze. Goal clear-lines:6.
 */
export function buildImportJstrisDrilltris1Level(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4]);
  paintGarbageRow(board, 1, [4]);
  paintGarbageRow(board, 2, [4]);
  paintGarbageRow(board, 3, []);
  paintGarbageRow(board, 4, [4]);
  paintGarbageRow(board, 5, [4]);
  paintGarbageRow(board, 6, [4]);
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
    { tick: 240, kind: 'freeze', params: { durationTicks: 600 } },
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
  ];

  return freezeLevel({
    id: 'import-jstris-drilltris-1',
    name: 'Jstris: drilltris 1',
    seed: 70070,
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
 * Import — Jstris map 71 "drilltris 2"
 * Source: https://jstris.jezevec10.com/map/71 (API maps/api/71).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * Drill 2; retrim + sparse curtain loop + late magnet. Goal clear-lines:7.
 */
export function buildImportJstrisDrilltris2Level(): CuratedPuzzleLevel {
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
    { tick: 90, kind: 'retrim' },
    { loop: { startTick: 360, periodTicks: 720, sequence: [{ at: 0, kind: 'curtain' }] } },
    { tick: 900, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'import-jstris-drilltris-2',
    name: 'Jstris: drilltris 2',
    seed: 71071,
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
 * Import — Jstris map 76 "SRS Tower"
 * Source: https://jstris.jezevec10.com/map/76 (API maps/api/76).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * SRS tower; poison→wildcard (+ late snag). Goal clear-lines:10.
 */
export function buildImportJstrisSrsTowerLevel(): CuratedPuzzleLevel {
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
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    { tick: 200, kind: 'wildcard', params: { variant: 2 } },
    { afterPieces: 14, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-srs-tower',
    name: 'Jstris: SRS Tower',
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
 * SRS training; retrim→magnet→curtain. Goal clear-lines:8.
 */
export function buildImportJstrisSrsTrainingLevel(): CuratedPuzzleLevel {
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
    { tick: 120, kind: 'retrim' },
    { tick: 280, kind: 'magnet' },
    { tick: 480, kind: 'curtain' },
  ];

  return freezeLevel({
    id: 'import-jstris-srs-training',
    name: 'Jstris: SRS Training',
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
 * DT cannon; snag→curtain→magnet afterPieces. Goal clear-lines:6.
 */
export function buildImportJstrisDtCannonPracticeLevel(): CuratedPuzzleLevel {
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
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 5, kind: 'curtain' },
    { afterPieces: 8, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'import-jstris-dt-cannon-practice',
    name: 'Jstris: DT Cannon Practice',
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
 * Godspin; purge→sticky→garbage. Goal clear-lines:7.
 */
export function buildImportJstrisGodspinLevel(): CuratedPuzzleLevel {
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
    { tick: 150, kind: 'purge', params: { variant: 2 } },
    { tick: 300, kind: 'sticky' },
    { tick: 450, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ];

  return freezeLevel({
    id: 'import-jstris-godspin',
    name: 'Jstris: Godspin',
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
export function buildImportJstrisManyStsdLevel(): CuratedPuzzleLevel {
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
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 9, kind: 'snag' },
    { afterPieces: 14, kind: 'freeze', params: { durationTicks: 360 } },
  ];

  return freezeLevel({
    id: 'import-jstris-many-stsd',
    name: 'Jstris: Many STSD',
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
 * Tripz; curtain→retrim→sticky. Goal clear-lines:9.
 */
export function buildImportJstrisTripzLevel(): CuratedPuzzleLevel {
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
    { tick: 100, kind: 'curtain' },
    { tick: 220, kind: 'retrim' },
    { tick: 400, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'import-jstris-tripz',
    name: 'Jstris: tripz',
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
 * Gutter; freeze-primary mid-solve. Goal clear-lines:6.
 */
export function buildImportJstrisTheGutterLevel(): CuratedPuzzleLevel {
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
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'import-jstris-the-gutter',
    name: 'Jstris: The Gutter',
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
 * Downstack; garbage→magnet + late snag. Goal clear-lines:8.
 */
export function buildImportJstris1v1DownstackLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [0]);
  paintGarbageRow(board, 1, [0]);
  paintGarbageRow(board, 2, [0]);
  paintGarbageRow(board, 3, [0]);
  paintGarbageRow(board, 4, [5]);
  paintGarbageRow(board, 5, [5]);
  paintGarbageRow(board, 6, [1]);
  paintGarbageRow(board, 7, [1]);

  const queuePrefix: ShapeType[] = ['O', 'I', 'J', 'T', 'L', 'L', 'J', 'S', 'I'];
  const timeline: TimelineEntry[] = [
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { tick: 240, kind: 'magnet' },
    { afterPieces: 10, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-1v1-downstack',
    name: 'Jstris: 1v1 downstack',
    seed: 355064,
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
 * Import — Jstris map 368 "AAron's T-spin tower"
 * Source: https://jstris.jezevec10.com/map/368 (API maps/api/368).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * 8 row(s) for spawn headroom. Exact API queue as queuePrefix.
 * T-spin tower; sticky→curtain→snag afterPieces. Goal clear-lines:10.
 */
export function buildImportJstrisAaronSTSpinTowerLevel(): CuratedPuzzleLevel {
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
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 7, kind: 'curtain' },
    { afterPieces: 12, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-aaron-s-t-spin-tower',
    name: 'Jstris: AAron\'s T-spin tower',
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
export function buildImportJstrisDhdLevel(): CuratedPuzzleLevel {
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
    { tick: 480, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'import-jstris-dhd',
    name: 'Jstris: DHD',
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
 * Soft afterPieces pressure (snag→curtain→magnet). Goal clear-lines:4.
 */
export function buildImportJstrisTSpinTriplesLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Bottom 3 of TST pair pattern (r17–19).
  paintGarbageRow(board, 0, [2, 8]);
  paintGarbageRow(board, 1, [2, 8]);
  paintGarbageRow(board, 2, [1, 2, 7, 8]);

  const queuePrefix: ShapeType[] = ['T', 'T', 'T', 'T', 'O', 'J', 'J', 'T', 'T', 'T', 'T', 'O', 'J', 'J', 'O', 'O'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 5, kind: 'snag' },
    { afterPieces: 10, kind: 'curtain' },
    { afterPieces: 15, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'import-jstris-t-spin-triples',
    name: 'Jstris: T-Spin triples!',
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
 * Goal clear-lines:6.
 */
export function buildImportJstrisMashSpaceLevel(): CuratedPuzzleLevel {
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
    { afterPieces: 4, kind: 'snag' },
    { afterPieces: 8, kind: 'sticky' },
    { afterPieces: 12, kind: 'purge', params: { variant: 2 } },
  ];

  return freezeLevel({
    id: 'import-jstris-mash-space',
    name: 'Jstris: Mash space',
    seed: 160063,
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
// --- END JSTRIS BATCH20 ---

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
    // Trial imports (picker only; not on DAILY_SCHEDULE slots).
    buildImportJstrisCheckboardLevel(),
    buildImportJstrisUltimate29ComboLevel(),
    buildImportFumenC4w3resLevel(),
    // JSTRIS BATCH20
    buildImportJstrisPerfectClearHowLevel(),
    buildImportJstrisClearTheRainbowLevel(),
    buildImportJstrisLspinsEasyLevel(),
    buildImportJstrisCheese10Level(),
    buildImportJstrisClogLevel(),
    buildImportJstrisSSpinTripleLevel(),
    buildImportJstrisDrilltris1Level(),
    buildImportJstrisDrilltris2Level(),
    buildImportJstrisSrsTowerLevel(),
    buildImportJstrisMashSpaceLevel(),
    buildImportJstrisSrsTrainingLevel(),
    buildImportJstrisDtCannonPracticeLevel(),
    buildImportJstrisGodspinLevel(),
    buildImportJstrisManyStsdLevel(),
    buildImportJstrisTripzLevel(),
    buildImportJstrisTheGutterLevel(),
    buildImportJstris1v1DownstackLevel(),
    buildImportJstrisAaronSTSpinTowerLevel(),
    buildImportJstrisDhdLevel(),
    buildImportJstrisTSpinTriplesLevel(),
    // JSTRIS BATCH20 END
  ];
}

