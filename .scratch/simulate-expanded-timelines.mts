import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';
import type { PuzzleLevel, PuzzleTimelineEvent } from '../server/puzzle/puzzleTypes.js';

// Define the expansions
const expansions: Record<string, PuzzleTimelineEvent[]> = {
  'authored-skew-stairs': [
    { afterPieces: 11, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 13, kind: 'retrim' },
    { afterPieces: 15, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 18, kind: 'sticky' },
    { afterPieces: 21, kind: 'snag' },
    { afterPieces: 24, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 27, kind: 'retrim' },
  ],
  'authored-well-freeze': [
    { afterPieces: 8, kind: 'sticky' },
    { afterPieces: 10, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 12, kind: 'retrim' },
    { afterPieces: 15, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 18, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 21, kind: 'snag' },
    { afterPieces: 24, kind: 'sticky' },
    { afterPieces: 27, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'import-jstris-checkboard': [
    { afterPieces: 13, kind: 'retrim' },
    { afterPieces: 16, kind: 'sticky' },
    { afterPieces: 19, kind: 'snag' },
    { afterPieces: 22, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 25, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 28, kind: 'retrim' },
    { afterPieces: 31, kind: 'sticky' },
  ],
  'import-jstris-lspins-easy': [
    { afterPieces: 12, kind: 'retrim' },
    { afterPieces: 15, kind: 'sticky' },
    { afterPieces: 18, kind: 'snag' },
    { afterPieces: 21, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 24, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 27, kind: 'retrim' },
  ],
  'authored-tslot-setup': [
    { afterPieces: 25, kind: 'sticky' },
    { afterPieces: 28, kind: 'retrim' },
    { afterPieces: 31, kind: 'snag' },
    { afterPieces: 34, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 37, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 40, kind: 'sticky' },
  ],
  'import-jstris-dt-cannon-practice': [
    { afterPieces: 12, kind: 'sticky' },
    { afterPieces: 15, kind: 'retrim' },
    { afterPieces: 18, kind: 'snag' },
    { afterPieces: 21, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 24, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 27, kind: 'sticky' },
  ],
  'import-jstris-t-spin-triples': [
    { afterPieces: 18, kind: 'sticky' },
    { afterPieces: 21, kind: 'retrim' },
    { afterPieces: 24, kind: 'snag' },
    { afterPieces: 27, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 30, kind: 'magnet', params: { stacks: 1 } },
  ],
  'import-fumen-c4w-3res': [
    { afterPieces: 10, kind: 'retrim' },
    { afterPieces: 13, kind: 'snag' },
    { afterPieces: 16, kind: 'sticky' },
    { afterPieces: 19, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 22, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 25, kind: 'sticky' },
  ],
  'import-jstris-the-gutter': [
    { afterPieces: 11, kind: 'retrim' },
    { afterPieces: 14, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 17, kind: 'sticky' },
    { afterPieces: 20, kind: 'snag' },
    { afterPieces: 23, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 26, kind: 'retrim' },
  ],
  'import-jstris-s-spin-triple': [
    { afterPieces: 10, kind: 'retrim' },
    { afterPieces: 13, kind: 'sticky' },
    { afterPieces: 16, kind: 'snag' },
    { afterPieces: 19, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 22, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 25, kind: 'sticky' },
  ],
  'authored-four-wide': [
    { afterPieces: 23, kind: 'sticky' },
    { afterPieces: 26, kind: 'snag' },
    { afterPieces: 29, kind: 'retrim' },
    { afterPieces: 32, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 36, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 40, kind: 'sticky' },
  ],
  'import-jstris-clog': [
    { afterPieces: 22, kind: 'retrim' },
    { afterPieces: 25, kind: 'sticky' },
    { afterPieces: 28, kind: 'snag' },
    { afterPieces: 31, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 34, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'authored-hold-discipline': [
    { afterPieces: 27, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 30, kind: 'retrim' },
    { afterPieces: 33, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 36, kind: 'snag' },
    { afterPieces: 40, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 44, kind: 'sticky' },
  ],
  'authored-pulse-garbage': [
    { afterPieces: 22, kind: 'sticky' },
    { afterPieces: 25, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 28, kind: 'snag' },
    { afterPieces: 31, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 34, kind: 'retrim' },
  ],
  'import-jstris-tripz': [
    { afterPieces: 18, kind: 'retrim' },
    { afterPieces: 21, kind: 'snag' },
    { afterPieces: 24, kind: 'sticky' },
    { afterPieces: 27, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 30, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'import-jstris-srs-training': [
    { afterPieces: 13, kind: 'retrim' },
    { afterPieces: 16, kind: 'sticky' },
    { afterPieces: 19, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 22, kind: 'snag' },
    { afterPieces: 25, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 28, kind: 'sticky' },
  ],
  'authored-late-i-well': [
    { afterPieces: 29, kind: 'retrim' },
    { afterPieces: 32, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 35, kind: 'sticky' },
    { afterPieces: 38, kind: 'snag' },
    { afterPieces: 42, kind: 'retrim' },
    { afterPieces: 46, kind: 'freeze', params: { durationTicks: 360 } },
  ],
  'import-jstris-srs-tower': [
    { afterPieces: 15, kind: 'sticky' },
    { afterPieces: 18, kind: 'snag' },
    { afterPieces: 21, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 24, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 27, kind: 'retrim' },
    { afterPieces: 30, kind: 'sticky' },
  ],
  'import-jstris-godspin': [
    { afterPieces: 18, kind: 'sticky' },
    { afterPieces: 21, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 24, kind: 'snag' },
    { afterPieces: 27, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 30, kind: 'retrim' },
  ],
  'authored-curtain-drop': [
    { afterPieces: 18, kind: 'retrim' },
    { afterPieces: 35, kind: 'magnet', params: { stacks: 1 } },
    { afterPieces: 55, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 85, kind: 'sticky' },
    { afterPieces: 100, kind: 'snag' },
  ],
};

const levelsMap = new Map(buildAuthoredLevels().map(l => [l.id, l]));

for (const [id, extra] of Object.entries(expansions)) {
  const original = levelsMap.get(id);
  if (!original) {
    console.error(`Not found: ${id}`);
    continue;
  }
  const testLevel: PuzzleLevel = {
    ...original,
    timeline: [...original.timeline, ...extra],
  };

  const batch = runPuzzleBaselineBatch(testLevel, DEFAULT_PUZZLE_VALIDATION_CANDIDATES);
  if (batch.selected) {
    console.log(`[PASS] ${id}: profile=${batch.selected.profileId}, pieces=${batch.selected.report.piecesUsed}, score=${batch.selected.report.score}, totalEvents=${testLevel.timeline.length}`);
  } else {
    console.error(`[FAIL] ${id}: NO qualifying solve!`);
  }
}
