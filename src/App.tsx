import React, { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { DrillConsole, DrillResult } from './components/DrillConsole';
import { MatchChrome } from './components/MatchChrome';
import { PlayfieldShell } from './components/PlayfieldShell';
import { fitMobilePlayfieldCellSize } from './components/PlayfieldCellSizer';
import { ShopRailVariations } from './components/ShopRailVariations';
import MobileControls from './components/MobileControls';
import { GameFieldRef } from './components/GameField';
import { BackgroundPrototype } from './components/BackgroundPrototype';
import {
  BG_BLUR_IDLE,
  BG_BLUR_MATCH,
  BG_SCRIM_IDLE,
  BG_SCRIM_MATCH,
  DispersedVoronoiBackground,
} from './components/DispersedVoronoiBackground';
import { DEV_TOOLS_ENABLED } from './devTools';
import { useLockDrill } from './hooks/useLockDrill';
import { useShopConfirm } from './hooks/useShopConfirm';
import {
  GameStateProvider,
  useGameActions,
  useGameState,
  useIsConnected,
  useMatchChromeSnapshot,
  useMyId,
  usePlayfieldSnapshot,
} from './state/GameStateProvider';
import { ActionType, COUNTDOWN_SECONDS } from './types';

interface DrillState {
  enabled: boolean;
  result: DrillResult | null;
}

type DrillAction =
  | { type: 'TOGGLE' }
  | { type: 'SET_RESULT'; payload: DrillResult }
  | { type: 'CLEAR_RESULT' };

function drillReducer(state: DrillState, action: DrillAction): DrillState {
  switch (action.type) {
    case 'TOGGLE':
      return { ...state, enabled: !state.enabled };
    case 'SET_RESULT':
      return { ...state, result: action.payload };
    case 'CLEAR_RESULT':
      return { ...state, result: null };
    default:
      return state;
  }
}

const AppShell: React.FC = () => {
  const connected = useIsConnected();
  const gameState = useGameState();
  const myId = useMyId();
  const playfield = usePlayfieldSnapshot();
  const hasLocalPlayer = Boolean(playfield.myPlayer);
  const chrome = useMatchChromeSnapshot();
  const { sendAction, sendInputState } = useGameActions();
  const handleShopConfirm = useShopConfirm();

  const stateRef = useRef({ playfield, myId });
  useLayoutEffect(() => {
    stateRef.current = { playfield, myId };
  }, [playfield, myId]);

  const mobilePlayfieldRef = useRef<HTMLDivElement>(null);
  const mobileBoardFitRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [mobileCellSize, setMobileCellSize] = useState(28);
  const [showVariations, setShowVariations] = useState(() => (
    DEV_TOOLS_ENABLED
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('shopMock') === '1'
  ));
  const [hatchingEnabled, setHatchingEnabled] = useState(false);
  const [drill, drillDispatch] = useReducer(drillReducer, { enabled: false, result: null });
  const [bgSeedKey, setBgSeedKey] = useState(0);
  const lastShopPurchaseRef = useRef<string | null | undefined>(undefined);
  const lastCountdownDigitRef = useRef<number | null>(null);

  const myMobileFieldRef = useRef<GameFieldRef>(null);
  const myDesktopFieldRef = useRef<GameFieldRef>(null);
  const oppDesktopFieldRef = useRef<GameFieldRef>(null);

  const handleDrillResult = useCallback((result: DrillResult) => {
    drillDispatch({ type: 'SET_RESULT', payload: result });
  }, []);

  const setShopMockVisibility = useCallback((visible: boolean) => {
    setShowVariations(visible);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (visible) {
      url.searchParams.set('shopMock', '1');
    } else {
      url.searchParams.delete('shopMock');
    }
    window.history.replaceState({}, '', url);
  }, []);

  useLockDrill(
    DEV_TOOLS_ENABLED && drill.enabled,
    gameState,
    myId,
    sendAction,
    sendInputState,
    handleDrillResult,
  );

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
      const me = stateRef.current.playfield.myPlayer;
      if (action === 'hardDrop' && me?.activePiece && !me.snagHardDropBlocked) {
        triggerShake(true, 'soft');
        myMobileFieldRef.current?.hardDrop();
        myDesktopFieldRef.current?.hardDrop();
      }
      sendAction(action);
    },
    [sendAction, triggerShake],
  );

  useLayoutEffect(() => {
    const boardSlot = mobileBoardFitRef.current;
    if (!boardSlot) return;
    const measure = () => {
      const ob = boardSlot.getBoundingClientRect();
      if (ob.width < 8 || ob.height < 8) return;
      const next = fitMobilePlayfieldCellSize(
        { width: ob.width, height: ob.height },
      );
      setMobileCellSize((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(boardSlot);
    return () => ro.disconnect();
  }, [connected, hasLocalPlayer]);

  useEffect(() => {
    if (!drill.result) return;
    const t = window.setTimeout(() => drillDispatch({ type: 'CLEAR_RESULT' }), 2200);
    return () => window.clearTimeout(t);
  }, [drill.result]);

  const heldKeysRef = useRef({ left: false, right: false, softDrop: false });
  useEffect(() => {
    if (playfield.status !== 'playing') {
      heldKeysRef.current = { left: false, right: false, softDrop: false };
      sendInputState({ left: false, right: false, softDrop: false });
    }
  }, [playfield.status, sendInputState]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (DEV_TOOLS_ENABLED) {
        if (e.key === 'F6') {
          e.preventDefault();
          drillDispatch({ type: 'TOGGLE' });
          return;
        }
        if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          setShopMockVisibility(!showVariations);
          return;
        }
      }
      const { playfield: pf, myId: id } = stateRef.current;
      if (pf.status !== 'playing' || !id || !pf.myPlayer) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (heldKeysRef.current.left) return;
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
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
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
  }, [handleAction, sendInputState, handleShopConfirm, setShopMockVisibility, showVariations]);

  useEffect(() => {
    const evt = chrome.lastMatchEvent;
    if (!evt) return;
    const isMe = !!(myId && evt.playerId === myId);
    if (evt.type === 'lineClear') {
      triggerShake(isMe, 'soft');
    } else if (evt.type === 'garbageApplied') {
      triggerShake(isMe, 'medium');
    }
  }, [chrome.lastMatchEvent, myId, triggerShake]);

  const isPlaying = chrome.status === 'playing';
  const bgScrimOpacity = isPlaying ? BG_SCRIM_MATCH : BG_SCRIM_IDLE;
  const bgBlur = isPlaying ? BG_BLUR_MATCH : BG_BLUR_IDLE;

  useEffect(() => {
    const purchasedId = chrome.shopLastPurchasedItemId;
    const prev = lastShopPurchaseRef.current;
    lastShopPurchaseRef.current = purchasedId;
    // Skip the first observe so reconnect/hydrate does not reseed.
    // Reseed only when a purchase lands (null→id or id→other id), not when the shop clears.
    if (prev === undefined) return;
    if (purchasedId && purchasedId !== prev) {
      setBgSeedKey((key) => key + 1);
    }
  }, [chrome.shopLastPurchasedItemId]);

  // Reseed once per displayed 3→2→1 digit (not every float tick — that cancels mid-generate).
  // Post-match restart uses ended + restartTimer, not countdown status.
  useEffect(() => {
    if (chrome.status !== 'countdown') {
      lastCountdownDigitRef.current = null;
      return;
    }
    const digit = Math.ceil(chrome.countdown);
    if (digit < 1 || digit > COUNTDOWN_SECONDS) return;
    if (lastCountdownDigitRef.current === digit) return;
    lastCountdownDigitRef.current = digit;
    setBgSeedKey((key) => key + 1);
  }, [chrome.status, chrome.countdown]);

  if (showVariations) {
    return <ShopRailVariations onClose={() => setShopMockVisibility(false)} />;
  }

  return (
    <div className="relative flex h-dvh max-h-dvh min-h-0 flex-col items-center justify-center overflow-hidden p-[5px] font-sans text-white min-[661px]:p-3">
      <DispersedVoronoiBackground
        scrimOpacity={bgScrimOpacity}
        blur={bgBlur}
        seedKey={bgSeedKey}
      />

      {!connected ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-mono text-sm tracking-widest uppercase animate-pulse">Connecting to Game Server...</p>
        </div>
      ) : (
        <>
          <main className="relative z-10 flex h-[min(820px,calc(100dvh-10px))] min-h-[500px] w-full max-w-[430px] flex-col overflow-hidden border-0 bg-transparent p-1.5 shadow-none min-[661px]:h-[min(820px,calc(100dvh-24px))] min-[661px]:max-w-[820px] min-[661px]:p-2.5 min-[901px]:max-w-[1180px]">
            <MatchChrome />
            {DEV_TOOLS_ENABLED && drill.enabled && gameState && myId && gameState.players[myId] && (
              <DrillConsole
                player={gameState.players[myId]}
                enabled={drill.enabled}
                onToggle={() => drillDispatch({ type: 'TOGGLE' })}
                result={drill.result}
              />
            )}

            <PlayfieldShell
              mobilePlayfieldRef={mobilePlayfieldRef}
              mobileBoardFitRef={mobileBoardFitRef}
              railRef={railRef}
              mobileCellSize={mobileCellSize}
              myMobileFieldRef={myMobileFieldRef}
              myDesktopFieldRef={myDesktopFieldRef}
              oppDesktopFieldRef={oppDesktopFieldRef}
              hatchingEnabled={DEV_TOOLS_ENABLED && hatchingEnabled}
              onToggleHatching={
                DEV_TOOLS_ENABLED
                  ? () => setHatchingEnabled((enabled) => !enabled)
                  : undefined
              }
            />
            <MobileControls
              onInput={sendInputState}
              onAction={handleAction}
              onShopPress={handleShopConfirm}
            />
          </main>

      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {chrome.status === 'countdown' && (
            <m.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 2 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <h1 className="font-black italic text-white drop-shadow-2xl [font-size:min(28vw,12rem)]">
                {Math.ceil(chrome.countdown)}
              </h1>
            </m.div>
          )}

          {chrome.status === 'ended' && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 bg-[#0a0a0f]/80 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-8"
            >
              <div className="bg-[#1a1a1a] p-6 sm:p-10 md:p-12 rounded-[1.5rem] sm:rounded-[2rem] border border-white/10 shadow-2xl text-center max-w-[min(calc(100vw-2rem),28rem)] w-full">
                <Trophy className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-yellow-400 mx-auto mb-4 sm:mb-6" />
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tighter mb-2">Game Over</h2>
                <p className="text-sm sm:text-base text-zinc-400 mb-5 sm:mb-8">
                  {chrome.technicalVictory && chrome.winnerId === myId
                    ? 'Opponent disconnected. Technical Victory!'
                    : chrome.winnerId === myId
                      ? 'You won the match!'
                      : chrome.winnerId === 'draw'
                        ? "It's a draw!"
                        : 'Opponent won the match.'}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-8">
                  <div className="bg-[#0a0a0f]/40 p-3 sm:p-4 rounded-xl sm:rounded-2xl">
                    <p className="text-[9px] sm:text-[10px] uppercase text-zinc-500 font-bold mb-1">Your Score</p>
                    <p className="text-xl sm:text-2xl font-mono">{chrome.myScore}</p>
                  </div>
                  <div className="bg-[#0a0a0f]/40 p-3 sm:p-4 rounded-xl sm:rounded-2xl">
                    <p className="text-[9px] sm:text-[10px] uppercase text-zinc-500 font-bold mb-1">Opponent</p>
                    <p className="text-xl sm:text-2xl font-mono">{chrome.oppScore}</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-600">
                  {chrome.restartTimer !== undefined
                    ? `Restarting level in ${Math.ceil(chrome.restartTimer)} seconds...`
                    : 'Waiting for server reset...'}
                </p>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>

        </>
      )}
    </div>
  );
};

const App: React.FC = () => {
  if (
    DEV_TOOLS_ENABLED
    && new URLSearchParams(window.location.search).get('prototype') === 'background'
  ) {
    return <BackgroundPrototype />;
  }
  return (
    <GameStateProvider>
      <AppShell />
    </GameStateProvider>
  );
};

export default App;
