import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Activity, BarChart3, ChevronLeft, ChevronRight, FileUp, Target, Trophy } from 'lucide-react';
import { BotDecisionTrace, CandidateEvaluationTrace, GameState, PlayerState, ReplayData, ReplayDataV2 } from './types';
import GameField from './components/GameField';
import { GameFieldsLayout } from './components/GameFieldsLayout';
import { CandidateInspector } from './components/CandidateInspector';
import { HabitReportDashboard } from './components/HabitReportDashboard';
import { TimelinePowerupBands } from './components/TimelinePowerupBands';
import { analyzeReplayDiagnostics, type ReplayDiagnosticReport } from './replayDiagnostics';
import { projectCandidatePlacement, type ReplayCandidateOverlay } from './replayCandidateOverlay';
import { deriveReplayDecisionOutcome } from './replayDecisionOutcome';

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

function orderedPlayerIds(replay: ReplayDataV2 | null, players: Record<string, PlayerState>): string[] {
  return Object.keys(players).sort((a, b) => {
    const aSlot = replay?.playerSlots?.[a] ?? Number.MAX_SAFE_INTEGER;
    const bSlot = replay?.playerSlots?.[b] ?? Number.MAX_SAFE_INTEGER;
    return aSlot - bSlot || a.localeCompare(b);
  });
}

function decisionTraceKey(trace: BotDecisionTrace): string {
  const decisionTick = trace.replayTick ?? trace.tick;
  return `${trace.playerId}:${trace.decisionId ?? `${decisionTick}:${trace.pieceType}:${trace.selectedCandidate.rotation}:${trace.selectedCandidate.x}`}`;
}

function isRenderableDecisionTrace(trace: BotDecisionTrace): boolean {
  return trace.committed !== false && trace.decisionSource !== 'hold';
}

interface CandidatePreviewSelection {
  playerId: string;
  traceKey: string;
  frameTick: number | null;
  candidate: CandidateEvaluationTrace;
}

interface ReplayState {
  replay: ReplayDataV2 | null;
  error: string;
  playing: boolean;
  speed: number;
  tick: number;
}

type ReplayAction =
  | { type: 'LOAD_SUCCESS'; payload: ReplayDataV2 }
  | { type: 'LOAD_ERROR'; payload: string }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_SPEED'; payload: number }
  | { type: 'SET_TICK'; payload: number }
  | { type: 'ADVANCE_TICK'; payload: { delta: number; totalTicks: number } };

function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case 'LOAD_SUCCESS':
      return { ...state, replay: action.payload, tick: 0, error: '', playing: false };
    case 'LOAD_ERROR':
      return { ...state, error: action.payload };
    case 'TOGGLE_PLAY':
      return { ...state, playing: !state.playing };
    case 'SET_PLAYING':
      return { ...state, playing: action.payload };
    case 'SET_SPEED':
      return { ...state, speed: action.payload };
    case 'SET_TICK':
      return { ...state, tick: action.payload, playing: false };
    case 'ADVANCE_TICK': {
      const nxt = Math.min(action.payload.totalTicks, state.tick + action.payload.delta);
      return { ...state, tick: nxt, playing: nxt >= action.payload.totalTicks ? false : state.playing };
    }
    default:
      return state;
  }
}

const initialReplayState: ReplayState = {
  replay: null,
  error: '',
  playing: false,
  speed: 1,
  tick: 0,
};

export default function ReplayApp() {
  const [state, dispatch] = useReducer(replayReducer, initialReplayState);
  const { replay, error, playing, speed, tick } = state;
  const [activeTab, setActiveTab] = useState<'inspector' | 'habits'>('inspector');
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const [previewSelection, setPreviewSelection] = useState<CandidatePreviewSelection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const totalTicks = useMemo(() => replay?.keyframes[replay.keyframes.length - 1]?.tick ?? 1, [replay]);

  const diagnosticReport: ReplayDiagnosticReport | null = useMemo(() => {
    if (!replay) return null;
    return analyzeReplayDiagnostics(replay);
  }, [replay]);

  useEffect(() => {
    if (!playing || !replay) return;
    const update = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      dispatch({ type: 'ADVANCE_TICK', payload: { delta: dt * 60 * speed, totalTicks } });
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [playing, replay, speed, totalTicks]);

  const viewFrame = useMemo(() => {
    if (!replay) return null;
    const frames = replay.keyframes;
    let nearest = frames[0];
    for (const frame of frames) {
      if (frame.tick <= tick) nearest = frame;
      else break;
    }
    return nearest;
  }, [replay, tick]);

  const viewState = useMemo((): GameState | null => {
    if (!replay || !viewFrame) return null;
    return {
      ...replay.initialState,
      tick: viewFrame.tick,
      players: viewFrame.players,
      status: 'playing',
    };
  }, [replay, viewFrame]);

  const playerIds = useMemo(
    () => (viewState ? orderedPlayerIds(replay, viewState.players) : []),
    [replay, viewState],
  );

  const playerLabel = (playerId: string): string => {
    const index = playerIds.indexOf(playerId);
    return `Player ${index >= 0 ? index + 1 : '?'} · ${playerId}`;
  };

  const activeInspectedPlayerId = inspectedPlayerId && playerIds.includes(inspectedPlayerId)
    ? inspectedPlayerId
    : playerIds[0] ?? null;
  const currentFrameTraces: Record<string, BotDecisionTrace> = viewFrame?.decisionTraces ?? {};

  useEffect(() => {
    if (playerIds.length > 0 && !playerIds.includes(inspectedPlayerId ?? '')) {
      setInspectedPlayerId(playerIds[0]);
    }
  }, [inspectedPlayerId, playerIds]);

  const currentDecisionTrace = useMemo(() => {
    if (!viewFrame) return null;
    const traces: Record<string, BotDecisionTrace> = viewFrame.decisionTraces ?? {};
    if (activeInspectedPlayerId) {
      const direct = traces[activeInspectedPlayerId];
      if (direct && isRenderableDecisionTrace(direct)) return direct;
      const matching = Object.values(traces).find((trace) => trace.playerId === activeInspectedPlayerId);
      if (matching && isRenderableDecisionTrace(matching)) return matching;
    }
    return null;
  }, [activeInspectedPlayerId, viewFrame]);

  const currentTraceKey = currentDecisionTrace ? decisionTraceKey(currentDecisionTrace) : null;
  const currentFrameTick = viewFrame?.tick ?? null;
  const previewCandidate = previewSelection
    && activeInspectedPlayerId
    && currentTraceKey
    && previewSelection.playerId === activeInspectedPlayerId
    && previewSelection.traceKey === currentTraceKey
    && previewSelection.frameTick === currentFrameTick
    ? previewSelection.candidate
    : null;

  const inspectedPlayer = activeInspectedPlayerId && viewState
    ? viewState.players[activeInspectedPlayerId] ?? null
    : null;

  const replayCandidateOverlay = useMemo<ReplayCandidateOverlay | null>(() => {
    if (!currentDecisionTrace || !isRenderableDecisionTrace(currentDecisionTrace) || !currentDecisionTrace.decisionBoard) return null;
    const decisionBoard = currentDecisionTrace.decisionBoard;
    return {
      botChoice: projectCandidatePlacement(
        decisionBoard,
        currentDecisionTrace.pieceType,
        currentDecisionTrace.selectedCandidate,
        currentDecisionTrace.isBomber,
      ),
      alternative: previewCandidate && !previewCandidate.selected
        ? projectCandidatePlacement(
            decisionBoard,
            currentDecisionTrace.pieceType,
            previewCandidate,
            currentDecisionTrace.isBomber,
          )
        : null,
    };
  }, [currentDecisionTrace, previewCandidate]);

  const observedDecisionOutcome = useMemo(() => {
    if (!replay || !currentDecisionTrace) return null;
    return deriveReplayDecisionOutcome(replay, currentDecisionTrace);
  }, [currentDecisionTrace, replay]);

  const loadReplayFromUrl = (url: string) => {
    fetch(url)
      .then((res) => res.json())
      .then((raw: ReplayData) => {
        const normalized = normalizeReplay(raw);
        if (normalized) {
          dispatch({ type: 'LOAD_SUCCESS', payload: normalized });
        } else {
          dispatch({ type: 'LOAD_ERROR', payload: 'Replay viewer currently supports v2 replay files only.' });
        }
      })
      .catch(() => {
        // Silent fallback if default demo replay file is not found
      });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetFile = params.get('file') || params.get('replay') || '/replays/improved_rulesbot_demo.json';
    loadReplayFromUrl(targetFile);
  }, []);

  const p1 = playerIds[0] && viewState ? viewState.players[playerIds[0]] : null;
  const p2 = playerIds[1] && viewState ? viewState.players[playerIds[1]] : null;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = JSON.parse(event.target?.result as string) as ReplayData;
        const normalized = normalizeReplay(raw);
        if (!normalized) {
          dispatch({ type: 'LOAD_ERROR', payload: 'Replay viewer currently supports v2 replay files only.' });
          return;
        }
        dispatch({ type: 'LOAD_SUCCESS', payload: normalized });
      } catch {
        dispatch({ type: 'LOAD_ERROR', payload: 'Invalid replay file.' });
      }
    };
    reader.readAsText(file);
  };

  const stepTimelineTick = (direction: -1 | 1) => {
    const targetTick = direction < 0 ? Math.ceil(tick) - 1 : Math.floor(tick) + 1;
    dispatch({
      type: 'SET_TICK',
      payload: Math.max(0, Math.min(totalTicks, targetTick)),
    });
  };

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0f] text-white overflow-hidden">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFile} accept=".replay,.json" />

      {/* Top Header Bar */}
      <div className="p-3 bg-[#121218] border-b border-white/10 flex justify-between items-center flex-none">
        <div>
          <h1 className="text-lg font-black text-emerald-400 tracking-wider flex items-center gap-2">
            <Activity size={18} /> REPLAY DIAGNOSTICS VIEWER
          </h1>
          <p className="text-[11px] text-zinc-400">
            {replay ? `Seed ${replay.seed} • ${replay.date}` : 'No replay loaded'}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            type="button"
            onClick={() => loadReplayFromUrl('/replays/improved_rulesbot_demo.json')}
            className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-full transition-colors flex items-center gap-2 px-3 text-xs font-bold"
          >
            DEMO BOT GAME
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors flex items-center gap-2 px-3 text-xs font-bold"
          >
            <FileUp size={14} /> LOAD FILE
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
            disabled={!replay}
            className="px-4 py-1.5 bg-emerald-500/20 text-emerald-400 font-bold rounded-lg hover:bg-emerald-500/30 disabled:opacity-50 text-xs"
          >
            {playing ? 'PAUSE' : 'PLAY'}
          </button>
          <select
            value={speed}
            onChange={(e) => dispatch({ type: 'SET_SPEED', payload: Number(e.target.value) })}
            className="bg-[#0a0a0f] border border-white/20 rounded p-1 text-xs"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
        </div>
      </div>

      {/* Main Dual-Pane Shell */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Playfield & Canvas Area (60% Width) */}
        <div className="flex-1 min-w-0 flex flex-col relative border-r border-white/10 p-3 bg-[#0c0c10]">
          {error && <div className="absolute z-30 left-3 top-3 text-xs text-rose-300 bg-rose-950/50 px-2 py-1 rounded">{error}</div>}
          <div className="flex-1 min-h-0 relative">
            <GameFieldsLayout>
              {p1 && <GameField player={p1} isMe={false} title={playerLabel(playerIds[0])} fieldRole="self" hatchingEnabled={false} showEffectPills effectTick={viewFrame?.tick} suppressBomberExplosionAnimation replayCandidateOverlay={activeInspectedPlayerId === playerIds[0] ? replayCandidateOverlay : null} />}
              {p2 && <GameField player={p2} isMe={false} title={playerLabel(playerIds[1])} fieldRole="opponent" hatchingEnabled={false} showEffectPills effectTick={viewFrame?.tick} suppressBomberExplosionAnimation replayCandidateOverlay={activeInspectedPlayerId === playerIds[1] ? replayCandidateOverlay : null} />}
            </GameFieldsLayout>
            {replay && tick >= totalTicks - 1 && (
              <div className="absolute inset-0 z-40 bg-[#0a0a0f]/40 flex items-center justify-center">
                <div className="bg-[#121212]/90 border border-emerald-500/30 p-6 rounded-xl text-center shadow-[0_0_30px_rgba(16,185,129,0.2)] backdrop-blur px-12">
                  <Trophy className="mx-auto mb-3 text-emerald-400" size={32} />
                  <div className="text-zinc-400 text-xs tracking-widest mb-1 uppercase">Match Finished</div>
                  <div className="text-2xl font-black text-white">{winnerText(p1, p2)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Timeline Scrubber + Powerup Bands */}
          <div className="flex-none pt-3 border-t border-white/10 flex flex-col gap-1.5">
            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
              <span>Effects & purchase timeline</span>
              <span>{(tick / 60).toFixed(1)}s / {(totalTicks / 60).toFixed(1)}s</span>
            </div>
            {replay && (
              <TimelinePowerupBands
                replay={replay}
                totalTicks={totalTicks}
                playerIds={playerIds}
                currentTick={tick}
                playerLabel={playerLabel}
              />
            )}
            {replay && replay.keyframeIntervalTicks && replay.keyframeIntervalTicks > 1 && (
              <div className="text-center text-[9px] text-zinc-600">
                Timeline steps are exact; board snapshots are recorded every {replay.keyframeIntervalTicks} ticks.
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => stepTimelineTick(-1)}
                disabled={!replay || tick <= 0}
                aria-label="Previous tick"
                title="Previous tick"
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-white/10 bg-white/5 px-2 text-[10px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={13} />
                <span>-1 tick</span>
              </button>
              <span className="text-xs font-mono w-10 text-zinc-400">{(tick / 60).toFixed(1)}s</span>
              <input
                type="range"
                min={0}
                max={totalTicks}
                value={tick}
                onChange={(e) => dispatch({ type: 'SET_TICK', payload: Number(e.target.value) })}
                className="flex-1 accent-emerald-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
              />
              <button
                type="button"
                onClick={() => stepTimelineTick(1)}
                disabled={!replay || tick >= totalTicks}
                aria-label="Next tick"
                title="Next tick"
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-white/10 bg-white/5 px-2 text-[10px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>+1 tick</span>
                <ChevronRight size={13} />
              </button>
              <span className="text-xs font-mono w-10 text-zinc-500 text-right">{(totalTicks / 60).toFixed(1)}s</span>
            </div>
            <div className="text-center text-[9px] font-mono uppercase tracking-wider text-zinc-600">
              Tick {Math.round(tick)} / {totalTicks}
            </div>
          </div>
        </div>

        {/* Right Scrollable Diagnostic Inspector (40% Width) */}
        <div className="w-[480px] flex-none flex flex-col bg-[#0f0f14] overflow-hidden">
          {/* Tab Header Selector */}
          <div className="flex border-b border-white/10 p-2 gap-2 bg-[#14141a]">
            <button
              type="button"
              onClick={() => setActiveTab('inspector')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'inspector'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Target size={14} /> Candidate Inspector
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('habits')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'habits'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BarChart3 size={14} /> Replay Misstep Timeline
            </button>
          </div>

          {/* Dedicated Sub-Scrollable Body Pane */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
            <div className="mb-4 rounded-lg border border-white/10 bg-black/25 p-3">
              <div className="mb-2 text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500">Inspecting decision owner</div>
              <div className="flex flex-wrap gap-2">
                {playerIds.map((playerId) => {
                  const hasTrace = Object.values(currentFrameTraces).some(
                    (trace) => trace.playerId === playerId && isRenderableDecisionTrace(trace),
                  );
                  const isActive = playerId === activeInspectedPlayerId;
                  return (
                    <button
                      type="button"
                      key={playerId}
                      onClick={() => setInspectedPlayerId(playerId)}
                      className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${isActive ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${hasTrace ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
                      {playerLabel(playerId)}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[9px] text-zinc-600">The selected owner controls the candidate inspector. Both players remain visible in the replay field.</div>
            </div>
            {activeTab === 'inspector' ? (
              <CandidateInspector
                trace={currentDecisionTrace}
                player={inspectedPlayer}
                playerLabel={activeInspectedPlayerId ? playerLabel(activeInspectedPlayerId) : 'No player selected'}
                frameTick={viewFrame?.tick}
                previewCandidate={previewCandidate}
                observedOutcome={observedDecisionOutcome}
                onPreviewCandidate={(candidate) => {
                  if (!candidate || !activeInspectedPlayerId || !currentTraceKey) {
                    setPreviewSelection(null);
                    return;
                  }
                  setPreviewSelection({
                    playerId: activeInspectedPlayerId,
                    traceKey: currentTraceKey,
                    frameTick: currentFrameTick,
                    candidate,
                  });
                }}
              />
            ) : diagnosticReport ? (
              <HabitReportDashboard
                replay={replay}
                report={diagnosticReport}
                selectedTick={tick}
                selectedPlayerId={activeInspectedPlayerId}
                onSelectPlayer={(playerId) => setInspectedPlayerId(playerId)}
                onJumpToTick={(targetTick) => dispatch({ type: 'SET_TICK', payload: targetTick })}
                onJumpToDecision={(playerId, targetTick) => {
                  setInspectedPlayerId(playerId);
                  dispatch({ type: 'SET_TICK', payload: targetTick });
                }}
                playerLabel={playerLabel}
              />
            ) : (
              <div className="p-6 text-center text-zinc-500 text-xs">
                No diagnostic report available for this replay file.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
