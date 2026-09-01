import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Metrics from the published Validation Artifact Reference Baseline. */
export interface PuzzleReferenceBaseline {
  score: number;
  ticksUsed: number;
  piecesUsed: number;
  linesCleared: number;
  profileId: string;
}

interface ArtifactSelectedBaseline {
  score?: number;
  ticksUsed?: number;
  piecesUsed?: number;
  linesCleared?: number;
  profileId?: string;
}

interface ArtifactFile {
  selectedBaseline?: ArtifactSelectedBaseline | null;
  validationStatus?: string;
}

/**
 * Load the checked-in Reference Baseline for a curated puzzle id.
 * Returns null when the fixture is missing or has no selected baseline.
 */
export function loadReferenceBaseline(
  puzzleId: string,
  fixturesDir = join(process.cwd(), 'fixtures', 'puzzle-validation'),
): PuzzleReferenceBaseline | null {
  const path = join(fixturesDir, `${puzzleId}.json`);
  if (!existsSync(path)) return null;
  try {
    const artifact = JSON.parse(readFileSync(path, 'utf8')) as ArtifactFile;
    const baseline = artifact.selectedBaseline;
    if (!baseline || artifact.validationStatus !== 'passed') return null;
    if (
      typeof baseline.score !== 'number' ||
      typeof baseline.ticksUsed !== 'number' ||
      typeof baseline.piecesUsed !== 'number' ||
      typeof baseline.profileId !== 'string'
    ) {
      return null;
    }
    return {
      score: baseline.score,
      ticksUsed: baseline.ticksUsed,
      piecesUsed: baseline.piecesUsed,
      linesCleared: typeof baseline.linesCleared === 'number' ? baseline.linesCleared : 0,
      profileId: baseline.profileId,
    };
  } catch {
    return null;
  }
}
