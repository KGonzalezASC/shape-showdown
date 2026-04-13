import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileUp, Info, Play, Trophy } from 'lucide-react';
import { GameState, PlayerState, ReplayData } from './types';
import GameField from './components/GameField';
import { GameFieldsLayout } from './components/GameFieldsLayout';

type ReplayUiState = {
  replay: ReplayData | null;
  error: string;
  playing: boolean;
  speed: number;
  hasStarted: boolean;
  isSidebarOpen: boolean;
};

type ReplayUiAction =
  | { type: 'loadReplay'; replay: ReplayData }
  | { type: 'setError'; error: string }
  | { type: 'togglePlaying' }
  | { type: 'setPlaying'; playing: boolean }
  | { type: 'setSpeed'; speed: number }
  | { type: 'startReplay' }
  | { type: 'toggleSidebar' };

const initialReplayUiState: ReplayUiState = {
  replay: null,
  error: '',
  playing: false,
  speed: 1,
  hasStarted: false,
  isSidebarOpen: true
};

function replayUiReducer(state: ReplayUiState, action: ReplayUiAction): ReplayUiState {
  switch (action.type) {
    case 'loadReplay':
      return {
        ...state,
        replay: action.replay,
        error: '',
        playing: false,
        hasStarted: false
      };
    case 'setError':
      return {
        ...state,
        error: action.error
      };
    case 'togglePlaying':
      return {
        ...state,
        playing: !state.playing
      };
    case 'setPlaying':
      return {
        ...state,
        playing: action.playing
      };
    case 'setSpeed':
      return {
        ...state,
        speed: action.speed
      };
    case 'startReplay':
      return {
        ...state,
        hasStarted: true,
        playing: true
      };
    case 'toggleSidebar':
      return {
        ...state,
        isSidebarOpen: !state.isSidebarOpen
      };
    default:
      return state;
  }
}

function winnerText(p1: PlayerState | null, p2: PlayerState | null): string {
  if (!p1 || !p2) return 'Unknown Winner';
  if (p1.score > p2.score) return `Player 1 Wins (${p1.score} - ${p2.score})`;
  if (p2.score > p1.score) return `Player 2 Wins (${p2.score} - ${p1.score})`;
  return 'TIE GAME';
}

type ReplayHeaderProps = {
  replay: ReplayData | null;
  totalTicks: number;
  playing: boolean;
  speed: number;
  onOpenFile: () => void;
  onTogglePlaying: () => void;
  onSpeedChange: (speed: number) => void;
};

function ReplayHeader({
  replay,
  totalTicks,
  playing,
  speed,
  onOpenFile,
  onTogglePlaying,
  onSpeedChange
}: ReplayHeaderProps) {
  return (
    <div className="p-4 bg-[#1a1a1a] border-b border-white/10 flex justify-between items-center shrink-0">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-emerald-400 tracking-wider">REPLAY VIEWER</h1>
          <p className="text-xs text-zinc-500">
            {replay ? `${replay.date} • ${Math.floor(totalTicks / 60)} seconds` : 'No file loaded'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenFile}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors flex items-center gap-2 px-3 text-xs font-bold"
          title="Load local file"
        >
          <FileUp size={14} /> <span className="hidden sm:inline">LOAD FILE</span>
        </button>
      </div>
      <div className="flex gap-4 items-center">
        <button
          type="button"
          onClick={onTogglePlaying}
          disabled={!replay}
          className="px-4 py-2 bg-emerald-500/20 text-emerald-400 font-bold rounded-lg hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {playing ? 'PAUSE' : 'PLAY'}
        </button>
        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          disabled={!replay}
          className="bg-black border border-white/20 rounded p-1 disabled:opacity-50"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1.0x</option>
          <option value={2}>2.0x</option>
        </select>
      </div>
    </div>
  );
}

type ReplaySidebarProps = {
  isOpen: boolean;
  onToggleOpen: () => void;
  replay: ReplayData | null;
  totalTicks: number;
  p1: PlayerState | null;
  p2: PlayerState | null;
};

function ReplaySidebar({ isOpen, onToggleOpen, replay, totalTicks, p1, p2 }: ReplaySidebarProps) {
  return (
    <div
      className={`transition-all duration-300 ease-in-out bg-[#121212] flex flex-col justify-start relative shrink-0 ${
        isOpen ? 'w-64 border-r border-white/10' : 'w-0'
      }`}
    >
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={isOpen ? 'Collapse match info sidebar' : 'Expand match info sidebar'}
        className="absolute top-1/2 -right-4 z-40 transform -translate-y-1/2 bg-[#1a1a1a] p-1 border border-white/20 rounded-full cursor-pointer hover:bg-[#2a2a2a] text-zinc-400 hover:text-white shadow-lg transition-colors"
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      <div className={`p-6 w-64 uppercase tracking-widest ${isOpen ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}>
        <h2 className="text-emerald-400 font-bold mb-6 text-xs flex items-center gap-2">
          <Info size={14} /> Match Info
        </h2>

        <div className="space-y-6 text-sm">
          <div>
            <div className="text-zinc-500 text-[10px] mb-1">RECORDED</div>
            <div className="text-white/80">{replay?.date || '—'}</div>
          </div>

          <div>
            <div className="text-zinc-500 text-[10px] mb-1">TOTAL DURATION</div>
            <div className="font-mono text-emerald-400">{replay ? `${Math.floor(totalTicks / 60)}s` : '—'}</div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <div className="text-zinc-500 text-[10px] mb-3">PLAYERS & SCORES</div>
            {p1 && (
              <div className="flex justify-between items-center mb-2 bg-[#1a1a1a] px-3 py-2 rounded">
                <span className="text-emerald-400">P1: {p1.id.slice(0, 4)}</span>
                <span className="font-mono font-bold">{p1.score}</span>
              </div>
            )}
            {p2 && (
              <div className="flex justify-between items-center bg-[#1a1a1a] px-3 py-2 rounded">
                <span className="text-rose-400">P2: {p2.id.slice(0, 4)}</span>
                <span className="font-mono font-bold">{p2.score}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type ReplayIntroOverlayProps = {
  onStart: () => void;
  onOpenFile: () => void;
};

function ReplayIntroOverlay({ onStart, onOpenFile }: ReplayIntroOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur flex items-center justify-center">
      <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-2xl max-w-md text-center shadow-2xl">
        <h2 className="text-2xl font-black text-emerald-400 tracking-widest mb-4">REPLAY VIEWER</h2>
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
          Welcome to the Shape Showdown replay system. You can review matches to verify fairness and analyze plays.
          <br />
          <br />
          Use the timeline scrubber at the bottom to navigate. You can pause, play, and change playback speed at any time.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onStart}
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-black px-8 py-3 rounded-lg uppercase tracking-wider transition-colors w-full flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play size={18} fill="currentColor" /> Start Replay
          </button>
          <button
            type="button"
            onClick={onOpenFile}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-8 py-3 rounded-lg uppercase tracking-wider transition-colors w-full flex items-center justify-center gap-2 cursor-pointer border border-white/10"
          >
            <FileUp size={18} /> Open Local File
          </button>
        </div>
      </div>
    </div>
  );
}

function ReplayWinnerOverlay({ p1, p2 }: { p1: PlayerState | null; p2: PlayerState | null }) {
  return (
    <div className="absolute inset-0 z-40 bg-black/40 flex items-center justify-center pointer-events-none">
      <div className="bg-[#121212]/90 border border-emerald-500/30 p-6 rounded-xl text-center shadow-[0_0_30px_rgba(16,185,129,0.2)] backdrop-blur px-12 transform scale-100 animate-in zoom-in duration-300 pointer-events-auto">
        <Trophy className="mx-auto mb-3 text-emerald-400" size={32} />
        <div className="text-zinc-400 text-xs tracking-widest mb-1 uppercase">Match Finished</div>
        <div className="text-2xl font-black text-white">{winnerText(p1, p2)}</div>
      </div>
    </div>
  );
}

type ReplayTimelineControlsProps = {
  currentTick: number;
  totalTicks: number;
  onTickChange: (tick: number) => void;
};

function ReplayTimelineControls({ currentTick, totalTicks, onTickChange }: ReplayTimelineControlsProps) {
  return (
    <div className="h-16 bg-[#141414] border-t border-white/10 px-8 flex items-center gap-4 shrink-0">
      <span className="text-xs font-mono w-12">{(currentTick / 60).toFixed(1)}s</span>
      <input
        type="range"
        min={0}
        max={totalTicks}
        value={currentTick}
        onChange={(e) => onTickChange(Number(e.target.value))}
        className="flex-1 accent-emerald-500"
      />
      <span className="text-xs font-mono w-12 text-zinc-500">{(totalTicks / 60).toFixed(1)}s</span>
    </div>
  );
}

export default function ReplayApp() {
  const [ui, dispatch] = useReducer(replayUiReducer, initialReplayUiState);
  const [currentTick, setCurrentTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const { replay, error, playing, speed, hasStarted, isSidebarOpen } = ui;

  const resetReplay = (data: ReplayData) => {
    dispatch({ type: 'loadReplay', replay: data });
    setCurrentTick(0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.initialState || !json.frames) {
          throw new Error('Invalid replay format');
        }
        resetReplay(json);
      } catch {
        dispatch({ type: 'setError', error: 'Error parsing replay file. Ensure it is a valid .replay or .bin JSON file.' });
      }
    };
    reader.readAsText(file);
  };

  const totalTicks = useMemo(() => {
    if (!replay || replay.frames.length === 0) return 1;
    return replay.frames[replay.frames.length - 1].tick;
  }, [replay]);

  useEffect(() => {
    if (!playing || !replay) return;

    const tickRate = 60; // Game runs at 60 ticks per second

    const update = (time: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
      }
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      setCurrentTick((prev) => {
        let nxt = prev + dt * tickRate * speed;
        if (nxt >= totalTicks) {
          dispatch({ type: 'setPlaying', playing: false });
          return totalTicks;
        }
        return nxt;
      });

      rafRef.current = requestAnimationFrame(update);
    };

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [playing, replay, speed, totalTicks]);

  const viewState = useMemo((): GameState | null => {
    if (!replay) return null;
    const { frames, events, initialState } = replay;
    if (frames.length === 0) return initialState;

    let f1 = frames[0];
    let f2 = frames[0];
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].tick <= currentTick) {
        f1 = frames[i];
      }
      if (frames[i].tick >= currentTick) {
        f2 = frames[i];
        break;
      }
    }

    const tRange = f2.tick - f1.tick;
    const progress = tRange === 0 ? 0 : (currentTick - f1.tick) / tRange;

    // Deep clone initial players conceptually
    const players: Record<string, PlayerState> = {};
    for (const pid in initialState.players) {
      const initP = initialState.players[pid];
      const p1 = f1.players[pid] || f2.players[pid];
      const p2 = f2.players[pid] || f1.players[pid];

      if (!p1) continue; // safety

      // Lerp properties
      const paddleX = p1.paddleX + (p2.paddleX - p1.paddleX) * progress;
      const ballX = p1.ballPos.x + (p2.ballPos.x - p1.ballPos.x) * progress;
      const ballY = p1.ballPos.y + (p2.ballPos.y - p1.ballPos.y) * progress;

      // Create new bubles list applying all events up to currentTick
      // (Optimization: we just map active to false)
      const destroyedBubbles = new Set<string>();
      for (const ev of events) {
        if (ev.tick <= currentTick && ev.playerId === pid && ev.type === 'bubbleDestroyed') {
          destroyedBubbles.add(ev.bubbleId);
        }
      }

      const currentBubbles = initP.bubbles.map(b => ({
        ...b,
        active: b.active && !destroyedBubbles.has(b.id)
      }));

      players[pid] = {
        ...initP,
        paddleX,
        ballPos: { x: ballX, y: ballY },
        score: p1.score, // show score from f1
        ballActive: p1.ballActive,
        canShoot: p1.canShoot,
        bubbles: currentBubbles
      };
    }

    return {
      ...initialState,
      status: 'playing',
      players
    };
  }, [replay, currentTick]);

  const pIds = viewState ? Object.keys(viewState.players) : [];
  const p1 = (viewState && pIds[0]) ? viewState.players[pIds[0]] : null;
  const p2 = (viewState && pIds[1]) ? viewState.players[pIds[1]] : null;

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0a] text-white">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".replay,.bin,application/json"
        className="hidden"
      />

      <ReplayHeader
        replay={replay}
        totalTicks={totalTicks}
        playing={playing}
        speed={speed}
        onOpenFile={() => fileInputRef.current?.click()}
        onTogglePlaying={() => dispatch({ type: 'togglePlaying' })}
        onSpeedChange={(nextSpeed) => dispatch({ type: 'setSpeed', speed: nextSpeed })}
      />

      <div className="flex-1 min-h-0 relative flex flex-row overflow-hidden">
        <ReplaySidebar
          isOpen={isSidebarOpen}
          onToggleOpen={() => dispatch({ type: 'toggleSidebar' })}
          replay={replay}
          totalTicks={totalTicks}
          p1={p1}
          p2={p2}
        />

        <div className="flex-1 relative min-w-0 flex flex-col">
          {error && (
            <div className="absolute left-4 top-4 z-30 rounded-md border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          <GameFieldsLayout>
            {p1 && (
              <GameField
                player={p1}
                isMe={false}
                title="Player 1"
                borderColorClass="border-emerald-500/20"
                shadowColorClass=""
              />
            )}
            {p2 && (
              <div className="relative shrink-0">
                <GameField
                  player={p2}
                  isMe={false}
                  title="Player 2"
                  borderColorClass="border-rose-500/20"
                  shadowColorClass=""
                />
              </div>
            )}
          </GameFieldsLayout>

          {!hasStarted && (
            <ReplayIntroOverlay
              onStart={() => dispatch({ type: 'startReplay' })}
              onOpenFile={() => fileInputRef.current?.click()}
            />
          )}

          {hasStarted && currentTick >= totalTicks - 1 && (
            <ReplayWinnerOverlay p1={p1} p2={p2} />
          )}
        </div>
      </div>

      <ReplayTimelineControls
        currentTick={currentTick}
        totalTicks={totalTicks}
        onTickChange={(tick) => {
          setCurrentTick(tick);
          dispatch({ type: 'setPlaying', playing: false });
        }}
      />
    </div>
  );
}
