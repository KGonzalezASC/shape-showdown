import {
  createRulesBotFromProfile,
  serializeRulesBotProfileIdentity,
  type RulesBotCandidateProfile,
} from '../testHarness/rulesBot.js';
import { PuzzleSession, type PuzzleSessionReport } from './puzzleSession.js';
import {
  DEFAULT_PUZZLE_BENCHMARK,
  type PuzzleBenchmarkMetric,
  type PuzzleBenchmarkPolicy,
  type PuzzleLevel,
} from './puzzleTypes.js';

/** One candidate's full batch outcome, including unsolved runs. */
export interface PuzzleCandidateRunResult {
  profile: RulesBotCandidateProfile;
  profileIdentity: string;
  report: PuzzleSessionReport;
  /** Solved and not topped out. Only these may become the Reference Baseline. */
  qualifies: boolean;
}

export interface PuzzleBaselineBatchResult {
  levelId: string;
  benchmark: PuzzleBenchmarkPolicy;
  candidates: PuzzleCandidateRunResult[];
  /** Best qualifying candidate, or null when none solved. */
  selected: PuzzleCandidateRunResult | null;
  /** Identities that appeared more than once in the configured candidate list. */
  duplicateProfileIdentities: string[];
}

export function metricValueForBenchmark(
  report: PuzzleSessionReport,
  metric: PuzzleBenchmarkMetric,
): number {
  switch (metric) {
    case 'score':
      return report.score;
    case 'ticks':
      return report.ticksUsed;
    case 'pieces':
      return report.piecesUsed;
  }
}

/**
 * Compare two reports under a benchmark policy.
 * Negative means `a` is better, positive means `b` is better, 0 is an exact tie.
 */
export function comparePuzzleCandidateReports(
  a: PuzzleSessionReport,
  b: PuzzleSessionReport,
  policy: PuzzleBenchmarkPolicy,
): number {
  const chain: Array<{ metric: PuzzleBenchmarkMetric; direction: 'maximize' | 'minimize' }> = [
    { metric: policy.metric, direction: policy.direction },
    ...(policy.tieBreakers ?? []),
  ];
  for (const step of chain) {
    const av = metricValueForBenchmark(a, step.metric);
    const bv = metricValueForBenchmark(b, step.metric);
    if (av === bv) continue;
    if (step.direction === 'maximize') return av > bv ? -1 : 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}

function collectDuplicateIdentities(
  candidates: readonly RulesBotCandidateProfile[],
): string[] {
  const counts = new Map<string, number>();
  for (const profile of candidates) {
    const identity = serializeRulesBotProfileIdentity(profile);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  const duplicates: string[] = [];
  for (const [identity, count] of counts) {
    if (count > 1) duplicates.push(identity);
  }
  return duplicates.sort();
}

/**
 * Run every candidate profile once against an immutable puzzle level, then
 * select the Reference Baseline from qualifying solved results.
 */
export function runPuzzleBaselineBatch(
  level: PuzzleLevel,
  candidates: readonly RulesBotCandidateProfile[],
  maxTicks = 90 * 60,
): PuzzleBaselineBatchResult {
  const benchmark = level.benchmark ?? DEFAULT_PUZZLE_BENCHMARK;
  const duplicateProfileIdentities = collectDuplicateIdentities(candidates);
  const results: PuzzleCandidateRunResult[] = [];

  for (const profile of candidates) {
    const bot = createRulesBotFromProfile(profile);
    const session = new PuzzleSession({ level, driver: bot, maxTicks });
    session.advance(maxTicks);
    const report = session.getReport();
    results.push({
      profile,
      profileIdentity: serializeRulesBotProfileIdentity(profile),
      report,
      qualifies: report.solved && !report.topOut,
    });
  }

  const qualifying = results.filter((result) => result.qualifies);
  let selected: PuzzleCandidateRunResult | null = null;
  if (qualifying.length > 0) {
    selected = qualifying[0]!;
    for (let i = 1; i < qualifying.length; i++) {
      const candidate = qualifying[i]!;
      if (comparePuzzleCandidateReports(candidate.report, selected.report, benchmark) < 0) {
        selected = candidate;
      }
    }
  }

  return {
    levelId: level.id,
    benchmark,
    candidates: results,
    selected,
    duplicateProfileIdentities,
  };
}
