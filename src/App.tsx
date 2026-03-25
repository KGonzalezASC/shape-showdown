import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Trophy, Users, Timer, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameSocket } from './hooks/useGameSocket';
import GameField from './components/GameField';
import { PlayerState } from './types';
import { SCORE_FLOAT_DURATION_SEC } from './constants';

function paddleDirFromKeys(left: boolean, right: boolean): number {
  if (left && !right) return -1;
  if (right && !left) return 1;
  return 0;
}

type HeaderFloat = {
  id: string;
  label: string;
  side: 'me' | 'op';
  tone: 'gain' | 'loss';
};

const App: React.FC = () => {
  const { gameState, myId, setPaddleInput, shootBall } = useGameSocket();
  const keysHeld = useRef({ left: false, right: false });
  const [headerFloats, setHeaderFloats] = useState<HeaderFloat[]>([]);
  const prevMyPlayerRef = useRef<PlayerState | null>(null);
  const prevOpponentRef = useRef<PlayerState | null>(null);

  const pushHeaderFloat = useCallback((label: string, side: 'me' | 'op', tone: 'gain' | 'loss') => {
    const id = `hf-${performance.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setHeaderFloats((fs) => [...fs, { id, label, side, tone }]);
  }, []);

  const emitPaddleDir = useCallback(() => {
    setPaddleInput(paddleDirFromKeys(keysHeld.current.left, keysHeld.current.right));
  }, [setPaddleInput]);

  useEffect(() => {
    if (!gameState || gameState.status !== 'playing') {
      keysHeld.current = { left: false, right: false };
      setPaddleInput(0);
    }
  }, [gameState?.status, setPaddleInput]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!gameState || gameState.status !== 'playing' || !myId || !gameState.players[myId]) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.repeat) return;
        keysHeld.current.left = true;
        emitPaddleDir();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.repeat) return;
        keysHeld.current.right = true;
        emitPaddleDir();
      } else if (e.key === ' ') {
        e.preventDefault();
        shootBall();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        keysHeld.current.left = false;
        emitPaddleDir();
      } else if (e.key === 'ArrowRight') {
        keysHeld.current.right = false;
        emitPaddleDir();
      }
    };
    const clearInput = () => {
      keysHeld.current = { left: false, right: false };
      setPaddleInput(0);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
    };
  }, [gameState, myId, emitPaddleDir, setPaddleInput, shootBall]);

  const myPlayer = myId ? gameState?.players[myId] : null;
  const opponentId = myId ? Object.keys(gameState?.players ?? {}).find((id) => id !== myId) : null;
  const opponentPlayer = opponentId && gameState ? gameState.players[opponentId] : null;

  useEffect(() => {
    if (!myPlayer) {
      prevMyPlayerRef.current = null;
      return;
    }
    const prev = prevMyPlayerRef.current;
    if (prev && prev.id === myPlayer.id) {
      const d = myPlayer.score - prev.score;
      const ballDropped = prev.ballActive && !myPlayer.ballActive;
      if (d > 0) {
        pushHeaderFloat(`+${d}`, 'me', 'gain');
      } else if (d < 0) {
        pushHeaderFloat(`${d}`, 'me', 'loss');
      } else if (ballDropped) {
        pushHeaderFloat('-10', 'me', 'loss');
      }
    }
    prevMyPlayerRef.current = myPlayer;
  }, [myPlayer, pushHeaderFloat]);

  useEffect(() => {
    if (!opponentPlayer) {
      prevOpponentRef.current = null;
      return;
    }
    const prev = prevOpponentRef.current;
    if (prev && prev.id === opponentPlayer.id) {
      const d = opponentPlayer.score - prev.score;
      const ballDropped = prev.ballActive && !opponentPlayer.ballActive;
      if (d > 0) {
        pushHeaderFloat(`+${d}`, 'op', 'gain');
      } else if (d < 0) {
        pushHeaderFloat(`${d}`, 'op', 'loss');
      } else if (ballDropped) {
        pushHeaderFloat('-10', 'op', 'loss');
      }
    }
    prevOpponentRef.current = opponentPlayer;
  }, [opponentPlayer, pushHeaderFloat]);

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-mono text-sm tracking-widest uppercase animate-pulse">Connecting to Game Server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans p-4 flex flex-col items-center">
      {/* Header */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-6 overflow-visible bg-[#1a1a1a] p-4 rounded-2xl border border-white/5 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500/10 p-2 rounded-lg">
            <Zap className="text-emerald-400 w-5 h-5" />
          </div>
          <div className="relative min-h-[2.5rem] min-w-[3rem] overflow-visible z-10">
            <p className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-semibold">Your Score</p>
            <p className="text-2xl font-mono leading-none">{myPlayer?.score ?? 0}</p>
            {headerFloats
              .filter((f) => f.side === 'me')
              .map((f) => (
                <span
                  key={f.id}
                  role="presentation"
                  style={{ animationDuration: `${SCORE_FLOAT_DURATION_SEC}s` }}
                  className={`pointer-events-none absolute left-full top-[1.35rem] ml-2 whitespace-nowrap font-black text-xl tabular-nums drop-shadow-lg animate-score-float-header ${
                    f.tone === 'gain' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                  onAnimationEnd={() =>
                    setHeaderFloats((fs) => fs.filter((x) => x.id !== f.id))
                  }
                >
                  {f.label}
                </span>
              ))}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 mb-1">
            <Timer className="w-4 h-4 text-zinc-500" />
            <span className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Remaining</span>
          </div>
          <p className="text-3xl font-mono tracking-tighter">
            {Math.floor(gameState.remainingTime / 60)}:{(Math.floor(gameState.remainingTime % 60)).toString().padStart(2, '0')}
          </p>
        </div>

        <div className="flex items-center gap-4 text-right">
          <div className="relative min-h-[2.5rem] min-w-[3rem] overflow-visible z-10">
            <p className="text-[10px] uppercase tracking-wider text-rose-400/60 font-semibold">Opponent Score</p>
            <p className="text-2xl font-mono leading-none">{opponentPlayer?.score ?? 0}</p>
            {headerFloats
              .filter((f) => f.side === 'op')
              .map((f) => (
                <span
                  key={f.id}
                  role="presentation"
                  style={{ animationDuration: `${SCORE_FLOAT_DURATION_SEC}s` }}
                  className={`pointer-events-none absolute right-full top-[1.35rem] mr-2 whitespace-nowrap font-black text-xl tabular-nums drop-shadow-lg animate-score-float-header ${
                    f.tone === 'gain' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                  onAnimationEnd={() =>
                    setHeaderFloats((fs) => fs.filter((x) => x.id !== f.id))
                  }
                >
                  {f.label}
                </span>
              ))}
          </div>
          <div className="bg-rose-500/10 p-2 rounded-lg">
            <Users className="text-rose-400 w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Game Fields */}
      <div className="flex gap-8 items-start">
        {myPlayer && (
          <GameField 
            player={myPlayer} 
            isMe={true} 
            title="Your Field"
            borderColorClass="border-emerald-500/20"
            shadowColorClass="shadow-[0_0_30px_rgba(16,185,129,0.1)]"
          />
        )}

        <div className="relative">
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
            <div className="relative">
              <div className="mb-2">
                <h2 className="text-sm font-bold uppercase tracking-widest text-rose-400">Opponent Field</h2>
              </div>
              <div className="w-[400px] h-[600px] bg-[#141414] rounded-xl border-2 border-rose-500/10 flex items-center justify-center">
                <p className="text-zinc-500 text-sm font-medium animate-pulse">Waiting for opponent...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {gameState.status === 'countdown' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 2 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <h1 className="text-[12rem] font-black italic text-white drop-shadow-2xl">
              {Math.ceil(gameState.countdown)}
            </h1>
          </motion.div>
        )}

        {gameState.status === 'ended' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-8"
          >
            <div className="bg-[#1a1a1a] p-12 rounded-[2rem] border border-white/10 shadow-2xl text-center max-w-md w-full">
              <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-6" />
              <h2 className="text-4xl font-black uppercase tracking-tighter mb-2">Game Over</h2>
              <p className="text-zinc-400 mb-8">
                {gameState.winnerId === myId ? "You won the match!" : 
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
              <p className="text-xs text-zinc-600">Waiting for server reset...</p>
            </div>
          </motion.div>
        )}

        {gameState.status === 'waiting' && Object.keys(gameState.players).length < 2 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-12 flex flex-col items-center"
          >
            <div className="flex items-center gap-3 bg-zinc-900 px-6 py-3 rounded-full border border-white/5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              <p className="text-sm font-medium text-zinc-400 tracking-wide">Waiting for another player to join...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls Help */}
      <div className="fixed bottom-8 left-8 flex flex-col gap-2">
        <div className="flex items-center gap-3 text-zinc-500">
          <kbd className="bg-zinc-800 px-2 py-1 rounded text-xs font-mono border border-white/5">←</kbd>
          <kbd className="bg-zinc-800 px-2 py-1 rounded text-xs font-mono border border-white/5">→</kbd>
          <span className="text-[10px] uppercase font-bold tracking-widest">Move Paddle</span>
        </div>
        <div className="flex items-center gap-3 text-zinc-500">
          <kbd className="bg-zinc-800 px-4 py-1 rounded text-xs font-mono border border-white/5">SPACE</kbd>
          <span className="text-[10px] uppercase font-bold tracking-widest">Shoot Ball</span>
        </div>
      </div>
    </div>
  );
};

export default App;
