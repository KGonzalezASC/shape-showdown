import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';
import { PROPOSED_TIMELINES } from './test-proposed-timelines.mts';

const levels = buildAuthoredLevels();
const dhd = levels.find((l) => l.id === 'import-jstris-dhd')!;

dhd.timeline = PROPOSED_TIMELINES['import-jstris-dhd'];

const batch = runPuzzleBaselineBatch(dhd, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
console.log('Selected:', batch.selected?.profile.id);
for (const c of batch.candidates) {
  console.log(`Cand ${c.profile.id}: qualifies=${c.qualifies}, solved=${c.report.solved}, topOut=${c.report.topOut}, pieces=${c.report.piecesUsed}, ticks=${c.report.ticksUsed}, lines=${c.report.linesCleared}`);
}
