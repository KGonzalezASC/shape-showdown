import { emptyBoard, paintGarbageRow } from '../server/puzzle/catalog/authoredLevels.js';
import { DEFAULT_PUZZLE_BENCHMARK, type PuzzleLevel, type ShapeType } from '../server/puzzle/puzzleTypes.js';
import { derivePuzzleSolution } from '../server/puzzle/puzzleSolution.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';

// hole columns from bottom (jstris r19..r01)
const holeFromBottom = [9, 6, 3, 1, 7, 8, 6, 3, 6, 5, 1, 3, 7, 8, 2, 0, 2, 6, 3];

const queuePrefix: ShapeType[] = [
  'I', 'L', 'Z', 'S', 'J', 'O', 'I', 'T', 'L', 'Z', 'J', 'O', 'I', 'T', 'S',
  'L', 'O', 'T', 'I', 'S', 'J', 'Z', 'J', 'O', 'I', 'T', 'Z', 'S', 'L', 'Z', 'I',
];

function buildAuthentic(rows: number): PuzzleLevel {
  const board = emptyBoard();
  for (let i = 0; i < rows; i++) {
    const hole = holeFromBottom[i];
    const filled: number[] = [];
    for (let c = 0; c < 10; c++) if (c !== hole) filled.push(c);
    paintGarbageRow(board, i, filled);
  }
  return {
    id: `probe-ult-${rows}`,
    name: `probe ult ${rows}`,
    seed: 255255,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'perfect-clear', maxPieces: 50 },
    timeline: [],
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  };
}

function probe(level: PuzzleLevel) {
  console.log('\n===', level.id, '===');
  const omni = derivePuzzleSolution(level, 90 * 60);
  console.log('omni', { solved: omni.solved, ticks: omni.ticksUsed, pieces: omni.piecesUsed, score: omni.score });
  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES], 90 * 60);
  for (const c of batch.candidates) {
    console.log(' cand', c.profile.id, {
      q: c.qualifies, solved: c.report.solved, top: c.report.topOut,
      ticks: c.report.ticksUsed, pieces: c.report.piecesUsed,
      lines: c.report.linesCleared, pc: c.report.perfectClear,
    });
  }
}

for (const rows of [4, 6, 8, 10, 12]) {
  probe(buildAuthentic(rows));
}
