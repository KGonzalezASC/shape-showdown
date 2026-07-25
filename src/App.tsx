import React, { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { DrillConsole, DrillResult } from './components/DrillConsole';
import { MatchChrome } from './components/MatchChrome';
import { PlayfieldShell } from './components/PlayfieldShell';
import { ShopRailVariations } from './components/ShopRailVariations';
import MobileControls from './components/MobileControls';
import { GameFieldRef } from './components/GameField';
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
import { ActionType, BOARD_COLS, BOARD_VISIBLE_ROWS } from './types';

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
  const chrome = useMatchChromeSnapshot();
  const { sendAction, sendInputState } = useGameActions();
  const handleShopConfirm = useShopConfirm();

  const stateRef = useRef({ playfield, myId });
  useLayoutEffect(() => {
    stateRef.current = { playfield, myId };
  }, [playfield, myId]);

  const mobilePlayfieldRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [mobileCellSize, setMobileCellSize] = useState(28);
  const [showVariations, setShowVariations] = useState(false);
  const [drill, drillDispatch] = useReducer(drillReducer, { enabled: false, result: null });

  const myMobileFieldRef = useRef<GameFieldRef>(null);
  const myDesktopFieldRef = useRef<GameFieldRef>(null);
  const oppDesktopFieldRef = useRef<GameFieldRef>(null);

  const handleDrillResult = useCallback((result: DrillResult) => {
    drillDispatch({ type: 'SET_RESULT', payload: result });
  }, []);

  useLockDrill(drill.enabled, gameState, myId, sendAction, sendInputState, handleDrillResult);

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
      if (action === 'hardDrop' && !me?.snagHardDropBlocked) {
        triggerShake(true, 'soft');
      }
      sendAction(action);
    },
    [sendAction, triggerShake],
  );

  useLayoutEffect(() => {
    const outer = mobilePlayfieldRef.current;
    if (!outer) return;
    const measure = () => {
      const ob = outer.getBoundingClientRect();
      if (ob.width < 8 || ob.height < 8) return;
      const scale = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
      // Keep the board footprint independent of shop content. The first line
      // clear adds the Start button, which can create a rail scrollbar; using
      // the measured rail width here made every board cell shrink in response.
      const railW = 92 * scale; // ShopRail mobile width: 5.75rem
      const boardChromeReserve = 118 * scale;
      const GAP_AND_SAFETY = 16;
      const availW = ob.width - railW - GAP_AND_SAFETY;
      const fromW = availW / BOARD_COLS;
      const fromH = (ob.height - boardChromeReserve) / BOARD_VISIBLE_ROWS;
      const c = Math.floor(Math.min(fromW, fromH));
      setMobileCellSize((prev) => {
        const next = Math.max(8, Math.min(48, c));
        return prev !== next ? next : prev;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [connected]);

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
      if (e.key === 'F6') {
        e.preventDefault();
        drillDispatch({ type: 'TOGGLE' });
        return;
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
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        setShowVariations((prev) => !prev);
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
  }, [handleAction, sendInputState, handleShopConfirm]);

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

  if (showVariations) {
    return <ShopRailVariations />;
  }

  if (!connected) {
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
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-[#0a0a0a] px-2 py-2 font-sans text-white sm:px-4 sm:py-3">
      <MatchChrome />
      {gameState && myId && gameState.players[myId] && (
        <DrillConsole
          player={gameState.players[myId]}
          enabled={drill.enabled}
          onToggle={() => drillDispatch({ type: 'TOGGLE' })}
          result={drill.result}
        />
      )}

      <PlayfieldShell
        mobilePlayfieldRef={mobilePlayfieldRef}
        railRef={railRef}
        mobileCellSize={mobileCellSize}
        myMobileFieldRef={myMobileFieldRef}
        myDesktopFieldRef={myDesktopFieldRef}
        oppDesktopFieldRef={oppDesktopFieldRef}
      />

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

      <div className="pointer-events-none fixed bottom-2 left-2 z-30 hidden md:flex flex-col gap-1 md:bottom-8 md:left-8 md:gap-2">
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] sm:px-2 sm:py-1 sm:text-xs">←</kbd>
          <kbd className="rounded border border-white/5 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] sm:px-2 sm:py-1 sm:text-xs">→</kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Move</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">↓</kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Soft Drop</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">↑</kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Hard Drop</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">Z / X</kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Rotate</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">SHIFT</kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Storage</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">C</kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Shop</span>
        </div>
      </div>
      <MobileControls
        onInput={sendInputState}
        onAction={handleAction}
        onShopPress={handleShopConfirm}
      />
    </div>
  );
};

const App: React.FC = () => (
  <GameStateProvider>
    <AppShell />
  </GameStateProvider>
);

export default App;
