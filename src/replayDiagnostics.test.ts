import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BotDecisionTrace, PlayerState, ReplayDataV2 } from './types';
import { analyzeReplayDiagnostics } from './replayDiagnostics';

function makePlayer(id: string, board: Array<Array<'I' | null>>): PlayerState {
  return { id, board } as unknown as PlayerState;
}

function makeTrace(
  playerId: string,
  overrides: Partial<BotDecisionTrace> = {},
): BotDecisionTrace {
  const selected = {
    rotation: 0,
    x: 0,
    score: 10,
    selected: true,
    subScores: {
      lineClearScore: 0,
      holeCountScore: 0,
      holeCountDeltaScore: 0,
      cavityScore: 0,
      heightScore: 0,
      bumpinessScore: 0,
      spiresScore: 0,
      wellsScore: 0,
      poisonScore: 0,
      dropDepthBonus: 0,
      visibilityRiskPenalty: 0,
      finalAdjustmentScore: 0,
      totalScore: 10,
    },
  };
  return {
    tick: 10,
    playerId,
    pieceType: 'I',
    selectedCandidate: selected,
    runnerUpCandidates: [
      { ...selected, score: 0, selected: false, subScores: { ...selected.subScores, totalScore: 0 } },
    ],
    activeEffects: [],
    pendingGarbageLines: 0,
    imminentGarbageLines: 0,
    maxHeight: 2,
    totalCavityDepth: 0,
    ...overrides,
  };
}

function replayWithBothPlayers(): ReplayDataV2 {
  const p1Trace = makeTrace('p1');
  const p2Trace = makeTrace('p2', {
    selectedCandidate: {
      ...p1Trace.selectedCandidate,
      score: -200,
      subScores: {
        ...p1Trace.selectedCandidate.subScores,
        cavityScore: -200,
        visibilityRiskPenalty: 200,
        totalScore: -400,
      },
    },
    runnerUpCandidates: [
      {
        ...p1Trace.selectedCandidate,
        score: 0,
        selected: false,
        subScores: {
          ...p1Trace.selectedCandidate.subScores,
          lineClearScore: 400,
          totalScore: 0,
        },
      },
    ],
    pendingGarbageLines: 3,
    imminentGarbageLines: 2,
  });
  const empty = makePlayer('p1', [[null], [null], [null]]);
  const p2Before = makePlayer('p2', [[null], [null], [null]]);
  const p2After = makePlayer('p2', [['I'], [null], [null]]);

  return {
    version: 2,
    date: '2026-08-09',
    seed: 1,
    playerSlots: { p1: 0, p2: 1 },
    initialState: {} as ReplayDataV2['initialState'],
    inputs: [],
    keyframes: [
      { tick: 0, players: { p1: empty, p2: p2Before } },
      { tick: 10, players: { p1: empty, p2: p2Before }, decisionTraces: { p1: p1Trace, p2: p2Trace } },
      { tick: 20, players: { p1: empty, p2: p2After }, decisionTraces: { p1: p1Trace, p2: p2Trace } },
    ],
    events: [],
  };
}

describe('replay diagnostics', () => {
  it('keeps both players distinct and annotates each trace', () => {
    const replay = replayWithBothPlayers();
    const originalP2Trace = replay.keyframes[1].decisionTraces?.p2;
    const report = analyzeReplayDiagnostics(replay);

    assert.equal(report.totalDecisionTraces, 2);
    assert.deepEqual(report.playerSummaries.map((summary) => summary.playerId), ['p1', 'p2']);
    assert.deepEqual(report.annotatedDecisions.map((decision) => decision.playerId), ['p1', 'p2']);
    assert.equal(report.playerSummaries.find((summary) => summary.playerId === 'p1')?.totalMissteps, 0);
    assert.ok((report.playerSummaries.find((summary) => summary.playerId === 'p2')?.totalMissteps ?? 0) > 0);
    assert.deepEqual(report.annotatedDecisions.find((decision) => decision.playerId === 'p2')?.misstepTags, [
      'BuriedCavity',
      'MisjudgedGarbageUrgency',
      'HighFrontierRisk',
      'MissedGarbageCancel',
    ]);
    assert.equal(originalP2Trace?.misstepTags, undefined);
  });

  it('keeps committed decisions distinct when player-limited traces share tick zero', () => {
    const replay = replayWithBothPlayers();
    const first = makeTrace('p1', { tick: 0, decisionId: 1 });
    const second = makeTrace('p1', { tick: 0, decisionId: 2, pieceType: 'T' });
    replay.keyframes[1].decisionTraces = { p1: first };
    replay.keyframes[2].decisionTraces = { p1: second };

    const report = analyzeReplayDiagnostics(replay);

    assert.equal(report.totalDecisionTraces, 2);
    assert.deepEqual(report.annotatedDecisions.map((decision) => decision.trace.decisionId), [1, 2]);
  });
});
