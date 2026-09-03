/**
 * Build immutable published puzzle packs and manifest from curated catalog source
 * and passing validation artifacts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadPuzzleCatalog } from '../server/puzzle/catalog/index.js';
import { migratePuzzleLevelToPublishedPuzzlePayload } from '../server/puzzle/publishedPuzzleAdapter.js';
import {
  type PublishedPuzzleManifestV1,
  type PublishedPuzzlePackV1,
  type PublishedPuzzleV1,
  type NonEmptyReadonlyArray,
  PUZZLE_RUNTIME_VERSION,
} from '../src/puzzle/publishedPuzzle.js';
import {
  decodePublishedPuzzleManifest,
  decodePublishedPuzzlePack,
  encodePublishedPuzzleManifest,
  encodePublishedPuzzlePack,
  hashPublishedPuzzlePackBytes,
  hashPublishedPuzzlePayload,
} from '../src/puzzle/publishedPuzzleCodec.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version?: string };

export interface BuildPuzzlePacksOptions {
  outDir?: string;
  catalogDir?: string;
  validationDir?: string;
  copyToPublic?: boolean;
}

export async function buildPuzzlePacks(options: BuildPuzzlePacksOptions = {}): Promise<{
  manifest: PublishedPuzzleManifestV1;
  pack: PublishedPuzzlePackV1;
  packSha256: string;
  packBytes: Uint8Array;
  manifestPath: string;
  packPath: string;
}> {
  const projectRoot = path.resolve('.');
  const outDir = options.outDir
    ? path.resolve(options.outDir)
    : path.join(projectRoot, 'dist', 'client', 'puzzles');
  const packsDir = path.join(outDir, 'packs');
  const validationDir = options.validationDir
    ? path.resolve(options.validationDir)
    : path.join(projectRoot, 'fixtures', 'puzzle-validation');

  const catalog = loadPuzzleCatalog();
  if (catalog.length === 0) {
    throw new Error('Puzzle catalog is empty; cannot generate published packs');
  }

  const publishedPuzzles: PublishedPuzzleV1[] = [];

  for (const entry of catalog) {
    const level = entry.level;
    const payload = migratePuzzleLevelToPublishedPuzzlePayload(level);
    const payloadHash = await hashPublishedPuzzlePayload(payload);

    const artifactPath = path.join(validationDir, `${level.id}.json`);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(
        `Missing passing validation artifact for puzzle ${level.id} at ${artifactPath}`,
      );
    }

    const artifactRaw = fs.readFileSync(artifactPath, 'utf8');
    const artifact = JSON.parse(artifactRaw) as {
      validationStatus?: string;
      contentHash?: string;
      selectedBaseline?: {
        score: number;
        ticksUsed: number;
        piecesUsed: number;
        linesCleared: number;
      } | null;
    };

    if (artifact.validationStatus !== 'passed') {
      throw new Error(
        `Puzzle ${level.id} validation artifact status is '${artifact.validationStatus}', expected 'passed'`,
      );
    }

    if (artifact.contentHash !== payloadHash) {
      throw new Error(
        `Puzzle ${level.id} content hash mismatch: artifact has '${artifact.contentHash}', computed payload hash is '${payloadHash}'`,
      );
    }

    if (!artifact.selectedBaseline) {
      throw new Error(
        `Puzzle ${level.id} lacks selectedBaseline metrics in validation artifact`,
      );
    }

    const puzzle: PublishedPuzzleV1 = {
      payload,
      contentHash: payloadHash,
      publicBaseline: {
        score: artifact.selectedBaseline.score,
        ticksUsed: artifact.selectedBaseline.ticksUsed,
        piecesUsed: artifact.selectedBaseline.piecesUsed,
        linesCleared: artifact.selectedBaseline.linesCleared,
      },
    };

    publishedPuzzles.push(puzzle);
  }

  const [firstPuzzle, ...restPuzzles] = publishedPuzzles;
  if (!firstPuzzle) throw new Error('No published puzzles generated');
  const puzzleList: NonEmptyReadonlyArray<PublishedPuzzleV1> = [firstPuzzle, ...restPuzzles];

  const pack: PublishedPuzzlePackV1 = {
    schemaVersion: 1,
    id: 'curated-catalog',
    puzzles: puzzleList,
  };

  const packBytes = encodePublishedPuzzlePack(pack);
  const packSha256 = await hashPublishedPuzzlePackBytes(packBytes);
  const packFilename = `${pack.id}.${packSha256.slice(0, 16)}.json`;
  const packRelativeUrl = `./packs/${packFilename}`;

  const manifest: PublishedPuzzleManifestV1 = {
    schemaVersion: 1,
    puzzleRuntimeVersion: PUZZLE_RUNTIME_VERSION,
    releaseId: `${pkg.version ?? '0.0.0'}-${packSha256.slice(0, 8)}`,
    packs: [
      {
        id: pack.id,
        url: packRelativeUrl,
        sha256: packSha256,
        byteLength: packBytes.length,
        puzzleIds: publishedPuzzles.map((p) => p.payload.id) as unknown as NonEmptyReadonlyArray<string>,
      },
    ],
  };

  fs.mkdirSync(packsDir, { recursive: true });

  const packPath = path.join(packsDir, packFilename);
  fs.writeFileSync(packPath, packBytes);

  const manifestText = encodePublishedPuzzleManifest(manifest);
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, manifestText, 'utf8');

  // Verify decoded output immediately
  await decodePublishedPuzzlePack(packBytes, packSha256);
  decodePublishedPuzzleManifest(manifestText);

  // Optionally copy to public/puzzles for dev and testing
  const copyToPublic = options.copyToPublic ?? true;
  if (copyToPublic) {
    const publicPuzzlesDir = path.join(projectRoot, 'public', 'puzzles');
    const publicPacksDir = path.join(publicPuzzlesDir, 'packs');
    fs.mkdirSync(publicPacksDir, { recursive: true });
    fs.writeFileSync(path.join(publicPacksDir, packFilename), packBytes);
    fs.writeFileSync(path.join(publicPuzzlesDir, 'manifest.json'), manifestText, 'utf8');
  }

  return {
    manifest,
    pack,
    packSha256,
    packBytes,
    manifestPath,
    packPath,
  };
}

// Direct CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/build-puzzle-packs.mts')) {
  try {
    const result = await buildPuzzlePacks();
    console.log(
      `[build-puzzle-packs] Generated pack '${result.pack.id}' with ${result.pack.puzzles.length} puzzles`,
    );
    console.log(`[build-puzzle-packs] Pack SHA-256: ${result.packSha256}`);
    console.log(`[build-puzzle-packs] Pack size: ${result.packBytes.length} bytes`);
    console.log(`[build-puzzle-packs] Manifest: ${result.manifestPath}`);
    console.log(`[build-puzzle-packs] Pack file: ${result.packPath}`);
  } catch (err) {
    console.error(`[build-puzzle-packs] Failed:`, err);
    process.exitCode = 1;
  }
}
