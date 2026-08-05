import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runBotQuality,
  runItemImpact,
  runPricingExperiment,
} from './experimentRunners.js';

describe('Separated Experiment Runners', () => {
  it('runBotQuality measures bot performance deterministically without shop noise', () => {
    const report1 = runBotQuality({ runs: 3, seconds: 5, seedPolicyId: 'rulesBot-v1' } as any);
    const report2 = runBotQuality({ runs: 3, seconds: 5, seedPolicyId: 'rulesBot-v1' } as any);

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
  });

  it('runItemImpact measures reference-price impact and computes role-aware deltas', () => {
    const report = runItemImpact({
      runs: 3,
      seconds: 5,
      targetItemId: 'frost-shift',
      costPolicy: 'reference-price',
    });

    assert.equal(report.evidenceType, 'deterministic in-process simulation');
    assert.equal(report.costPolicy, 'reference-price');
    assert.equal(report.controlTraces.length, 3);
    assert.equal(report.treatmentTraces.length, 3);
    assert.ok(typeof report.avgDirectRecipientHolesDelta === 'number');
  });

  it('runPricingExperiment projects price matrix from item impact evidence without altering mechanics', () => {
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
