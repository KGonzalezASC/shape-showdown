import {
  BOMBER_COST,
  BOUNTY_TAX_COST,
  CURTAIN_COST,
  FREEZE_COST,
  GAME_TICK_RATE,
  MAGNET_COST,
  POISON_COST,
  POISON_PURGE_COST,
  RETRIM_COST,
  SATELLITE_COST,
  SNAG_COST,
  STICKY_COST,
  STORAGE_POISON_COST,
  TECTONIC_SHIFT_COST,
  WILDCARD_FOUR_COST,
} from '../constants';
import type { ItemPricingState } from '../types';

export type { ItemPricingState } from '../types';

export const PRICING_POLICY_VERSION = 'engagement-v1';
const PRICING_WINDOW_SECONDS = 20;
export const PRICING_WINDOW_TICKS = GAME_TICK_RATE * PRICING_WINDOW_SECONDS;

export type PricingWindowClosedBy = 'allowance' | 'timer';

export interface PricingCurve {
  basePrice: number;
  allowance: number;
  growthRate: number;
}

export interface PricingView extends ItemPricingState {
  currentPrice: number;
  nextPrice: number;
  allowance: number;
  purchasesRemaining: number;
  windowExpiresAtTick: number | null;
  secondsRemaining: number | null;
  windowActive: boolean;
  windowClosedBy: PricingWindowClosedBy | null;
}

/**
 * Candidate curve parameters derived from the saved replay corpus. Keep this
 * table explicit so adding a new shop item requires an intentional balance
 * decision instead of silently inheriting another item's curve.
 */
export const SHOP_PRICING_CURVES: Record<string, PricingCurve> = {
  'fortify-frame': { basePrice: SNAG_COST, allowance: 2, growthRate: 1.95 },
  'satellite-link': { basePrice: SATELLITE_COST, allowance: 2, growthRate: 2.05 },
  curtain: { basePrice: CURTAIN_COST, allowance: 3, growthRate: 1.85 },
  'gravity-lure': { basePrice: MAGNET_COST, allowance: 3, growthRate: 1.95 },
  'tectonic-shift': { basePrice: TECTONIC_SHIFT_COST, allowance: 4, growthRate: 1.80 },
  retrim: { basePrice: RETRIM_COST, allowance: 4, growthRate: 1.70 },
  'wildcard-four': { basePrice: WILDCARD_FOUR_COST, allowance: 4, growthRate: 1.65 },
  'elixir-pulse': { basePrice: POISON_COST, allowance: 5, growthRate: 1.60 },
  'quickstep-clock': { basePrice: STICKY_COST, allowance: 5, growthRate: 1.80 },
  'vortex-step': { basePrice: POISON_PURGE_COST, allowance: 5, growthRate: 1.55 },
  'frost-shift': { basePrice: FREEZE_COST, allowance: 5, growthRate: 1.55 },
  'storage-toxin': { basePrice: STORAGE_POISON_COST, allowance: 5, growthRate: 1.55 },
  'nova-charge': { basePrice: BOMBER_COST, allowance: 4, growthRate: 1.65 },
  'bounty-tax': { basePrice: BOUNTY_TAX_COST, allowance: 3, growthRate: 1.20 },
};

function clampInteger(value: number, minimum: number, maximum?: number): number {
  const integer = Number.isFinite(value) ? Math.floor(value) : minimum;
  return Math.max(minimum, maximum === undefined ? integer : Math.min(maximum, integer));
}

function roundPriceToNearest5(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

function pricingCurveFor(itemId: string): PricingCurve {
  const curve = SHOP_PRICING_CURVES[itemId];
  if (!curve) throw new Error(`Missing pricing curve for shop item: ${itemId}`);
  return curve;
}

export function priceForLevel(itemId: string, level: number): number {
  const curve = pricingCurveFor(itemId);
  const safeLevel = clampInteger(level, 0);
  if (safeLevel === 0) return curve.basePrice;
  return roundPriceToNearest5(curve.basePrice * curve.growthRate ** safeLevel);
}

export function createInitialPricingState(): Record<string, ItemPricingState> {
  return Object.fromEntries(
    Object.keys(SHOP_PRICING_CURVES).map((itemId) => [
      itemId,
      { level: 0, purchasesInWindow: 0, windowStartedAtTick: null },
    ]),
  );
}

function initialPricingStateFor(itemId: string): ItemPricingState {
  pricingCurveFor(itemId);
  return { level: 0, purchasesInWindow: 0, windowStartedAtTick: null };
}

/**
 * Normalize a state at a server tick. Closing a window advances only one level;
 * it never compounds repeatedly while the item remains untouched.
 */
function normalizePricingState(
  itemId: string,
  state: ItemPricingState | undefined,
  currentTick: number,
): ItemPricingState {
  const curve = pricingCurveFor(itemId);
  const source = state ?? initialPricingStateFor(itemId);
  const level = clampInteger(source.level, 0);
  const purchasesInWindow = clampInteger(source.purchasesInWindow, 0, curve.allowance);
  const windowStartedAtTick = source.windowStartedAtTick === null || source.windowStartedAtTick === undefined
    ? null
    : clampInteger(source.windowStartedAtTick, 0);

  if (windowStartedAtTick === null) {
    return {
      level,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
      ...(source.lastWindowClosedBy ? { lastWindowClosedBy: source.lastWindowClosedBy } : {}),
    };
  }

  if (purchasesInWindow >= curve.allowance) {
    return {
      level: level + 1,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
      lastWindowClosedBy: 'allowance',
    };
  }

  if (currentTick - windowStartedAtTick >= PRICING_WINDOW_TICKS) {
    return {
      level: level + 1,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
      lastWindowClosedBy: 'timer',
    };
  }

  return {
    level,
    purchasesInWindow,
    windowStartedAtTick,
    ...(source.lastWindowClosedBy ? { lastWindowClosedBy: source.lastWindowClosedBy } : {}),
  };
}

export function getPricingView(
  itemId: string,
  state: ItemPricingState | undefined,
  currentTick: number,
): PricingView {
  const curve = pricingCurveFor(itemId);
  const source = state ?? initialPricingStateFor(itemId);
  const normalized = normalizePricingState(itemId, source, currentTick);
  const windowExpiresAtTick = normalized.windowStartedAtTick === null
    ? null
    : normalized.windowStartedAtTick + PRICING_WINDOW_TICKS;
  const secondsRemaining = windowExpiresAtTick === null
    ? null
    : Math.max(0, Math.ceil((windowExpiresAtTick - currentTick) / GAME_TICK_RATE));

  return {
    ...normalized,
    currentPrice: priceForLevel(itemId, normalized.level),
    nextPrice: priceForLevel(itemId, normalized.level + 1),
    allowance: curve.allowance,
    purchasesRemaining: Math.max(0, curve.allowance - normalized.purchasesInWindow),
    windowExpiresAtTick,
    secondsRemaining,
    windowActive: normalized.windowStartedAtTick !== null,
    windowClosedBy: normalized.windowStartedAtTick === null
      ? normalized.lastWindowClosedBy ?? null
      : null,
  };
}

export function advancePricingAfterPurchase(
  itemId: string,
  state: ItemPricingState | undefined,
  purchaseTick: number,
): ItemPricingState {
  const normalized = normalizePricingState(itemId, state, purchaseTick);
  const next: ItemPricingState = {
    level: normalized.level,
    purchasesInWindow: normalized.purchasesInWindow + 1,
    windowStartedAtTick: normalized.windowStartedAtTick ?? purchaseTick,
  };
  return normalizePricingState(itemId, next, purchaseTick);
}

export function normalizePricingRecord(
  pricing: Record<string, ItemPricingState> | undefined,
  currentTick: number,
): Record<string, ItemPricingState> {
  const source = pricing ?? {};
  const next: Record<string, ItemPricingState> = {};
  for (const itemId of Object.keys(SHOP_PRICING_CURVES)) {
    next[itemId] = normalizePricingState(itemId, source[itemId], currentTick);
  }
  return next;
}

export function ensurePricingRecord(
  pricing: Record<string, ItemPricingState> | undefined,
  currentTick: number,
): Record<string, ItemPricingState> {
  const normalized = normalizePricingRecord(pricing, currentTick);
  if (pricing) {
    for (const [itemId, state] of Object.entries(normalized)) pricing[itemId] = state;
    return pricing;
  }
  return normalized;
}
