import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import { DEFAULT_PUZZLE_VALIDATION_CANDIDATES } from '../server/puzzle/puzzleValidationArtifact.js';

const levels = buildAuthoredLevels();
const dhd = levels.find((l) => l.id === 'import-jstris-dhd')!;

// Test alternative timelines:
const alternatives = [
  [
    { afterPieces: 3, kind: 'poison', params: { variant: 1 } },
    { afterPieces: 7, kind: 'wildcard', params: { variant: 1 } },
    { afterPieces: 16, kind: 'magnet' },
    { afterPieces: 24, kind: 'sticky' },
    { afterPieces: 30, kind: 'snag' },
  ],
  [
    { afterPieces: 4, kind: 'poison', params: { variant: 1 } },
    { afterPieces: 8, kind: 'wildcard', params: { variant: 1 } },
    { afterPieces: 18, kind: 'magnet' },
    { afterPieces: 26, kind: 'sticky' },
  ],
  [
    { tick: 90, kind: 'poison', params: { variant: 1 } },
    { tick: 210, kind: 'wildcard', params: { variant: 1 } },
    { afterPieces: 15, kind: 'magnet' },
    { afterPieces: 22, kind: 'sticky' },
    { afterPieces: 28, kind: 'snag' },
  ]
];

for (let i = 0; i < alternatives.length; i++) {
  dhd.timeline = alternatives[i];
  const b = runPuzzleBaselineBatch(dhd, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
  console.log(`Alt ${i+1}: Selected=${b.selected?.profile.id}, solved=${b.selected?.report.solved}, pieces=${b.selected?.report.piecesUsed}`);
}
