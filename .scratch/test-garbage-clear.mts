import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';
import { PuzzleSession } from '../server/puzzle/puzzleSession.js';

const levels = buildAuthoredLevels();

// First, check all levels if they are evaluated with garbage-clear
console.log('Testing which maps fit garbage-clear...\n');

for (const level of levels) {
  const gCells = level.initialBoard.flat().filter(c => c === 'G').length;
  if (gCells === 0) continue;

  const testLevel = JSON.parse(JSON.stringify(level));
  testLevel.goal = { kind: 'garbage-clear' };

  try {
    const batch = runPuzzleBaselineBatch(testLevel, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
    const solved = batch.selected != null && batch.selected.report.solved;
    const pieces = batch.selected?.report.piecesUsed;
    const score = batch.selected?.report.score;
    console.log(`Level: ${level.id} ("${level.name}") | GarbageCells: ${gCells} | Solved: ${solved} | Pieces: ${pieces} | Score: ${score}`);
  } catch (err: any) {
    console.log(`Level: ${level.id} | Error: ${err.message}`);
  }
}
