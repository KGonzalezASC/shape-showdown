import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runExperimentTrace } from './experimentTrace.js';
import { generatePricingReport } from './economyPricing.js';
import { computeBoardPressure } from './boardPressure.js';
import { createEmptyBoard } from '../puzzleEngine/engine.js';
import { BOARD_ROWS } from '../../src/constants.js';

describe('Experiment Trace & Pricing Lab', () => {
  it('computes board pressure metrics correctly', () => {
    const board = createEmptyBoard();
    board[BOARD_ROWS - 1][0] = 'I';
    const pressure = computeBoardPressure(board);
    assert.equal(pressure.aggregateHeight, 1);
    assert.equal(pressure.maxHeight, 1);
    assert.equal(pressure.holes, 0);
  });

  it('runs experiment trace reproducibly for fixed seeds', () => {
    const res1 = runExperimentTrace({ runs: 3, seconds: 5, targetItemId: 'frost-shift' });
    const res2 = runExperimentTrace({ runs: 3, seconds: 5, targetItemId: 'frost-shift' });

    assert.equal(res1.evidenceType, 'deterministic in-process simulation');
    assert.equal(res1.runCount, 3);
    assert.equal(res1.survivalRate, res2.survivalRate);
    assert.equal(res1.avgGrossScore, res2.avgGrossScore);
    assert.deepEqual(res1.runs.map((r) => r.seed), res2.runs.map((r) => r.seed));
  });

  it('generates structured pricing report with explicit evidence labeling and disclaimer', () => {
    const trace = runExperimentTrace({ runs: 2, seconds: 3 });
    const report = generatePricingReport(trace, 'Test Pricing Report');

    assert.equal(report.evidenceType, 'deterministic in-process simulation');
    assert.ok(report.markdown.includes('Evidence Type: deterministic in-process simulation'));
    assert.ok(report.markdown.includes('PROVISIONAL CANDIDATE EVIDENCE ONLY'));
    assert.ok(report.markdown.includes('Per-Run Trace Breakdown'));
  });
});
