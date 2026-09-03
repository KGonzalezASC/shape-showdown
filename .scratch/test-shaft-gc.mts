import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';

const levels = buildAuthoredLevels();
const s = levels.find(l => l.id === 'authored-dig-shaft')!;

s.goal = { kind: 'garbage-clear' };
s.timeline = [
  { afterPieces: 2, kind: 'sticky' },
  { afterPieces: 4, kind: 'snag' },
  { afterPieces: 7, kind: 'retrim' },
  { afterPieces: 10, kind: 'magnet' },
  { afterPieces: 13, kind: 'freeze', params: { durationTicks: 360 } },
  { afterPieces: 16, kind: 'sticky' },
  { afterPieces: 20, kind: 'snag' },
  { afterPieces: 24, kind: 'magnet' },
  { afterPieces: 28, kind: 'retrim' },
  { afterPieces: 32, kind: 'freeze', params: { durationTicks: 360 } },
];

const batch = runPuzzleBaselineBatch(s, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
console.log(`Dig Shaft Solved=${batch.selected?.report.solved} | Pieces=${batch.selected?.report.piecesUsed} | Score=${batch.selected?.report.score}`);
