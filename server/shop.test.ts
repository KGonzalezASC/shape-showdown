import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer, makeRng, stepPlayer } from './puzzleEngine/engine.js';
import {
  applyShopPurchase,
  openPlayerShop,
  rollShopOnLineClear,
  tickPlayerShop,
  SHOP_CYCLE_TICKS,
} from './shop.js';
import { SHOP_ROLL_POOL, SHOP_ITEM_BY_ID } from '../src/shop/shopCatalog.js';
import { createInitialShopRoll, drawWeightedShopOffers, SHOP_VISIBLE_COUNT } from '../src/shop/shopRoll.js';
import { BOARD_HIDDEN_ROWS } from '../src/constants.js';
import type { GameState, ShopItem } from '../src/types.js';
import {
  getPricingView,
  priceForLevel,
  PRICING_WINDOW_TICKS,
  SHOP_PRICING_CURVES,
} from '../src/shop/shopPricing.js';

function blankGame(seed = 42): { game: GameState; rng: ReturnType<typeof makeRng> } {
  const rng = makeRng(seed);
  const buyer = makePlayer('buyer', rng);
  const opponent = makePlayer('opponent', rng);
  const game: GameState = {
    players: { buyer, opponent },
    status: 'playing',
    countdown: 0,
    winnerId: null,
    tick: 10,
    seed,
  };
  return { game, rng };
}

describe('shop catalog seam', () => {
  it('every rollable item is purchasable and has a matching catalog cost', () => {
    for (const item of SHOP_ROLL_POOL) {
      assert.equal(item.purchasable, true, `${item.id} must be purchasable`);
      const catalog = SHOP_ITEM_BY_ID.get(item.id);
      assert.ok(catalog, `${item.id} missing from catalog map`);
      assert.equal(catalog!.cost, item.cost);
      assert.ok(SHOP_PRICING_CURVES[item.id], `${item.id} missing pricing curve`);
      assert.equal(priceForLevel(item.id, 0), item.cost);
    }
  });

  it('rolls are deterministic for a fixed seed', () => {
    const a = createInitialShopRoll(SHOP_ROLL_POOL, SHOP_VISIBLE_COUNT, makeRng(99));
    const b = createInitialShopRoll(SHOP_ROLL_POOL, SHOP_VISIBLE_COUNT, makeRng(99));
    assert.deepEqual(
      a.offers.map((o) => o.id),
      b.offers.map((o) => o.id),
    );
    assert.deepEqual(a.bagState, b.bagState);
  });

  it('drawWeightedShopOffers advances bag state deterministically', () => {
    const seed = 12345;
    const first = createInitialShopRoll(SHOP_ROLL_POOL, SHOP_VISIBLE_COUNT, makeRng(seed));
    const r1 = drawWeightedShopOffers(
      SHOP_ROLL_POOL,
      SHOP_VISIBLE_COUNT,
      first.bagState,
      new Set(),
      makeRng(seed + 1),
    );
    const r2 = drawWeightedShopOffers(
      SHOP_ROLL_POOL,
      SHOP_VISIBLE_COUNT,
      first.bagState,
      new Set(),
      makeRng(seed + 1),
    );
    assert.deepEqual(
      r1.offers.map((o) => o.id),
      r2.offers.map((o) => o.id),
    );
  });

  it('baseWeight skews within-tier draws toward heavier items', () => {
    const base: Omit<ShopItem, 'id' | 'baseWeight'> = {
      name: 'x',
      icon: 'x',
      cost: 10,
      tier: 2,
      purchasable: true,
      target: 'self',
      description: '',
    };
    const heavy: ShopItem = { ...base, id: 'heavy', baseWeight: 100 };
    const light: ShopItem = { ...base, id: 'light', baseWeight: 1 };

    let heavyFirst = 0;
    const trials = 2000;
    for (let seed = 1; seed <= trials; seed += 1) {
      const rolled = createInitialShopRoll([heavy, light], 2, makeRng(seed));
      if (rolled.offers[0]?.id === 'heavy') heavyFirst += 1;
    }
    // First offer is the weighted draw; with 100:1 weights it lands on heavy
    // ~99% of the time. Anything below 85% means weights are being ignored.
    assert.ok(heavyFirst > trials * 0.85, `heavy drawn first only ${heavyFirst}/${trials} times`);
  });

  it('zero-weight items are never drawn while a positive-weight sibling exists', () => {
    const base: Omit<ShopItem, 'id' | 'baseWeight'> = {
      name: 'x',
      icon: 'x',
      cost: 10,
      tier: 2,
      purchasable: true,
      target: 'self',
      description: '',
    };
    const positive: ShopItem = { ...base, id: 'positive', baseWeight: 10 };
    const zero: ShopItem = { ...base, id: 'zero', baseWeight: 0 };

    for (let seed = 1; seed <= 500; seed += 1) {
      const rolled = createInitialShopRoll([positive, zero], 2, makeRng(seed));
      assert.equal(rolled.offers[0]?.id, 'positive', `seed ${seed} drew zero-weight item first`);
    }
  });
});

describe('shop purchase / phase harness', () => {
  it('uses the Snag curve and advances after allowance exhaustion', () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6].map((level) => priceForLevel('fortify-frame', level)),
      [60, 115, 230, 445, 870, 1690, 3300],
    );

    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.funds = 10000;
    buyer.shop.offerIds = ['fortify-frame'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'fortify-frame', rng), true);
    assert.equal(buyer.funds, 9940);
    assert.deepEqual(buyer.shop.pricing['fortify-frame'], {
      level: 0,
      purchasesInWindow: 1,
      windowStartedAtTick: game.tick,
    });

    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'fortify-frame', rng), true);
    assert.equal(buyer.funds, 9880);
    assert.deepEqual(buyer.shop.pricing['fortify-frame'], {
      level: 1,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
      lastWindowClosedBy: 'allowance',
    });

    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'fortify-frame', rng), true);
    assert.equal(buyer.funds, 9765);
    assert.equal(buyer.shop.pricing['fortify-frame'].level, 1);
    assert.equal(buyer.shop.pricing['fortify-frame'].purchasesInWindow, 1);
  });

  it('advances exactly one level when the engagement timer expires', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.funds = 10000;
    buyer.shop.offerIds = ['fortify-frame'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'fortify-frame', rng), true);
    const startedAt = buyer.shop.pricing['fortify-frame'].windowStartedAtTick;
    assert.equal(startedAt, game.tick);

    tickPlayerShop(buyer, startedAt! + PRICING_WINDOW_TICKS);
    assert.deepEqual(buyer.shop.pricing['fortify-frame'], {
      level: 1,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
      lastWindowClosedBy: 'timer',
    });
    assert.equal(getPricingView('fortify-frame', buyer.shop.pricing['fortify-frame'], game.tick).currentPrice, 115);
  });

  it('does not extend the engagement timer when a second purchase uses the allowance', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.funds = 10000;
    buyer.shop.offerIds = ['curtain'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'curtain', rng), true);
    const startedAt = buyer.shop.pricing.curtain.windowStartedAtTick;
    game.tick = startedAt! + 10;
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'curtain', rng), true);

    assert.equal(buyer.shop.pricing.curtain.windowStartedAtTick, startedAt);
  });

  it('checks affordability against the current level price', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.funds = 114;
    buyer.shop.pricing['fortify-frame'] = {
      level: 1,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
    };
    buyer.shop.offerIds = ['fortify-frame'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'fortify-frame', rng), false);
    buyer.funds = 115;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'fortify-frame', rng), true);
    assert.equal(buyer.funds, 0);
  });

  it('keeps pricing progression independent for every item', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.funds = 10000;
    buyer.shop.offerIds = ['fortify-frame'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'fortify-frame', rng), true);
    assert.equal(buyer.shop.pricing['fortify-frame'].purchasesInWindow, 1);
    assert.deepEqual(buyer.shop.pricing['nova-charge'], {
      level: 0,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
    });
  });

  it('starts each new player with an untouched pricing record', () => {
    const first = makePlayer('first', makeRng(1));
    first.shop.pricing['fortify-frame'].level = 4;
    first.shop.pricing['fortify-frame'].purchasesInWindow = 1;

    const second = makePlayer('second', makeRng(1));
    assert.deepEqual(second.shop.pricing['fortify-frame'], {
      level: 0,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
    });
  });

  it('preserves explicit overrideCost experiments without entering the dynamic curve', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.funds = 100;
    buyer.shop.offerIds = ['frost-shift'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(
      applyShopPurchase(game, buyer, opponent, 'frost-shift', rng, { overrideCost: 7 }),
      true,
    );
    assert.equal(buyer.funds, 93);
    assert.deepEqual(buyer.shop.pricing['frost-shift'], {
      level: 0,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
    });
  });

  it('rejects purchase when not cycling or wrong highlight', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
    buyer.funds = 9999;
    buyer.shop.offerIds = ['frost-shift', 'retrim'];
    buyer.shop.phase = 'ready';
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'frost-shift', rng), false);

    buyer.shop.phase = 'cycling';
    assert.equal(applyShopPurchase(game, buyer, opponent, 'retrim', rng), false);
  });

  it('applies freeze via catalog cost and semantic effect kind', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    const cost = SHOP_ITEM_BY_ID.get('frost-shift')!.cost;
    buyer.score = cost;
    buyer.funds = cost;
    buyer.shop.offerIds = ['frost-shift'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'frost-shift', rng), true);
    assert.equal(buyer.funds, 0);
    assert.equal(buyer.score, cost);
    assert.equal(buyer.shop.phase, 'waiting');
    assert.ok(opponent.activeEffects?.some((e) => e.kind === 'freeze'));
    assert.ok((opponent.holdFrozenUntilTick ?? 0) > game.tick);
  });

  it('activates delayed curtain on stepPlayer', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
    buyer.funds = 9999;
    buyer.shop.offerIds = ['curtain'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'curtain', rng), true);
    assert.ok(opponent.pendingShopEffects.some((e) => e.itemId === 'curtain'));
    assert.ok(opponent.activeEffects?.some((e) => e.kind === 'curtain-warn'));

    const activation = opponent.pendingShopEffects[0].activationTick;
    game.tick = activation;
    stepPlayer(game.tick, opponent, rng, []);
    assert.ok(opponent.activeEffects?.some((e) => e.kind === 'curtain'));
    assert.equal(opponent.pendingShopEffects.length, 0);
  });

  it('opens ready shop and expires after cycle window', () => {
    const { game } = blankGame();
    const buyer = game.players.buyer;
    rollShopOnLineClear(buyer, makeRng(7));
    assert.equal(buyer.shop.phase, 'ready');
    assert.ok(buyer.shop.offerIds.length > 0);

    assert.equal(openPlayerShop(buyer, game.tick), true);
    assert.equal(buyer.shop.phase, 'cycling');
    assert.equal(buyer.shop.cycleIndex, 0);

    const expireTick = game.tick + SHOP_CYCLE_TICKS * buyer.shop.offerIds.length;
    tickPlayerShop(buyer, expireTick);
    assert.equal(buyer.shop.phase, 'expired');
  });

  it('reverts pricing curves by 2 levels or grants free purchase on Tax Evasion', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
    buyer.funds = 1000;
    buyer.shop.pricing.curtain = { level: 3, purchasesInWindow: 1, windowStartedAtTick: game.tick };
    buyer.shop.pricing['nova-charge'] = { level: 1, purchasesInWindow: 2, windowStartedAtTick: game.tick };
    buyer.shop.pricing['frost-shift'] = { level: 0, purchasesInWindow: 0, windowStartedAtTick: null };

    buyer.shop.offerIds = ['bounty-tax'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'bounty-tax', rng), true);
    assert.equal(buyer.funds, 950); // 1000 - 50 cost
    assert.equal(buyer.shop.pricing.curtain.level, 1);
    assert.equal(buyer.shop.pricing.curtain.freePurchases, undefined);

    assert.equal(buyer.shop.pricing['nova-charge'].level, 0);
    assert.equal(buyer.shop.pricing['nova-charge'].freePurchases, 1);

    assert.equal(buyer.shop.pricing['frost-shift'].level, 0);
    assert.equal(buyer.shop.pricing['frost-shift'].freePurchases, 1);

    assert.equal(getPricingView('frost-shift', buyer.shop.pricing['frost-shift'], game.tick).currentPrice, 0);

    // Buy frost-shift with 0 funds cost
    buyer.shop.offerIds = ['frost-shift'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'frost-shift', rng), true);
    assert.equal(buyer.funds, 950); // unchanged because purchase was free!
    assert.equal(buyer.shop.pricing['frost-shift'].freePurchases, undefined);
    assert.equal(getPricingView('frost-shift', buyer.shop.pricing['frost-shift'], game.tick).currentPrice, 45);
  });

  it('gates storage-toxin on non-empty hold and poisons storage', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
    buyer.funds = 9999;
    buyer.shop.offerIds = ['storage-toxin'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(opponent.holdPiece, null);
    assert.equal(applyShopPurchase(game, buyer, opponent, 'storage-toxin', rng), false);

    opponent.holdPiece = { type: 'J' };
    assert.equal(applyShopPurchase(game, buyer, opponent, 'storage-toxin', rng), true);
    assert.equal(opponent.holdPiece?.type, 'J');
    assert.equal(opponent.holdPiece?.poisoned, true);
    assert.ok(opponent.holdPiece?.poisonVariant);
    assert.ok(opponent.activeEffects?.some((e) => e.kind === 'storage-poison'));
  });

  it('storage-toxin poison survives swap onto the field', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
    buyer.funds = 9999;
    buyer.shop.offerIds = ['storage-toxin'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    opponent.holdPiece = { type: 'S' };
    assert.equal(applyShopPurchase(game, buyer, opponent, 'storage-toxin', rng), true);
    const variant = opponent.holdPiece!.poisonVariant;

    assert.ok(opponent.activePiece);
    opponent.canHold = true;
    opponent.activePiece!.y = BOARD_HIDDEN_ROWS;
    opponent.actionQueue.push('hold');
    stepPlayer(game.tick, opponent, rng, []);

    assert.equal(opponent.activePiece?.type, 'S');
    assert.equal(opponent.activePiece?.poisoned, true);
    assert.equal(opponent.activePiece?.poisonVariant, variant);
  });

  it('vortex-step is legal without poison while wildcard-four requires opponent poison prerequisite', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
    buyer.funds = 9999;

    // 1. Without poison on opponent: vortex-step is legal, wildcard-four is rejected
    buyer.shop.offerIds = ['vortex-step'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'vortex-step', rng), true);

    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'wildcard-four', rng), false);

    // 2. Add poison to opponent stack: wildcard-four becomes legal
    opponent.poisonBoard = Array.from({ length: 20 }, () => Array.from({ length: 10 }, () => 0));
    opponent.poisonBoard[19][0] = 1;

    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'wildcard-four', rng), true);
  });
});
