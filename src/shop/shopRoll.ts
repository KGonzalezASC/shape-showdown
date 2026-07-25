import { ShopBagState, ShopItem } from '../types';
import { MutableRng, rngNext, rngInt } from '../rng';

export type { ShopBagState } from '../types';

export const SHOP_VISIBLE_COUNT = 5;
const SHOP_MAX_TIER1_OFFERS = 2;

function shuffleStrings(input: string[], rng: MutableRng): string[] {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rngInt(rng, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildShopBagState(pool: ShopItem[], rng: MutableRng): ShopBagState {
  return {
    tier1Bag: shuffleStrings(
      pool.filter((item) => item.tier === 1).map((item) => item.id),
      rng,
    ),
    tier2Bag: shuffleStrings(
      pool.filter((item) => item.tier === 2).map((item) => item.id),
      rng,
    ),
  };
}

function chooseTierByWeight(
  tier1Weight: number,
  tier2Weight: number,
  rng: MutableRng,
): 1 | 2 | null {
  if (tier1Weight <= 0 && tier2Weight <= 0) return null;
  if (tier1Weight <= 0) return 2;
  if (tier2Weight <= 0) return 1;
  const total = tier1Weight + tier2Weight;
  return rngNext(rng) < tier1Weight / total ? 1 : 2;
}

function drawIdFromTierBag(
  pool: ShopItem[],
  tier: 1 | 2,
  bagState: ShopBagState,
  excludedIds: Set<string>,
  rng: MutableRng,
): { itemId: string | null; nextBagState: ShopBagState } {
  const key = tier === 1 ? 'tier1Bag' : 'tier2Bag';
  const tierPoolIds = pool.filter((item) => item.tier === tier).map((item) => item.id);
  let bag = bagState[key].length ? [...bagState[key]] : shuffleStrings(tierPoolIds, rng);

  while (bag.length > 0) {
    const nextId = bag.pop();
    if (!nextId) break;
    if (excludedIds.has(nextId)) continue;
    return {
      itemId: nextId,
      nextBagState: { ...bagState, [key]: bag },
    };
  }

  const fallback = shuffleStrings(
    tierPoolIds.filter((id) => !excludedIds.has(id)),
    rng,
  );
  if (fallback.length > 0) {
    const [itemId, ...remaining] = fallback;
    return {
      itemId,
      nextBagState: { ...bagState, [key]: remaining },
    };
  }

  return { itemId: null, nextBagState: { ...bagState, [key]: bag } };
}

function synergyMultiplier(item: ShopItem, activeSynergySeeds: Set<string>): number {
  if (item.synergyTargetId && item.synergyBoost && activeSynergySeeds.has(item.synergyTargetId)) {
    return Math.max(1, item.synergyBoost);
  }
  return 1;
}

function removeIdFromTierBag(bagState: ShopBagState, tier: 1 | 2, id: string): ShopBagState {
  const key = tier === 1 ? 'tier1Bag' : 'tier2Bag';
  if (!bagState[key].includes(id)) return bagState;
  return { ...bagState, [key]: bagState[key].filter((x) => x !== id) };
}

function drawOneWeightedShopItem(
  pool: ShopItem[],
  bagState: ShopBagState,
  excludedIds: Set<string>,
  currentTier1Count: number,
  activeSynergySeeds: Set<string>,
  rng: MutableRng,
): { item: ShopItem | null; nextBagState: ShopBagState } {
  const byId = new Map(pool.map((item) => [item.id, item]));
  const effWeight = (item: ShopItem) => item.baseWeight * synergyMultiplier(item, activeSynergySeeds);
  const tier1Weight = pool
    .filter((item) => item.tier === 1 && !excludedIds.has(item.id))
    .reduce((sum, item) => sum + effWeight(item), 0);
  const tier2Weight = pool
    .filter((item) => item.tier === 2 && !excludedIds.has(item.id))
    .reduce((sum, item) => sum + effWeight(item), 0);
  const hasTier1Available = tier1Weight > 0;
  const hasTier2Available = tier2Weight > 0;
  const canTakeTier1 = hasTier1Available && currentTier1Count < SHOP_MAX_TIER1_OFFERS;
  const canTakeTier2 = hasTier2Available;

  const primaryTier = chooseTierByWeight(
    canTakeTier1 ? tier1Weight : 0,
    canTakeTier2 ? tier2Weight : 0,
    rng,
  );
  if (!primaryTier) return { item: null, nextBagState: bagState };

  const fallbackTier = primaryTier === 1 ? 2 : 1;
  const tiersToTry: Array<1 | 2> = [primaryTier, fallbackTier];
  let nextState = bagState;

  for (const tier of tiersToTry) {
    if (tier === 1 && !canTakeTier1) continue;
    if (tier === 2 && !canTakeTier2) continue;

    const synergyItems = pool.filter(
      (it) => it.tier === tier && !excludedIds.has(it.id) && synergyMultiplier(it, activeSynergySeeds) > 1,
    );
    if (synergyItems.length > 0) {
      const synergyItem = synergyItems[rngInt(rng, synergyItems.length)];
      if (rngNext(rng) < 1 - 1 / synergyMultiplier(synergyItem, activeSynergySeeds)) {
        nextState = removeIdFromTierBag(nextState, tier, synergyItem.id);
        return { item: synergyItem, nextBagState: nextState };
      }
    }

    const drawn = drawIdFromTierBag(pool, tier, nextState, excludedIds, rng);
    nextState = drawn.nextBagState;
    if (drawn.itemId) {
      return { item: byId.get(drawn.itemId) ?? null, nextBagState: nextState };
    }
  }

  return { item: null, nextBagState: nextState };
}

export function drawWeightedShopOffers(
  pool: ShopItem[],
  count: number,
  bagState: ShopBagState,
  activeSynergySeeds: Set<string> = new Set(),
  rng: MutableRng,
): { offers: ShopItem[]; nextBagState: ShopBagState } {
  const target = Math.max(0, Math.min(count, pool.length));
  const offers: ShopItem[] = [];
  const excludedIds = new Set<string>();
  let tier1Count = 0;
  let nextState = bagState;

  while (offers.length < target) {
    const drawn = drawOneWeightedShopItem(
      pool,
      nextState,
      excludedIds,
      tier1Count,
      activeSynergySeeds,
      rng,
    );
    nextState = drawn.nextBagState;
    if (!drawn.item) break;
    offers.push(drawn.item);
    excludedIds.add(drawn.item.id);
    if (drawn.item.tier === 1) tier1Count += 1;
  }

  if (offers.length < target) {
    const fallback = shuffleStrings(
      pool.map((item) => item.id),
      rng,
    )
      .map((id) => pool.find((item) => item.id === id) ?? null)
      .filter((item): item is ShopItem => !!item && !excludedIds.has(item.id));
    offers.push(...fallback.slice(0, target - offers.length));
  }

  return { offers, nextBagState: nextState };
}

export function createInitialShopRoll(
  pool: ShopItem[],
  count: number,
  rng: MutableRng,
  activeSynergySeeds: Set<string> = new Set(),
): { offers: ShopItem[]; bagState: ShopBagState } {
  const freshBag = buildShopBagState(pool, rng);
  const rolled = drawWeightedShopOffers(pool, count, freshBag, activeSynergySeeds, rng);
  return {
    offers: rolled.offers,
    bagState: rolled.nextBagState,
  };
}
