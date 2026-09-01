import { createHash } from 'node:crypto';
import {
  DEFAULT_RULES_BOT_PROFILE,
  type RulesBotCandidateProfile,
} from '../testHarness/rulesBot.js';
import { GAME_PROTOCOL_VERSION } from '../../src/protocol/version.js';
import type { PuzzleBaselineBatchResult } from './puzzleBaselineBatch.js';
import {
  DEFAULT_PUZZLE_BENCHMARK,
  type PuzzleBenchmarkPolicy,
  type PuzzleLevel,
} from './puzzleTypes.js';

export type PuzzleValidationStatus = 'passed' | 'failed' | 'invalid-batch';

/** One candidate outcome in the immutable validation artifact (no command traces). */
export interface PuzzleValidationCandidateOutcome {
  profileId: string;
  profileIdentity: string;
  qualifies: boolean;
  solved: boolean;
  topOut: boolean;
  score: number;
  ticksUsed: number;
  piecesUsed: number;
  linesCleared: number;
  perfectClear: boolean;
}

export interface PuzzleValidationSelectedBaseline {
  profileId: string;
  profileIdentity: string;
  score: number;
  ticksUsed: number;
  piecesUsed: number;
  linesCleared: number;
  solved: true;
}

/**
 * Build/staging validation artifact for a curated puzzle.
 * Safe to promote without re-running validation when contentHash matches.
 */
export interface PuzzleValidationArtifact {
  schemaVersion: 1;
  puzzleId: string;
  contentHash: string;
  engineProtocolVersion: number;
  packageVersion: string;
  validationStatus: PuzzleValidationStatus;
  benchmark: PuzzleBenchmarkPolicy;
  batchSize: number;
  candidateProfileIds: string[];
  candidateProfileIdentities: string[];
  duplicateProfileIdentities: string[];
  candidates: PuzzleValidationCandidateOutcome[];
  selectedBaseline: PuzzleValidationSelectedBaseline | null;
  allowedMechanics: {
    shopPolicy: 'none' | 'standard';
    allowHold: boolean;
  };
  scriptedEvents: Array<{ tick: number; kind: string }>;
  /**
   * Levels do not yet carry Puzzle Visibility Policy. Record unspecified
   * so the seam exists without inventing per-puzzle UX.
   */
  visibilityPolicy: 'unspecified';
  /** References only. Never embed hidden solution command traces here. */
  intendedSolutionRefs: string[];
  solutionAlternativeRefs: string[];
}

/** Default meaningful candidate set for staging validation (not identical reruns). */
export const DEFAULT_PUZZLE_VALIDATION_CANDIDATES: readonly RulesBotCandidateProfile[] = [
  DEFAULT_RULES_BOT_PROFILE,
  {
    ...DEFAULT_RULES_BOT_PROFILE,
    id: 'omniscient-surface',
    topology: 'surface',
  },
];

/** Stable SHA-256 of the immutable puzzle content used for promotion checks. */
export function hashPuzzleContent(level: PuzzleLevel): string {
  const payload = {
    id: level.id,
    name: level.name,
    seed: level.seed,
    initialBoard: level.initialBoard,
    queuePrefix: level.queuePrefix,
    goal: level.goal,
    timeline: level.timeline,
    shopPolicy: level.shopPolicy,
    allowHold: level.allowHold ?? true,
    par: level.par ?? null,
    benchmark: level.benchmark ?? DEFAULT_PUZZLE_BENCHMARK,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export interface BuildPuzzleValidationArtifactInput {
  level: PuzzleLevel;
  batch: PuzzleBaselineBatchResult;
  packageVersion: string;
  intendedSolutionRefs?: string[];
  solutionAlternativeRefs?: string[];
}

export function buildPuzzleValidationArtifact(
  input: BuildPuzzleValidationArtifactInput,
): PuzzleValidationArtifact {
  const { level, batch, packageVersion } = input;
  const candidates: PuzzleValidationCandidateOutcome[] = batch.candidates.map((candidate) => ({
    profileId: candidate.profile.id,
    profileIdentity: candidate.profileIdentity,
    qualifies: candidate.qualifies,
    solved: candidate.report.solved,
    topOut: candidate.report.topOut,
    score: candidate.report.score,
    ticksUsed: candidate.report.ticksUsed,
    piecesUsed: candidate.report.piecesUsed,
    linesCleared: candidate.report.linesCleared,
    perfectClear: candidate.report.perfectClear,
  }));

  const selectedBaseline: PuzzleValidationSelectedBaseline | null = batch.selected
    ? {
        profileId: batch.selected.profile.id,
        profileIdentity: batch.selected.profileIdentity,
        score: batch.selected.report.score,
        ticksUsed: batch.selected.report.ticksUsed,
        piecesUsed: batch.selected.report.piecesUsed,
        linesCleared: batch.selected.report.linesCleared,
        solved: true,
      }
    : null;

  let validationStatus: PuzzleValidationStatus = 'passed';
  if (batch.duplicateProfileIdentities.length > 0) {
    validationStatus = 'invalid-batch';
  } else if (!selectedBaseline) {
    validationStatus = 'failed';
  }

  return {
    schemaVersion: 1,
    puzzleId: level.id,
    contentHash: hashPuzzleContent(level),
    engineProtocolVersion: GAME_PROTOCOL_VERSION,
    packageVersion,
    validationStatus,
    benchmark: batch.benchmark,
    batchSize: batch.candidates.length,
    candidateProfileIds: batch.candidates.map((candidate) => candidate.profile.id),
    candidateProfileIdentities: batch.candidates.map((candidate) => candidate.profileIdentity),
    duplicateProfileIdentities: [...batch.duplicateProfileIdentities],
    candidates,
    selectedBaseline,
    allowedMechanics: {
      shopPolicy: level.shopPolicy,
      allowHold: level.allowHold ?? true,
    },
    scriptedEvents: level.timeline.map((event) => ({
      tick: event.tick,
      kind: event.kind,
    })),
    visibilityPolicy: 'unspecified',
    intendedSolutionRefs: [...(input.intendedSolutionRefs ?? [])],
    solutionAlternativeRefs: [...(input.solutionAlternativeRefs ?? [])],
  };
}
