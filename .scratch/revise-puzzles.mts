import fs from 'node:fs';

const path = 'server/puzzle/catalog/authoredLevels.ts';
let s = fs.readFileSync(path, 'utf8');

// Replace skew stairs builder body with a slightly richer stair that still plans well
const skewStart = s.indexOf('export function buildSkewStairsLevel()');
const skewEnd = s.indexOf('export function buildPulseGarbageLevel()');
const pulseEnd = s.indexOf('export function buildAuthoredLevels()');

if (skewStart < 0 || skewEnd < 0 || pulseEnd < 0) {
  throw new Error('markers missing');
}

const skew = `export function buildSkewStairsLevel(): CuratedPuzzleLevel {
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

`;

const pulse = `export function buildPulseGarbageLevel(): CuratedPuzzleLevel {
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

`;

s = s.slice(0, skewStart) + skew + pulse + s.slice(pulseEnd);
fs.writeFileSync(path, s);
console.log('revised puzzles');
