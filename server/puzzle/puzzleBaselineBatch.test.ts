import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_RULES_BOT_PROFILE,
  type RulesBotCandidateProfile,
} from '../testHarness/rulesBot.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import {
  comparePuzzleCandidateReports,
  runPuzzleBaselineBatch,
} from './puzzleBaselineBatch.js';
import type { PuzzleLevel } from './puzzleTypes.js';
import type { PuzzleSessionReport as SessionReport } from './puzzleSession.js';

const pcGoal = { kind: 'perfect-clear', maxPieces: 40 } as const;

function cleanLevel(id: string, seed: number, benchmark?: PuzzleLevel['benchmark']): PuzzleLevel {
  const level = generatePuzzleLevel({
    id,
    name: `clean-${id}`,
    seed,
    garbageRows: 0,
    goal: pcGoal,
  });
  if (benchmark) return { ...level, benchmark };
  return level;
}

function profile(partial: Partial<RulesBotCandidateProfile> & Pick<RulesBotCandidateProfile, 'id'>): RulesBotCandidateProfile {
  return {
    policyVersion: 1,
    observationMode: 'omniscient',
    topology: 'none',
    garbageEnabled: false,
    variationSeed: 0,
    ...partial,
  };
}

function fakeReport(partial: Partial<SessionReport>): SessionReport {
  return {
    levelId: 'x',
    solved: true,
    ticksUsed: 100,
    piecesUsed: 10,
    topOut: false,
    linesCleared: 0,
    perfectClear: true,
    score: 0,
    seed: 1,
    finalTick: 100,
    events: [],
    commandRecords: [],
    gameState: {} as SessionReport['gameState'],
    ...partial,
  };
}

describe('puzzleBaselineBatch', () => {
  it('runs each candidate once and selects a qualifying baseline', () => {
    const level = cleanLevel('batch-default', 42);
    const result = runPuzzleBaselineBatch(level, [DEFAULT_RULES_BOT_PROFILE]);
    assert.equal(result.levelId, 'batch-default');
    assert.equal(result.candidates.length, 1);
    assert.equal(result.duplicateProfileIdentities.length, 0);
    assert.ok(result.selected);
    assert.equal(result.selected.qualifies, true);
    assert.equal(typeof result.selected.report.score, 'number');
    assert.equal(result.benchmark.metric, 'score');
  });

  it('is deterministic for the same level and candidate list', () => {
    const level = cleanLevel('batch-det', 99);
    const candidates = [
      DEFAULT_RULES_BOT_PROFILE,
      profile({ id: 'surface', topology: 'surface' }),
    ];
    const a = runPuzzleBaselineBatch(level, candidates);
    const b = runPuzzleBaselineBatch(level, candidates);
    assert.equal(a.selected?.profileIdentity, b.selected?.profileIdentity);
    assert.deepEqual(
      a.candidates.map((c) => [c.profileIdentity, c.report.score, c.report.ticksUsed, c.report.solved]),
      b.candidates.map((c) => [c.profileIdentity, c.report.score, c.report.ticksUsed, c.report.solved]),
    );
  });

  it('reports duplicate profile identities without pretending they are independent', () => {
    const level = cleanLevel('batch-dup', 7);
    const result = runPuzzleBaselineBatch(level, [
      DEFAULT_RULES_BOT_PROFILE,
      DEFAULT_RULES_BOT_PROFILE,
    ]);
    assert.equal(result.candidates.length, 2);
    assert.ok(result.duplicateProfileIdentities.length >= 1);
    assert.match(result.duplicateProfileIdentities[0]!, /^default\|/);
  });

  it('rejects unsolved candidates from baseline selection', () => {
    const level = generatePuzzleLevel({
      id: 'batch-unsolved',
      name: 'batch-unsolved',
      seed: 3,
      garbageRows: 10,
      goal: { kind: 'survive', ticks: 60 * 60 },
    });
    // Extremely short budget forces an unfinished run on a tall stack.
    const result = runPuzzleBaselineBatch(level, [DEFAULT_RULES_BOT_PROFILE], 5);
    assert.equal(result.candidates[0]?.report.solved, false);
    assert.equal(result.candidates[0]?.qualifies, false);
    assert.equal(result.selected, null);
  });

  it('comparePuzzleCandidateReports honors maximize score and minimize ticks', () => {
    const low = fakeReport({ score: 10, ticksUsed: 50 });
    const high = fakeReport({ score: 50, ticksUsed: 80 });
    assert.ok(
      comparePuzzleCandidateReports(high, low, { metric: 'score', direction: 'maximize' }) < 0,
    );
    const fewerTicks = fakeReport({ score: 10, ticksUsed: 20 });
    const moreTicks = fakeReport({ score: 10, ticksUsed: 40 });
    assert.ok(
      comparePuzzleCandidateReports(fewerTicks, moreTicks, {
        metric: 'ticks',
        direction: 'minimize',
      }) < 0,
    );
  });

  it('uses declared benchmark metric from the level', () => {
    const level = cleanLevel('batch-metric', 11, {
      metric: 'ticks',
      direction: 'minimize',
      tieBreakers: [{ metric: 'pieces', direction: 'minimize' }],
    });
    const result = runPuzzleBaselineBatch(level, [DEFAULT_RULES_BOT_PROFILE]);
    assert.equal(result.benchmark.metric, 'ticks');
    assert.equal(result.benchmark.direction, 'minimize');
  });
});
