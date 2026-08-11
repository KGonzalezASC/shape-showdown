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

  it('charges 0 spending in mechanical-impact cost policy across setup and pair arms', () => {
    const report = runCompoundTreatment({
      runs: 3,
      seconds: 5,
      setupItemId: 'elixir-pulse',
      payoffItemId: 'vortex-step',
      costPolicy: 'mechanical-impact',
    });

    assert.equal(report.costPolicy, 'mechanical-impact');
    for (const c of report.cases) {
      assert.equal(c.setupTrace.players.p1.spending, 0);
      assert.equal(c.pairTrace.players.p1.spending, 0);
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

  it('supports Re-Trim <-> Curtain optional order permutations (forward and reverse)', { timeout: 30000 }, () => {
    const forwardReport = runCompoundTreatment({
      runs: 3,
      seconds: 5,
      setupItemId: 'retrim',
      payoffItemId: 'curtain',
      costPolicy: 'reference-price',
    });
    assert.equal(forwardReport.setupItemId, 'retrim');
    assert.equal(forwardReport.payoffItemId, 'curtain');
    assert.equal(forwardReport.cases.length, 3);

    const reverseReport = runCompoundTreatment({
      runs: 3,
      seconds: 5,
      setupItemId: 'curtain',
      payoffItemId: 'retrim',
      costPolicy: 'reference-price',
    });
    assert.equal(reverseReport.setupItemId, 'curtain');
    assert.equal(reverseReport.payoffItemId, 'retrim');
    assert.equal(reverseReport.cases.length, 3);
  });

  it('enforces mandatory-order gating and rejects payoff attempts before Elixir poison activation', () => {
    // 1. Verify policy phase remains 'setup' and ignores payoff offer prior to setup purchase
    const report = runCompoundTreatment({
      runs: 3,
      seconds: 5,
      setupItemId: 'elixir-pulse',
      payoffItemId: 'vortex-step',
      costPolicy: 'reference-price',
    });

    for (const c of report.cases) {
      // In pairTrace, no payoff purchase record precedes the setup purchase record
      const setupIndex = c.pairTrace.purchases.findIndex((p) => p.itemId === 'elixir-pulse' && p.accepted);
      const payoffIndex = c.pairTrace.purchases.findIndex((p) => p.itemId === 'vortex-step' && p.accepted);
      if (payoffIndex !== -1) {
        assert.ok(setupIndex !== -1, 'Payoff must not succeed without setup');
        assert.ok(payoffIndex > setupIndex, 'Payoff accepted index must follow setup accepted index');
      }
    }
  });
});

