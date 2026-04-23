import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Trophy } from 'lucide-react';
import { GameState, PlayerState, ReplayData, ReplayDataV2 } from './types';
import GameField from './components/GameField';
import { GameFieldsLayout } from './components/GameFieldsLayout';

function winnerText(p1: PlayerState | null, p2: PlayerState | null): string {
  if (!p1 || !p2) return 'Unknown winner';
  if (p1.topOut && !p2.topOut) return 'Player 2 wins';
  if (p2.topOut && !p1.topOut) return 'Player 1 wins';
  if (p1.score > p2.score) return `Player 1 wins (${p1.score}-${p2.score})`;
  if (p2.score > p1.score) return `Player 2 wins (${p2.score}-${p1.score})`;
  return 'Draw';
}

function normalizeReplay(json: ReplayData): ReplayDataV2 | null {
  if (json.version === 2) return json;
  return null;
}

export default function ReplayApp() {
  const [replay, setReplay] = useState<ReplayDataV2 | null>(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const totalTicks = useMemo(() => replay?.keyframes[replay.keyframes.length - 1]?.tick ?? 1, [replay]);

  useEffect(() => {
    if (!playing || !replay) return;
    const update = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      setTick((prev) => {
        const nxt = Math.min(totalTicks, prev + dt * 60 * speed);
        if (nxt >= totalTicks) setPlaying(false);
        return nxt;
      });
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [playing, replay, speed, totalTicks]);

  const viewState = useMemo((): GameState | null => {
    if (!replay) return null;
    const frames = replay.keyframes;
    let nearest = frames[0];
    for (const frame of frames) {
      if (frame.tick <= tick) nearest = frame;
      else break;
    }
    return {
      ...replay.initialState,
      tick: nearest.tick,
      players: nearest.players,
      status: 'playing',
    };
  }, [replay, tick]);

  const pids = viewState ? Object.keys(viewState.players) : [];
  const p1 = viewState && pids[0] ? viewState.players[pids[0]] : null;
  const p2 = viewState && pids[1] ? viewState.players[pids[1]] : null;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = JSON.parse(event.target?.result as string) as ReplayData;
        const normalized = normalizeReplay(raw);
        if (!normalized) {
          setError('Replay viewer currently supports v2 replay files only.');
          return;
        }
        setReplay(normalized);
        setTick(0);
        setError('');
      } catch {
        setError('Invalid replay file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0a] text-white">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFile} accept=".replay,.json" />
      <div className="p-4 bg-[#1a1a1a] border-b border-white/10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-emerald-400 tracking-wider">REPLAY VIEWER</h1>
          <p className="text-xs text-zinc-500">{replay ? replay.date : 'No file loaded'}</p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors flex items-center gap-2 px-3 text-xs font-bold"
          >
            <FileUp size={14} /> LOAD
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={!replay}
            className="px-4 py-2 bg-emerald-500/20 text-emerald-400 font-bold rounded-lg hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {playing ? 'PAUSE' : 'PLAY'}
          </button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="bg-black border border-white/20 rounded p-1">
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {error && <div className="absolute z-30 left-3 top-3 text-xs text-rose-300 bg-rose-950/50 px-2 py-1 rounded">{error}</div>}
        <GameFieldsLayout>
          {p1 && <GameField player={p1} isMe={false} title="Player 1" borderColorClass="border-emerald-500/20" shadowColorClass="" />}
          {p2 && <GameField player={p2} isMe={false} title="Player 2" borderColorClass="border-rose-500/20" shadowColorClass="" />}
        </GameFieldsLayout>
        {replay && tick >= totalTicks - 1 && (
          <div className="absolute inset-0 z-40 bg-black/40 flex items-center justify-center">
            <div className="bg-[#121212]/90 border border-emerald-500/30 p-6 rounded-xl text-center shadow-[0_0_30px_rgba(16,185,129,0.2)] backdrop-blur px-12">
              <Trophy className="mx-auto mb-3 text-emerald-400" size={32} />
              <div className="text-zinc-400 text-xs tracking-widest mb-1 uppercase">Match Finished</div>
              <div className="text-2xl font-black text-white">{winnerText(p1, p2)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="h-16 bg-[#141414] border-t border-white/10 px-8 flex items-center gap-4">
        <span className="text-xs font-mono w-12">{(tick / 60).toFixed(1)}s</span>
        <input
          type="range"
          min={0}
          max={totalTicks}
          value={tick}
          onChange={(e) => {
            setTick(Number(e.target.value));
            setPlaying(false);
          }}
          className="flex-1 accent-emerald-500"
        />
        <span className="text-xs font-mono w-12 text-zinc-500">{(totalTicks / 60).toFixed(1)}s</span>
      </div>
    </div>
  );
}
