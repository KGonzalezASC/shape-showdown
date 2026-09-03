import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';
import { PuzzleSession } from '../server/puzzle/puzzleSession.js';
import { createRulesBotFromProfile, DEFAULT_RULES_BOT_PROFILE } from '../server/testHarness/rulesBot.js';

// Map of proposed timelines for testing before editing authoredLevels.ts
export const PROPOSED_TIMELINES: Record<string, any[]> = {
  'authored-cheese-keyhole': [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 6, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'authored-well-freeze': [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 4, kind: 'curtain' },
    { afterPieces: 5, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'authored-skew-stairs': [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 8, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ],
  'authored-pulse-garbage': [
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 7, kind: 'magnet' },
    { afterPieces: 11, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 16, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ],
  'authored-cheese-ladder': [
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 7, kind: 'snag' },
    { afterPieces: 11, kind: 'magnet' },
  ],
  'authored-dig-shaft': [
    { afterPieces: 4, kind: 'retrim' },
    { afterPieces: 10, kind: 'curtain' },
    { afterPieces: 18, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { afterPieces: 26, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 34, kind: 'magnet' },
  ],
  'authored-tslot-setup': [
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 9, kind: 'snag' },
    { afterPieces: 15, kind: 'magnet' },
    { afterPieces: 20, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'authored-four-wide': [
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 10, kind: 'snag' },
    { afterPieces: 16, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ],
  'authored-hold-discipline': [
    { afterPieces: 4, kind: 'retrim' },
    { afterPieces: 8, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 14, kind: 'snag' },
    { afterPieces: 20, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'authored-poison-beat': [
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    { tick: 170, kind: 'wildcard', params: { variant: 2 } },
    { afterPieces: 15, kind: 'poison', params: { variant: 2 } },
    { afterPieces: 22, kind: 'purge', params: { variant: 2 } },
    { afterPieces: 28, kind: 'magnet' },
  ],
  'authored-curtain-drop': [
    { tick: 60, kind: 'retrim' },
    { tick: 480, kind: 'curtain' },
    { tick: 1200, kind: 'curtain' },
    { tick: 1800, kind: 'magnet' },
  ],
  'authored-late-i-well': [
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 11, kind: 'magnet' },
    { afterPieces: 17, kind: 'snag' },
    { afterPieces: 23, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'import-jstris-checkboard': [
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 7, kind: 'snag' },
    { afterPieces: 11, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'import-jstris-ultimate-29-combo': [
    { tick: 120, kind: 'retrim' },
    { tick: 480, kind: 'magnet' },
    { afterPieces: 5, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 12, kind: 'curtain' },
    { afterPieces: 20, kind: 'snag' },
  ],
  'import-fumen-c4w-3res': [
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 5, kind: 'sticky' },
    { afterPieces: 7, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'import-jstris-perfect-clear-how': [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 8, kind: 'snag' },
  ],
  'import-jstris-clear-the-rainbow': [
    { afterPieces: 1, kind: 'retrim' },
    { afterPieces: 3, kind: 'magnet' },
    { afterPieces: 4, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ],
  'import-jstris-lspins-easy': [
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 9, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'import-jstris-cheese-10': [
    { afterPieces: 2, kind: 'poison', params: { variant: 2 } },
    { afterPieces: 4, kind: 'purge', params: { variant: 2 } },
    { afterPieces: 6, kind: 'magnet' },
    { afterPieces: 8, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ],
  'import-jstris-clog': [
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 7, kind: 'curtain' },
    { afterPieces: 12, kind: 'snag' },
    { afterPieces: 17, kind: 'magnet' },
  ],
  'import-jstris-s-spin-triple': [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 5, kind: 'snag' },
    { afterPieces: 7, kind: 'magnet' },
  ],
  'import-jstris-drilltris-1': [
    { afterPieces: 1, kind: 'garbage', params: { lines: 1, delayTicks: 6 } },
    { afterPieces: 2, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'import-jstris-drilltris-2': [
    { afterPieces: 1, kind: 'retrim' },
    { afterPieces: 2, kind: 'snag' },
  ],
  'import-jstris-srs-tower': [
    { afterPieces: 2, kind: 'poison', params: { variant: 2 } },
    { afterPieces: 5, kind: 'wildcard', params: { variant: 2 } },
    { afterPieces: 9, kind: 'snag' },
  ],
  'import-jstris-mash-space': [
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 5, kind: 'magnet' },
  ],
  'import-jstris-srs-training': [
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 6, kind: 'curtain' },
    { afterPieces: 9, kind: 'magnet' },
  ],
  'import-jstris-dt-cannon-practice': [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 5, kind: 'snag' },
    { afterPieces: 8, kind: 'magnet' },
  ],
  'import-jstris-godspin': [
    { afterPieces: 3, kind: 'poison', params: { variant: 2 } },
    { afterPieces: 7, kind: 'sticky' },
    { afterPieces: 10, kind: 'purge', params: { variant: 2 } },
    { afterPieces: 14, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ],
  'import-jstris-many-stsd': [
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 8, kind: 'snag' },
    { afterPieces: 13, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 17, kind: 'retrim' },
    { afterPieces: 21, kind: 'curtain' },
  ],
  'import-jstris-tripz': [
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 6, kind: 'curtain' },
    { afterPieces: 10, kind: 'sticky' },
    { afterPieces: 14, kind: 'magnet' },
  ],
  'import-jstris-the-gutter': [
    { afterPieces: 2, kind: 'retrim' },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 7, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'import-jstris-1v1-downstack': [
    { afterPieces: 2, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 8, kind: 'snag' },
  ],
  'import-jstris-aaron-s-t-spin-tower': [
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 7, kind: 'curtain' },
    { afterPieces: 12, kind: 'snag' },
    { afterPieces: 17, kind: 'retrim' },
    { afterPieces: 21, kind: 'magnet' },
  ],
  'import-jstris-dhd': [
    { tick: 90, kind: 'poison', params: { variant: 1 } },
    { tick: 210, kind: 'wildcard', params: { variant: 1 } },
    { afterPieces: 15, kind: 'magnet' },
    { afterPieces: 22, kind: 'sticky' },
    { afterPieces: 28, kind: 'snag' },
  ],
  'import-jstris-t-spin-triples': [
    { afterPieces: 3, kind: 'retrim' },
    { afterPieces: 7, kind: 'curtain' },
    { afterPieces: 11, kind: 'snag' },
    { afterPieces: 15, kind: 'magnet' },
  ],
};

const levels = buildAuthoredLevels();
let failures = 0;

for (let i = 0; i < levels.length; i++) {
  const level = levels[i];
  if (PROPOSED_TIMELINES[level.id]) {
    level.timeline = PROPOSED_TIMELINES[level.id];
  }

  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
  const passed = batch.selected != null && batch.selected.report.solved;

  if (!passed) {
    failures++;
    console.error(`❌ FAILED: [#${i + 1}] ${level.id} ("${level.name}")`);
  } else {
    console.log(`✅ PASSED: [#${i + 1}] ${level.id} (profile=${batch.selected?.profile.id}, pieces=${batch.selected?.report.piecesUsed}, ticks=${batch.selected?.report.ticksUsed})`);
  }
}

console.log(`\nResult: ${levels.length - failures}/${levels.length} passed.`);
if (failures > 0) process.exit(1);
