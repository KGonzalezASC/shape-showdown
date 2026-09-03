import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';
import { derivePuzzleSolution } from '../server/puzzle/puzzleSolution.js';

const levels = buildAuthoredLevels();
console.log(`Total levels: ${levels.length}`);

const report = [];

for (let i = 0; i < levels.length; i++) {
  const level = levels[i];
  const omni = derivePuzzleSolution(level);
  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
  const selected = batch.selected;

  report.push({
    index: i + 1,
    id: level.id,
    name: level.name,
    goal: level.goal,
    allowHold: level.allowHold ?? true,
    timeline: level.timeline,
    omni: {
      solved: omni.solved,
      ticks: omni.ticksUsed,
      pieces: omni.piecesUsed,
      lines: omni.linesCleared,
      score: omni.score,
    },
    rulesBot: selected ? {
      profile: selected.profile.id,
      solved: selected.report.solved,
      ticks: selected.report.ticksUsed,
      pieces: selected.report.piecesUsed,
      lines: selected.report.linesCleared,
      score: selected.report.score,
    } : null,
  });
}

console.log(JSON.stringify(report, null, 2));
