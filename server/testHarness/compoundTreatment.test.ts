import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCompoundTreatment } from './experimentRunners.js';

describe('Compound Treatment Runner (C, P, P+S Arms)', () => {
  it('runs 3-arm matched seed simulations and derives raw impact vectors', () => {
    const report = runCompoundTreatment({
      runs: 3,
      seconds: 5,
      setupItemId: 'elixir-pulse',
      payoffItemId: 'vortex-step',
      costPolicy: 'reference-price',
    });

    assert.equal(report.evidenceType, 'deterministic in-process simulation');
    assert.equal(report.runCount, 3);
    assert.equal(report.setupItemId, 'elixir-pulse');
    assert.equal(report.payoffItemId, 'vortex-step');
    assert.ok(typeof report.avgPoisonDirectValue === 'number');
    assert.ok(typeof report.avgPayoffConditionalValue === 'number');
    assert.ok(typeof report.avgTotalPairValue === 'number');
    assert.equal(report.cases.length, 3);

    for (const c of report.cases) {
      assert.equal(c.controlTrace.armType, 'control');
      assert.equal(c.setupTrace.armType, 'treatment');
      assert.equal(c.pairTrace.armType, 'treatment');
      assert.equal(c.totalPairValue, c.poisonDirectValue + c.payoffConditionalValue);
    }
  });

  it('handles Wildcard +4 payoff sequence as a gated prerequisite treatment', () => {
    const report = runCompoundTreatment({
      runs: 3,
      seconds: 5,
      setupItemId: 'elixir-pulse',
      payoffItemId: 'wildcard-four',
      costPolicy: 'reference-price',
    });

    assert.equal(report.evidenceType, 'deterministic in-process simulation');
    assert.equal(report.payoffItemId, 'wildcard-four');
    assert.equal(report.cases.length, 3);
  });
});
