import type {
  BotDecisionTrace,
  MisstepTag,
  ReplayDataV2,
  ReplayKeyframe,
} from './types';

export interface HotspotTimeBin {
  tickStart: number;
  tickEnd: number;
  counts: Record<MisstepTag, number>;
  totalMissteps: number;
}

export interface SeedDiagnosticSummary {
  seed: number;
  totalTicks: number;
  totalMissteps: number;
  misstepCounts: Record<MisstepTag, number>;
  topOut: boolean;
  finalScore: number;
}

export interface ReplayDiagnosticReport {
  evidenceType: 'retrospective diagnostic analysis';
  totalKeyframes: number;
  totalDecisionTraces: number;
  totalMissteps: number;
  misstepCounts: Record<MisstepTag, number>;
  hotspotBins: HotspotTimeBin[];
  seedSummaries?: SeedDiagnosticSummary[];
  annotatedKeyframes: Array<{
    tick: number;
    trace?: BotDecisionTrace;
    misstepTags: MisstepTag[];
  }>;
}

export const MISSTEP_CATEGORIES: MisstepTag[] = [
  'BuriedCavity',
  'MisjudgedGarbageUrgency',
  'HighFrontierRisk',
  'MissedGarbageCancel',
];

export function createEmptyMisstepCounts(): Record<MisstepTag, number> {
  return {
    BuriedCavity: 0,
    MisjudgedGarbageUrgency: 0,
    HighFrontierRisk: 0,
    MissedGarbageCancel: 0,
  };
}

/**
  * Retrospectively analyzes a replay file or decision trace stream for solver missteps,
  * generating hotspot heatmap bins and diagnostic habit reports.
  */
export function analyzeReplayDiagnostics(
  replay: ReplayDataV2,
  binSizeTicks = 100,
): ReplayDiagnosticReport {
  const keyframes = replay.keyframes || [];
  const totalKeyframes = keyframes.length;
  const maxTick = keyframes[keyframes.length - 1]?.tick ?? 3600;

  const numBins = Math.max(1, Math.ceil(maxTick / binSizeTicks));
  const hotspotBins: HotspotTimeBin[] = Array.from({ length: numBins }, (_, i) => ({
    tickStart: i * binSizeTicks,
    tickEnd: (i + 1) * binSizeTicks,
    counts: createEmptyMisstepCounts(),
    totalMissteps: 0,
  }));

  const misstepCounts = createEmptyMisstepCounts();
  let totalDecisionTraces = 0;
  let totalMissteps = 0;

  const annotatedKeyframes: Array<{
    tick: number;
    trace?: BotDecisionTrace;
    misstepTags: MisstepTag[];
  }> = [];

  for (let i = 0; i < keyframes.length; i++) {
    const frame = keyframes[i];
    const trace = frame.decisionTraces?.p1 || frame.decisionTraces?.p2;
    const misstepTags: MisstepTag[] = [];

    if (trace) {
      totalDecisionTraces++;

      // 1. Check BuriedCavity: Retrospective lookahead over next 3 frames
      const selected = trace.selectedCandidate;
      const cavityScore = selected?.subScores?.cavityScore ?? 0;
      const holeDelta = selected?.subScores?.holeCountDeltaScore ?? 0;

      let futureHoleIncreased = false;
      for (let j = 1; j <= 3 && i + j < keyframes.length; j++) {
        const nextFrameP1 = keyframes[i + j].players?.p1;
        const prevFrameP1 = frame.players?.p1;
        if (nextFrameP1 && prevFrameP1) {
          const prevHoles = prevFrameP1.board.reduce(
            (sum, row) => sum + row.filter((c) => c === null).length,
            0,
          );
          const nextHoles = nextFrameP1.board.reduce(
            (sum, row) => sum + row.filter((c) => c === null).length,
            0,
          );
          if (nextHoles > prevHoles + 1 && cavityScore < -50) {
            futureHoleIncreased = true;
            break;
          }
        }
      }

      if (holeDelta < 0 || cavityScore < -100 || futureHoleIncreased) {
        misstepTags.push('BuriedCavity');
      }

      // 2. Check MisjudgedGarbageUrgency
      if (
        trace.imminentGarbageLines > 0 &&
        selected?.subScores?.lineClearScore === 0 &&
        trace.runnerUpCandidates.some((c) => (c.subScores?.lineClearScore ?? 0) > 200)
      ) {
        misstepTags.push('MisjudgedGarbageUrgency');
      }

      // 3. Check HighFrontierRisk
      if (
        (selected?.subScores?.visibilityRiskPenalty ?? 0) >= 120 &&
        trace.runnerUpCandidates.some((c) => (c.subScores?.visibilityRiskPenalty ?? 0) === 0)
      ) {
        misstepTags.push('HighFrontierRisk');
      }

      // 4. Check MissedGarbageCancel
      if (
        trace.pendingGarbageLines > 0 &&
        (selected?.subScores?.lineClearScore ?? 0) === 0 &&
        trace.runnerUpCandidates.some((c) => (c.subScores?.lineClearScore ?? 0) > 300)
      ) {
        misstepTags.push('MissedGarbageCancel');
      }

      // Mutate trace misstepTags for UI binding
      trace.misstepTags = misstepTags;
    }

    for (const tag of misstepTags) {
      misstepCounts[tag]++;
      totalMissteps++;

      const binIndex = Math.min(numBins - 1, Math.floor(frame.tick / binSizeTicks));
      hotspotBins[binIndex].counts[tag]++;
      hotspotBins[binIndex].totalMissteps++;
    }

    annotatedKeyframes.push({
      tick: frame.tick,
      trace,
      misstepTags,
    });
  }

  return {
    evidenceType: 'retrospective diagnostic analysis',
    totalKeyframes,
    totalDecisionTraces,
    totalMissteps,
    misstepCounts,
    hotspotBins,
    annotatedKeyframes,
  };
}
