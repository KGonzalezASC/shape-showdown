import React, { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { ActionType, BOARD_COLS, BOARD_VISIBLE_ROWS, LOCK_DELAY_TICKS, LOCK_RESET_CAP, ShopItem } from './types';

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
    id: 'aegis-core',
    name: 'Aegis',
    icon: '🛡️',
    cost: 150,
    tier: 1,
    baseWeight: 1,
    colorClass: 'bg-emerald-900/75',
    borderColorClass: 'border-emerald-300/70',
    description: 'Consectetur adipiscing elit.',
  },
  {
    id: 'nova-charge',
    name: 'Nova',
    icon: '💣',
    cost: 175,
    tier: 1,
    baseWeight: 1,
    colorClass: 'bg-rose-900/75',
    borderColorClass: 'border-rose-300/70',
    description: 'Sed do eiusmod tempor.',
  },
  {
    id: 'gravity-lure',
    name: 'Lure',
    icon: '🧲',
    cost: 145,
    tier: 1,
    baseWeight: 1,
    colorClass: 'bg-violet-900/75',
    borderColorClass: 'border-violet-300/70',
    description: 'Incididunt ut labore et dolore.',
  },
  {
    id: 'frost-shift',
    name: 'Frost',
    icon: '❄️',
    cost: 70,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-sky-900/70',
    borderColorClass: 'border-sky-300/65',
    description: 'Magna aliqua lorem ipsum.',
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
    cost: 55,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-lime-900/70',
    borderColorClass: 'border-lime-300/65',
    description: 'Quis nostrud exercitation ullamco.',
  },
  {
    id: 'vortex-step',
    name: 'Vortex',
    icon: '🌀',
    cost: 75,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-indigo-900/70',
    borderColorClass: 'border-indigo-300/65',
    description: 'Laboris nisi ut aliquip ex ea.',
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
    name: 'Fortify',
    icon: '🧱',
    cost: 50,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-orange-900/70',
    borderColorClass: 'border-orange-300/65',
    description: 'Duis aute irure dolor in.',
  },
  {
    id: 'quickstep-clock',
    name: 'Quickstep',
    icon: '⏱️',
    cost: 65,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-teal-900/70',
    borderColorClass: 'border-teal-300/65',
    description: 'Reprehenderit in voluptate velit.',
  },
  {
    id: 'satellite-link',
    name: 'Satellite',
    icon: '🛰️',
    cost: 90,
    tier: 2,
    baseWeight: 2.25,
    colorClass: 'bg-zinc-800/80',
    borderColorClass: 'border-zinc-300/60',
    description: 'Esse cillum dolore eu fugiat.',
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

function drawOneWeightedShopItem(
  pool: ShopItem[],
  bagState: ShopBagState,
  excludedIds: Set<string>,
  currentTier1Count: number,
): { item: ShopItem | null; nextBagState: ShopBagState } {
  const byId = new Map(pool.map((item) => [item.id, item]));
  const tier1Weight = pool
    .filter((item) => item.tier === 1 && !excludedIds.has(item.id))
    .reduce((sum, item) => sum + item.baseWeight, 0);
  const tier2Weight = pool
    .filter((item) => item.tier === 2 && !excludedIds.has(item.id))
    .reduce((sum, item) => sum + item.baseWeight, 0);
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
): { offers: ShopItem[]; nextBagState: ShopBagState } {
  const target = Math.max(0, Math.min(count, pool.length));
  const offers: ShopItem[] = [];
  const excludedIds = new Set<string>();
  let tier1Count = 0;
  let nextState = bagState;

  while (offers.length < target) {
    const drawn = drawOneWeightedShopItem(pool, nextState, excludedIds, tier1Count);
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

function createInitialShopRoll(pool: ShopItem[], count: number): { offers: ShopItem[]; bagState: ShopBagState } {
  const freshBag = buildShopBagState(pool);
  const rolled = drawWeightedShopOffers(pool, count, freshBag);
  return {
    offers: rolled.offers,
    bagState: rolled.nextBagState,
  };
}

const App: React.FC = () => {
  const { gameState, myId, lastMatchEvent, sendAction, sendInputState } = useGameSocket();

  const stateRef = useRef({ gameState, myId });
  useLayoutEffect(() => {
    stateRef.current = { gameState, myId };
  }, [gameState, myId]);

  const mobilePlayfieldRef = useRef<HTMLDivElement>(null);
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

  const [myShake, setMyShake] = useState('');
  const [oppShake, setOppShake] = useState('');
  const [shopState, setShopState] = useState<{ offers: ShopItem[]; bagState: ShopBagState }>(() =>
    createInitialShopRoll(SHOP_MOCK_POOL, SHOP_VISIBLE_COUNT),
  );
  const [shopPhase, setShopPhase] = useState<'waiting' | 'ready' | 'cycling' | 'expired'>('waiting');
  const [shopCycleIndex, setShopCycleIndex] = useState(-1);
  const [purchasedItem, setPurchasedItem] = useState<ShopItem | null>(null);
  const [shopSpentScore, setShopSpentScore] = useState(0);
  const shopSpentScoreRef = useRef(0);
  const shopStateRef = useRef({ phase: 'waiting', cycleIndex: -1, offers: shopState.offers });
  const shopCycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useLayoutEffect(() => {
    shopStateRef.current = { phase: shopPhase, cycleIndex: shopCycleIndex, offers: shopState.offers };
  }, [shopPhase, shopCycleIndex, shopState.offers]);

  const triggerShake = useCallback((isMe: boolean, type: 'soft' | 'medium') => {
    const setter = isMe ? setMyShake : setOppShake;
    const cls = type === 'soft' ? 'animate-shake-soft' : 'animate-shake-medium';
    setter('');
    setTimeout(() => setter(cls), 10);
    setTimeout(() => setter(''), 400);
  }, []);

  const handleAction = useCallback(
    (action: ActionType) => {
      if (action === 'hardDrop') {
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
    setShopPhase('cycling');
    setShopCycleIndex(0);
    // Sync ref immediately so handleShopConfirm closure reads fresh phase/index
    shopStateRef.current = { ...shopStateRef.current, phase: 'cycling', cycleIndex: 0 };

    shopCycleTimerRef.current = setInterval(() => {
      setShopCycleIndex((prev) => {
        const nextIndex = prev + 1;
        if (nextIndex >= offersLength) {
          if (shopCycleTimerRef.current) {
            clearInterval(shopCycleTimerRef.current);
            shopCycleTimerRef.current = null;
          }
          setShopPhase('expired');
          shopStateRef.current = { ...shopStateRef.current, phase: 'expired', cycleIndex: -1 };
          return -1;
        }
        shopStateRef.current = { ...shopStateRef.current, cycleIndex: nextIndex };
        return nextIndex;
      });
    }, SHOP_CYCLE_INTERVAL_MS);
  }, []);

  const stopShopCycle = useCallback(() => {
    if (shopCycleTimerRef.current) {
      clearInterval(shopCycleTimerRef.current);
      shopCycleTimerRef.current = null;
    }
    setShopPhase('waiting');
    setShopCycleIndex(-1);
  }, []);

  const handleShopConfirm = useCallback(() => {
    const { phase, cycleIndex, offers } = shopStateRef.current;
    if (phase === 'waiting') return;

    if (phase === 'ready' || phase === 'expired') {
      startShopCycle(offers.length);
      return;
    }

    if (phase === 'cycling') {
      if (cycleIndex < 0 || cycleIndex >= offers.length) return;

      const picked = offers[cycleIndex];
      const currentScore = myId && gameState ? (gameState.players[myId]?.score ?? 0) : 0;
      const availableScore = Math.max(0, currentScore - shopSpentScoreRef.current);

      if (availableScore < picked.cost) return;

      setPurchasedItem(picked);
      const nextSpent = shopSpentScoreRef.current + picked.cost;
      shopSpentScoreRef.current = nextSpent;
      setShopSpentScore(nextSpent);

      if (shopCycleTimerRef.current) {
        clearInterval(shopCycleTimerRef.current);
        shopCycleTimerRef.current = null;
      }
      setShopPhase('waiting');
      setShopCycleIndex(-1);
      shopStateRef.current = { ...shopStateRef.current, phase: 'waiting', cycleIndex: -1 };
    }
  }, [gameState, myId, startShopCycle]);

  useLayoutEffect(() => {
    const el = mobilePlayfieldRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 8 || height < 8) return;
      // Space reserved for title row, compact storage panel, bottom padding, and a small safety margin.
      const boardChromeReserve = 114;
      const fromH = (height - boardChromeReserve) / BOARD_VISIBLE_ROWS;
      const c = Math.floor(Math.min((width - 104) / BOARD_COLS, fromH));
      setMobileCellSize((prev) => {
        // Increased max cell size to 36 to allow board to grow on intermediate tablet views
        const next = Math.max(10, Math.min(36, c));
        return prev !== next ? next : prev;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!drillResult) return;
    const t = window.setTimeout(() => setDrillResult(null), 2200);
    return () => window.clearTimeout(t);
  }, [drillResult]);

  useEffect(() => {
    shopSpentScoreRef.current = shopSpentScore;
  }, [shopSpentScore]);

  const previousLineClearTickRef = useRef<number | null>(null);
  const previousStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const status = gameState?.status ?? null;
    if (!status) return;
    if (previousStatusRef.current === status) return;
    previousStatusRef.current = status;

    if (status === 'waiting' || status === 'countdown') {
      stopShopCycle();
      setShopState(createInitialShopRoll(SHOP_MOCK_POOL, SHOP_VISIBLE_COUNT));
      setShopSpentScore(0);
      setPurchasedItem(null);
      shopSpentScoreRef.current = 0;
      previousLineClearTickRef.current = null;
    }
  }, [gameState?.status, stopShopCycle]);

  useEffect(() => {
    if (!gameState || gameState.status !== 'playing') return;
    if (!lastMatchEvent || lastMatchEvent.type !== 'lineClear' || !myId) return;
    if (lastMatchEvent.playerId !== myId) return;
    if (previousLineClearTickRef.current === lastMatchEvent.tick) return;
    previousLineClearTickRef.current = lastMatchEvent.tick;
    
    const rolled = drawWeightedShopOffers(SHOP_MOCK_POOL, SHOP_VISIBLE_COUNT, shopState.bagState);
    const newOffers = rolled.offers;
    setShopState({
      offers: newOffers,
      bagState: rolled.nextBagState,
    });

    if (shopCycleTimerRef.current) {
      clearInterval(shopCycleTimerRef.current);
      shopCycleTimerRef.current = null;
    }
    setShopPhase('ready');
    setShopCycleIndex(-1);
    // Update ref synchronously so C key handler reads fresh offers+phase immediately
    shopStateRef.current = { phase: 'ready', cycleIndex: -1, offers: newOffers };
  }, [gameState?.status, lastMatchEvent, myId, shopState.bagState]);

  useEffect(() => {
    if (!gameState || gameState.status !== 'playing') {
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
        sendInputState({ ...gameState.players[myId].inputState, left: true });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        sendInputState({ ...gameState.players[myId].inputState, right: true });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        sendInputState({ ...gameState.players[myId].inputState, softDrop: true });
      } else if (e.key === 'ArrowUp') {
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
      const { gameState, myId } = stateRef.current;
      if (!gameState || !myId || !gameState.players[myId]) return;
      const current = gameState.players[myId].inputState;
      if (e.key === 'ArrowLeft') {
        sendInputState({ ...current, left: false });
      } else if (e.key === 'ArrowRight') {
        sendInputState({ ...current, right: false });
      } else if (e.key === 'ArrowDown') {
        sendInputState({ ...current, softDrop: false });
      }
    };
    const clearInput = () => {
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
  const availableShopScore = Math.max(0, (myPlayer?.score ?? 0) - shopSpentScore);
  const shopCanPurchase = shopPhase === 'cycling' || shopPhase === 'ready';
  const myPendingGarbage = myPlayer ? myPlayer.pendingGarbage.reduce((sum, g) => sum + g.lines, 0) : 0;
  const oppPendingGarbage = opponentPlayer ? opponentPlayer.pendingGarbage.reduce((sum, g) => sum + g.lines, 0) : 0;
  const eventUi = matchEventLabel(lastMatchEvent, myId);

  if (showVariations) {
    return <ShopRailVariations />;
  }

  if (!gameState) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-mono text-sm tracking-widest uppercase animate-pulse">Connecting to Game Server...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-[#0a0a0a] px-2 py-2 pb-[var(--mobile-controls-pad)] font-sans text-white sm:px-4 sm:py-3 md:pb-2"
      style={{ '--mobile-controls-pad': `${mobileControlsHeight + 10}px` } as React.CSSProperties}
    >
      {/* Header */}
      <div className="mb-2 flex w-full max-w-5xl shrink-0 items-center justify-between gap-2 self-center overflow-visible rounded-xl border border-white/5 bg-[#1a1a1a] p-2 shadow-xl sm:mb-3 sm:rounded-2xl sm:p-3 md:p-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <div className="shrink-0 rounded-lg bg-emerald-500/10 p-1.5 sm:p-2">
            <Zap className="h-4 w-4 text-emerald-400 sm:h-5 sm:w-5" />
          </div>
          <div className="relative z-10 min-h-[2.25rem] min-w-0 overflow-visible sm:min-h-[2.5rem] sm:min-w-[3rem]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/60 sm:text-[10px]">
              Your Attack Score
            </p>
            <p className="font-mono text-lg leading-none sm:text-2xl">{myPlayer?.score ?? 0}</p>
            {myPlayer && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-400/80">Funds</span>
                <span className="font-mono text-xs sm:text-sm text-cyan-200">{availableShopScore}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center px-1">
          <div className="mb-0.5 flex items-center gap-1 sm:mb-1 sm:gap-2">
            <Timer className="h-3.5 w-3.5 text-zinc-500 sm:h-4 sm:w-4" />
            <span className="hidden text-[10px] font-bold uppercase tracking-widest text-zinc-500 sm:inline sm:text-xs">
              Remaining
            </span>
          </div>
          <p className="font-mono text-2xl tracking-tighter sm:text-3xl">
            {Math.floor(gameState.remainingTime / 60)}:{(Math.floor(gameState.remainingTime % 60)).toString().padStart(2, '0')}
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-right sm:gap-4">
          <div className="relative z-10 min-h-[2.25rem] min-w-0 overflow-visible sm:min-h-[2.5rem] sm:min-w-[3rem]">
            <p className="text-[9px] font-semibold uppercase leading-tight tracking-wider text-rose-400/60 sm:text-[10px]">
              <span className="sm:hidden">Opp.</span>
              <span className="hidden sm:inline">Opponent Attack Score</span>
            </p>
            <p className="font-mono text-lg leading-none sm:text-2xl">{opponentPlayer?.score ?? 0}</p>
          </div>
          <div className="shrink-0 rounded-lg bg-rose-500/10 p-1.5 sm:p-2">
            <Users className="h-4 w-4 text-rose-400 sm:h-5 sm:w-5" />
          </div>
        </div>
      </div>
      {lastMatchEvent && (
        <div className={`mb-2 self-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wider ${eventUi.tone}`}>
          {eventUi.text}
        </div>
      )}
      {(myPlayer || opponentPlayer) && (
        <div className="mb-2 grid w-full max-w-5xl grid-cols-2 gap-2 self-center">
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
            <span>cap: {LOCK_RESET_CAP}</span>
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

      {/* Mobile game view: primary board + mini opponent at top-right */}
      <div className="relative min-h-0 w-full flex-1 md:hidden">
        <div
          ref={mobilePlayfieldRef}
          className="flex h-full w-full items-start justify-center overflow-hidden px-1 pb-3 pr-[6.25rem]"
        >
          {myPlayer && (
            <div className="relative">
              <GameField
                player={myPlayer}
                isMe={true}
                title="👤 YOUR FIELD"
                borderColorClass="border-emerald-500/20"
                shadowColorClass="shadow-[0_0_30px_rgba(16,185,129,0.1)]"
                cellSize={mobileCellSize}
                shakeClass={myShake}
              />
              {/* Anchor mini field to the right of the main board so it doesn't drift away on wider screens */}
              <div className="absolute left-[calc(100%+0.5rem)] sm:left-[calc(100%+1rem)] top-0 z-20 origin-top-left">
                <OpponentMiniField player={opponentPlayer} pendingGarbage={oppPendingGarbage} />
              </div>
              <div className="absolute left-[calc(100%+0.5rem)] sm:left-[calc(100%+1rem)] top-[9.5rem] z-20 origin-top-left">
          <ShopRail
            items={shopState.offers}
            isPlaying={gameState.status === 'playing'}
            canPurchase={shopCanPurchase}
            cycleIndex={shopCycleIndex}
            shopPhase={shopPhase}
            purchasedItem={purchasedItem}
            onConfirm={handleShopConfirm}
            availableScore={availableShopScore}
            viewportMode="mobile"
          />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Desktop game view: dual full boards */}
      <div className="hidden min-h-0 w-full flex-1 md:flex md:flex-col">
        <GameFieldsLayout>
          {myPlayer && (
            <div className="flex shrink-0 items-start gap-3 sm:gap-4">
              <div className="shrink-0">
            <ShopRail
              items={shopState.offers}
              isPlaying={gameState.status === 'playing'}
              canPurchase={shopCanPurchase}
              cycleIndex={shopCycleIndex}
              shopPhase={shopPhase}
              purchasedItem={purchasedItem}
              onConfirm={handleShopConfirm}
              availableScore={availableShopScore}
              viewportMode="tabletDesktop"
            />
              </div>
              <GameField
                player={myPlayer}
                isMe={true}
                title="👤 YOUR FIELD"
                borderColorClass="border-emerald-500/20"
                shadowColorClass="shadow-[0_0_30px_rgba(16,185,129,0.1)]"
                shakeClass={myShake}
              />
            </div>
          )}

          <div className="relative shrink-0">
            {opponentPlayer ? (
              <GameField
                player={opponentPlayer}
                isMe={false}
                title="Opponent Field"
                borderColorClass="border-rose-500/20"
                shadowColorClass="shadow-[0_0_30px_rgba(244,63,94,0.1)]"
                opacityClass="opacity-80"
                shakeClass={oppShake}
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
              className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-8"
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
                  <div className="bg-black/40 p-3 sm:p-4 rounded-xl sm:rounded-2xl">
                    <p className="text-[9px] sm:text-[10px] uppercase text-zinc-500 font-bold mb-1">Your Score</p>
                    <p className="text-xl sm:text-2xl font-mono">{myPlayer?.score || 0}</p>
                  </div>
                  <div className="bg-black/40 p-3 sm:p-4 rounded-xl sm:rounded-2xl">
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
