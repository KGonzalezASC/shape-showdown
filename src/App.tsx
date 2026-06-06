import React, { useCallback, useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Timer, Trophy, Users, Zap } from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { useGameSocket } from './hooks/useGameSocket';
import GameField from './components/GameField';
import MobileControls from './components/MobileControls';
import OpponentMiniField from './components/OpponentMiniField';
import ShopRail from './components/ShopRail';
import { ShopRailVariations } from './components/ShopRailVariations';
import { GameFieldsLayout } from './components/GameFieldsLayout';
import { PlayfieldCellSizeContext } from './components/playfieldCellSizeContext';
import { GameFieldRef } from './components/GameField';
import { ActionType, BOARD_COLS, BOARD_VISIBLE_ROWS, BOMBER_COST, CURTAIN_COST, FREEZE_COST, LOCK_DELAY_TICKS, LOCK_RESET_CAP, MAGNET_COST, POISON_COST, POISON_PURGE_COST, RETRIM_COST, SATELLITE_COST, SNAG_COST, STICKY_COST, ShopItem } from './types';

function WaitingForOpponentBoard() {
  const cell = useContext(PlayfieldCellSizeContext);
  return (
    <div className="relative shrink-0">
      <div className="mb-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-rose-400">Opponent Field</h2>
      </div>
      <div
        className="flex items-center justify-center rounded-xl border-2 border-rose-500/10 bg-[#141414]"
        style={{ width: BOARD_COLS * cell, height: BOARD_VISIBLE_ROWS * cell }}
      >
        <p className="animate-pulse px-4 text-center text-sm font-medium text-zinc-500">Waiting for opponent…</p>
      </div>
    </div>
  );
}

function matchEventLabel(evt: { type: string; lines?: number; playerId?: string } | null, myId: string | null): { text: string; tone: string } {
  if (!evt) return { text: '', tone: '' };
  const mine = evt.playerId && myId ? evt.playerId === myId : false;
  if (evt.type === 'lineClear') return { text: `${mine ? 'You' : 'Opp'} line clear (${evt.lines ?? 0})`, tone: 'text-cyan-300' };
  if (evt.type === 'attackSent') return { text: `${mine ? 'You sent' : 'Opp sent'} ${evt.lines ?? 0} garbage`, tone: mine ? 'text-emerald-300' : 'text-rose-300' };
  if (evt.type === 'garbageApplied') return { text: `${mine ? 'You received' : 'Opp received'} ${evt.lines ?? 0} garbage`, tone: mine ? 'text-rose-300' : 'text-emerald-300' };
  if (evt.type === 'topOut') return { text: `${mine ? 'You topped out' : 'Opponent topped out'}`, tone: 'text-amber-300' };
  return { text: evt.type, tone: 'text-zinc-300' };
}


const SHOP_MOCK_POOL: ShopItem[] = [
  {
    id: 'spark-overclock',
    name: 'Overclock',
    icon: '⚡',
    cost: 160,
    tier: 1,
    baseWeight: 1,
    colorClass: 'bg-cyan-900/75',
    borderColorClass: 'border-cyan-300/70',
    description: 'Lorem ipsum dolor sit amet.',
  },
  {
    id: 'retrim',
    name: 'Re-Trim',
    icon: '✂️',
    cost: RETRIM_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-rose-900/70',
    borderColorClass: 'border-rose-300/65',
    description: 'Permanently moves the opponent\'s swap line up one row.',
  },
  {
    id: 'curtain',
    name: 'Curtain',
    icon: '🎭',
    cost: CURTAIN_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-indigo-900/70',
    borderColorClass: 'border-indigo-300/65',
    description: 'Frosts the opponent\'s field below their swap line for 4 seconds.',
    synergyTargetId: 'retrim',
    synergyBoost: 2.5,
  },
  {
    id: 'nova-charge',
    name: 'Bomber',
    icon: '💣',
    cost: BOMBER_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-rose-900/70',
    borderColorClass: 'border-rose-300/65',
    description:
      'Your next piece is rigged — on lock it blasts a circle out of your stack (holes only, normal line clears still score).',
  },
  {
    id: 'gravity-lure',
    name: 'Magnet',
    icon: '🧲',
    cost: MAGNET_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-violet-900/70',
    borderColorClass: 'border-violet-300/65',
    description:
      'Pulls the opponent down faster — first 3 buys add +2 gravity each (max +6); later buys add +1 on their current piece until it locks (rainbow edge while falling).',
  },
  {
    id: 'frost-shift',
    name: 'Freeze',
    icon: '❄️',
    cost: FREEZE_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-sky-900/70',
    borderColorClass: 'border-sky-300/65',
    description:
      'Locks the opponent\'s storage for 10s — they cannot store into an empty hold or swap with a stored piece.',
  },
  {
    id: 'ember-flare',
    name: 'Ember',
    icon: '🔥',
    cost: 80,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-amber-900/70',
    borderColorClass: 'border-amber-300/65',
    description: 'Ut enim ad minim veniam.',
  },
  {
    id: 'elixir-pulse',
    name: 'Elixir',
    icon: '🧪',
    cost: POISON_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-lime-900/70',
    borderColorClass: 'border-lime-300/65',
    description: "Poisons the opponent's active piece — it infects the stack it locks into, spreading for 4 waves.",
  },
  {
    id: 'vortex-step',
    name: 'Wild Purge',
    icon: '🃏',
    cost: POISON_PURGE_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-fuchsia-900/70',
    borderColorClass: 'border-fuchsia-300/65',
    description:
      'Rolls a random poison colour, then after a short delay deletes every cell of that colour on the opponent\'s stack — holes only, no gravity and no line-clear credit.',
    synergyTargetId: 'elixir-pulse',
    synergyBoost: 2.5,
  },
  {
    id: 'target-lock',
    name: 'Target',
    icon: '🎯',
    cost: 60,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-fuchsia-900/70',
    borderColorClass: 'border-fuchsia-300/65',
    description: 'Commodo consequat lorem ipsum.',
  },
  {
    id: 'fortify-frame',
    name: 'Snag',
    icon: '🪝',
    cost: SNAG_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-orange-900/70',
    borderColorClass: 'border-orange-300/65',
    description:
      'Hooks the opponent\'s piece — no hard drop until it locks. Current piece if not dropped yet, otherwise the next spawn.',
    synergyTargetId: 'gravity-lure',
    synergyBoost: 2.5,
  },
  {
    id: 'quickstep-clock',
    name: 'Sticky',
    icon: '⏱️',
    cost: STICKY_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-teal-900/70',
    borderColorClass: 'border-teal-300/65',
    description:
      'The opponent\'s current piece only gets 2 lock-move resets — limited wiggle before it locks.',
  },
  {
    id: 'satellite-link',
    name: 'Satellite',
    icon: '🛰️',
    cost: SATELLITE_COST,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-zinc-800/80',
    borderColorClass: 'border-zinc-300/60',
    description:
      'Arms until garbage arrives — then pushes queued lines back and slows new garbage for 10s.',
  },
];

interface ShopBagState {
  tier1Bag: string[];
  tier2Bag: string[];
}

const SHOP_VISIBLE_COUNT = 5;
const SHOP_MAX_TIER1_OFFERS = 2;

function shuffleStrings(input: string[]): string[] {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildShopBagState(pool: ShopItem[]): ShopBagState {
  return {
    tier1Bag: shuffleStrings(pool.filter((item) => item.tier === 1).map((item) => item.id)),
    tier2Bag: shuffleStrings(pool.filter((item) => item.tier === 2).map((item) => item.id)),
  };
}

function chooseTierByWeight(tier1Weight: number, tier2Weight: number): 1 | 2 | null {
  if (tier1Weight <= 0 && tier2Weight <= 0) return null;
  if (tier1Weight <= 0) return 2;
  if (tier2Weight <= 0) return 1;
  const total = tier1Weight + tier2Weight;
  return Math.random() < tier1Weight / total ? 1 : 2;
}

function drawIdFromTierBag(
  pool: ShopItem[],
  tier: 1 | 2,
  bagState: ShopBagState,
  excludedIds: Set<string>,
): { itemId: string | null; nextBagState: ShopBagState } {
  const key = tier === 1 ? 'tier1Bag' : 'tier2Bag';
  const tierPoolIds = pool.filter((item) => item.tier === tier).map((item) => item.id);
  let bag = bagState[key].length ? [...bagState[key]] : shuffleStrings(tierPoolIds);

  while (bag.length > 0) {
    const nextId = bag.pop();
    if (!nextId) break;
    if (excludedIds.has(nextId)) continue;
    return {
      itemId: nextId,
      nextBagState: { ...bagState, [key]: bag },
    };
  }

  const fallback = shuffleStrings(tierPoolIds.filter((id) => !excludedIds.has(id)));
  if (fallback.length > 0) {
    const [itemId, ...remaining] = fallback;
    return {
      itemId,
      nextBagState: { ...bagState, [key]: remaining },
    };
  }

  return { itemId: null, nextBagState: { ...bagState, [key]: bag } };
}

/**
 * Synergy boost for an item given the set of items the player already owns.
 * Returns the multiplier (>1) when the item's synergy partner is owned, else 1.
 * e.g. Curtain (synergyTargetId 'retrim') or Wild Purge ('elixir-pulse') become more likely once you own their pair.
 */
function synergyMultiplier(item: ShopItem, ownedIds: Set<string>): number {
  if (item.synergyTargetId && item.synergyBoost && ownedIds.has(item.synergyTargetId)) {
    return Math.max(1, item.synergyBoost);
  }
  return 1;
}

/** Remove a specific id from its tier bag (no-op if absent). */
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
  ownedIds: Set<string>,
): { item: ShopItem | null; nextBagState: ShopBagState } {
  const byId = new Map(pool.map((item) => [item.id, item]));
  // Effective weight folds in the synergy multiplier so a boosted item also
  // nudges its *tier* to be chosen more often, not just its within-tier odds.
  const effWeight = (item: ShopItem) => item.baseWeight * synergyMultiplier(item, ownedIds);
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

  const primaryTier = chooseTierByWeight(canTakeTier1 ? tier1Weight : 0, canTakeTier2 ? tier2Weight : 0);
  if (!primaryTier) return { item: null, nextBagState: bagState };

  const fallbackTier = primaryTier === 1 ? 2 : 1;
  const tiersToTry: Array<1 | 2> = [primaryTier, fallbackTier];
  let nextState = bagState;

  for (const tier of tiersToTry) {
    if (tier === 1 && !canTakeTier1) continue;
    if (tier === 2 && !canTakeTier2) continue;

    // Synergy fast-path: if a boosted item is eligible in this tier, give it a
    // chance to jump the bag with probability (1 - 1/boost) — e.g. boost 2.5 → 60%.
    const synergyItem = pool.find(
      (it) => it.tier === tier && !excludedIds.has(it.id) && synergyMultiplier(it, ownedIds) > 1,
    );
    if (synergyItem && Math.random() < 1 - 1 / synergyMultiplier(synergyItem, ownedIds)) {
      nextState = removeIdFromTierBag(nextState, tier, synergyItem.id);
      return { item: synergyItem, nextBagState: nextState };
    }

    const drawn = drawIdFromTierBag(pool, tier, nextState, excludedIds);
    nextState = drawn.nextBagState;
    if (drawn.itemId) {
      return { item: byId.get(drawn.itemId) ?? null, nextBagState: nextState };
    }
  }

  return { item: null, nextBagState: nextState };
}

function drawWeightedShopOffers(
  pool: ShopItem[],
  count: number,
  bagState: ShopBagState,
  ownedIds: Set<string> = new Set(),
): { offers: ShopItem[]; nextBagState: ShopBagState } {
  const target = Math.max(0, Math.min(count, pool.length));
  const offers: ShopItem[] = [];
  const excludedIds = new Set<string>();
  let tier1Count = 0;
  let nextState = bagState;

  while (offers.length < target) {
    const drawn = drawOneWeightedShopItem(pool, nextState, excludedIds, tier1Count, ownedIds);
    nextState = drawn.nextBagState;
    if (!drawn.item) break;
    offers.push(drawn.item);
    excludedIds.add(drawn.item.id);
    if (drawn.item.tier === 1) tier1Count += 1;
  }

  if (offers.length < target) {
    const fallback = shuffleStrings(pool.map((item) => item.id))
      .map((id) => pool.find((item) => item.id === id) ?? null)
      .filter((item): item is ShopItem => !!item && !excludedIds.has(item.id));
    offers.push(...fallback.slice(0, target - offers.length));
  }

  return { offers, nextBagState: nextState };
}

function createInitialShopRoll(
  pool: ShopItem[],
  count: number,
  ownedIds: Set<string> = new Set(),
): { offers: ShopItem[]; bagState: ShopBagState } {
  const freshBag = buildShopBagState(pool);
  const rolled = drawWeightedShopOffers(pool, count, freshBag, ownedIds);
  return {
    offers: rolled.offers,
    bagState: rolled.nextBagState,
  };
}

const App: React.FC = () => {
  const { gameState, myId, lastMatchEvent, sendAction, sendInputState, sendShopPurchase } = useGameSocket();

  const stateRef = useRef({ gameState, myId });
  useLayoutEffect(() => {
    stateRef.current = { gameState, myId };
  }, [gameState, myId]);

  const mobilePlayfieldRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [mobileCellSize, setMobileCellSize] = useState(28);
  const [mobileControlsHeight, setMobileControlsHeight] = useState(() => 
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 0 : 188
  );
  const [lockDrillEnabled, setLockDrillEnabled] = useState(false);
  const [showVariations, setShowVariations] = useState(false);
  const [drillResult, setDrillResult] = useState<{ status: 'pass' | 'fail'; message: string } | null>(null);
  const [kickPopup, setKickPopup] = useState<{ kx: number; ky: number } | null>(null);
  const prevKickNonceRef = useRef(0);
  const kickPopupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drillStepRef = useRef<'idle' | 'seekGround' | 'consumeCap' | 'exhaustCap' | 'spam' | 'waitForLock'>('idle');
  const drillSpinsRef = useRef(0);
  const drillLastSpinMsRef = useRef(0);
  const drillDirectionRef = useRef<1 | -1>(1);
  const drillTrackingPieceRef = useRef(false);
  /** True once lockResetsUsed >= LOCK_RESET_CAP so we only flag illegal refreshes after the cap is actually spent. */
  const drillObservedCapRef = useRef(false);
  const drillPrevLockDelayRef = useRef<number | null>(null);
  const drillPrevPieceYRef = useRef<number | null>(null);
  const drillExhaustAttemptsRef = useRef(0);
  const drillFailureReasonRef = useRef<string | null>(null);

  const myMobileFieldRef = useRef<GameFieldRef>(null);
  const myDesktopFieldRef = useRef<GameFieldRef>(null);
  const oppDesktopFieldRef = useRef<GameFieldRef>(null);

  // ---------------------------------------------------------------------------
  // Shop state — single useReducer so all fields update atomically, no manual
  // ref sync needed for closure-safe reads (use shopRef.current instead).
  // ---------------------------------------------------------------------------
  interface ShopReducerState {
    offers: ShopItem[];
    bagState: ShopBagState;
    phase: 'waiting' | 'ready' | 'cycling' | 'expired';
    cycleIndex: number;
    purchasedItem: ShopItem | null;
    spentScore: number;
    /** Ids of every item bought this match — drives synergy draw weighting. */
    ownedIds: string[];
  }

  type ShopAction =
    | { type: 'RESET'; payload: { offers: ShopItem[]; bagState: ShopBagState } }
    | { type: 'LINE_CLEAR_ROLL'; payload: { offers: ShopItem[]; bagState: ShopBagState } }
    | { type: 'START_CYCLE' }
    | { type: 'TICK_CYCLE'; payload: { nextIndex: number } }
    | { type: 'EXPIRE_CYCLE' }
    | { type: 'PURCHASE'; payload: { item: ShopItem; cost: number } }
    | { type: 'STOP_CYCLE' };

  function shopReducer(state: ShopReducerState, action: ShopAction): ShopReducerState {
    switch (action.type) {
      case 'RESET': {
        const { offers, bagState } = action.payload;
        return { offers, bagState, phase: 'waiting', cycleIndex: -1, purchasedItem: null, spentScore: 0, ownedIds: [] };
      }
      case 'LINE_CLEAR_ROLL': {
        const { offers, bagState } = action.payload;
        return { ...state, offers, bagState, phase: 'ready', cycleIndex: -1 };
      }
      case 'START_CYCLE':
        return { ...state, phase: 'cycling', cycleIndex: 0 };
      case 'TICK_CYCLE':
        return { ...state, cycleIndex: action.payload.nextIndex };
      case 'EXPIRE_CYCLE':
        return { ...state, phase: 'expired', cycleIndex: -1 };
      case 'PURCHASE': {
        const { item, cost } = action.payload;
        return {
          ...state,
          phase: 'waiting',
          cycleIndex: -1,
          purchasedItem: item,
          spentScore: state.spentScore + cost,
          ownedIds: [...state.ownedIds, item.id],
        };
      }
      case 'STOP_CYCLE':
        return { ...state, phase: 'waiting', cycleIndex: -1 };
      default:
        return state;
    }
  }

  const initialShop = createInitialShopRoll(SHOP_MOCK_POOL, SHOP_VISIBLE_COUNT);
  const [shop, shopDispatch] = useReducer(shopReducer, {
    offers: initialShop.offers,
    bagState: initialShop.bagState,
    phase: 'waiting',
    cycleIndex: -1,
    purchasedItem: null,
    spentScore: 0,
    ownedIds: [],
  });

  // Ref mirror so interval callbacks and key-event closures always read fresh state
  const shopRef = useRef(shop);
  useLayoutEffect(() => {
    shopRef.current = shop;
  }, [shop]);

  const shopCycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerShake = useCallback((isMe: boolean, type: 'soft' | 'medium') => {
    if (isMe) {
      myMobileFieldRef.current?.shake(type);
      myDesktopFieldRef.current?.shake(type);
    } else {
      oppDesktopFieldRef.current?.shake(type);
    }
  }, []);

  const handleAction = useCallback(
    (action: ActionType) => {
      const me = stateRef.current.gameState?.players[stateRef.current.myId ?? ''];
      if (action === 'hardDrop' && !me?.snagHardDropBlocked) {
        triggerShake(true, 'soft');
      }
      sendAction(action);
    },
    [sendAction, triggerShake],
  );

  const SHOP_CYCLE_INTERVAL_MS = 700;

  const startShopCycle = useCallback((offersLength: number) => {
    if (shopCycleTimerRef.current) {
      clearInterval(shopCycleTimerRef.current);
      shopCycleTimerRef.current = null;
    }
    if (offersLength <= 0) return;
    shopDispatch({ type: 'START_CYCLE' });

    shopCycleTimerRef.current = setInterval(() => {
      // Read fresh state from ref so this closure is never stale
      const current = shopRef.current;
      const nextIndex = current.cycleIndex + 1;
      if (nextIndex >= offersLength) {
        if (shopCycleTimerRef.current) {
          clearInterval(shopCycleTimerRef.current);
          shopCycleTimerRef.current = null;
        }
        shopDispatch({ type: 'EXPIRE_CYCLE' });
        return;
      }
      shopDispatch({ type: 'TICK_CYCLE', payload: { nextIndex } });
    }, SHOP_CYCLE_INTERVAL_MS);
  }, []);

  const stopShopCycle = useCallback(() => {
    if (shopCycleTimerRef.current) {
      clearInterval(shopCycleTimerRef.current);
      shopCycleTimerRef.current = null;
    }
    shopDispatch({ type: 'STOP_CYCLE' });
  }, []);

  const handleShopConfirm = useCallback(() => {
    const { phase, cycleIndex, offers, spentScore } = shopRef.current;
    if (phase === 'waiting') return;

    if (phase === 'ready' || phase === 'expired') {
      startShopCycle(offers.length);
      return;
    }

    if (phase === 'cycling') {
      if (cycleIndex < 0 || cycleIndex >= offers.length) return;

      const picked = offers[cycleIndex];
      const currentGameState = stateRef.current.gameState;
      const currentMyId = stateRef.current.myId;
      const currentScore = currentMyId && currentGameState ? (currentGameState.players[currentMyId]?.score ?? 0) : 0;
      const availableScore = Math.max(0, currentScore - spentScore);

      if (availableScore < picked.cost) return;

      if (shopCycleTimerRef.current) {
        clearInterval(shopCycleTimerRef.current);
        shopCycleTimerRef.current = null;
      }
      shopDispatch({ type: 'PURCHASE', payload: { item: picked, cost: picked.cost } });
      // Notify the server — it validates, deducts score, and applies the effect to the opponent.
      sendShopPurchase(picked.id);
    }
  }, [startShopCycle, sendShopPurchase]);

  useLayoutEffect(() => {
    // Size the board to the space left over after the rail's ACTUAL rendered
    // width. Measuring the live rail (rather than reserving fixed pixels) makes
    // this correct even when a larger system font / display zoom inflates the
    // rem-based rail and chrome — the case that broke the Samsung layout.
    const outer = mobilePlayfieldRef.current;
    if (!outer) return;
    const measure = () => {
      const ob = outer.getBoundingClientRect();
      if (ob.width < 8 || ob.height < 8) return;
      const railW = railRef.current?.getBoundingClientRect().width ?? 0;
      const scale = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
      const boardChromeReserve = 118 * scale; // GameField title + storage (rem-based)
      const GAP_AND_SAFETY = 16;              // flex gap + a couple px breathing room
      const availW = ob.width - railW - GAP_AND_SAFETY;
      const fromW = availW / BOARD_COLS;
      const fromH = (ob.height - boardChromeReserve) / BOARD_VISIBLE_ROWS;
      const c = Math.floor(Math.min(fromW, fromH));
      setMobileCellSize((prev) => {
        // Cap raised to 48 so the board grows to fill wider phones (it stays
        // limited by width/height on smaller ones, so this is a no-op there).
        const next = Math.max(8, Math.min(48, c));
        return prev !== next ? next : prev;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    if (railRef.current) ro.observe(railRef.current);
    return () => ro.disconnect();
    // Re-run once the game connects: the playfield/rail only mount after the
    // "Connecting…" screen, so on first mount the refs are null. Without this
    // the ResizeObserver never attaches and the board stays at its default size.
  }, [gameState != null]);

  useEffect(() => {
    if (!drillResult) return;
    const t = window.setTimeout(() => setDrillResult(null), 2200);
    return () => window.clearTimeout(t);
  }, [drillResult]);

  // shopSpentScore sync effect removed — spentScore lives inside shop reducer state,
  // read via shopRef.current.spentScore in closures.

  const previousLinesClearedRef = useRef<number | null>(null);
  const previousStatusRef = useRef<string | null>(null);
  // Local source of truth for held movement keys. Inputs must NOT be derived
  // from the server-echoed gameState (which lags ~RTT in prod) or holding one
  // key while tapping another can drop/resurrect keys ("stuck"/"ignored").
  const heldKeysRef = useRef({ left: false, right: false, softDrop: false });
  useEffect(() => {
    const status = gameState?.status ?? null;
    if (!status) return;
    if (previousStatusRef.current === status) return;
    previousStatusRef.current = status;

    if (status === 'waiting' || status === 'countdown') {
      if (shopCycleTimerRef.current) {
        clearInterval(shopCycleTimerRef.current);
        shopCycleTimerRef.current = null;
      }
      const fresh = createInitialShopRoll(SHOP_MOCK_POOL, SHOP_VISIBLE_COUNT);
      shopDispatch({ type: 'RESET', payload: fresh });
      previousLinesClearedRef.current = null;
    } else if (status === 'playing') {
      // Establish this match's lines-cleared baseline so the first clear
      // (0 -> N) triggers a shop roll.
      previousLinesClearedRef.current = 0;
    }
  }, [gameState?.status]);

  // Roll the shop off the AUTHORITATIVE per-player linesCleared counter in
  // gameState (sent 60x/sec), NOT transient 'lineClear' matchEvents. In prod,
  // multiple same-tick events (lineClear/attackSent/garbageApplied) coalesce
  // into one packet and React batches them, so lastMatchEvent ends up as a
  // non-lineClear event and the roll is silently lost. Diffing the cumulative
  // counter is immune to event batching and even to dropped frames.
  const myLinesCleared = myId ? gameState?.players?.[myId]?.linesCleared : undefined;
  useEffect(() => {
    if (!gameState || gameState.status !== 'playing' || !myId) return;
    const me = gameState.players[myId];
    if (!me) return;
    const prev = previousLinesClearedRef.current;
    previousLinesClearedRef.current = me.linesCleared;
    if (prev === null) return;            // baseline not established yet
    if (me.linesCleared <= prev) return;  // no new line clear since last frame

    if (shopCycleTimerRef.current) {
      clearInterval(shopCycleTimerRef.current);
      shopCycleTimerRef.current = null;
    }
    const rolled = drawWeightedShopOffers(
      SHOP_MOCK_POOL,
      SHOP_VISIBLE_COUNT,
      shopRef.current.bagState,
      new Set(shopRef.current.ownedIds),
    );
    shopDispatch({ type: 'LINE_CLEAR_ROLL', payload: { offers: rolled.offers, bagState: rolled.nextBagState } });
  }, [myLinesCleared, gameState?.status, myId]);

  useEffect(() => {
    if (!gameState || gameState.status !== 'playing') {
      heldKeysRef.current = { left: false, right: false, softDrop: false };
      sendInputState({ left: false, right: false, softDrop: false });
    }
  }, [gameState?.status, sendInputState]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F6') {
        e.preventDefault();
        setLockDrillEnabled((prev) => !prev);
        return;
      }
      const { gameState, myId } = stateRef.current;
      if (!gameState || gameState.status !== 'playing' || !myId || !gameState.players[myId]) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (heldKeysRef.current.left) return; // ignore OS key-repeat
        heldKeysRef.current = { ...heldKeysRef.current, left: true };
        sendInputState({ ...heldKeysRef.current });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (heldKeysRef.current.right) return;
        heldKeysRef.current = { ...heldKeysRef.current, right: true };
        sendInputState({ ...heldKeysRef.current });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (heldKeysRef.current.softDrop) return;
        heldKeysRef.current = { ...heldKeysRef.current, softDrop: true };
        sendInputState({ ...heldKeysRef.current });
      } else if (e.key === 'ArrowUp' || e.key === ' ') {
        e.preventDefault();
        handleAction('hardDrop');
      } else if (e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleAction('rotateCW');
      } else if (e.key.toLowerCase() === 'z' || e.key === 'Control') {
        e.preventDefault();
        handleAction('rotateCCW');
      } else if (e.key === 'Shift') {
        e.preventDefault();
        handleAction('hold');
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleShopConfirm();
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        setShowVariations((prev) => !prev);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Always honor key-up from the LOCAL held-keys state, independent of
      // gameState — a release must take effect even if the echo is delayed.
      if (e.key === 'ArrowLeft') {
        heldKeysRef.current = { ...heldKeysRef.current, left: false };
        sendInputState({ ...heldKeysRef.current });
      } else if (e.key === 'ArrowRight') {
        heldKeysRef.current = { ...heldKeysRef.current, right: false };
        sendInputState({ ...heldKeysRef.current });
      } else if (e.key === 'ArrowDown') {
        heldKeysRef.current = { ...heldKeysRef.current, softDrop: false };
        sendInputState({ ...heldKeysRef.current });
      }
    };
    const clearInput = () => {
      heldKeysRef.current = { left: false, right: false, softDrop: false };
      sendInputState({ left: false, right: false, softDrop: false });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
    };
  }, [handleAction, sendInputState, handleShopConfirm]);

  useEffect(() => {
    if (!lockDrillEnabled || !gameState || gameState.status !== 'playing' || !myId) {
      drillStepRef.current = 'idle';
      drillSpinsRef.current = 0;
      drillTrackingPieceRef.current = false;
      drillObservedCapRef.current = false;
      drillPrevLockDelayRef.current = null;
      drillPrevPieceYRef.current = null;
      drillExhaustAttemptsRef.current = 0;
      drillFailureReasonRef.current = null;
      return;
    }
    const me = gameState.players[myId];
    if (!me) return;
    if (!me.activePiece) {
      if (drillTrackingPieceRef.current) {
        if (drillFailureReasonRef.current) {
          setDrillResult({ status: 'fail', message: drillFailureReasonRef.current });
        } else if (drillObservedCapRef.current) {
          setDrillResult({
            status: 'pass',
            message:
              'PASS: Move-reset cap was exhausted; no illegal lock-delay refresh before lock (gravity refills ignored).',
          });
        } else {
          setDrillResult({
            status: 'pass',
            message: 'PASS: Piece locked (cap not fully exhausted this cycle — e.g. few valid rotations).',
          });
        }
      }
      drillTrackingPieceRef.current = false;
      drillObservedCapRef.current = false;
      drillPrevLockDelayRef.current = null;
      drillPrevPieceYRef.current = null;
      drillExhaustAttemptsRef.current = 0;
      drillFailureReasonRef.current = null;
      drillStepRef.current = 'seekGround';
      drillSpinsRef.current = 0;
      sendInputState({ left: false, right: false, softDrop: true });
      return;
    }
    if (drillStepRef.current === 'idle') {
      drillStepRef.current = 'seekGround';
      sendInputState({ left: false, right: false, softDrop: true });
      return;
    }
    if (drillStepRef.current === 'seekGround') {
      sendInputState({ left: false, right: false, softDrop: true });
      if (me.lockDelayRemainingTicks < LOCK_DELAY_TICKS) {
        sendInputState({ left: false, right: false, softDrop: false });
        drillStepRef.current = 'consumeCap';
      }
      return;
    }
    if (drillStepRef.current === 'consumeCap') {
      drillDirectionRef.current = -1;
      drillSpinsRef.current = 0;
      drillLastSpinMsRef.current = performance.now();
      drillTrackingPieceRef.current = true;
      drillObservedCapRef.current = false;
      drillPrevLockDelayRef.current = null;
      drillPrevPieceYRef.current = null;
      drillExhaustAttemptsRef.current = 0;
      drillFailureReasonRef.current = null;
      drillStepRef.current = 'exhaustCap';
      return;
    }
    if (drillStepRef.current === 'exhaustCap') {
      if (me.lockResetsUsed >= LOCK_RESET_CAP) {
        drillSpinsRef.current = 0;
        drillLastSpinMsRef.current = performance.now();
        drillStepRef.current = 'spam';
        return;
      }
      const now = performance.now();
      if (now - drillLastSpinMsRef.current < 120) return;
      if (drillExhaustAttemptsRef.current >= 40) {
        drillSpinsRef.current = 0;
        drillLastSpinMsRef.current = now;
        drillStepRef.current = 'spam';
        return;
      }
      sendAction('rotateCW');
      drillExhaustAttemptsRef.current += 1;
      drillLastSpinMsRef.current = now;
      return;
    }
    if (drillStepRef.current === 'spam') {
      if (me.lockResetsUsed >= LOCK_RESET_CAP) {
        if (!drillObservedCapRef.current) {
          drillObservedCapRef.current = true;
          drillPrevLockDelayRef.current = me.lockDelayRemainingTicks;
          drillPrevPieceYRef.current = me.activePiece?.y ?? null;
        } else {
          const prevD = drillPrevLockDelayRef.current;
          const prevY = drillPrevPieceYRef.current;
          const y = me.activePiece?.y ?? null;
          const yIncreased = prevY !== null && y !== null && y > prevY;
          const jumped = prevD !== null && me.lockDelayRemainingTicks > prevD + 1;
          if (jumped && !yIncreased && !drillFailureReasonRef.current) {
            drillFailureReasonRef.current =
              'FAIL: lockDelay refreshed after move-reset cap exhausted without a gravity step (illegal rotate/move reset).';
          }
          drillPrevLockDelayRef.current = me.lockDelayRemainingTicks;
          drillPrevPieceYRef.current = y;
        }
      }
      const now = performance.now();
      if (now - drillLastSpinMsRef.current < 120) return;
      if (drillSpinsRef.current >= 8) {
        drillStepRef.current = 'waitForLock';
        drillSpinsRef.current = 0;
        sendInputState({ left: false, right: false, softDrop: true });
        return;
      }
      sendAction(drillDirectionRef.current === 1 ? 'rotateCW' : 'rotateCCW');
      drillDirectionRef.current = drillDirectionRef.current === 1 ? -1 : 1;
      drillSpinsRef.current += 1;
      drillLastSpinMsRef.current = now;
      return;
    }
    if (drillStepRef.current === 'waitForLock') {
      if (me.lockResetsUsed >= LOCK_RESET_CAP) {
        const prevD = drillPrevLockDelayRef.current;
        const prevY = drillPrevPieceYRef.current;
        const y = me.activePiece?.y ?? null;
        const yIncreased = prevY !== null && y !== null && y > prevY;
        const jumped = prevD !== null && me.lockDelayRemainingTicks > prevD + 1;
        if (jumped && !yIncreased && !drillFailureReasonRef.current) {
          drillFailureReasonRef.current =
            'FAIL: lockDelay refreshed after move-reset cap exhausted without a gravity step (illegal rotate/move reset).';
        }
        drillPrevLockDelayRef.current = me.lockDelayRemainingTicks;
        drillPrevPieceYRef.current = y;
      }
      return;
    }
  }, [gameState, myId, lockDrillEnabled, sendAction, sendInputState]);

  useEffect(() => {
    if (!lastMatchEvent) return;
    const isMe = !!(myId && lastMatchEvent.playerId === myId);
    if (lastMatchEvent.type === 'lineClear') {
      triggerShake(isMe, 'soft');
    } else if (lastMatchEvent.type === 'garbageApplied') {
      triggerShake(isMe, 'medium');
    }
  }, [lastMatchEvent, myId, triggerShake]);

  useEffect(() => {
    return () => {
      if (kickPopupTimeoutRef.current) clearTimeout(kickPopupTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.status !== 'playing' || !myId) {
      prevKickNonceRef.current = myId ? (gameState.players[myId]?.srsKickNonce ?? 0) : 0;
      return;
    }
    const me = gameState.players[myId];
    if (!me) return;
    const n = me.srsKickNonce ?? 0;
    if (n > prevKickNonceRef.current && me.lastSrsKick) {
      if (kickPopupTimeoutRef.current) clearTimeout(kickPopupTimeoutRef.current);
      setKickPopup({ kx: me.lastSrsKick.kx, ky: me.lastSrsKick.ky });
      kickPopupTimeoutRef.current = setTimeout(() => setKickPopup(null), 480);
    }
    prevKickNonceRef.current = n;
  }, [gameState, myId]);

  const myPlayer = myId ? gameState?.players[myId] : null;
  const opponentId = myId ? Object.keys(gameState?.players ?? {}).find((id) => id !== myId) : null;
  const opponentPlayer = opponentId && gameState ? gameState.players[opponentId] : null;
  const availableShopScore = Math.max(0, (myPlayer?.score ?? 0) - shop.spentScore);
  const shopCanPurchase = shop.phase === 'cycling' || shop.phase === 'ready';
  const myPendingGarbage = myPlayer ? myPlayer.pendingGarbage.reduce((sum, g) => sum + g.lines, 0) : 0;
  const oppPendingGarbage = opponentPlayer ? opponentPlayer.pendingGarbage.reduce((sum, g) => sum + g.lines, 0) : 0;
  const eventUi = matchEventLabel(lastMatchEvent, myId);

  if (showVariations) {
    return <ShopRailVariations />;
  }

  if (!gameState) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0a0a0f] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-mono text-sm tracking-widest uppercase animate-pulse">Connecting to Game Server...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-[#0a0a0a] px-2 py-2 font-sans text-white sm:px-4 sm:py-3"
    >
      {/* Header */}
      <div className="mb-1 flex w-full max-w-5xl shrink-0 items-center justify-between gap-1 self-center overflow-visible rounded-lg border border-white/5 bg-[#1a1a1a] px-2 py-1.5 shadow-xl sm:mb-3 sm:gap-2 sm:rounded-2xl sm:p-3 md:p-4">
        
        {/* Left: My Score + Funds + Incoming */}
        <div className="flex flex-1 items-center gap-1.5 min-w-0 sm:gap-4">
          <div className="hidden shrink-0 rounded-lg bg-emerald-500/10 sm:block sm:p-2">
            <Zap className="h-4 w-4 text-emerald-400 sm:h-5 sm:w-5" />
          </div>
          <div className="flex flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:flex-col sm:items-start sm:gap-0 min-w-0">
            <p className="hidden text-[10px] font-semibold uppercase tracking-wider text-emerald-400/60 sm:block">
              Your Attack Score
            </p>
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-emerald-400 sm:hidden" />
              <p className="font-mono text-sm leading-none text-emerald-50 sm:text-2xl">{myPlayer?.score ?? 0}</p>
            </div>
            {myPlayer && (
              <div className="flex items-center gap-1 sm:mt-0.5 sm:gap-1.5">
                <span className="hidden text-[9px] font-bold uppercase tracking-widest text-cyan-400/80 sm:inline">Funds</span>
                <span className="text-[9px] font-bold text-cyan-400/80 sm:hidden">F</span>
                <span className="font-mono text-xs text-cyan-200 sm:text-sm">{availableShopScore}</span>
              </div>
            )}
            <div className="flex items-center text-[10px] font-mono sm:hidden">
              <span className="mr-0.5 text-rose-400/80">In:</span>
              <span className="text-rose-200">{myPendingGarbage}</span>
            </div>
          </div>
        </div>

        {/* Center: Timer */}
        <div className="flex shrink-0 flex-col items-center px-1 sm:px-2">
          <div className="hidden items-center gap-2 sm:mb-1 sm:flex">
            <Timer className="h-4 w-4 text-zinc-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Remaining
            </span>
          </div>
          <p className="font-mono text-base leading-none tracking-tighter text-zinc-300 sm:text-3xl">
            {Math.floor(gameState.remainingTime / 60)}:{(Math.floor(gameState.remainingTime % 60)).toString().padStart(2, '0')}
          </p>
        </div>

        {/* Right: Opponent Score + Incoming */}
        <div className="flex flex-1 items-center justify-end gap-1.5 min-w-0 sm:gap-4">
          <div className="flex flex-row flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 sm:flex-col sm:items-end sm:gap-0 min-w-0">
            <div className="flex items-center text-[10px] font-mono sm:hidden">
              <span className="mr-0.5 text-rose-400/80">In:</span>
              <span className="text-rose-200">{oppPendingGarbage}</span>
            </div>
            <p className="hidden text-[10px] font-semibold uppercase leading-tight tracking-wider text-rose-400/60 sm:block">
              Opponent Attack Score
            </p>
            <div className="flex items-center gap-1">
              <p className="font-mono text-sm leading-none text-rose-50 sm:text-2xl">{opponentPlayer?.score ?? 0}</p>
              <Users className="h-3 w-3 text-rose-400 sm:hidden" />
            </div>
          </div>
          <div className="hidden shrink-0 rounded-lg bg-rose-500/10 sm:block sm:p-2">
            <Users className="h-4 w-4 text-rose-400 sm:h-5 sm:w-5" />
          </div>
        </div>
      </div>
      {lastMatchEvent && (
        <div className={`mb-1 self-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] uppercase tracking-wider sm:mb-2 sm:px-3 sm:py-1 sm:text-[11px] ${eventUi.tone}`}>
          {eventUi.text}
        </div>
      )}
      {(myPlayer || opponentPlayer) && (
        <div className="mb-1.5 hidden w-full max-w-5xl grid-cols-2 gap-2 self-center sm:grid">
          <div className="rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-1.5 text-xs">
            <span className="text-rose-300/90">Incoming (you): </span>
            <span className="font-mono text-rose-200">{myPendingGarbage}</span>
          </div>
          <div className="rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-1.5 text-xs text-right">
            <span className="text-rose-300/90">Incoming (opp): </span>
            <span className="font-mono text-rose-200">{oppPendingGarbage}</span>
          </div>
        </div>
      )}
      {drillResult && (
        <div
          className={`mb-2 w-full max-w-5xl self-center rounded-lg border px-3 py-2 text-sm font-semibold ${drillResult.status === 'pass'
              ? 'border-emerald-400/40 bg-emerald-950/30 text-emerald-200'
              : 'border-rose-400/40 bg-rose-950/30 text-rose-200'
            }`}
        >
          {drillResult.message}
        </div>
      )}
      {myPlayer && (
        <div className="relative mb-2 hidden w-full max-w-5xl self-center rounded-lg border border-cyan-500/25 bg-cyan-950/15 px-3 py-2 text-xs text-cyan-100 md:block">
          <AnimatePresence>
            {kickPopup && (
              <m.div
                key={`${kickPopup.kx},${kickPopup.ky}-${myPlayer.srsKickNonce ?? 0}`}
                initial={{ opacity: 0, scale: 0.92, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: -4 }}
                transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                className="pointer-events-none absolute -top-2 right-3 z-10 rounded border border-amber-400/45 bg-amber-950/95 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-tight text-amber-100 shadow-md shadow-amber-950/50"
              >
                Kick {kickPopup.kx >= 0 ? '+' : ''}
                {kickPopup.kx},{kickPopup.ky >= 0 ? '+' : ''}
                {kickPopup.ky}
              </m.div>
            )}
          </AnimatePresence>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold uppercase tracking-wide">Lock Debug</div>
            <button
              type="button"
              onClick={() => setLockDrillEnabled((prev) => !prev)}
              className={`rounded px-2 py-1 font-mono text-[11px] ${lockDrillEnabled ? 'bg-cyan-500/30 text-cyan-50' : 'bg-zinc-800 text-zinc-200'}`}
            >
              Drill {lockDrillEnabled ? 'ON' : 'OFF'} (F6)
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
            <span>lockDelay: {myPlayer.lockDelayRemainingTicks}</span>
            <span>resetUsed: {myPlayer.lockResetsUsed}</span>
            <span>pieceY: {myPlayer.activePiece ? myPlayer.activePiece.y : 'none'}</span>
            <span>cap: {myPlayer.pieceLockResetCap ?? LOCK_RESET_CAP}</span>
            <span>
              lastKick:{' '}
              {myPlayer.lastSrsKick
                ? `${myPlayer.lastSrsKick.kx},${myPlayer.lastSrsKick.ky}`
                : '—'}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-cyan-200/80">
            Soft-drops to ground, rotates until move-reset cap is spent, then probes with more rotations. Fails only if lockDelay jumps to full after cap without the piece stepping down (Y increase).
          </div>
        </div>
      )}

      {gameState.status === 'waiting' && Object.keys(gameState.players).length < 2 && (
        <div className="mb-1 hidden shrink-0 self-center rounded-full border border-white/5 bg-zinc-900/90 px-4 py-1.5 sm:block sm:py-2">
          <p className="text-center text-xs font-medium tracking-wide text-zinc-400">
            Waiting for another player to join…
          </p>
        </div>
      )}

      {/* Mobile game view: board column (flex-1) + opponent/shop rail (flex sibling).
          Using a real flex row — instead of an absolutely-positioned rail with a
          fixed pixel reserve — lets the board shrink to whatever width remains
          after the rail's actual (possibly font-scaled) size, so the rail can
          never clip off-screen regardless of device or display scaling. */}
      <div className="relative min-h-0 w-full flex-1 md:hidden">
        <div
          ref={mobilePlayfieldRef}
          className="flex h-full w-full items-stretch gap-2 overflow-hidden px-1 pb-3"
        >
          {/* Board shrink-wraps to its computed cell size (no flex-grow, so it
              never leaves a gap that shoves the rail off-screen). */}
          <div className="flex min-h-0 shrink-0 items-start justify-start">
            {myPlayer && (
              <GameField
                ref={myMobileFieldRef}
                player={myPlayer}
                isMe={true}
                title="👤 YOUR FIELD"
                borderColorClass="border-emerald-500/20"
                shadowColorClass="shadow-[0_0_30px_rgba(16,185,129,0.1)]"
                cellSize={mobileCellSize}
              />
            )}
          </div>
          {/* Rail is always rendered so its width is a stable measurement target
              (it shows waiting states pre-match); shrink-0 keeps it intact. */}
          <div ref={railRef} className="flex shrink-0 flex-col gap-2 overflow-y-auto">
            <OpponentMiniField player={opponentPlayer} pendingGarbage={oppPendingGarbage} />
            <ShopRail
              items={shop.offers}
              isPlaying={gameState.status === 'playing'}
              canPurchase={shopCanPurchase}
              cycleIndex={shop.cycleIndex}
              shopPhase={shop.phase}
              purchasedItem={shop.purchasedItem}
              onConfirm={handleShopConfirm}
              availableScore={availableShopScore}
              viewportMode="mobile"
            />
          </div>
        </div>
      </div>

      {/* Desktop game view: dual full boards */}
      <div className="hidden min-h-0 w-full flex-1 md:flex md:flex-col">
        <GameFieldsLayout>
          {myPlayer && (
            <div className="flex shrink-0 items-start gap-3 sm:gap-4">
              <div className="shrink-0">
            <ShopRail
              items={shop.offers}
              isPlaying={gameState.status === 'playing'}
              canPurchase={shopCanPurchase}
              cycleIndex={shop.cycleIndex}
              shopPhase={shop.phase}
              purchasedItem={shop.purchasedItem}
              onConfirm={handleShopConfirm}
              availableScore={availableShopScore}
              viewportMode="tabletDesktop"
            />
              </div>
              <GameField
                ref={myDesktopFieldRef}
                player={myPlayer}
                isMe={true}
                title="👤 YOUR FIELD"
                borderColorClass="border-emerald-500/20"
                shadowColorClass="shadow-[0_0_30px_rgba(16,185,129,0.1)]"
              />
            </div>
          )}

          <div className="relative shrink-0">
            {opponentPlayer ? (
              <GameField
                ref={oppDesktopFieldRef}
                player={opponentPlayer}
                isMe={false}
                title="Opponent Field"
                borderColorClass="border-rose-500/20"
                shadowColorClass="shadow-[0_0_30px_rgba(244,63,94,0.1)]"
                opacityClass="opacity-80"
              />
            ) : (
              <WaitingForOpponentBoard />
            )}
          </div>
        </GameFieldsLayout>
      </div>

      {/* Overlays */}
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {gameState.status === 'countdown' && (
            <m.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 2 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <h1 className="font-black italic text-white drop-shadow-2xl [font-size:min(28vw,12rem)]">
                {Math.ceil(gameState.countdown)}
              </h1>
            </m.div>
          )}

          {gameState.status === 'ended' && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 bg-[#0a0a0f]/80 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-8"
            >
              <div className="bg-[#1a1a1a] p-6 sm:p-10 md:p-12 rounded-[1.5rem] sm:rounded-[2rem] border border-white/10 shadow-2xl text-center max-w-[min(calc(100vw-2rem),28rem)] w-full">
                <Trophy className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-yellow-400 mx-auto mb-4 sm:mb-6" />
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tighter mb-2">Game Over</h2>
                <p className="text-sm sm:text-base text-zinc-400 mb-5 sm:mb-8">
                  {gameState.technicalVictory && gameState.winnerId === myId ? "Opponent disconnected. Technical Victory!" :
                    gameState.winnerId === myId ? "You won the match!" :
                      gameState.winnerId === 'draw' ? "It's a draw!" : "Opponent won the match."}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-8">
                  <div className="bg-[#0a0a0f]/40 p-3 sm:p-4 rounded-xl sm:rounded-2xl">
                    <p className="text-[9px] sm:text-[10px] uppercase text-zinc-500 font-bold mb-1">Your Score</p>
                    <p className="text-xl sm:text-2xl font-mono">{myPlayer?.score || 0}</p>
                  </div>
                  <div className="bg-[#0a0a0f]/40 p-3 sm:p-4 rounded-xl sm:rounded-2xl">
                    <p className="text-[9px] sm:text-[10px] uppercase text-zinc-500 font-bold mb-1">Opponent</p>
                    <p className="text-xl sm:text-2xl font-mono">{opponentPlayer?.score || 0}</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-600">
                  {gameState.restartTimer !== undefined
                    ? `Restarting level in ${Math.ceil(gameState.restartTimer)} seconds...`
                    : "Waiting for server reset..."}
                </p>
              </div>
            </m.div>
          )}

        </AnimatePresence>
      </LazyMotion>

      {/* Controls Help */}
      <div className="pointer-events-none fixed bottom-2 left-2 z-30 hidden md:flex flex-col gap-1 md:bottom-8 md:left-8 md:gap-2">
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] sm:px-2 sm:py-1 sm:text-xs">
            ←
          </kbd>
          <kbd className="rounded border border-white/5 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] sm:px-2 sm:py-1 sm:text-xs">
            →
          </kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Move</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">
            ↓
          </kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Soft Drop</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">
            ↑
          </kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Hard Drop</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">
            Z / X
          </kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Rotate</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">
            SHIFT
          </kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Storage</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">
            C
          </kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Shop</span>
        </div>
      </div>
      <MobileControls
        onInput={sendInputState}
        onAction={handleAction}
        onShopPress={handleShopConfirm}
        onHeightChange={setMobileControlsHeight}
      />
    </div>
  );
};

export default App;
