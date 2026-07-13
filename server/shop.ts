import {
  BOMBER_COST,
  CURTAIN_COST,
  CURTAIN_TELEGRAPH_TICKS,
  FREEZE_COST,
  FREEZE_DURATION_TICKS,
  GameState,
  MAGNET_COST,
  PlayerShopState,
  PlayerState,
  POISON_COST,
  POISON_GENERATIONS,
  POISON_PURGE_COST,
  POISON_PURGE_TELEGRAPH_TICKS,
  RETRIM_ACTIVATION_TICKS,
  RETRIM_COST,
  SATELLITE_COST,
  SNAG_COST,
  STICKY_COST,
  BOUNTY_TAX_COST,
  BOUNTY_TAX_PERCENT,
} from '../src/types.js';
import { SHOP_MOCK_POOL } from '../src/shop/mockPool.js';
import {
  createInitialShopRoll,
  drawWeightedShopOffers,
  SHOP_VISIBLE_COUNT,
} from '../src/shop/shopRoll.js';
import {
  applyMagnetToOpponent,
  applySnagToOpponent,
  applyStickyToActivePiece,
  armSatelliteToBuyer,
  applyBomberToBuyer,
} from './tetris/engine.js';

/** ~700ms highlight interval at 60Hz simulation. */
export const SHOP_CYCLE_TICKS = 42;

const PURCHASABLE_IDS = new Set([
  'retrim',
  'curtain',
  'elixir-pulse',
  'vortex-step',
  'frost-shift',
  'quickstep-clock',
  'gravity-lure',
  'fortify-frame',
  'satellite-link',
  'nova-charge',
  'bounty-tax',
]);

const SELF_SHOP_ITEMS = new Set(['satellite-link', 'nova-charge']);

const ITEM_COST: Record<string, number> = {
  retrim: RETRIM_COST,
  curtain: CURTAIN_COST,
  'elixir-pulse': POISON_COST,
  'vortex-step': POISON_PURGE_COST,
  'frost-shift': FREEZE_COST,
  'quickstep-clock': STICKY_COST,
  'gravity-lure': MAGNET_COST,
  'fortify-frame': SNAG_COST,
  'satellite-link': SATELLITE_COST,
  'nova-charge': BOMBER_COST,
  'bounty-tax': BOUNTY_TAX_COST,
};

export function createInitialPlayerShop(): PlayerShopState {
  const rolled = createInitialShopRoll(SHOP_MOCK_POOL, SHOP_VISIBLE_COUNT);
  return {
    offerIds: rolled.offers.map((o) => o.id),
    bagState: rolled.bagState,
    phase: 'waiting',
    cycleIndex: -1,
    cycleStartTick: null,
    lastPurchasedItemId: null,
    ownedIds: [],
  };
}

export function resetPlayerShop(player: PlayerState): void {
  player.shop = createInitialPlayerShop();
}

export function rollShopOnLineClear(player: PlayerState): void {
  const rolled = drawWeightedShopOffers(
    SHOP_MOCK_POOL,
    SHOP_VISIBLE_COUNT,
    player.shop.bagState,
    new Set(player.shop.ownedIds),
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

export function applyShopPurchase(
  gameState: GameState,
  buyer: PlayerState,
  opponent: PlayerState | null,
  itemId: string,
): boolean {
  const shop = buyer.shop;
  if (shop.phase !== 'cycling') return false;
  if (shop.cycleIndex < 0 || shop.cycleIndex >= shop.offerIds.length) return false;
  const selectedId = shop.offerIds[shop.cycleIndex];
  if (selectedId !== itemId) return false;
  if (!PURCHASABLE_IDS.has(itemId)) return false;

  const cost = ITEM_COST[itemId];
  if (cost === undefined || buyer.score < cost) return false;
  if (!SELF_SHOP_ITEMS.has(itemId) && !opponent) return false;

  if (itemId === 'bounty-tax' && (!opponent || opponent.score <= buyer.score)) {
    return false;
  }

  buyer.score -= cost;
  shop.phase = 'waiting';
  shop.cycleIndex = -1;
  shop.cycleStartTick = null;
  shop.lastPurchasedItemId = itemId;
  shop.ownedIds = [...shop.ownedIds, itemId];

  if (!buyer.activeEffects) buyer.activeEffects = [];
  if (opponent && !opponent.activeEffects) opponent.activeEffects = [];

  const tick = gameState.tick;

  if (itemId === 'retrim' && opponent) {
    opponent.pendingShopEffects.push({ itemId: 'retrim', activationTick: tick + RETRIM_ACTIVATION_TICKS });
    opponent.activeEffects.push({
      id: `retrim-${tick}`,
      label: 'Retrimmed',
      icon: '✂️',
      bgClass: 'bg-rose-900/80',
      borderClass: 'border-rose-400',
      textClass: 'text-rose-100',
      glowClass: 'shadow-[0_0_10px_rgba(244,63,94,0.7)]',
      expiresAtTick: tick + 240,
    });
  } else if (itemId === 'curtain' && opponent) {
    opponent.pendingShopEffects.push({ itemId: 'curtain', activationTick: tick + CURTAIN_TELEGRAPH_TICKS });
    opponent.activeEffects.push({
      id: `curtain-warn-${tick}`,
      label: 'Curtain incoming',
      icon: '🎭',
      bgClass: 'bg-indigo-900/80',
      borderClass: 'border-indigo-400',
      textClass: 'text-indigo-100',
      glowClass: 'shadow-[0_0_10px_rgba(129,140,248,0.7)]',
      expiresAtTick: tick + CURTAIN_TELEGRAPH_TICKS,
    });
  } else if (itemId === 'elixir-pulse' && opponent) {
    const variant = Math.floor(Math.random() * 4) + 1;
    if (opponent.activePiece) {
      opponent.activePiece.poisoned = true;
      opponent.activePiece.poisonVariant = variant;
    } else {
      const stackEmpty = opponent.board.every((row) => row.every((cell) => cell === null));
      if (!stackEmpty) {
        opponent.poisonNextPiece = true;
        opponent.poisonNextVariant = variant;
      }
    }
    opponent.activeEffects.push({
      id: `poison-${tick}`,
      label: 'Poisoned',
      icon: '🧪',
      bgClass: 'bg-fuchsia-900/80',
      borderClass: 'border-fuchsia-400',
      textClass: 'text-fuchsia-100',
      glowClass: 'shadow-[0_0_10px_rgba(217,70,239,0.7)]',
      expiresAtTick: tick + 180,
    });
  } else if (itemId === 'vortex-step' && opponent) {
    const variant = Math.floor(Math.random() * POISON_GENERATIONS) + 1;
    opponent.pendingShopEffects.push({
      itemId: 'vortex-step',
      activationTick: tick + POISON_PURGE_TELEGRAPH_TICKS,
      poisonVariant: variant,
    });
    const variantLabels = ['Magenta', 'Lime', 'Indigo', 'Teal'] as const;
    opponent.activeEffects.push({
      id: `purge-warn-${tick}`,
      label: `Wild ${variantLabels[variant - 1]}`,
      icon: '🃏',
      bgClass: 'bg-fuchsia-900/80',
      borderClass: 'border-fuchsia-400',
      textClass: 'text-fuchsia-100',
      glowClass: 'shadow-[0_0_10px_rgba(217,70,239,0.7)]',
      expiresAtTick: tick + POISON_PURGE_TELEGRAPH_TICKS,
    });
  } else if (itemId === 'frost-shift' && opponent) {
    const until = tick + FREEZE_DURATION_TICKS;
    opponent.holdFrozenUntilTick = Math.max(opponent.holdFrozenUntilTick ?? 0, until);
    opponent.activeEffects.push({
      id: `freeze-active-${tick}`,
      label: 'Frozen',
      icon: '❄️',
      bgClass: 'bg-sky-900/80',
      borderClass: 'border-sky-300',
      textClass: 'text-sky-100',
      glowClass: 'shadow-[0_0_10px_rgba(56,189,248,0.7)]',
      expiresAtTick: until,
    });
  } else if (itemId === 'gravity-lure' && opponent) {
    applyMagnetToOpponent(opponent);
    const permanent = opponent.magnetPermanentStacks ?? 0;
    const pieceBoost = opponent.magnetPieceBoost ?? 0;
    const pull = permanent * 2 + pieceBoost;
    const label = pieceBoost > 0 ? `Magnet +${pull}` : `Magnet ×${permanent} (+${pull})`;
    opponent.activeEffects.push({
      id: `magnet-${tick}`,
      label,
      icon: '🧲',
      bgClass: 'bg-violet-900/80',
      borderClass: 'border-violet-400',
      textClass: 'text-violet-100',
      glowClass: 'shadow-[0_0_10px_rgba(167,139,250,0.7)]',
      expiresAtTick: tick + 180,
    });
  } else if (itemId === 'fortify-frame' && opponent) {
    applySnagToOpponent(opponent);
    opponent.activeEffects.push({
      id: `snag-${tick}`,
      label: 'Snagged',
      icon: '🪝',
      bgClass: 'bg-orange-900/80',
      borderClass: 'border-orange-400',
      textClass: 'text-orange-100',
      glowClass: 'shadow-[0_0_10px_rgba(251,146,60,0.7)]',
      expiresAtTick: tick + 180,
    });
  } else if (itemId === 'quickstep-clock' && opponent) {
    applyStickyToActivePiece(opponent);
    opponent.activeEffects!.push({
      id: `sticky-${tick}`,
      label: 'Sticky',
      icon: '⏱️',
      bgClass: 'bg-teal-900/80',
      borderClass: 'border-teal-300',
      textClass: 'text-teal-100',
      glowClass: 'shadow-[0_0_10px_rgba(45,212,191,0.7)]',
    });
  } else if (itemId === 'satellite-link') {
    armSatelliteToBuyer(buyer, tick);
    const activated = (buyer.satelliteDelayUntilTick ?? 0) > tick;
    buyer.activeEffects.push({
      id: `satellite-${tick}`,
      label: activated ? 'Satellite' : 'Satellite armed',
      icon: '🛰️',
      bgClass: 'bg-zinc-800/90',
      borderClass: 'border-zinc-300',
      textClass: 'text-zinc-100',
      glowClass: 'shadow-[0_0_10px_rgba(212,212,216,0.5)]',
      expiresAtTick: activated ? buyer.satelliteDelayUntilTick! : tick + 3600,
    });
  } else if (itemId === 'nova-charge') {
    applyBomberToBuyer(buyer);
    buyer.activeEffects.push({
      id: `bomber-${tick}`,
      label: 'Bomber',
      icon: '💣',
      bgClass: 'bg-rose-900/80',
      borderClass: 'border-rose-400',
      textClass: 'text-rose-100',
      glowClass: 'shadow-[0_0_10px_rgba(251,113,133,0.7)]',
      expiresAtTick: tick + 240,
    });
  } else if (itemId === 'bounty-tax' && opponent) {
    const stolen = Math.floor(opponent.score * BOUNTY_TAX_PERCENT);
    opponent.score -= stolen;
    buyer.score += stolen;

    opponent.activeEffects.push({
      id: `taxed-${tick}`,
      label: `Taxed (-${stolen})`,
      icon: '💸',
      bgClass: 'bg-rose-900/80',
      borderClass: 'border-rose-400',
      textClass: 'text-rose-100',
      glowClass: 'shadow-[0_0_10px_rgba(244,63,94,0.7)]',
      expiresAtTick: tick + 120,
    });
    buyer.activeEffects.push({
      id: `tax-siphon-${tick}`,
      label: `Siphoned (+${stolen})`,
      icon: '💸',
      bgClass: 'bg-emerald-900/80',
      borderClass: 'border-emerald-400',
      textClass: 'text-emerald-100',
      glowClass: 'shadow-[0_0_10px_rgba(52,211,153,0.7)]',
      expiresAtTick: tick + 120,
    });
  }

  return true;
}
