import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';

const levels = buildAuthoredLevels();
const c10 = levels.find(l => l.id === 'import-jstris-cheese-10')!;
console.log('Current cheese 10 goal:', c10.goal);

c10.goal = { kind: 'garbage-clear' };
// Sparing with curtain, alternate items
c10.timeline = [
  { afterPieces: 2, kind: 'sticky' },
  { afterPieces: 5, kind: 'snag' },
  { afterPieces: 8, kind: 'magnet' },
  { afterPieces: 12, kind: 'retrim' },
  { afterPieces: 16, kind: 'freeze', params: { durationTicks: 360 } },
  { afterPieces: 20, kind: 'sticky' },
  { afterPieces: 25, kind: 'snag' },
  { afterPieces: 30, kind: 'magnet' },
  { afterPieces: 36, kind: 'retrim' },
  { afterPieces: 42, kind: 'freeze', params: { durationTicks: 360 } },
];

const batch = runPuzzleBaselineBatch(c10, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
console.log(`Cheese 10 Solved=${batch.selected?.report.solved} | Pieces=${batch.selected?.report.piecesUsed} | Score=${batch.selected?.report.score}`);
