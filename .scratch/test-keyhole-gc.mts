import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';

const levels = buildAuthoredLevels();
const k = levels.find(l => l.id === 'authored-cheese-keyhole')!;

k.goal = { kind: 'garbage-clear' };
k.timeline = [
  { afterPieces: 1, kind: 'sticky' },
  { afterPieces: 2, kind: 'snag' },
  { afterPieces: 4, kind: 'magnet' },
  { afterPieces: 6, kind: 'retrim' },
  { afterPieces: 8, kind: 'freeze', params: { durationTicks: 360 } },
  { afterPieces: 10, kind: 'sticky' },
  { afterPieces: 12, kind: 'snag' },
  { afterPieces: 15, kind: 'magnet' },
  { afterPieces: 18, kind: 'retrim' },
  { afterPieces: 21, kind: 'freeze', params: { durationTicks: 360 } },
];

const batch = runPuzzleBaselineBatch(k, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
console.log(`Cheese Keyhole Solved=${batch.selected?.report.solved} | Pieces=${batch.selected?.report.piecesUsed} | Score=${batch.selected?.report.score}`);
