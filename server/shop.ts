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
  TECTONIC_SHIFT_COST,
  STICKY_COST,
  BOUNTY_TAX_COST,
  BOUNTY_TAX_PERCENT,
  WILDCARD_FOUR_COST,
  BOARD_COLS,
  BOARD_ROWS,
} from '../src/types.js';
import { SHOP_MOCK_POOL, SHOP_ITEM_BY_ID } from '../src/shop/mockPool.js';
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
  startTectonicShift,
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
  'wildcard-four',
  'tectonic-shift',
]);

const SELF_SHOP_ITEMS = new Set(['satellite-link', 'nova-charge', 'tectonic-shift']);

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
  'wildcard-four': WILDCARD_FOUR_COST,
  'tectonic-shift': TECTONIC_SHIFT_COST,
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
    activeSynergySeeds: [],
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
    new Set(player.shop.activeSynergySeeds),
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

/** Max cells copied onto a Wildcard +4 puzzle piece. */
export const WILDCARD_FOUR_MAX_CELLS = 6;

type PoisonCell = { x: number; y: number };

/**
 * Find the largest 4-connected poison blotch (same variant).
 * Ties prefer the topmost, then leftmost seed cell.
 */
function findLargestPoisonComponent(
  poison: number[][],
): { cells: PoisonCell[]; variant: number } | null {
  const visited = Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => false),
  );
  let best: PoisonCell[] | null = null;
  let bestVariant = 0;

  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      const variant = poison[y]?.[x] ?? 0;
      if (variant <= 0 || visited[y][x]) continue;

      const cells: PoisonCell[] = [];
      const queue: PoisonCell[] = [{ x, y }];
      visited[y][x] = true;
      while (queue.length > 0) {
        const cur = queue.shift()!;
        cells.push(cur);
        for (const [nx, ny] of [
          [cur.x + 1, cur.y],
          [cur.x - 1, cur.y],
          [cur.x, cur.y + 1],
          [cur.x, cur.y - 1],
        ] as const) {
          if (ny < 0 || ny >= BOARD_ROWS || nx < 0 || nx >= BOARD_COLS) continue;
          if (visited[ny][nx]) continue;
          if ((poison[ny]?.[nx] ?? 0) !== variant) continue;
          visited[ny][nx] = true;
          queue.push({ x: nx, y: ny });
        }
      }

      const betterSize = !best || cells.length > best.length;
      const betterTie =
        !!best &&
        cells.length === best.length &&
        (cells[0].y < best[0].y || (cells[0].y === best[0].y && cells[0].x < best[0].x));
      if (betterSize || betterTie) {
        best = cells;
        bestVariant = variant;
      }
    }
  }

  if (!best) return null;
  return { cells: best, variant: bestVariant };
}

/**
 * If a blotch exceeds the piece cap, keep a connected subset via BFS from its
 * topmost-leftmost cell (never row-major chop across disconnected islands).
 */
function truncateConnectedPoisonCells(cells: PoisonCell[], maxCells: number): PoisonCell[] {
  if (cells.length <= maxCells) return cells;
  const inGroup = new Set(cells.map((c) => `${c.x},${c.y}`));
  const seed = [...cells].sort((a, b) => a.y - b.y || a.x - b.x)[0];
  const out: PoisonCell[] = [];
  const visited = new Set<string>([`${seed.x},${seed.y}`]);
  const queue: PoisonCell[] = [seed];
  while (queue.length > 0 && out.length < maxCells) {
    const cur = queue.shift()!;
    out.push(cur);
    const neighbors = [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (!inGroup.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push(n);
    }
  }
  return out;
}

function poisonCellsToOffsets(cells: PoisonCell[]): [number, number][] {
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  return cells
    .map((c) => [c.x - minX, c.y - minY] as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
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

  if (itemId === 'wildcard-four') {
    if (!opponent) return false;
    const poison = opponent.poisonBoard ?? [];
    let hasPoison = false;
    for (let y = 0; y < BOARD_ROWS; y++) {
      for (let x = 0; x < BOARD_COLS; x++) {
        if (poison[y]?.[x] > 0) {
          hasPoison = true;
          break;
        }
      }
      if (hasPoison) break;
    }
    if (!hasPoison) return false;
  }

  buyer.score -= cost;
  shop.phase = 'waiting';
  shop.cycleIndex = -1;
  shop.cycleStartTick = null;
  shop.lastPurchasedItemId = itemId;

  // Add the newly purchased item to active synergy seeds
  let nextSeeds = [...shop.activeSynergySeeds, itemId];
  // If this item has a synergy partner it consumes, remove that partner from active seeds
  const purchasedItem = SHOP_ITEM_BY_ID.get(itemId);
  if (purchasedItem && purchasedItem.synergyTargetId) {
    nextSeeds = nextSeeds.filter((id) => id !== purchasedItem.synergyTargetId);
  }
  shop.activeSynergySeeds = nextSeeds;

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
  } else if (itemId === 'wildcard-four' && opponent) {
    const poison = opponent.poisonBoard ?? [];
    const component = findLargestPoisonComponent(poison);
    // hasPoison gate above guarantees a component exists.
    if (component) {
      const targetCells = truncateConnectedPoisonCells(component.cells, WILDCARD_FOUR_MAX_CELLS);
      opponent.customNextPieceOffsets = poisonCellsToOffsets(targetCells);
      opponent.customNextPieceVariant = component.variant;
      opponent.customNextPieceSourceCells = targetCells.map((cell) => [cell.x, cell.y]);

      opponent.activeEffects.push({
        id: `wildcard-four-${tick}`,
        label: 'Wildcard +4',
        icon: '🧩',
        bgClass: 'bg-fuchsia-950/80',
        borderClass: 'border-fuchsia-400',
        textClass: 'text-fuchsia-100',
        glowClass: 'shadow-[0_0_10px_rgba(217,70,239,0.7)]',
        expiresAtTick: tick + 240,
      });
    }
  } else if (itemId === 'tectonic-shift') {
    startTectonicShift(buyer, tick);
    buyer.activeEffects.push({
      id: `tectonic-shift-${tick}`,
      label: 'Tectonic Shift',
      icon: '🪐',
      bgClass: 'bg-indigo-950/80',
      borderClass: 'border-indigo-400',
      textClass: 'text-indigo-100',
      glowClass: 'shadow-[0_0_10px_rgba(129,140,248,0.7)]',
      expiresAtTick: tick + 360,
    });
  }

  return true;
}
