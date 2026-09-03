import fs from 'node:fs';

const path = 'server/puzzle/catalog/authoredLevels.ts';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('authored-skew-stairs')) {
  const builders = `
/**
 * Skew Stairs — diagonal cheese stairs with a forced queue that rewards
 * committing to the ascending holes in order (J/L plugs, then O/I finish).
 * Wrong order leaves unreachable overhangs. No timeline.
 */
export function buildSkewStairsLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Bottom → top: holes march rightward (skew stairs / cheese diagonal).
  paintGarbageRow(board, 0, [0, 1]);
  paintGarbageRow(board, 1, [1, 2]);
  paintGarbageRow(board, 2, [2, 3]);
  paintGarbageRow(board, 3, [3, 4]);
  // Soft right wall so clears don't spill into a flat dig.
  paintColumnStack(board, 8, 2);
  paintColumnStack(board, 9, 3);

  // Plan: J covers early left steps, L the mid skew, O seats the flat, I cleans.
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
 * Pulse Garbage — shallow cheese dig that is solvable, then a mid-run
 * garbage pulse forces a replan. Hold allowed; queue partially hidden.
 */
export function buildPulseGarbageLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3, 6]);
  paintGarbageRow(board, 1, [4, 5]);
  paintGarbageRow(board, 2, [2, 7]);

  const queuePrefix: ShapeType[] = ['O', 'I', 'T', 'J', 'L', 'S', 'Z'];
  const timeline: TimelineEvent[] = [
    // ~4s in: one garbage line arrives after a couple of placements.
    { tick: 240, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
  ];

  return freezeLevel({
    id: 'authored-pulse-garbage',
    name: 'Pulse Garbage',
    seed: 4201,
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
`;

  s = s.replace(
    `export function buildAuthoredLevels(): CuratedPuzzleLevel[] {
  return [buildCheeseKeyholeLevel(), buildFrozenWellLevel()];
}`,
    `${builders}
export function buildAuthoredLevels(): CuratedPuzzleLevel[] {
  return [
    buildCheeseKeyholeLevel(),
    buildFrozenWellLevel(),
    buildSkewStairsLevel(),
    buildPulseGarbageLevel(),
  ];
}`,
  );
  fs.writeFileSync(path, s);
  console.log('authored levels updated');
} else {
  console.log('already present');
}
