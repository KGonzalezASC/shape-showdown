import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runBotQuality,
  runItemImpact,
  runPricingExperiment,
} from './experimentRunners.js';

describe('Separated Experiment Runners', () => {
  it('runBotQuality measures bot performance deterministically without shop noise', () => {
    const report1 = runBotQuality({ runs: 3, seconds: 5, policyId: 'rulesBot-v1' });
    const report2 = runBotQuality({ runs: 3, seconds: 5, policyId: 'rulesBot-v1' });

    assert.equal(report1.evidenceType, 'deterministic in-process simulation');
    assert.equal(report1.runCount, 3);
    assert.equal(report1.survivalRate, report2.survivalRate);
    assert.equal(report1.avgScore, report2.avgScore);
    assert.equal(report1.traces.length, 3);
    assert.equal(report1.traces[0].armType, 'baseline');
  });

  it('runItemImpact measures mechanical impact under mechanical-impact cost policy (0 cost)', () => {
    const report = runItemImpact({
      runs: 3,
      seconds: 5,
      targetItemId: 'frost-shift',
      costPolicy: 'mechanical-impact',
    });

    assert.equal(report.evidenceType, 'deterministic in-process simulation');
    assert.equal(report.costPolicy, 'mechanical-impact');
    assert.equal(report.avgEconomicCost, 0);
    assert.equal(report.roleDeltas.length, 3);

    for (const trace of report.treatmentTraces) {
      assert.equal(trace.players.p1.spending, 0);
    }
  });

  it('runItemImpact resolves target recipient from catalog (self vs opponent)', () => {
    const selfReport = runItemImpact({
      runs: 2,
      seconds: 5,
      targetItemId: 'nova-charge', // self target
      costPolicy: 'reference-price',
    });

    const oppReport = runItemImpact({
      runs: 2,
      seconds: 5,
      targetItemId: 'frost-shift', // opponent target
      costPolicy: 'reference-price',
    });

    assert.equal(selfReport.roleDeltas[0].recipientId, 'p1');
    assert.equal(oppReport.roleDeltas[0].recipientId, 'p2');
  });

  it('runPricingExperiment performs closed-loop candidate price simulations', () => {
    const report = runPricingExperiment({
      runs: 3,
      seconds: 5,
      targetItemId: 'frost-shift',
      candidatePrices: [20, 40, 60, 80],
    });

    assert.equal(report.evidenceType, 'deterministic in-process simulation');
    assert.ok(report.disclaimer.includes('PROVISIONAL CANDIDATE EVIDENCE ONLY'));
    assert.equal(report.priceMatrix.length, 4);
    assert.ok(typeof report.recommendedPrice === 'number');
  });
});
