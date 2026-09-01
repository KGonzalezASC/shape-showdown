/**
 * Staging/build seam: emit immutable puzzle validation artifacts.
 * RulesBot stays in server/testHarness; fixtures/ is not shipped in dist/client.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generatePuzzleLevel } from '../server/puzzle/puzzleGenerator.js';
import { runPuzzleBaselineBatch } from '../server/puzzle/puzzleBaselineBatch.js';
import {
  DEFAULT_PUZZLE_VALIDATION_CANDIDATES,
  buildPuzzleValidationArtifact,
  type PuzzleValidationArtifact,
} from '../server/puzzle/puzzleValidationArtifact.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const outDir = path.resolve('fixtures/puzzle-validation');
fs.mkdirSync(outDir, { recursive: true });

const levels = [
  generatePuzzleLevel({
    id: 'staging-clean-pc',
    name: 'Staging Clean Perfect Clear',
    seed: 42,
    garbageRows: 0,
    goal: { kind: 'perfect-clear', maxPieces: 40 },
  }),
  generatePuzzleLevel({
    id: 'staging-clean-pc-hold-off',
    name: 'Staging Clean Perfect Clear (hold disabled)',
    seed: 77,
    garbageRows: 0,
    allowHold: false,
    goal: { kind: 'perfect-clear', maxPieces: 40 },
  }),
];

const artifacts: PuzzleValidationArtifact[] = [];

for (const level of levels) {
  console.log(`[puzzle-validation] validating ${level.id}...`);
  const batch = runPuzzleBaselineBatch(level, [...DEFAULT_PUZZLE_VALIDATION_CANDIDATES]);
  const artifact = buildPuzzleValidationArtifact({
    level,
    batch,
    packageVersion: pkg.version,
  });
  artifacts.push(artifact);

  const outPath = path.join(outDir, `${level.id}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(
    `[puzzle-validation] ${level.id}: status=${artifact.validationStatus} baseline=${artifact.selectedBaseline?.profileId ?? 'none'} -> ${outPath}`,
  );
}

const indexPath = path.join(outDir, 'index.json');
fs.writeFileSync(
  indexPath,
  `${JSON.stringify(
    {
      packageVersion: pkg.version,
      puzzles: artifacts.map((artifact) => ({
        puzzleId: artifact.puzzleId,
        contentHash: artifact.contentHash,
        validationStatus: artifact.validationStatus,
        selectedBaselineProfileId: artifact.selectedBaseline?.profileId ?? null,
      })),
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`[puzzle-validation] wrote index ${indexPath}`);

const failed = artifacts.filter((artifact) => artifact.validationStatus !== 'passed');
if (failed.length > 0) {
  console.error(
    `[puzzle-validation] ${failed.length} puzzle(s) did not pass: ${failed
      .map((artifact) => `${artifact.puzzleId}=${artifact.validationStatus}`)
      .join(', ')}`,
  );
  process.exitCode = 1;
}
