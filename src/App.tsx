import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Timer, Trophy, Users, Zap } from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { useGameSocket } from './hooks/useGameSocket';
import GameField from './components/GameField';
import MobileControls from './components/MobileControls';
import OpponentMiniField from './components/OpponentMiniField';
import { GameFieldsLayout } from './components/GameFieldsLayout';
import { PlayfieldCellSizeContext } from './components/playfieldCellSizeContext';
import { ActionType, BOARD_COLS, BOARD_VISIBLE_ROWS, LOCK_DELAY_TICKS, LOCK_RESET_CAP } from './types';

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

const App: React.FC = () => {
  const { gameState, myId, lastMatchEvent, sendAction, sendInputState } = useGameSocket();
  const mobilePlayfieldRef = useRef<HTMLDivElement>(null);
  const [mobileCellSize, setMobileCellSize] = useState(28);
  const [lockDrillEnabled, setLockDrillEnabled] = useState(false);
  const [drillResult, setDrillResult] = useState<{ status: 'pass' | 'fail'; message: string } | null>(null);
  const drillStepRef = useRef<'idle' | 'seekGround' | 'consumeCap' | 'spam'>('idle');
  const drillSpinsRef = useRef(0);
  const drillLastSpinMsRef = useRef(0);
  const drillDirectionRef = useRef<1 | -1>(1);
  const drillTrackingPieceRef = useRef(false);
  const drillObservedCapRef = useRef(false);
  const drillPrevLockDelayRef = useRef<number | null>(null);
  const drillFailureReasonRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = mobilePlayfieldRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 8 || height < 8) return;
      const headerReserve = 48;
      const fromW = (width - 4) / BOARD_COLS;
      const fromH = (height - headerReserve) / BOARD_VISIBLE_ROWS;
      const c = Math.floor(Math.min(fromW, fromH));
      setMobileCellSize(Math.max(22, Math.min(36, c)));
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
      } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'x') {
        e.preventDefault();
        sendAction('rotateCW');
      } else if (e.key.toLowerCase() === 'z' || e.key === 'Control') {
        e.preventDefault();
        sendAction('rotateCCW');
      } else if (e.key === ' ') {
        e.preventDefault();
        sendAction('hardDrop');
      } else if (e.key.toLowerCase() === 'c' || e.key === 'Shift') {
        e.preventDefault();
        sendAction('hold');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
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
  }, [gameState, myId, sendAction, sendInputState]);

  useEffect(() => {
    if (!lockDrillEnabled || !gameState || gameState.status !== 'playing' || !myId) {
      drillStepRef.current = 'idle';
      drillSpinsRef.current = 0;
      drillTrackingPieceRef.current = false;
      drillObservedCapRef.current = false;
      drillPrevLockDelayRef.current = null;
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
          setDrillResult({ status: 'pass', message: 'PASS: Piece locked after cap without extra lock reset.' });
        }
      }
      drillTrackingPieceRef.current = false;
      drillObservedCapRef.current = false;
      drillPrevLockDelayRef.current = null;
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
      sendAction('rotateCW');
      drillDirectionRef.current = -1;
      drillSpinsRef.current = 0;
      drillLastSpinMsRef.current = performance.now();
      drillTrackingPieceRef.current = true;
      drillObservedCapRef.current = false;
      drillPrevLockDelayRef.current = null;
      drillFailureReasonRef.current = null;
      drillStepRef.current = 'spam';
      return;
    }
    if (drillStepRef.current === 'spam') {
      if (me.lockResetsUsed >= 1) {
        if (!drillObservedCapRef.current) {
          drillObservedCapRef.current = true;
          drillPrevLockDelayRef.current = me.lockDelayRemainingTicks;
        } else if (
          drillPrevLockDelayRef.current !== null &&
          me.lockDelayRemainingTicks > drillPrevLockDelayRef.current + 1 &&
          !drillFailureReasonRef.current
        ) {
          drillFailureReasonRef.current = 'FAIL: lockDelay refreshed again after cap was already used.';
        }
        drillPrevLockDelayRef.current = me.lockDelayRemainingTicks;
      }
      const now = performance.now();
      if (now - drillLastSpinMsRef.current < 120) return;
      if (drillSpinsRef.current >= 8) {
        drillStepRef.current = 'seekGround';
        drillSpinsRef.current = 0;
        sendInputState({ left: false, right: false, softDrop: true });
        return;
      }
      sendAction(drillDirectionRef.current === 1 ? 'rotateCW' : 'rotateCCW');
      drillDirectionRef.current = drillDirectionRef.current === 1 ? -1 : 1;
      drillSpinsRef.current += 1;
      drillLastSpinMsRef.current = now;
    }
  }, [gameState, myId, lockDrillEnabled, sendAction, sendInputState]);

  const myPlayer = myId ? gameState?.players[myId] : null;
  const opponentId = myId ? Object.keys(gameState?.players ?? {}).find((id) => id !== myId) : null;
  const opponentPlayer = opponentId && gameState ? gameState.players[opponentId] : null;
  const myPendingGarbage = myPlayer ? myPlayer.pendingGarbage.reduce((sum, g) => sum + g.lines, 0) : 0;
  const oppPendingGarbage = opponentPlayer ? opponentPlayer.pendingGarbage.reduce((sum, g) => sum + g.lines, 0) : 0;
  const eventUi = matchEventLabel(lastMatchEvent, myId);

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
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-[#0a0a0a] px-2 py-2 pb-36 md:pb-2 font-sans text-white sm:px-4 sm:py-3">
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
          className={`mb-2 w-full max-w-5xl self-center rounded-lg border px-3 py-2 text-sm font-semibold ${
            drillResult.status === 'pass'
              ? 'border-emerald-400/40 bg-emerald-950/30 text-emerald-200'
              : 'border-rose-400/40 bg-rose-950/30 text-rose-200'
          }`}
        >
          {drillResult.message}
        </div>
      )}
      {myPlayer && (
        <div className="mb-2 w-full max-w-5xl self-center rounded-lg border border-cyan-500/25 bg-cyan-950/15 px-3 py-2 text-xs text-cyan-100">
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
          </div>
          <div className="mt-1 text-[10px] text-cyan-200/80">
            Drill auto-soft-drops to ground, uses one rotate reset, then spams more rotations so you can see whether lockDelay stops refreshing after cap.
          </div>
        </div>
      )}

      {gameState.status === 'waiting' && Object.keys(gameState.players).length < 2 && (
        <div className="mb-1 shrink-0 self-center rounded-full border border-white/5 bg-zinc-900/90 px-4 py-1.5 sm:py-2">
          <p className="text-center text-xs font-medium tracking-wide text-zinc-400">
            Waiting for another player to join…
          </p>
        </div>
      )}

      {/* Mobile game view: primary board + mini opponent at top-right */}
      <div className="relative min-h-0 w-full flex-1 md:hidden">
        <div className="absolute right-1 top-1 z-20">
          <OpponentMiniField player={opponentPlayer} pendingGarbage={oppPendingGarbage} />
        </div>
        <div
          ref={mobilePlayfieldRef}
          className="flex h-full w-full items-center justify-center overflow-hidden px-1 pr-[6.25rem]"
        >
          {myPlayer && (
            <GameField
              player={myPlayer}
              isMe={true}
              title="👤 YOUR FIELD"
              borderColorClass="border-emerald-500/20"
              shadowColorClass="shadow-[0_0_30px_rgba(16,185,129,0.1)]"
              cellSize={mobileCellSize}
            />
          )}
        </div>
      </div>

      {/* Desktop game view: dual full boards */}
      <div className="hidden min-h-0 w-full flex-1 md:block">
        <GameFieldsLayout>
          {myPlayer && (
            <GameField
              player={myPlayer}
              isMe={true}
              title="👤 YOUR FIELD"
              borderColorClass="border-emerald-500/20"
              shadowColorClass="shadow-[0_0_30px_rgba(16,185,129,0.1)]"
            />
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
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-8"
          >
            <div className="bg-[#1a1a1a] p-12 rounded-[2rem] border border-white/10 shadow-2xl text-center max-w-md w-full">
              <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-6" />
              <h2 className="text-4xl font-black uppercase tracking-tighter mb-2">Game Over</h2>
              <p className="text-zinc-400 mb-8">
                {gameState.technicalVictory && gameState.winnerId === myId ? "Opponent disconnected. Technical Victory!" :
                 gameState.winnerId === myId ? "You won the match!" : 
                 gameState.winnerId === 'draw' ? "It's a draw!" : "Opponent won the match."}
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-black/40 p-4 rounded-2xl">
                  <p className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Your Score</p>
                  <p className="text-2xl font-mono">{myPlayer?.score || 0}</p>
                </div>
                <div className="bg-black/40 p-4 rounded-2xl">
                  <p className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Opponent</p>
                  <p className="text-2xl font-mono">{opponentPlayer?.score || 0}</p>
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
      <div className="pointer-events-none fixed bottom-2 left-2 z-30 hidden sm:flex flex-col gap-1 sm:bottom-6 sm:left-6 sm:gap-2 md:bottom-8 md:left-8">
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
            Z / X
          </kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Rotate</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 sm:gap-3">
          <kbd className="rounded border border-white/5 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] sm:px-4 sm:py-1 sm:text-xs">
            SPACE
          </kbd>
          <span className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]">Hard Drop</span>
        </div>
      </div>
      <MobileControls onInput={sendInputState} onAction={(action: ActionType) => sendAction(action)} />
    </div>
  );
};

export default App;
