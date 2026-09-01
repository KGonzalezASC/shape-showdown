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
import { isPuzzleFinished } from '../puzzle/puzzlePresentation';

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
}

interface PuzzleStarted {
  levelId: string;
  name: string;
  seed: number;
  goal: { kind: string; lines?: number; ticks?: number };
  allowHold?: boolean;
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
    nextQueue: (Array.isArray(snap.nextQueue) ? snap.nextQueue : []) as PublicPlayerState['nextQueue'],
    score: snap.score,
    funds: 0,
    linesCleared: snap.linesCleared,
    combo: 0,
    backToBack: false,
    pendingGarbage: [],
    topOut: snap.topOut,
    swapCutoffRow: allowHold ? (snap.swapCutoffRow ?? HOLD_SWAP_CUTOFF_VISIBLE_ROW) : 0,
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
        socket.emit('puzzle:start', { mode: 'random' });
      });
      socket.on('disconnect', () => {
        if (!cancelled) setConnected(false);
      });
      socket.on('connect_error', (err) => {
        console.warn('Puzzle socket connection error:', err);
      });
      socket.on('puzzle:started', (payload: PuzzleStarted) => {
        if (cancelled) return;
        setStarted(payload);
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

  const restart = useCallback(() => {
    setEnd(null);
    setState(null);
    setStarted(null);
    const socket = socketRef.current;
    if (socket) {
      if (!socket.connected) {
        socket.connect();
      } else {
        socket.emit('puzzle:start', { mode: 'random' });
      }
    }
  }, []);

  const player = state ? toPublicPlayerState(state, 'puzzle-me') : null;
  const finished = isPuzzleFinished(state?.status ?? null, end !== null);

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
          {started && (
            <p className="text-xs text-zinc-400">
              {started.name} — {goalLabel(started.goal)}
              {started.allowHold === false && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                  No Hold
                </span>
              )}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-zinc-400">
          {state && <div>Lines: {state.linesCleared}</div>}
          {state && <div>Pieces: {state.piecesPlaced ?? 0}</div>}
          {state && <div>Time: {Math.floor(state.tick / 60)}s</div>}
        </div>
      </header>

      <div className="flex items-start justify-center">
        {player ? (
          <GameField
            ref={myFieldRef}
            player={player}
            isMe
            title="Puzzle"
            hatchingEnabled={false}
            status={finished ? 'ended' : 'playing'}
          />
        ) : (
          <div className="flex h-[420px] w-[240px] items-center justify-center rounded-xl border border-white/10 bg-[#08090d] text-sm text-zinc-500">
            {connected ? 'Loading puzzle…' : 'Connecting…'}
          </div>
        )}
      </div>

      {finished && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-[#08090d] px-8 py-6 text-center">
          <p className="text-xl font-black uppercase tracking-wider">
            {end?.solved || state?.status === 'solved'
              ? 'Solved! 🎉'
              : end?.topOut || state?.status === 'topout'
                ? 'Top Out'
                : 'Session Ended'}
          </p>
          {end && (
            <p className="text-xs text-zinc-400">
              {end.linesCleared} lines · {end.piecesUsed} pieces ·{' '}
              {Math.round(end.ticksUsed / 60)}s
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={restart}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/20"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>New Puzzle</span>
            </button>
            <button
              type="button"
              onClick={() => setAppRoute('landing')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-white/10"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Back to Menu</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PuzzleScreen;
