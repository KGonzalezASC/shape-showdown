import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSimpleShopPolicy, PairedRunner } from './pairedRunner.js';
import { shopReadyWithOffer } from './fixtures.js';

describe('PairedRunner Bot vs Bot Harness', () => {
  it('runs bot-versus-bot match deterministically by seed', () => {
    const runner1 = new PairedRunner({ seed: 7777 });
    const report1 = runner1.run(150);

    const runner2 = new PairedRunner({ seed: 7777 });
    const report2 = runner2.run(150);

    assert.equal(report1.ticks, report2.ticks);
    assert.equal(report1.status, report2.status);
    assert.equal(report1.winnerId, report2.winnerId);
    assert.deepEqual(report1.metrics, report2.metrics);
    assert.deepEqual(report1.events, report2.events);
  });

  it('executes shop policy and records accepted/rejected shop purchases', () => {
    const runner = new PairedRunner({
      seed: 9090,
      players: {
        p1: shopReadyWithOffer('frost-shift', 500),
      },
      shopPolicies: {
        p1: createSimpleShopPolicy('frost-shift', 100),
      },
    });

    const report = runner.run(10);

    assert.ok(report.purchases.length > 0);
    const purchase = report.purchases.find((p) => p.itemId === 'frost-shift');
    assert.ok(purchase);
    assert.equal(purchase.accepted, true);
    assert.equal(purchase.cost, 45);
    assert.ok(report.walletHistory.p1.length > 0);
  });

  it('records the current dynamic price after a prior level is exhausted', () => {
    const runner = new PairedRunner({
      seed: 9091,
      players: {
        p1: (player) => {
          player.funds = 200;
          player.shop.pricing['frost-shift'].level = 1;
          player.shop.offerIds = ['frost-shift'];
          player.shop.phase = 'ready';
        },
      },
      shopPolicies: {
        p1: createSimpleShopPolicy('frost-shift'),
      },
    });

    const report = runner.run(10);
    const purchase = report.purchases.find((p) => p.itemId === 'frost-shift');
    assert.ok(purchase);
    assert.equal(purchase.accepted, true);
    assert.equal(purchase.cost, 70);
  });

  it('verifies GameManager does not import testHarness/rulesBot modules', () => {
    const gmPath = path.resolve('server/GameManager.ts');
    const gmSource = fs.readFileSync(gmPath, 'utf8');

    assert.equal(gmSource.includes('rulesBot'), false);
    assert.equal(gmSource.includes('testHarness'), false);
  });
});
