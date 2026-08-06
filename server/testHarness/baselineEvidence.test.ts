import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runBotQuality, runItemImpact } from './experimentRunners.js';

describe('Baseline Evidence Generation (Section 3)', () => {
  it('records deterministic baseline bot quality evidence across matched seeds', { timeout: 15000 }, () => {
    const report1 = runBotQuality({ runs: 5, seconds: 10, policyId: 'rulesBot-v1', enableGarbage: false });
    const report2 = runBotQuality({ runs: 5, seconds: 10, policyId: 'rulesBot-v1', enableGarbage: false });

    assert.equal(report1.evidenceType, 'deterministic in-process simulation');
    assert.equal(report1.policyId, 'rulesBot-v1');
    assert.equal(report1.runCount, 5);
    assert.equal(report1.survivalRate, report2.survivalRate);
    assert.equal(report1.avgScore, report2.avgScore);
  });

  it('records baseline item impact for Curtain and Poison without modifying bot controller policy', { timeout: 15000 }, () => {
    const curtainReport = runItemImpact({
      runs: 4,
      seconds: 10,
      targetItemId: 'frost-shift',
      costPolicy: 'reference-price',
      policyId: 'rulesBot-v1',
      enableGarbage: false,
    });

    const poisonReport = runItemImpact({
      runs: 4,
      seconds: 10,
      targetItemId: 'elixir-pulse',
      costPolicy: 'reference-price',
      policyId: 'rulesBot-v1',
      enableGarbage: false,
    });

    assert.equal(curtainReport.evidenceType, 'deterministic in-process simulation');
    assert.equal(curtainReport.targetItemId, 'frost-shift');
    assert.equal(curtainReport.matchedCasesCount, 4);

    assert.equal(poisonReport.evidenceType, 'deterministic in-process simulation');
    assert.equal(poisonReport.targetItemId, 'elixir-pulse');
    assert.equal(poisonReport.matchedCasesCount, 4);
    assert.ok(typeof poisonReport.avgDirectRecipientPoisonDelta === 'number');
  });
});
