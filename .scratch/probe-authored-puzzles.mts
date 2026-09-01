import { buildAuthoredLevels } from './server/puzzle/catalog/authoredLevels.ts';
import { runPuzzleBaselineBatch } from './server/puzzle/puzzleBaselineBatch.ts';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES, DIAGNOSTIC_OMNISCIENT_CANDIDATES } from './server/puzzle/puzzleValidationArtifact.ts';
import { derivePuzzleSolution } from './server/puzzle/puzzleSolution.ts';

const levels = buildAuthoredLevels();
for (const level of levels) {
  console.log('\n===', level.id, level.name, '===');
  console.log('goal', level.goal, 'queue', level.queuePrefix.join(''), 'hold', level.allowHold);
  console.log('timeline', JSON.stringify(level.timeline));
  // print bottom 6 rows
  for (let y = 14; y < 20; y++) {
    const row = level.initialBoard[y].map((c) => (c == null ? '.' : c)).join('');
    console.log(`y${y}: ${row}`);
  }
  const omni = derivePuzzleSolution(level);
  console.log('omniscient', { solved: omni.solved, ticks: omni.ticksUsed, pieces: omni.piecesUsed, score: omni.score });
  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
  console.log('player-limited selected', batch.selected ? {
    id: batch.selected.profile.id,
    solved: batch.selected.report.solved,
    ticks: batch.selected.report.ticksUsed,
    pieces: batch.selected.report.piecesUsed,
    score: batch.selected.report.score,
    lines: batch.selected.report.linesCleared,
  } : null);
  for (const c of batch.candidates) {
    console.log('  cand', c.profile.id, {
      qualifies: c.qualifies,
      solved: c.report.solved,
      topOut: c.report.topOut,
      ticks: c.report.ticksUsed,
      pieces: c.report.piecesUsed,
      lines: c.report.linesCleared,
      score: c.report.score,
    });
  }
  const diag = runPuzzleBaselineBatch(level, [...DIAGNOSTIC_OMNISCIENT_CANDIDATES]);
  console.log('omni-batch selected', diag.selected ? {
    id: diag.selected.profile.id,
    ticks: diag.selected.report.ticksUsed,
    pieces: diag.selected.report.piecesUsed,
    lines: diag.selected.report.linesCleared,
  } : 'NONE');
}
