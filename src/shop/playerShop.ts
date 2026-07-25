import { PlayerShopState, PlayerState } from '../types';
import { MutableRng } from '../rng';
import { SHOP_ROLL_POOL } from './shopCatalog';
import {
  createInitialShopRoll,
  drawWeightedShopOffers,
  SHOP_VISIBLE_COUNT,
} from './shopRoll';

/** ~700ms highlight interval at 60Hz simulation. */
export const SHOP_CYCLE_TICKS = 42;

export function createInitialPlayerShop(rng: MutableRng): PlayerShopState {
  const rolled = createInitialShopRoll(SHOP_ROLL_POOL, SHOP_VISIBLE_COUNT, rng);
  return {
    offerIds: rolled.offers.map((o) => o.id),
    bagState: rolled.bagState,
    phase: 'waiting',
    cycleIndex: -1,
    cycleStartTick: null,
    lastPurchasedItemId: null,
    activeSynergySeeds: [],
  };
}

export function resetPlayerShop(player: PlayerState, rng: MutableRng): void {
  player.shop = createInitialPlayerShop(rng);
}

export function rollShopOnLineClear(player: PlayerState, rng: MutableRng): void {
  const rolled = drawWeightedShopOffers(
    SHOP_ROLL_POOL,
    SHOP_VISIBLE_COUNT,
    player.shop.bagState,
    new Set(player.shop.activeSynergySeeds),
    rng,
  );
  player.shop.offerIds = rolled.offers.map((o) => o.id);
  player.shop.bagState = rolled.nextBagState;
  player.shop.phase = 'ready';
  player.shop.cycleIndex = -1;
  player.shop.cycleStartTick = null;
  player.shop.lastPurchasedItemId = null;
}

export function tickPlayerShop(player: PlayerState, currentTick: number): void {
  if (player.shop.phase !== 'cycling' || player.shop.cycleStartTick === null) return;
  const elapsed = currentTick - player.shop.cycleStartTick;
  const nextIndex = Math.floor(elapsed / SHOP_CYCLE_TICKS);
  if (nextIndex >= player.shop.offerIds.length) {
    player.shop.phase = 'expired';
    player.shop.cycleIndex = -1;
    player.shop.cycleStartTick = null;
    return;
  }
  player.shop.cycleIndex = nextIndex;
}

export function openPlayerShop(player: PlayerState, currentTick: number): boolean {
  if (player.shop.phase !== 'ready' && player.shop.phase !== 'expired') return false;
  if (player.shop.offerIds.length === 0) return false;
  player.shop.phase = 'cycling';
  player.shop.cycleIndex = 0;
  player.shop.cycleStartTick = currentTick;
  return true;
}
