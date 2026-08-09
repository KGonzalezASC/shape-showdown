import type { BotDecisionTrace, MisstepTag, ReplayDataV2 } from './types';

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

export interface AnnotatedDecision {
  tick: number;
  playerId: string;
  trace: BotDecisionTrace;
  misstepTags: MisstepTag[];
}

export interface PlayerDiagnosticSummary {
  playerId: string;
  totalDecisionTraces: number;
  totalMissteps: number;
  misstepCounts: Record<MisstepTag, number>;
}

export interface ReplayDiagnosticReport {
  evidenceType: 'retrospective diagnostic analysis';
  totalTicks: number;
  totalKeyframes: number;
  totalDecisionTraces: number;
  totalMissteps: number;
  misstepCounts: Record<MisstepTag, number>;
  hotspotBins: HotspotTimeBin[];
  playerSummaries: PlayerDiagnosticSummary[];
  seedSummaries?: SeedDiagnosticSummary[];
  annotatedDecisions: AnnotatedDecision[];
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

function countBoardHoles(board: Array<Array<string | null>>): number {
  let holes = 0;
  for (let x = 0; x < (board[0]?.length ?? 0); x += 1) {
    let filledFound = false;
    for (const row of board) {
      if (row[x] !== null) {
        filledFound = true;
      } else if (filledFound) {
        holes += 1;
      }
    }
  }
  return holes;
}

function classifyMissteps(
  trace: BotDecisionTrace,
  frameIndex: number,
  replay: ReplayDataV2,
): MisstepTag[] {
  const selected = trace.selectedCandidate;
  const runnerUps = trace.runnerUpCandidates ?? [];
  const selectedSub = selected?.subScores;
  const selectedCavityRisk =
    (selectedSub?.cavityScore ?? 0) + (selectedSub?.holeCountDeltaScore ?? 0);
  const bestCavityAlternative = Math.max(
    ...runnerUps.map(
      (candidate) =>
        (candidate.subScores?.cavityScore ?? 0) +
        (candidate.subScores?.holeCountDeltaScore ?? 0),
    ),
    -Infinity,
  );
  const misstepTags: MisstepTag[] = [];

  // This is a flag for a selected placement that worsened cavity/hole risk while
  // a recorded alternative materially reduced it. It is not a claim that the
  // alternative would have won the full match.
  let futureHoleIncreased = false;
  const currentBoard = trace.decisionBoard ?? replay.keyframes[frameIndex]?.players?.[trace.playerId]?.board;
  if (currentBoard) {
    const currentHoles = countBoardHoles(currentBoard);
    for (let j = 1; j <= 3 && frameIndex + j < replay.keyframes.length; j += 1) {
      const futureBoard = replay.keyframes[frameIndex + j]?.players?.[trace.playerId]?.board;
      if (futureBoard && countBoardHoles(futureBoard) > currentHoles + 1) {
        futureHoleIncreased = true;
        break;
      }
    }
  }
  if (
    (selectedCavityRisk < -100 || futureHoleIncreased) &&
    bestCavityAlternative > selectedCavityRisk + 50
  ) {
    misstepTags.push('BuriedCavity');
  }

  const bestLineClearAlternative = Math.max(
    ...runnerUps.map((candidate) => candidate.subScores?.lineClearScore ?? 0),
    -Infinity,
  );
  if (
    trace.imminentGarbageLines > 0 &&
    bestLineClearAlternative > (selectedSub?.lineClearScore ?? 0) + 200
  ) {
    misstepTags.push('MisjudgedGarbageUrgency');
  }

  const bestVisibilityAlternative = Math.min(
    ...runnerUps.map((candidate) => candidate.subScores?.visibilityRiskPenalty ?? 0),
    Infinity,
  );
  if (
    (selectedSub?.visibilityRiskPenalty ?? 0) >= 120 &&
    bestVisibilityAlternative + 80 < (selectedSub?.visibilityRiskPenalty ?? 0)
  ) {
    misstepTags.push('HighFrontierRisk');
  }

  if (
    trace.pendingGarbageLines > 0 &&
    bestLineClearAlternative > (selectedSub?.lineClearScore ?? 0) + 300
  ) {
    misstepTags.push('MissedGarbageCancel');
  }

  return misstepTags;
}

/**
 * Produces retrospective flags from recorded bot traces and board snapshots.
 * The flags are diagnostic evidence, not authoritative match outcomes: they
 * identify a suspicious decision and preserve the player/tick needed to inspect it.
 */
export function analyzeReplayDiagnostics(
  replay: ReplayDataV2,
  binSizeTicks = 100,
): ReplayDiagnosticReport {
  const keyframes = replay.keyframes || [];
  const maxTraceTick = keyframes.reduce((max, frame) => {
    return Math.max(
      max,
      ...Object.values(frame.decisionTraces ?? {}).map((trace) => trace.tick),
    );
  }, 0);
  const totalTicks = Math.max(keyframes[keyframes.length - 1]?.tick ?? 0, maxTraceTick);
  const totalKeyframes = keyframes.length;
  const numBins = Math.max(1, Math.ceil(Math.max(1, totalTicks) / binSizeTicks));
  const hotspotBins: HotspotTimeBin[] = Array.from({ length: numBins }, (_, i) => ({
    tickStart: i * binSizeTicks,
    tickEnd: (i + 1) * binSizeTicks,
    counts: createEmptyMisstepCounts(),
    totalMissteps: 0,
  }));

  const misstepCounts = createEmptyMisstepCounts();
  const playerSummaryById = new Map<string, PlayerDiagnosticSummary>();
  const annotatedDecisions: AnnotatedDecision[] = [];
  const seenDecisionKeys = new Set<string>();
  let totalDecisionTraces = 0;
  let totalMissteps = 0;

  for (let frameIndex = 0; frameIndex < keyframes.length; frameIndex += 1) {
    const frame = keyframes[frameIndex];
    for (const [traceKey, originalTrace] of Object.entries(frame.decisionTraces ?? {})) {
      const playerId = originalTrace.playerId || traceKey;
      const legacyCandidateKey = `${originalTrace.tick}:${originalTrace.pieceType}:${originalTrace.selectedCandidate.rotation}:${originalTrace.selectedCandidate.x}`;
      const decisionKey = `${playerId}:${originalTrace.decisionId !== undefined ? `id:${originalTrace.decisionId}` : legacyCandidateKey}`;
      if (seenDecisionKeys.has(decisionKey)) continue;
      seenDecisionKeys.add(decisionKey);
      const trace = { ...originalTrace, playerId };
      const misstepTags = classifyMissteps(trace, frameIndex, replay);
      trace.misstepTags = misstepTags;
      totalDecisionTraces += 1;

      let playerSummary = playerSummaryById.get(playerId);
      if (!playerSummary) {
        playerSummary = {
          playerId,
          totalDecisionTraces: 0,
          totalMissteps: 0,
          misstepCounts: createEmptyMisstepCounts(),
        };
        playerSummaryById.set(playerId, playerSummary);
      }
      playerSummary.totalDecisionTraces += 1;

      const binIndex = Math.min(
        numBins - 1,
        Math.max(0, Math.floor(trace.tick / binSizeTicks)),
      );
      for (const tag of misstepTags) {
        misstepCounts[tag] += 1;
        playerSummary.misstepCounts[tag] += 1;
        playerSummary.totalMissteps += 1;
        totalMissteps += 1;
        hotspotBins[binIndex].counts[tag] += 1;
        hotspotBins[binIndex].totalMissteps += 1;
      }

      annotatedDecisions.push({
        tick: trace.tick,
        playerId,
        trace,
        misstepTags,
      });
    }
  }

  annotatedDecisions.sort((a, b) => a.tick - b.tick || a.playerId.localeCompare(b.playerId));

  return {
    evidenceType: 'retrospective diagnostic analysis',
    totalTicks,
    totalKeyframes,
    totalDecisionTraces,
    totalMissteps,
    misstepCounts,
    hotspotBins,
    playerSummaries: [...playerSummaryById.values()],
    annotatedDecisions,
  };
}
