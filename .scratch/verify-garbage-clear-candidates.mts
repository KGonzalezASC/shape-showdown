import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';

const levels = buildAuthoredLevels();

// Candidate maps for garbage-clear:
const GARBAGE_CLEAR_CANDIDATES = [
  'import-jstris-perfect-clear-how',
  'import-jstris-clear-the-rainbow',
  'import-jstris-drilltris-1',
  'import-jstris-drilltris-2',
  'import-jstris-mash-space',
  'import-jstris-1v1-downstack',
  'authored-cheese-ladder',
];

for (const id of GARBAGE_CLEAR_CANDIDATES) {
  const level = levels.find(l => l.id === id)!;
  level.goal = { kind: 'garbage-clear' };
  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
  console.log(`[${id}] Solved=${batch.selected?.report.solved} | Pieces=${batch.selected?.report.piecesUsed} | Score=${batch.selected?.report.score} | Profile=${batch.selected?.profile.id}`);
}
