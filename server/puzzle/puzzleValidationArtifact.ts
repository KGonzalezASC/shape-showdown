import { createHash } from 'node:crypto';
import {
  DEFAULT_RULES_BOT_PROFILE,
  type RulesBotCandidateProfile,
} from '../testHarness/rulesBot.js';
import { GAME_PROTOCOL_VERSION } from '../../src/protocol/version.js';
import { runPuzzleBaselineBatch, type PuzzleBaselineBatchResult } from './puzzleBaselineBatch.js';
import {
  DEFAULT_PUZZLE_BENCHMARK,
  type PuzzleBenchmarkPolicy,
  type PuzzleLevel,
  type PuzzleVisibilityPolicy,
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
  /** Copied from the level; curated catalog entries always set a concrete policy. */
  visibilityPolicy: PuzzleVisibilityPolicy | 'unspecified';
  /** References only. Never embed hidden solution command traces here. */
  intendedSolutionRefs: string[];
  solutionAlternativeRefs: string[];
}

/** Default meaningful candidate set for staging validation (not identical reruns). */
/** Publication baseline candidates: player-limited only. */
export const DEFAULT_PUZZLE_VALIDATION_CANDIDATES: readonly RulesBotCandidateProfile[] = [
  {
    id: 'player-limited-default',
    policyVersion: 1,
    observationMode: 'player-limited',
    topology: 'none',
    garbageEnabled: false,
    variationSeed: 0,
  },
  {
    id: 'player-limited-surface',
    policyVersion: 1,
    observationMode: 'player-limited',
    topology: 'surface',
    garbageEnabled: false,
    variationSeed: 0,
  },
];

/** Omniscient profiles for diagnostics only (not publication baselines). */
export const DIAGNOSTIC_OMNISCIENT_CANDIDATES: readonly RulesBotCandidateProfile[] = [
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
    visibilityPolicy: level.visibilityPolicy ?? 'unspecified',
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
    visibilityPolicy: level.visibilityPolicy ?? 'unspecified',
    intendedSolutionRefs: [...(input.intendedSolutionRefs ?? [])],
    solutionAlternativeRefs: [...(input.solutionAlternativeRefs ?? [])],
  };
}

export interface EmitPuzzleValidationResult {
  artifacts: PuzzleValidationArtifact[];
  exitCode: 0 | 1;
}

/** Run validation batches and build artifacts (no filesystem I/O). */
export function emitPuzzleValidationArtifacts(
  entries: Array<{
    level: PuzzleLevel;
    intendedSolutionRefs?: string[];
    solutionAlternativeRefs?: string[];
  }>,
  packageVersion: string,
  candidates: readonly RulesBotCandidateProfile[] = DEFAULT_PUZZLE_VALIDATION_CANDIDATES,
  maxTicks = 90 * 60,
): EmitPuzzleValidationResult {
  const artifacts: PuzzleValidationArtifact[] = [];
  for (const entry of entries) {
    const batch = runPuzzleBaselineBatch(entry.level, [...candidates], maxTicks);
    artifacts.push(
      buildPuzzleValidationArtifact({
        level: entry.level,
        batch,
        packageVersion,
        intendedSolutionRefs: entry.intendedSolutionRefs,
        solutionAlternativeRefs: entry.solutionAlternativeRefs,
      }),
    );
  }
  const failed = artifacts.some((artifact) => artifact.validationStatus !== 'passed');
  return { artifacts, exitCode: failed ? 1 : 0 };
}
