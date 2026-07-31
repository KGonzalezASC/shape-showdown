import {
  BOARD_COLS,
  BOARD_ROWS,
  BOUNTY_TAX_PERCENT,
  CURTAIN_TELEGRAPH_TICKS,
  FREEZE_DURATION_TICKS,
  GameState,
  PlayerState,
  POISON_GENERATIONS,
  POISON_PURGE_TELEGRAPH_TICKS,
  RETRIM_ACTIVATION_TICKS,
} from '../src/types.js';
import { MutableRng, rngInt } from '../src/rng.js';
import { SHOP_ITEM_BY_ID } from '../src/shop/shopCatalog.js';
import { pushFieldEffect } from '../src/shop/fieldEffects.js';
import {
  applyBomberToBuyer,
  applyMagnetToOpponent,
  applySnagToOpponent,
  applyStickyToActivePiece,
  armSatelliteToBuyer,
  startTectonicShift,
} from './tetris/engine.js';

export {
  createInitialPlayerShop,
  openPlayerShop,
  resetPlayerShop,
  rollShopOnLineClear,
  SHOP_CYCLE_TICKS,
  tickPlayerShop,
} from '../src/shop/playerShop.js';

/** Max cells copied onto a Wildcard +4 puzzle piece. */
export const WILDCARD_FOUR_MAX_CELLS = 6;

const POISON_VARIANT_LABELS = ['Magenta', 'Lime', 'Indigo', 'Teal'] as const;

type PurchaseCtx = {
  gameState: GameState;
  buyer: PlayerState;
  opponent: PlayerState | null;
  tick: number;
  rng: MutableRng;
};

type ShopHandler = {
  canPurchase?: (ctx: PurchaseCtx) => boolean;
  onPurchase: (ctx: PurchaseCtx) => void;
};

type PoisonCell = { x: number; y: number };

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

function truncateConnectedPoisonCells(
  cells: PoisonCell[],
  maxCells: number,
  requestedSeed?: PoisonCell,
): PoisonCell[] {
  if (cells.length <= maxCells) return cells;
  const inGroup = new Set(cells.map((c) => `${c.x},${c.y}`));
  const seed = requestedSeed ?? [...cells].sort((a, b) => a.y - b.y || a.x - b.x)[0];
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

type WildcardCandidate = {
  seed: PoisonCell;
  cells: PoisonCell[];
  shapeKey: string;
};

function wildcardCandidates(cells: PoisonCell[], maxCells: number): WildcardCandidate[] {
  return [...cells]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((seed) => {
      const selected = truncateConnectedPoisonCells(cells, maxCells, seed);
      const offsets = poisonCellsToOffsets(selected);
      return {
        seed,
        cells: selected,
        shapeKey: offsets.map(([x, y]) => `${x},${y}`).join('|'),
      };
    });
}

function chooseWildcardCandidate(
  opponent: PlayerState,
  candidates: WildcardCandidate[],
  rng: MutableRng,
): WildcardCandidate {
  const previousSeed = opponent.wildcardLastSeed;
  const previousShapeKey = opponent.wildcardLastShapeKey;
  if (!previousSeed && !previousShapeKey) return candidates[0];

  const differentShape = candidates.filter((candidate) => candidate.shapeKey !== previousShapeKey);
  const differentSeed = candidates.filter(
    (candidate) => candidate.seed.x !== previousSeed?.[0] || candidate.seed.y !== previousSeed?.[1],
  );
  const pool = differentShape.length > 0
    ? differentShape
    : differentSeed.length > 0
      ? differentSeed
      : candidates;
  return pool[rngInt(rng, pool.length)] ?? pool[0];
}

function opponentHasPoison(opponent: PlayerState): boolean {
  const poison = opponent.poisonBoard ?? [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (poison[y]?.[x] > 0) return true;
    }
  }
  return false;
}

const SHOP_HANDLERS: Record<string, ShopHandler> = {
  retrim: {
    onPurchase: ({ opponent, tick }) => {
      if (!opponent) return;
      opponent.pendingShopEffects.push({
        itemId: 'retrim',
        activationTick: tick + RETRIM_ACTIVATION_TICKS,
      });
      pushFieldEffect(opponent, 'retrim', tick, 'Retrimmed', '✂️', tick + 240);
    },
  },
  curtain: {
    onPurchase: ({ opponent, tick }) => {
      if (!opponent) return;
      opponent.pendingShopEffects.push({
        itemId: 'curtain',
        activationTick: tick + CURTAIN_TELEGRAPH_TICKS,
      });
      pushFieldEffect(opponent, 'curtain-warn', tick, 'Curtain incoming', '🎭', tick + CURTAIN_TELEGRAPH_TICKS);
    },
  },
  'elixir-pulse': {
    onPurchase: ({ opponent, tick, rng }) => {
      if (!opponent) return;
      const variant = rngInt(rng, 4) + 1;
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
      pushFieldEffect(opponent, 'poison', tick, 'Poisoned', '🧪', tick + 180);
    },
  },
  'storage-toxin': {
    canPurchase: ({ opponent }) => !!opponent?.holdPiece,
    onPurchase: ({ opponent, tick, rng }) => {
      if (!opponent?.holdPiece) return;
      const variant = rngInt(rng, 4) + 1;
      opponent.holdPiece.poisoned = true;
      opponent.holdPiece.poisonVariant = variant;
      pushFieldEffect(opponent, 'storage-poison', tick, 'Storage poisoned', '🦠', tick + 180);
    },
  },
  'vortex-step': {
    onPurchase: ({ opponent, tick, rng }) => {
      if (!opponent) return;
      const variant = rngInt(rng, POISON_GENERATIONS) + 1;
      opponent.pendingShopEffects.push({
        itemId: 'vortex-step',
        activationTick: tick + POISON_PURGE_TELEGRAPH_TICKS,
        poisonVariant: variant,
      });
      pushFieldEffect(
        opponent,
        'purge-warn',
        tick,
        `Wild ${POISON_VARIANT_LABELS[variant - 1]}`,
        '🃏',
        tick + POISON_PURGE_TELEGRAPH_TICKS,
      );
    },
  },
  'frost-shift': {
    onPurchase: ({ opponent, tick }) => {
      if (!opponent) return;
      const until = tick + FREEZE_DURATION_TICKS;
      opponent.holdFrozenUntilTick = Math.max(opponent.holdFrozenUntilTick ?? 0, until);
      pushFieldEffect(opponent, 'freeze', tick, 'Frozen', '❄️', until);
    },
  },
  'gravity-lure': {
    onPurchase: ({ opponent, tick }) => {
      if (!opponent) return;
      applyMagnetToOpponent(opponent);
      const permanent = opponent.magnetPermanentStacks ?? 0;
      const pieceBoost = opponent.magnetPieceBoost ?? 0;
      const pull = permanent * 2 + pieceBoost;
      const label = pieceBoost > 0 ? `Magnet +${pull}` : `Magnet ×${permanent} (+${pull})`;
      pushFieldEffect(opponent, 'magnet', tick, label, '🧲', tick + 180);
    },
  },
  'fortify-frame': {
    onPurchase: ({ opponent, tick }) => {
      if (!opponent) return;
      applySnagToOpponent(opponent);
      pushFieldEffect(opponent, 'snag', tick, 'Snagged', '🪝', tick + 180);
    },
  },
  'quickstep-clock': {
    onPurchase: ({ opponent, tick }) => {
      if (!opponent) return;
      applyStickyToActivePiece(opponent);
      pushFieldEffect(opponent, 'sticky', tick, 'Sticky', '⏱️');
    },
  },
  'satellite-link': {
    onPurchase: ({ buyer, tick }) => {
      armSatelliteToBuyer(buyer, tick);
      const activated = (buyer.satelliteDelayUntilTick ?? 0) > tick;
      pushFieldEffect(
        buyer,
        'satellite',
        tick,
        activated ? 'Satellite' : 'Satellite armed',
        '🛰️',
        activated ? buyer.satelliteDelayUntilTick! : tick + 3600,
      );
    },
  },
  'nova-charge': {
    onPurchase: ({ buyer, tick }) => {
      applyBomberToBuyer(buyer);
      pushFieldEffect(buyer, 'bomber', tick, 'Bomber', '💣', tick + 240);
    },
  },
  'bounty-tax': {
    canPurchase: ({ buyer, opponent }) => !!opponent && opponent.score > buyer.score,
    onPurchase: ({ buyer, opponent, tick }) => {
      if (!opponent) return;
      const stolen = Math.floor(opponent.score * BOUNTY_TAX_PERCENT);
      opponent.score -= stolen;
      buyer.score += stolen;
      pushFieldEffect(opponent, 'taxed', tick, `Taxed (-${stolen})`, '💸', tick + 120);
      pushFieldEffect(buyer, 'tax-siphon', tick, `Siphoned (+${stolen})`, '💸', tick + 120);
    },
  },
  'wildcard-four': {
    canPurchase: ({ opponent }) => !!opponent && opponentHasPoison(opponent),
    onPurchase: ({ opponent, tick, rng }) => {
      if (!opponent) return;
      const poison = opponent.poisonBoard ?? [];
      const component = findLargestPoisonComponent(poison);
      if (!component) return;
      const candidates = wildcardCandidates(component.cells, WILDCARD_FOUR_MAX_CELLS);
      const candidate = chooseWildcardCandidate(opponent, candidates, rng);
      const targetCells = candidate.cells;
      opponent.customNextPieceOffsets = poisonCellsToOffsets(targetCells);
      opponent.customNextPieceVariant = component.variant;
      opponent.customNextPieceSourceCells = targetCells.map((cell) => [cell.x, cell.y]);
      opponent.wildcardLastSeed = [candidate.seed.x, candidate.seed.y];
      opponent.wildcardLastShapeKey = candidate.shapeKey;
      pushFieldEffect(opponent, 'wildcard-four', tick, 'Wildcard +4', '🧩', tick + 240);
    },
  },
  'tectonic-shift': {
    onPurchase: ({ buyer, tick }) => {
      startTectonicShift(buyer, tick);
      pushFieldEffect(buyer, 'tectonic-shift', tick, 'Tectonic Shift', '🪐', tick + 360);
    },
  },
};

export function applyShopPurchase(
  gameState: GameState,
  buyer: PlayerState,
  opponent: PlayerState | null,
  itemId: string,
  rng: MutableRng,
): boolean {
  const shop = buyer.shop;
  if (shop.phase !== 'cycling') return false;
  if (shop.cycleIndex < 0 || shop.cycleIndex >= shop.offerIds.length) return false;
  const selectedId = shop.offerIds[shop.cycleIndex];
  if (selectedId !== itemId) return false;

  const catalogItem = SHOP_ITEM_BY_ID.get(itemId);
  if (!catalogItem || !catalogItem.purchasable) return false;
  if (buyer.score < catalogItem.cost) return false;
  if (catalogItem.target === 'opponent' && !opponent) return false;

  const handler = SHOP_HANDLERS[itemId];
  if (!handler) return false;

  const ctx: PurchaseCtx = { gameState, buyer, opponent, tick: gameState.tick, rng };
  if (handler.canPurchase && !handler.canPurchase(ctx)) return false;

  buyer.score -= catalogItem.cost;
  shop.phase = 'waiting';
  shop.cycleIndex = -1;
  shop.cycleStartTick = null;
  shop.lastPurchasedItemId = itemId;

  let nextSeeds = [...shop.activeSynergySeeds, itemId];
  if (catalogItem.synergyTargetId) {
    nextSeeds = nextSeeds.filter((id) => id !== catalogItem.synergyTargetId);
  }
  shop.activeSynergySeeds = nextSeeds;

  handler.onPurchase(ctx);
  return true;
}
