import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';
import fs from 'fs';

const levels = buildAuthoredLevels();

interface LevelRunResult {
  index: number;
  id: string;
  name: string;
  goalDescription: string;
  holdAllowed: boolean;
  profile: string;
  solved: boolean;
  score: number;
  piecesUsed: number;
  linesCleared: number;
  minPiecesPossible: number;
  timelineCount: number;
  timelineKinds: string[];
}

const results: LevelRunResult[] = [];

console.log(`Running RulesBot live across all ${levels.length} levels...\n`);

for (let i = 0; i < levels.length; i++) {
  const level = levels[i];
  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
  
  if (!batch.selected) {
    console.error(`❌ LEVEL #${i + 1} ${level.id} FAILED TO SOLVE!`);
    continue;
  }

  const report = batch.selected.report;
  
  // Calculate goal description and theoretical minimum pieces
  let goalDesc = '';
  let minPieces = 0;
  if (level.goal.kind === 'clear-lines') {
    goalDesc = `Clear ${level.goal.lines} lines`;
    // In standard Tetris, 1 piece covers 4 cells, 1 line = 10 cells = 2.5 pieces minimum
    minPieces = Math.ceil((level.goal.lines * 10) / 4);
  } else if (level.goal.kind === 'survive-clear') {
    goalDesc = `Survive & Clear ${level.goal.lines} lines`;
    minPieces = Math.ceil((level.goal.lines * 10) / 4);
  } else if (level.goal.kind === 'target-cells') {
    goalDesc = `Target Cells (${level.goal.targets.length} cells)`;
    minPieces = Math.ceil(level.goal.targets.length / 4);
  }

  const kinds = (level.timeline as any[]).map(e => {
    if ('afterPieces' in e) return `[p:${e.afterPieces}] ${e.kind}`;
    if ('tick' in e) return `[t:${e.tick}] ${e.kind}`;
    return e.kind;
  });

  results.push({
    index: i + 1,
    id: level.id,
    name: level.name,
    goalDescription: goalDesc,
    holdAllowed: level.allowHold ?? true,
    profile: batch.selected.profile.id,
    solved: report.solved,
    score: report.score,
    piecesUsed: report.piecesUsed,
    linesCleared: report.linesCleared,
    minPiecesPossible: minPieces,
    timelineCount: level.timeline.length,
    timelineKinds: kinds,
  });

  console.log(`[#${i + 1}] ${level.name} (${level.id}): Solved=${report.solved} | Score=${report.score} | Pieces=${report.piecesUsed} (Min: ${minPieces}) | Events=${level.timeline.length}`);
}

fs.writeFileSync('.scratch/rulesbot-score-pieces-results.json', JSON.stringify(results, null, 2));
console.log(`\nCompleted live RulesBot execution across all ${results.length} levels.`);
