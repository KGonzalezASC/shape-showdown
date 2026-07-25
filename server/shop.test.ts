import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer, makeRng, stepPlayer } from './tetris/engine.js';
import {
  applyShopPurchase,
  openPlayerShop,
  rollShopOnLineClear,
  tickPlayerShop,
  SHOP_CYCLE_TICKS,
} from './shop.js';
import { SHOP_ROLL_POOL, SHOP_ITEM_BY_ID } from '../src/shop/shopCatalog.js';
import { createInitialShopRoll, drawWeightedShopOffers, SHOP_VISIBLE_COUNT } from '../src/shop/shopRoll.js';
import type { GameState } from '../src/types.js';

function blankGame(seed = 42): { game: GameState; rng: ReturnType<typeof makeRng> } {
  const rng = makeRng(seed);
  const buyer = makePlayer('buyer', rng);
  const opponent = makePlayer('opponent', rng);
  const game: GameState = {
    players: { buyer, opponent },
    status: 'playing',
    countdown: 0,
    remainingTime: 120,
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
});

describe('shop purchase / phase harness', () => {
  it('rejects purchase when not cycling or wrong highlight', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
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
    buyer.shop.offerIds = ['frost-shift'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'frost-shift', rng), true);
    assert.equal(buyer.score, 0);
    assert.equal(buyer.shop.phase, 'waiting');
    assert.ok(opponent.activeEffects?.some((e) => e.kind === 'freeze'));
    assert.ok((opponent.holdFrozenUntilTick ?? 0) > game.tick);
  });

  it('activates delayed curtain on stepPlayer', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
    buyer.shop.offerIds = ['curtain'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    assert.equal(applyShopPurchase(game, buyer, opponent, 'curtain', rng), true);
    assert.ok(opponent.pendingShopEffects.some((e) => e.itemId === 'curtain'));
    assert.ok(opponent.activeEffects?.some((e) => e.kind === 'curtain-warn'));

    const activation = opponent.pendingShopEffects[0].activationTick;
    game.tick = activation;
    stepPlayer(game, opponent, buyer, rng, []);
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

  it('rejects bounty tax when buyer is not behind', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
    opponent.score = 10;
    buyer.shop.offerIds = ['bounty-tax'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'bounty-tax', rng), false);
  });

  it('gates storage-toxin on non-empty hold and poisons storage', () => {
    const { game, rng } = blankGame();
    const buyer = game.players.buyer;
    const opponent = game.players.opponent;
    buyer.score = 9999;
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
    buyer.shop.offerIds = ['storage-toxin'];
    buyer.shop.phase = 'cycling';
    buyer.shop.cycleIndex = 0;

    opponent.holdPiece = { type: 'S' };
    assert.equal(applyShopPurchase(game, buyer, opponent, 'storage-toxin', rng), true);
    const variant = opponent.holdPiece!.poisonVariant;

    assert.ok(opponent.activePiece);
    opponent.canHold = true;
    opponent.activePiece!.y = 20;
    opponent.actionQueue.push('hold');
    stepPlayer(game, opponent, buyer, rng, []);

    assert.equal(opponent.activePiece?.type, 'S');
    assert.equal(opponent.activePiece?.poisoned, true);
    assert.equal(opponent.activePiece?.poisonVariant, variant);
  });
});
