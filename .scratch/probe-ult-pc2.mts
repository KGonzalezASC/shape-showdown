import { emptyBoard, paintGarbageRow, buildImportJstrisUltimate29ComboLevel } from '../server/puzzle/catalog/authoredLevels.js';
import { DEFAULT_PUZZLE_BENCHMARK, type PuzzleLevel, type ShapeType } from '../server/puzzle/puzzleTypes.js';
import { derivePuzzleSolution } from '../server/puzzle/puzzleSolution.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES, DIAGNOSTIC_OMNISCIENT_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';

const holeFromBottom = [9, 6, 3, 1, 7, 8, 6, 3, 6, 5, 1, 3, 7, 8, 2, 0, 2, 6, 3];
const queuePrefix: ShapeType[] = [
  'I', 'L', 'Z', 'S', 'J', 'O', 'I', 'T', 'L', 'Z', 'J', 'O', 'I', 'T', 'S',
  'L', 'O', 'T', 'I', 'S', 'J', 'Z', 'J', 'O', 'I', 'T', 'Z', 'S', 'L', 'Z', 'I',
];

function authentic(rows: number): PuzzleLevel {
  const board = emptyBoard();
  for (let i = 0; i < rows; i++) {
    const hole = holeFromBottom[i];
    const filled: number[] = [];
    for (let c = 0; c < 10; c++) if (c !== hole) filled.push(c);
    paintGarbageRow(board, i, filled);
  }
  return {
    id: `auth-${rows}`, name: `auth-${rows}`, seed: 255255, initialBoard: board, queuePrefix,
    goal: { kind: 'perfect-clear', maxPieces: 60 }, timeline: [], shopPolicy: 'none', allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK, visibilityPolicy: 'revealed',
  };
}

function sparse(n: number): PuzzleLevel {
  const base = buildImportJstrisUltimate29ComboLevel();
  // keep only bottom n painted rows from current builder by rebuilding
  const holes = [9, 6, 3, 1, 7, 8, 6, 3, 8, 5];
  const board = emptyBoard();
  for (let i = 0; i < n; i++) paintGarbageRow(board, i, [holes[i]]);
  return {
    ...base,
    id: `sparse-${n}`,
    initialBoard: board,
    goal: { kind: 'perfect-clear', maxPieces: 40 },
    timeline: [],
  };
}

function probe(level: PuzzleLevel, maxTicks = 90 * 60) {
  console.log('\n===', level.id, '===');
  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES], maxTicks);
  for (const c of batch.candidates) {
    console.log(' pl', c.profile.id, { q: c.qualifies, solved: c.report.solved, top: c.report.topOut, ticks: c.report.ticksUsed, pieces: c.report.piecesUsed, lines: c.report.linesCleared, pc: c.report.perfectClear });
  }
  const omni = runPuzzleBaselineBatch(level, [...DIAGNOSTIC_OMNISCIENT_CANDIDATES], maxTicks);
  for (const c of omni.candidates) {
    console.log(' om', c.profile.id, { q: c.qualifies, solved: c.report.solved, top: c.report.topOut, ticks: c.report.ticksUsed, pieces: c.report.piecesUsed, lines: c.report.linesCleared, pc: c.report.perfectClear });
  }
}

for (const r of [1, 2, 3, 4, 5]) probe(authentic(r));
for (const n of [1, 2, 3, 4]) probe(sparse(n));
