import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BotDecisionTrace, PlayerState, ReplayDataV2 } from './types';
import { deriveReplayDecisionOutcome } from './replayDecisionOutcome';

function makePlayer(
  id: string,
  overrides: Partial<PlayerState> = {},
): PlayerState {
  return {
    id,
    board: Array.from({ length: 20 }, () => Array(10).fill(null)),
    score: 0,
    linesCleared: 0,
    lastHardDropTick: -1,
    ...overrides,
  } as PlayerState;
}

function makeTrace(overrides: Partial<BotDecisionTrace> = {}): BotDecisionTrace {
  return {
    // Player-limited policy time is normalized, while replayTick remains absolute.
    tick: 0,
    replayTick: 3,
    playerId: 'p1',
    pieceType: 'L',
    decisionScore: 0,
    selectedCandidate: {
      rotation: 0,
      x: 7,
      score: 10,
      selected: true,
      subScores: {} as BotDecisionTrace['selectedCandidate']['subScores'],
    },
    runnerUpCandidates: [],
    activeEffects: [],
    pendingGarbageLines: 0,
    imminentGarbageLines: 0,
    maxHeight: 0,
    totalCavityDepth: 0,
    ...overrides,
  };
}

function makeReplay(): ReplayDataV2 {
  return {
    version: 2,
    date: '2026-08-09',
    seed: 1,
    initialState: {} as ReplayDataV2['initialState'],
    inputs: [],
    keyframes: [
      { tick: 0, players: { p1: makePlayer('p1'), p2: makePlayer('p2') } },
      {
        tick: 2,
        players: {
          p1: makePlayer('p1', { score: 50, lastLockTick: 2 }),
          p2: makePlayer('p2'),
        },
      },
      {
        tick: 10,
        players: { p1: makePlayer('p1'), p2: makePlayer('p2') },
        decisionTraces: { p1: makeTrace() },
      },
      {
        tick: 40,
        players: {
          p1: makePlayer('p1', { score: 120, linesCleared: 1, lastLockTick: 39 }),
          p2: makePlayer('p2'),
        },
      },
    ],
    events: [
      { tick: 39, type: 'lineClear', playerId: 'p1', lines: 1, tSpin: false },
      { tick: 39, type: 'attackSent', playerId: 'p1', lines: 1 },
      { tick: 39, type: 'garbageApplied', playerId: 'p1', lines: 2 },
    ],
  };
}

describe('replay decision outcomes', () => {
  it('summarizes the observed lock outcome after a committed decision', () => {
    const outcome = deriveReplayDecisionOutcome(makeReplay(), makeTrace());

    assert.deepEqual(outcome, {
      decisionTick: 3,
      lockTick: 39,
      snapshotTick: 40,
      scoreDelta: 120,
      linesCleared: 1,
      attackSent: 1,
      garbageApplied: 2,
      maxHeightBefore: 0,
      maxHeightAfter: 0,
      maxHeightDelta: 0,
    });
  });
});
