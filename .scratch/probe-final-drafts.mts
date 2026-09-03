import { emptyBoard, paintGarbageRow } from '../server/puzzle/catalog/authoredLevels.js';
import { DEFAULT_PUZZLE_BENCHMARK, type PuzzleLevel, type ShapeType, type TimelineEntry } from '../server/puzzle/puzzleTypes.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';

const holeFromBottom = [9, 6, 3, 1, 7, 8, 6, 3, 6, 5];
const queuePrefix: ShapeType[] = [
  'I', 'L', 'Z', 'S', 'J', 'O', 'I', 'T', 'L', 'Z', 'J', 'O', 'I', 'T', 'S',
  'L', 'O', 'T', 'I', 'S', 'J', 'Z', 'J', 'O', 'I', 'T', 'Z', 'S', 'L', 'Z', 'I',
];

function auth(rows: number, timeline: TimelineEntry[], ticksHorizonHint: number): PuzzleLevel {
  const board = emptyBoard();
  for (let i = 0; i < rows; i++) {
    const hole = holeFromBottom[i];
    const filled: number[] = [];
    for (let c = 0; c < 10; c++) if (c !== hole) filled.push(c);
    paintGarbageRow(board, i, filled);
  }
  return {
    id: `auth-${rows}-tl`, name: `auth-${rows}`, seed: 255255, initialBoard: board, queuePrefix,
    goal: { kind: 'perfect-clear', maxPieces: 60 }, timeline, shopPolicy: 'none', allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK, visibilityPolicy: 'revealed',
  };
}

function sparse(n: number, timeline: TimelineEntry[]): PuzzleLevel {
  const holes = [9, 6, 3, 1, 7, 8, 6, 3, 8, 5];
  const board = emptyBoard();
  for (let i = 0; i < n; i++) paintGarbageRow(board, i, [holes[i]]);
  return {
    id: `sparse-${n}-tl`, name: `sparse`, seed: 255255, initialBoard: board, queuePrefix,
    goal: { kind: 'perfect-clear', maxPieces: 40 }, timeline, shopPolicy: 'none', allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK, visibilityPolicy: 'revealed',
  };
}

function probe(level: PuzzleLevel) {
  console.log('\n===', level.id, JSON.stringify(level.timeline), '===');
  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES], 90 * 60);
  console.log('selected', batch.selected ? { id: batch.selected.profile.id, ticks: batch.selected.report.ticksUsed, pieces: batch.selected.report.piecesUsed, score: batch.selected.report.score, lines: batch.selected.report.linesCleared } : null);
  for (const c of batch.candidates) {
    console.log(' ', c.profile.id, { q: c.qualifies, solved: c.report.solved, top: c.report.topOut, ticks: c.report.ticksUsed, pieces: c.report.piecesUsed, pc: c.report.perfectClear, score: c.report.score });
  }
}

// auth-2 human ~4479
const authTl: TimelineEntry[] = [
  { tick: 360, kind: 'freeze', params: { durationTicks: 600 } },
  { tick: 1600, kind: 'curtain' },
  { tick: 2800, kind: 'magnet' },
  { tick: 3800, kind: 'snag' },
];
probe(auth(2, authTl, 4479));
probe(auth(2, [], 0));

// sparse-2 human depends on selected; try timeline scaled to ~3*652 and ~3*1741
const sparseTlFast: TimelineEntry[] = [
  { tick: 240, kind: 'freeze', params: { durationTicks: 480 } },
  { tick: 900, kind: 'curtain' },
  { tick: 1500, kind: 'magnet' },
  { tick: 1800, kind: 'snag' },
];
const sparseTlSlow: TimelineEntry[] = [
  { tick: 400, kind: 'freeze', params: { durationTicks: 600 } },
  { tick: 1800, kind: 'curtain' },
  { tick: 3200, kind: 'magnet' },
  { tick: 4500, kind: 'snag' },
];
probe(sparse(2, sparseTlFast));
probe(sparse(2, sparseTlSlow));
probe(sparse(2, []));

// curtain survive-clear draft
import { buildCurtainDropLevel } from '../server/puzzle/catalog/authoredLevels.js';
const curtain = buildCurtainDropLevel();
const cTl: TimelineEntry[] = [
  { tick: 60, kind: 'retrim' },
  { tick: 480, kind: 'curtain' },
  { tick: 1200, kind: 'curtain' },
  { tick: 1800, kind: 'magnet' }, // escalator
];
const cLevel = {
  ...curtain,
  goal: { kind: 'survive-clear' as const, ticks: 2250, lines: 12 },
  timeline: cTl,
};
probe(cLevel as any);

const cTl2: TimelineEntry[] = [
  { tick: 60, kind: 'retrim' },
  { tick: 540, kind: 'curtain' },
  { tick: 1500, kind: 'garbage', params: { lines: 1 } },
  { tick: 2100, kind: 'curtain' },
  { tick: 2700, kind: 'retrim' }, // second retrim escalator
];
const cLevel2 = {
  ...curtain,
  goal: { kind: 'survive-clear' as const, ticks: 3000, lines: 12 },
  timeline: cTl2,
};
probe(cLevel2 as any);
