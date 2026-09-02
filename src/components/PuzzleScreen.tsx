import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import GameField, { type GameFieldRef } from './GameField';
import type { PublicPlayerState } from '../state/publicSnapshots';
import { setAppRoute } from '../appRoute';
import { useKeyBindings } from '../input/KeyBindingsProvider';
import { actionForCode } from '../input/keyBindings';
import { HOLD_SWAP_CUTOFF_VISIBLE_ROW } from '../types';
import { appendDiscordFrameId, isDiscordActivityContext } from '../discordContext';
import { resolveGameServerUrl } from '../hooks/useGameSocket';
import {
  isPuzzleFinished,
  presentTimelineHints,
  type PuzzleVisibilityPolicy,
} from '../puzzle/puzzlePresentation';

/**
 * Single-player puzzle screen.
 *
 * Connects a direct socket session (no queue or second seat), streams player
 * snapshots via `puzzle:state`, renders using the standard GameField, and
 * delegates player input through the unified KeyBindings configuration.
 */

interface PuzzleWireState {
  tick: number;
  board: unknown[][];
  activePiece: unknown;
  holdPiece: unknown;
  canHold: boolean;
  swapCutoffRow?: number;
  allowHold?: boolean;
  holdFrozenUntilTick?: number;
  activeEffects?: PublicPlayerState['activeEffects'];
  nextQueue: string[];
  score: number;
  linesCleared: number;
  piecesPlaced?: number;
  pendingGarbage: number;
  topOut: boolean;
  status: 'playing' | 'solved' | 'topout';
  goal: { kind: string; lines?: number; ticks?: number };
  levelId: string;
  levelName: string;
  poisonBoard?: PublicPlayerState['poisonBoard'];
  poisonSpread?: PublicPlayerState['poisonSpread'];
  customNextPieceSourceCells?: PublicPlayerState['customNextPieceSourceCells'];
  curtainDefenseLevel?: number;
  pendingHazardKinds?: string[];
}

interface PuzzleReferenceBaseline {
  score: number;
  ticksUsed: number;
  piecesUsed: number;
  linesCleared: number;
  profileId: string;
}

interface PuzzleBenchmarkWire {
  metric: 'score' | 'ticks' | 'pieces';
  direction: 'maximize' | 'minimize';
}

interface PuzzleStarted {
  levelId: string;
  name: string;
  seed: number;
  goal: { kind: string; lines?: number; ticks?: number };
  allowHold?: boolean;
  visibilityPolicy?: PuzzleVisibilityPolicy;
  puzzleId?: string;
  attemptId?: string;
  timeline?: Array<{ tick: number; kind: string }>;
  benchmark?: PuzzleBenchmarkWire;
  referenceBaseline?: PuzzleReferenceBaseline | null;
}

interface PuzzleCatalogEntry {
  id: string;
  name: string;
  goal: { kind: string; lines?: number; ticks?: number };
  allowHold: boolean;
  visibilityPolicy: PuzzleVisibilityPolicy;
}

interface PuzzleDailySummary {
  dateKey: string;
  puzzleId: string;
  name: string;
}

interface PuzzleCatalogPayload {
  puzzles: PuzzleCatalogEntry[];
  daily: PuzzleDailySummary;
}

interface PuzzleEnd {
  solved: boolean;
  topOut: boolean;
  ticksUsed: number;
  piecesUsed: number;
  linesCleared: number;
  perfectClear: boolean;
  score?: number;
  levelId?: string;
  attemptId?: string;
}

/** Shape the wire snapshot into the PublicPlayerState GameField expects. */
function toPublicPlayerState(snap: PuzzleWireState, myId: string): PublicPlayerState {
  const allowHold = snap.allowHold !== false;
  return {
    id: myId,
    board: snap.board as PublicPlayerState['board'],
    activePiece: snap.activePiece as PublicPlayerState['activePiece'],
    holdPiece: (snap.holdPiece ?? null) as PublicPlayerState['holdPiece'],
    canHold: allowHold && snap.canHold,
    holdFrozenUntilTick: snap.holdFrozenUntilTick,
    activeEffects: snap.activeEffects ?? [],
    nextQueue: (Array.isArray(snap.nextQueue) ? snap.nextQueue : []) as PublicPlayerState['nextQueue'],
    score: snap.score,
    funds: 0,
    linesCleared: snap.linesCleared,
    combo: 0,
    backToBack: false,
    pendingGarbage: [],
    topOut: snap.topOut,
    swapCutoffRow: allowHold ? (snap.swapCutoffRow ?? HOLD_SWAP_CUTOFF_VISIBLE_ROW) : 0,
    poisonBoard: snap.poisonBoard,
    poisonSpread: snap.poisonSpread ?? null,
    customNextPieceSourceCells: snap.customNextPieceSourceCells,
    curtainDefenseLevel: snap.curtainDefenseLevel ?? 0,
    shop: {
      offerIds: [],
      phase: 'waiting',
      cycleIndex: -1,
      lastPurchasedItemId: null,
      activeSynergySeeds: [],
      pricing: {},
    },
  };
}

const goalLabel = (goal: PuzzleStarted['goal']): string => {
  switch (goal.kind) {
    case 'perfect-clear':
      return 'Clear the whole board';
    case 'survive':
      return `Survive ${Math.ceil((goal.ticks ?? 0) / 60)}s`;
    case 'clear-lines':
      return `Clear ${goal.lines ?? 0} lines`;
    default:
      return goal.kind;
  }
};

const baselinePrimaryLabel = (_benchmark?: PuzzleBenchmarkWire): string => {
  return 'Record to beat';
};

export const PuzzleScreen: React.FC = () => {
  const socketRef = useRef<Socket | null>(null);
  const myFieldRef = useRef<GameFieldRef>(null);
  const bindings = useKeyBindings();
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const [state, setState] = useState<PuzzleWireState | null>(null);
  const [started, setStarted] = useState<PuzzleStarted | null>(null);
  const [end, setEnd] = useState<PuzzleEnd | null>(null);
  const [connected, setConnected] = useState(false);
  const [catalog, setCatalog] = useState<PuzzleCatalogEntry[]>([]);
  const [daily, setDaily] = useState<PuzzleDailySummary | null>(null);
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string | null>(null);
  const [picking, setPicking] = useState(true);
  const dailyAutostartHandledRef = useRef(false);
  const selectedPuzzleIdRef = useRef<string | null>(null);
  selectedPuzzleIdRef.current = selectedPuzzleId;
  const heldInputsRef = useRef({ left: false, right: false, softDrop: false });

  useEffect(() => {
    let cancelled = false;
    const connect = async (): Promise<void> => {
      const url = await resolveGameServerUrl();
      if (cancelled) return;

      const isDiscord = isDiscordActivityContext();
      const socket = io(appendDiscordFrameId(url), {
        path: isDiscord ? '/socketio' : '/socket.io',
        transports: isDiscord ? ['websocket'] : ['websocket', 'polling'],
        auth: {
          purpose: 'puzzle',
        },
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        if (cancelled) return;
        setConnected(true);
        socket.emit('puzzle:list');
      });
      socket.on('disconnect', () => {
        if (!cancelled) {
          setConnected(false);
          setState(null);
        }
      });
      socket.on('connect_error', (err) => {
        console.warn('Puzzle socket connection error:', err);
      });
      socket.on('puzzle:catalog', (payload: PuzzleCatalogPayload | PuzzleCatalogEntry[]) => {
        if (cancelled) return;
        const puzzles = Array.isArray(payload) ? payload : payload.puzzles;
        const dailyPayload = Array.isArray(payload) ? null : payload.daily;
        setCatalog(puzzles);
        if (dailyPayload) setDaily(dailyPayload);

        // LandingShowcase Daily button stashes this flag.
        if (
          !dailyAutostartHandledRef.current &&
          typeof sessionStorage !== 'undefined' &&
          sessionStorage.getItem('puzzleAutostart') === 'daily'
        ) {
          dailyAutostartHandledRef.current = true;
          sessionStorage.removeItem('puzzleAutostart');
          setPicking(false);
          socket.emit('puzzle:start', { mode: 'daily' });
        }
      });
      socket.on('puzzle:started', (payload: PuzzleStarted) => {
        if (cancelled) return;
        setStarted(payload);
        setSelectedPuzzleId(payload.puzzleId ?? payload.levelId);
        setPicking(false);
        setEnd(null);
      });
      socket.on('puzzle:state', (snap: PuzzleWireState) => {
        if (!cancelled) setState(snap);
      });
      socket.on('puzzle:end', (payload: PuzzleEnd) => {
        if (!cancelled) setEnd(payload);
      });
    };
    void connect();

    return () => {
      cancelled = true;
      const socket = socketRef.current;
      socket?.emit('puzzle:stop');
      socket?.close();
      socketRef.current = null;
    };
  }, []);

  // Keyboard controls wired to KeyBindingsProvider (matches multiplayer match behavior).
  useEffect(() => {
    const emitInput = () => {
      const socket = socketRef.current;
      if (!socket) return;
      socket.emit('puzzle:input', { ...heldInputsRef.current });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const action = actionForCode(bindingsRef.current, e.code);
      if (!action) return;

      e.preventDefault();
      if (action === 'moveLeft') {
        if (heldInputsRef.current.left) return;
        heldInputsRef.current = { ...heldInputsRef.current, left: true };
        emitInput();
      } else if (action === 'moveRight') {
        if (heldInputsRef.current.right) return;
        heldInputsRef.current = { ...heldInputsRef.current, right: true };
        emitInput();
      } else if (action === 'softDrop') {
        if (heldInputsRef.current.softDrop) return;
        heldInputsRef.current = { ...heldInputsRef.current, softDrop: true };
        emitInput();
      } else if (action === 'hardDrop') {
        myFieldRef.current?.hardDrop();
        socketRef.current?.emit('puzzle:action', 'hardDrop');
      } else if (action === 'rotateCW') {
        if (e.repeat) return;
        socketRef.current?.emit('puzzle:action', 'rotateCW');
      } else if (action === 'rotateCCW') {
        if (e.repeat) return;
        socketRef.current?.emit('puzzle:action', 'rotateCCW');
      } else if (action === 'hold') {
        socketRef.current?.emit('puzzle:action', 'hold');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const action = actionForCode(bindingsRef.current, e.code);
      if (action === 'moveLeft') {
        heldInputsRef.current = { ...heldInputsRef.current, left: false };
        emitInput();
      } else if (action === 'moveRight') {
        heldInputsRef.current = { ...heldInputsRef.current, right: false };
        emitInput();
      } else if (action === 'softDrop') {
        heldInputsRef.current = { ...heldInputsRef.current, softDrop: false };
        emitInput();
      }
    };

    const clearInput = () => {
      heldInputsRef.current = { left: false, right: false, softDrop: false };
      emitInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
    };
  }, []);

  const startPuzzle = useCallback((puzzleId: string) => {
    setEnd(null);
    setState(null);
    setStarted(null);
    setSelectedPuzzleId(puzzleId);
    setPicking(false);
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('puzzle:start', { mode: 'catalog', puzzleId });
  }, []);

  const startDaily = useCallback(() => {
    setEnd(null);
    setState(null);
    setStarted(null);
    setPicking(false);
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('puzzle:start', { mode: 'daily' });
  }, []);

  const restartSame = useCallback(() => {
    const id = selectedPuzzleIdRef.current;
    if (id) startPuzzle(id);
  }, [startPuzzle]);

  const pickAnother = useCallback(() => {
    setEnd(null);
    setState(null);
    setStarted(null);
    setPicking(true);
    socketRef.current?.emit('puzzle:stop');
    socketRef.current?.emit('puzzle:list');
  }, []);

  const player = state ? toPublicPlayerState(state, 'puzzle-me') : null;
  const finished = isPuzzleFinished(state?.status ?? null, end !== null);
  const timelineHints = presentTimelineHints(
    started?.timeline ?? [],
    started?.visibilityPolicy,
    state?.tick ?? 0,
    state?.pendingHazardKinds ?? [],
  );

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#07080b] p-4 font-sans text-white">
      <header className="flex w-full max-w-3xl items-center justify-between">
        <button
          type="button"
          onClick={() => setAppRoute('landing')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.08]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>
        <div className="text-center">
          <h1 className="text-lg font-black uppercase tracking-wider">Puzzles</h1>
          {started && !picking && (
            <p className="text-xs text-zinc-400">
              {started.name} — {goalLabel(started.goal)}
              {started.allowHold === false && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                  No Hold
                </span>
              )}
              {started.visibilityPolicy && (
                <span className="ml-2 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                  {started.visibilityPolicy}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-zinc-400">
          {state && !picking && <div>Lines: {state.linesCleared}</div>}
          {state && !picking && <div>Pieces: {state.piecesPlaced ?? 0}</div>}
          {state && !picking && <div>Time: {Math.floor(state.tick / 60)}s</div>}
        </div>
      </header>

      {!picking && started?.referenceBaseline && (
        <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-[#08090d] px-4 py-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {baselinePrimaryLabel(started.benchmark)}
            </p>
            <p className="text-[10px] text-zinc-600">Reference Baseline</p>
          </div>
          <div className="flex flex-wrap gap-4 font-mono text-xs tabular-nums text-zinc-300">
            <span>
              Score{' '}
              <strong className="text-emerald-300">{started.referenceBaseline.score}</strong>
              {state && (
                <span className="ml-1 text-zinc-500">/ {state.score}</span>
              )}
            </span>
            <span>
              Pieces{' '}
              <strong className="text-sky-300">{started.referenceBaseline.piecesUsed}</strong>
              {state && (
                <span className="ml-1 text-zinc-500">/ {state.piecesPlaced ?? 0}</span>
              )}
            </span>
            <span>
              Ticks{' '}
              <strong className="text-amber-300">{started.referenceBaseline.ticksUsed}</strong>
              {state && (
                <span className="ml-1 text-zinc-500">/ {state.tick}</span>
              )}
            </span>
          </div>
          {finished && end && (
            <p className="mt-2 text-[10px] text-zinc-500">
              Your run: {end.score ?? '—'} score · {end.piecesUsed} pieces · {end.ticksUsed} ticks
              {end.solved ? ' · solved' : end.topOut ? ' · top out' : ''}
            </p>
          )}
        </div>
      )}

      {picking ? (
        <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-white/10 bg-[#08090d] p-5">
          <p className="text-sm font-bold uppercase tracking-wider text-zinc-300">Choose a puzzle</p>
          {!connected && (
            <p className="text-xs text-zinc-500">Connecting…</p>
          )}
          {connected && catalog.length === 0 && (
            <p className="text-xs text-zinc-500">Loading catalog…</p>
          )}
          {daily && (
            <button
              type="button"
              onClick={startDaily}
              className="flex flex-col items-start rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/20 to-orange-600/10 px-4 py-4 text-left shadow-[0_0_24px_rgba(251,191,36,0.12)] hover:from-amber-500/30 hover:to-orange-600/20"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                Today&apos;s Challenge
              </span>
              <span className="mt-1 text-base font-black text-white">{daily.name}</span>
              <span className="mt-0.5 text-xs text-amber-100/70">{daily.dateKey}</span>
            </button>
          )}
          <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Practice</p>
          {catalog.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => startPuzzle(entry.id)}
              className="flex flex-col items-start rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.08]"
            >
              <span className="text-sm font-bold">{entry.name}</span>
              <span className="text-xs text-zinc-400">
                {goalLabel(entry.goal)}
                {entry.allowHold ? '' : ' · no hold'}
                {' · '}
                {entry.visibilityPolicy}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const socket = socketRef.current;
              if (!socket) return;
              setPicking(false);
              socket.emit('puzzle:start', { mode: 'random' });
            }}
            className="rounded-lg bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/20"
          >
            Random curated
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-center gap-4">
            {player ? (
              <GameField
                ref={myFieldRef}
                player={player}
                isMe
                title="Puzzle"
                showFunds={false}
                showPlayerName={false}
                hatchingEnabled={false}
                allowHold={started?.allowHold !== false}
                status={finished ? 'ended' : 'playing'}
              />
            ) : (
              <div className="flex h-[420px] w-[240px] items-center justify-center rounded-xl border border-white/10 bg-[#08090d] text-sm text-zinc-500">
                {connected ? 'Loading puzzle…' : 'Connecting…'}
              </div>
            )}
            {timelineHints.length > 0 && (
              <div className="w-40 rounded-xl border border-white/10 bg-[#08090d] p-3 text-xs text-zinc-300">
                <p className="mb-2 font-bold uppercase tracking-wider text-zinc-400">Upcoming</p>
                <ul className="space-y-1">
                  {timelineHints.map((hint, index) => (
                    <li key={`${hint.kind}-${index}`}>
                      {hint.tick < 0
                        ? hint.kind
                        : `${hint.kind} @ ${Math.floor(hint.tick / 60)}s`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {finished && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-[#08090d] px-8 py-6 text-center">
              <p className="text-xl font-black uppercase tracking-wider">
                {end?.solved || state?.status === 'solved'
                  ? 'Solved!'
                  : end?.topOut || state?.status === 'topout'
                    ? 'Top Out'
                    : 'Session Ended'}
              </p>
              {end && (
                <p className="text-xs text-zinc-400">
                  {end.linesCleared} lines · {end.piecesUsed} pieces ·{' '}
                  {Math.round(end.ticksUsed / 60)}s
                  {end.attemptId ? ` · attempt ${end.attemptId.slice(0, 8)}` : ''}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={restartSame}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/20"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  onClick={pickAnother}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/20"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Pick Another</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAppRoute('landing')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-white/10"
                >
                  <span>Menu</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PuzzleScreen;

