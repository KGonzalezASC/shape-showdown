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
import { extractPieceTimeline, materializeTimeline } from './puzzleTimeline.js';
import { migratePuzzleLevelToPublishedPuzzlePayload } from './publishedPuzzleAdapter.js';
import { encodeCanonicalBytes } from '../../src/puzzle/publishedPuzzle.js';

const PUZZLE_CONTENT_HASH_PREFIX = 'shape-showdown:puzzle:v1\0';

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
  scriptedEvents: Array<{ tick?: number; afterPieces?: number; kind: string }>;
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

/** Stable SHA-256 of the canonical published puzzle payload used for validation artifacts. */
export function hashPuzzleContent(level: PuzzleLevel): string {
  const payload = migratePuzzleLevelToPublishedPuzzlePayload(level);
  const prefixBytes = new TextEncoder().encode(PUZZLE_CONTENT_HASH_PREFIX);
  const payloadBytes = encodeCanonicalBytes(payload);
  const input = new Uint8Array(prefixBytes.length + payloadBytes.length);
  input.set(prefixBytes, 0);
  input.set(payloadBytes, prefixBytes.length);
  return createHash('sha256').update(input).digest('hex');
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
    scriptedEvents: [
      ...materializeTimeline(level.timeline, 60 * 60).map((event) => ({
        tick: event.tick,
        kind: event.kind,
      })),
      ...extractPieceTimeline(level.timeline).map((event) => ({
        afterPieces: event.afterPieces,
        kind: event.kind,
      })),
    ],
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
