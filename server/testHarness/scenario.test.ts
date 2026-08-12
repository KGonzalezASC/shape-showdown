import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Scenario } from './scenario.js';
import { ScriptedDriver } from './inputDriver.js';
import {
  nearTopOutPlayer,
  shopReadyWithOffer,
  validateBoard,
  withCompletedBottomRow,
} from './fixtures.js';
import { BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';

describe('Scenario Harness & Scripted Driver', () => {
  it('runs scripted-versus-scripted scenarios deterministically without server or network', () => {
    const p1Driver1 = new ScriptedDriver({
      5: { actions: ['hardDrop'] },
      30: { actions: ['hold'] },
    });
    const p2Driver1 = new ScriptedDriver({
      10: { inputState: { softDrop: true } },
      40: { actions: ['rotateCW'] },
    });

    const scenario1 = new Scenario({
      seed: 424242,
      drivers: { p1: p1Driver1, p2: p2Driver1 },
    });

    const report1 = scenario1.advance(100);

    const p1Driver2 = new ScriptedDriver({
      5: { actions: ['hardDrop'] },
      30: { actions: ['hold'] },
    });
    const p2Driver2 = new ScriptedDriver({
      10: { inputState: { softDrop: true } },
      40: { actions: ['rotateCW'] },
    });

    const scenario2 = new Scenario({
      seed: 424242,
      drivers: { p1: p1Driver2, p2: p2Driver2 },
    });

    const report2 = scenario2.advance(100);

    assert.equal(report1.finalTick, 100);
    assert.equal(report2.finalTick, 100);
    assert.deepEqual(report1.metrics, report2.metrics);
    assert.deepEqual(report1.events, report2.events);
    assert.deepEqual(report1.gameState, report2.gameState);
  });

  it('applies shop purchases through authoritative applyShopPurchase path', () => {
    const scenario = new Scenario({
      seed: 7007,
      players: {
        p1: shopReadyWithOffer('frost-shift', 500),
      },
    });

    const p1StateBefore = scenario.getPlayerState('p1');
    assert.equal(p1StateBefore.shop.phase, 'ready');
    assert.equal(p1StateBefore.shop.offerIds[0], 'frost-shift');

    const opened = scenario.openShop('p1');
    assert.equal(opened, true);
    assert.equal(p1StateBefore.shop.phase, 'cycling');

    const accepted = scenario.purchase('p1', 'frost-shift');
    assert.equal(accepted, true);

    const p1StateAfter = scenario.getPlayerState('p1');
    const p2StateAfter = scenario.getPlayerState('p2');

    assert.equal(p1StateAfter.funds, 455); // 500 - FREEZE_COST (45)
    assert.equal(p1StateAfter.score, 500);
    assert.ok(p2StateAfter.holdFrozenUntilTick && p2StateAfter.holdFrozenUntilTick > 0);
  });

  it('reproduces line clear attack commitment without duplicate garbage logic', () => {
    const scenario = new Scenario({
      seed: 8888,
      players: {
        p1: withCompletedBottomRow(0), // complete bottom row
      },
    });

    // Place active piece so it locks on tick 1
    const p1 = scenario.getPlayerState('p1');
    p1.activePiece = { type: 'I', rotation: 0, x: -1, y: BOARD_ROWS - 2 };
    p1.lockDelayRemainingTicks = 0;

    const report = scenario.advance(1);

    assert.ok(report.metrics.p1.linesCleared > 0);
    assert.ok(report.metrics.p2.pendingGarbageLines > 0);
    assert.ok(report.events.some((ev) => ev.type === 'attackSent' && ev.playerId === 'p1'));
  });

  it('ends match immediately on top-out fixture', () => {
    const scenario = new Scenario({
      seed: 1111,
      players: {
        p1: nearTopOutPlayer(20),
      },
    });

    const report = scenario.advance(1);

    assert.equal(report.status, 'ended');
    assert.equal(report.winnerId, 'p2');
    assert.equal(report.metrics.p1.topOut, true);
  });

  it('validates board dimensions in fixtures', () => {
    assert.throws(
      () => validateBoard([]),
      /Invalid board height/,
    );
    assert.throws(
      () => validateBoard(Array.from({ length: BOARD_ROWS }, () => Array.from({ length: 5 }, () => null))),
      /Invalid board width/,
    );
  });
});
