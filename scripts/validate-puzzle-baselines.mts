/**
 * Staging/build seam: emit immutable puzzle validation artifacts from the catalog.
 * RulesBot stays in server/testHarness; fixtures/ is not shipped in dist/client.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadPuzzleCatalog } from '../server/puzzle/catalog/index.js';
import {
  emitPuzzleValidationArtifacts,
} from '../server/puzzle/puzzleValidationArtifact.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const outDir = path.resolve('fixtures/puzzle-validation');
fs.mkdirSync(outDir, { recursive: true });

const catalog = loadPuzzleCatalog();
const { artifacts, exitCode } = emitPuzzleValidationArtifacts(catalog, pkg.version);

for (const artifact of artifacts) {
  const outPath = path.join(outDir, `${artifact.puzzleId}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(
    `[puzzle-validation] ${artifact.puzzleId}: status=${artifact.validationStatus} baseline=${artifact.selectedBaseline?.profileId ?? 'none'} visibility=${artifact.visibilityPolicy} -> ${outPath}`,
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
        visibilityPolicy: artifact.visibilityPolicy,
        selectedBaselineProfileId: artifact.selectedBaseline?.profileId ?? null,
      })),
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`[puzzle-validation] wrote index ${indexPath}`);

if (exitCode !== 0) {
  const failed = artifacts.filter((artifact) => artifact.validationStatus !== 'passed');
  console.error(
    `[puzzle-validation] ${failed.length} puzzle(s) did not pass: ${failed
      .map((artifact) => `${artifact.puzzleId}=${artifact.validationStatus}`)
      .join(', ')}`,
  );
  process.exitCode = exitCode;
}
