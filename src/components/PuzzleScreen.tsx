import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import GameField, { type GameFieldRef } from './GameField';
import MobileControls, { type MobileControlsRef } from './MobileControls';
import { OnScreenControlsPreferenceButton } from './OnScreenControlsPreference';
import type { PublicPlayerState } from '../state/publicSnapshots';
import { setAppRoute } from '../appRoute';
import { useKeyBindings } from '../input/KeyBindingsProvider';
import { actionForCode } from '../input/keyBindings';
import {
  CELL_SIZE,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
} from '../types';
import type { ActionType, InputState } from '../types';
import { usePlayfieldLayoutMode } from '../responsive/playfieldLayoutMode';
import { usePuzzleViewportConstraints } from '../responsive/puzzleViewport';
import { fitMobilePlayfieldCellSize } from './PlayfieldCellSizer';
import {
  presentTimelineHints,
  type PuzzleVisibilityPolicy,
} from '../puzzle/puzzlePresentation';
import { PuzzleRuntimeClient } from '../puzzle/runtime/PuzzleRuntimeClient.js';
import { decodePublishedPuzzleManifest, decodePublishedPuzzlePack } from '../puzzle/publishedPuzzleCodec.js';
import { stableSeedForPuzzle } from '../puzzle/runtime/PuzzleRuntime.js';
import type { PublishedPuzzleV1, PuzzleActionV1 } from '../puzzle/publishedPuzzle.js';
import {
  calculatePuzzleStars,
  type PuzzleStarEvaluation,
} from '../puzzle/puzzleStarRating';
import {
  loadAllPuzzleRecords,
  savePuzzleRecord,
  getTotalStarsEarned,
  type PuzzleProgressRecord,
} from '../state/puzzleProgressStorage';
import { PuzzleVictoryModal } from './PuzzleVictoryModal';
import { DEV_TOOLS_ENABLED } from '../devTools';
import {
  actionAvailabilityFor,
  deriveGameplayControlAvailability,
} from '../input/gameplayControls';
import { useOnScreenControlsPolicy } from '../input/onScreenControlsPolicy';
import { useDocumentInteractionPolicy } from '../input/documentInteractionPolicy';
import { isPalmOrEdgeContact } from '../input/touchSafety';
import { derivePuzzleViewPhase } from '../puzzle/puzzleViewPhase';

/**
 * Single-player puzzle screen.
 *
 * Runs client-side via a deterministic Web Worker simulation without a live socket,
 * renders using the standard GameField, and delegates player input through the
 * unified KeyBindings configuration.
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
  goal: { kind: string; lines?: number; ticks?: number; maxPieces?: number };
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
  description?: string;
  seed: number;
  goal: { kind: string; lines?: number; ticks?: number; maxPieces?: number };
  allowHold?: boolean;
  visibilityPolicy?: PuzzleVisibilityPolicy;
  puzzleId?: string;
  attemptId?: string;
  timeline?: Array<{ tick?: number; afterPieces?: number; kind: string }>;
  benchmark?: PuzzleBenchmarkWire;
  referenceBaseline?: PuzzleReferenceBaseline | null;
}

interface PuzzleCatalogEntry {
  id: string;
  name: string;
  description?: string;
  goal: { kind: string; lines?: number; ticks?: number; maxPieces?: number };
  allowHold: boolean;
  visibilityPolicy: PuzzleVisibilityPolicy;
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
    case 'garbage-clear':
      return 'Clear all garbage';
    case 'perfect-clear':
      return 'Clear the whole board';
    case 'survive':
      return `Survive ${Math.ceil((goal.ticks ?? 0) / 60)}s`;
    case 'clear-lines':
      return `Clear ${goal.lines ?? 0} lines`;
    case 'survive-clear':
      return `Survive ${Math.ceil((goal.ticks ?? 0) / 60)}s · Clear ${goal.lines ?? 0} lines`;
    default:
      return goal.kind;
  }
};


interface IncomingEffectMeta {
  icon: string;
  name: string;
  category: string;
  badgeClass: string;
  borderClass: string;
  glowClass: string;
}

const INCOMING_EFFECT_META: Record<string, IncomingEffectMeta> = {
  retrim: {
    icon: '✂️',
    name: 'Re-Trim',
    category: 'Attack',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    borderClass: 'border-rose-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(244,63,94,0.18)]',
  },
  garbage: {
    icon: '💥',
    name: 'Garbage',
    category: 'Attack',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
    borderClass: 'border-red-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(239,68,68,0.18)]',
  },
  magnet: {
    icon: '🧲',
    name: 'Magnet',
    category: 'Gravity',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    borderClass: 'border-amber-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(245,158,11,0.18)]',
  },
  sticky: {
    icon: '⏱️',
    name: 'Sticky',
    category: 'Lock Limit',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    borderClass: 'border-orange-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(249,115,22,0.18)]',
  },
  snag: {
    icon: '🪝',
    name: 'Snag',
    category: 'Disrupt',
    badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
    borderClass: 'border-pink-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(236,72,153,0.18)]',
  },
  freeze: {
    icon: '❄️',
    name: 'Freeze',
    category: 'Hold Lock',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    borderClass: 'border-cyan-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(6,182,212,0.18)]',
  },
  curtain: {
    icon: '🎭',
    name: 'Curtain',
    category: 'Blindness',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    borderClass: 'border-purple-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(168,85,247,0.18)]',
  },
  poison: {
    icon: '🧪',
    name: 'Poison',
    category: 'Infection',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    borderClass: 'border-emerald-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(16,185,129,0.18)]',
  },
  wildcard: {
    icon: '🧩',
    name: 'Wildcard',
    category: 'Shape-Shift',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    borderClass: 'border-indigo-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(99,102,241,0.18)]',
  },
  purge: {
    icon: '🃏',
    name: 'Wild Purge',
    category: 'Cleanse',
    badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    borderClass: 'border-teal-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(20,184,166,0.18)]',
  },
  bomber: {
    icon: '💣',
    name: 'Bomber',
    category: 'Blast',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    borderClass: 'border-rose-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(244,63,94,0.18)]',
  },
  satellite: {
    icon: '🛰️',
    name: 'Satellite',
    category: 'Defense',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    borderClass: 'border-sky-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(14,165,233,0.18)]',
  },
  tectonic: {
    icon: '🌋',
    name: 'Tectonic',
    category: 'Attack',
    badgeClass: 'bg-stone-500/20 text-stone-300 border-stone-500/40',
    borderClass: 'border-stone-500/40',
    glowClass: 'shadow-[0_0_12px_rgba(120,113,108,0.18)]',
  },
};

const getEffectMeta = (kind: string): IncomingEffectMeta => {
  return INCOMING_EFFECT_META[kind.toLowerCase()] ?? {
    icon: '⚡',
    name: kind.charAt(0).toUpperCase() + kind.slice(1),
    category: 'Hazard',
    badgeClass: 'bg-zinc-700/40 text-zinc-200 border-zinc-500/30',
    borderClass: 'border-white/10',
    glowClass: '',
  };
};

const getTriggerDetails = (
  hint: { tick: number; afterPieces?: number },
  piecesPlaced: number,
  currentTick: number,
) => {
  if (typeof hint.afterPieces === 'number') {
    const remaining = hint.afterPieces - piecesPlaced;
    if (remaining <= 0) {
      return { label: 'NOW', isImminent: true, isUrgent: true };
    }
    if (remaining === 1) {
      return { label: 'NEXT PC', isImminent: true, isUrgent: true };
    }
    if (remaining <= 3) {
      return { label: `in ${remaining} pcs`, isImminent: true, isUrgent: false };
    }
    return { label: `in ${remaining} pcs`, isImminent: false, isUrgent: false };
  }
  if (hint.tick >= 0) {
    const sec = Math.max(0, Math.ceil((hint.tick - currentTick) / 60));
    if (sec <= 2) {
      return { label: `${sec}s`, isImminent: true, isUrgent: true };
    }
    if (sec <= 5) {
      return { label: `${sec}s`, isImminent: true, isUrgent: false };
    }
    return { label: `${sec}s`, isImminent: false, isUrgent: false };
  }
  return { label: 'QUEUED', isImminent: false, isUrgent: false };
};

export type PuzzleContentLoadState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'incompatible'
  | 'corrupt-content'
  | 'failed';

export interface PuzzleViewAttemptState {
  client: PuzzleRuntimeClient | null;
  puzzle: PublishedPuzzleV1 | null;
  contentHash: string | null;
  wireState: PuzzleWireState | null;
  end: PuzzleEnd | null;
}

export const PuzzleScreen: React.FC = () => {
  const clientRef = useRef<PuzzleRuntimeClient | null>(null);
  const myFieldRef = useRef<GameFieldRef>(null);
  const mobileControlsRef = useRef<MobileControlsRef>(null);
  const lossModalRef = useRef<HTMLDivElement>(null);
  const retryPointerAllowedRef = useRef(false);
  const bindings = useKeyBindings();
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const [contentState, setContentState] = useState<PuzzleContentLoadState>('idle');
  const [contentError, setContentError] = useState<string | null>(null);
  const [puzzlesById, setPuzzlesById] = useState<Map<string, PublishedPuzzleV1>>(new Map());
  const puzzlesByIdRef = useRef<Map<string, PublishedPuzzleV1>>(puzzlesById);
  puzzlesByIdRef.current = puzzlesById;

  const [state, setState] = useState<PuzzleWireState | null>(null);
  const [started, setStarted] = useState<PuzzleStarted | null>(null);
  const startedRef = useRef<PuzzleStarted | null>(null);
  startedRef.current = started;
  const [end, setEnd] = useState<PuzzleEnd | null>(null);
  const [catalog, setCatalog] = useState<PuzzleCatalogEntry[]>([]);
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string | null>(null);
  const [picking, setPicking] = useState(true);
  const [records, setRecords] = useState<Record<string, PuzzleProgressRecord>>(() =>
    loadAllPuzzleRecords(),
  );
  const [victoryEvaluation, setVictoryEvaluation] = useState<PuzzleStarEvaluation | null>(null);
  const selectedPuzzleIdRef = useRef<string | null>(null);
  selectedPuzzleIdRef.current = selectedPuzzleId;
  const keyboardInputRef = useRef<InputState>({ left: false, right: false, softDrop: false });
  const touchInputRef = useRef<InputState>({ left: false, right: false, softDrop: false });
  const controlsPolicy = useOnScreenControlsPolicy();
  const puzzlePhase = derivePuzzleViewPhase({
    picking,
    selectedPuzzleId,
    startedPuzzleId: started?.puzzleId ?? started?.levelId ?? null,
    stateStatus: state?.status ?? null,
    ended: end !== null,
    endSolved: end?.solved ?? null,
  });
  useDocumentInteractionPolicy(puzzlePhase.kind === 'picker' ? 'puzzle-picker' : 'gameplay', 1);

  const emitInput = useCallback((input: InputState) => {
    clientRef.current?.setInput(input);
  }, []);
  const emitCombinedInput = useCallback(() => {
    emitInput({
      left: keyboardInputRef.current.left || touchInputRef.current.left,
      right: keyboardInputRef.current.right || touchInputRef.current.right,
      softDrop: keyboardInputRef.current.softDrop || touchInputRef.current.softDrop,
    });
  }, [emitInput]);
  const clearInput = useCallback(() => {
    keyboardInputRef.current = { left: false, right: false, softDrop: false };
    touchInputRef.current = { left: false, right: false, softDrop: false };
    emitInput({ left: false, right: false, softDrop: false });
  }, [emitInput]);
  const player = state ? toPublicPlayerState(state, 'puzzle-me') : null;
  const gameplayInputActive = puzzlePhase.kind === 'playing' && state?.status === 'playing';
  const controlsAvailability = useMemo(
    () => deriveGameplayControlAvailability({
      active: gameplayInputActive,
      player,
      currentTick: state?.tick ?? 0,
      allowHold: started?.allowHold !== false,
      utility: { kind: 'none' },
    }),
    [gameplayInputActive, player, started?.allowHold, state?.tick],
  );
  const controlsAvailabilityRef = useRef(controlsAvailability);
  controlsAvailabilityRef.current = controlsAvailability;
  const gameplayInputActiveRef = useRef(gameplayInputActive);
  gameplayInputActiveRef.current = gameplayInputActive;

  useEffect(() => {
    if (!gameplayInputActive || !controlsPolicy.visible) clearInput();
  }, [clearInput, controlsPolicy.visible, gameplayInputActive]);

  const loadPuzzleContent = useCallback(async () => {
    setContentState('loading');
    setContentError(null);
    try {
      const baseUrl = import.meta.env.BASE_URL || './';
      const manifestUrl = new URL('puzzles/manifest.json', new URL(baseUrl, window.location.href)).toString();
      const manifestRes = await fetch(manifestUrl);
      if (!manifestRes.ok) {
        throw new Error(`Failed to fetch puzzle manifest: HTTP ${manifestRes.status}`);
      }
      const manifestText = await manifestRes.text();
      const manifest = decodePublishedPuzzleManifest(manifestText);

      if (manifest.puzzleRuntimeVersion !== 'puzzle-runtime-v1') {
        setContentState('incompatible');
        setContentError(`Incompatible puzzle runtime version: ${manifest.puzzleRuntimeVersion}`);
        return;
      }

      const loaded = new Map<string, PublishedPuzzleV1>();
      const catalogList: PuzzleCatalogEntry[] = [];

      for (const packRef of manifest.packs) {
        const packUrl = new URL(packRef.url, manifestUrl).toString();
        const packRes = await fetch(packUrl);
        if (!packRes.ok) {
          throw new Error(`Failed to fetch puzzle pack: HTTP ${packRes.status}`);
        }
        const packBytes = new Uint8Array(await packRes.arrayBuffer());
        const pack = await decodePublishedPuzzlePack(packBytes, packRef.sha256);

        for (const puzzle of pack.puzzles) {
          loaded.set(puzzle.payload.id, puzzle);
          catalogList.push({
            id: puzzle.payload.id,
            name: puzzle.payload.name,
            description: puzzle.payload.description,
            goal: puzzle.payload.goal,
            allowHold: puzzle.payload.allowedMechanics.allowHold,
            visibilityPolicy: puzzle.payload.visibilityPolicy,
          });
        }
      }

      setPuzzlesById(loaded);
      setCatalog(catalogList);
      setContentState('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('SHA-256')
        || msg.includes('corrupt')
        || msg.includes('mismatch')
        || msg.includes('checksum')
      ) {
        setContentState('corrupt-content');
      } else {
        setContentState('failed');
      }
      setContentError(msg);
    }
  }, []);

  useEffect(() => {
    void loadPuzzleContent();
  }, [loadPuzzleContent]);

  useEffect(() => {
    if (DEV_TOOLS_ENABLED && typeof window !== 'undefined') {
      (window as unknown as { __triggerPuzzleVictory?: (targetStars?: number) => void }).__triggerPuzzleVictory = (
        targetStars = 3,
      ) => {
        const curStarted = startedRef.current;
        if (!curStarted) return;
        const baseline = curStarted.referenceBaseline;
        const piecesUsed =
          targetStars === 3
            ? (baseline?.piecesUsed ?? 15)
            : targetStars === 2
              ? Math.ceil((baseline?.piecesUsed ?? 15) * 1.3)
              : (baseline?.piecesUsed ?? 15) + 8;
        const evalResult = calculatePuzzleStars(
          {
            solved: true,
            piecesUsed,
            score: 2450,
            ticksUsed: 800,
            goalKind: curStarted.goal.kind,
          },
          baseline,
        );
        clearInput();
        setEnd({
          levelId: curStarted.puzzleId ?? curStarted.levelId,
          solved: true,
          piecesUsed,
          score: 2450,
          ticksUsed: 800,
          linesCleared: 4,
          attemptId: 'dev-test',
        });
        setVictoryEvaluation(evalResult);
      };
    }

    return () => {
      clearInput();
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, [clearInput]);

  const handlePuzzleAction = useCallback((action: ActionType) => {
    if (!gameplayInputActiveRef.current) return;
    if (!actionAvailabilityFor(controlsAvailabilityRef.current, action).enabled) return;
    if (action === 'hardDrop') myFieldRef.current?.hardDrop();
    clientRef.current?.sendAction(action as PuzzleActionV1);
  }, []);

  // Keyboard controls stay active on hybrid devices even when on-screen controls are shown.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = actionForCode(bindingsRef.current, event.code);
      if (!action || !gameplayInputActiveRef.current) return;

      event.preventDefault();
      if (action === 'moveLeft') {
        if (keyboardInputRef.current.left) return;
        keyboardInputRef.current = { ...keyboardInputRef.current, left: true };
        emitCombinedInput();
      } else if (action === 'moveRight') {
        if (keyboardInputRef.current.right) return;
        keyboardInputRef.current = { ...keyboardInputRef.current, right: true };
        emitCombinedInput();
      } else if (action === 'softDrop') {
        if (keyboardInputRef.current.softDrop) return;
        keyboardInputRef.current = { ...keyboardInputRef.current, softDrop: true };
        emitCombinedInput();
      } else if (action === 'hardDrop') {
        handlePuzzleAction('hardDrop');
      } else if (action === 'rotateCW') {
        if (!event.repeat) handlePuzzleAction('rotateCW');
      } else if (action === 'rotateCCW') {
        if (!event.repeat) handlePuzzleAction('rotateCCW');
      } else if (action === 'hold') {
        handlePuzzleAction('hold');
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const action = actionForCode(bindingsRef.current, event.code);
      if (action === 'moveLeft') {
        keyboardInputRef.current = { ...keyboardInputRef.current, left: false };
        emitCombinedInput();
      } else if (action === 'moveRight') {
        keyboardInputRef.current = { ...keyboardInputRef.current, right: false };
        emitCombinedInput();
      } else if (action === 'softDrop') {
        keyboardInputRef.current = { ...keyboardInputRef.current, softDrop: false };
        emitCombinedInput();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      clearInput();
    };
  }, [clearInput, emitCombinedInput, handlePuzzleAction]);

  const startPuzzle = useCallback((puzzleId: string) => {
    clearInput();
    setEnd(null);
    setState(null);
    setVictoryEvaluation(null);
    setSelectedPuzzleId(puzzleId);
    setPicking(false);

    const puzzle = puzzlesByIdRef.current.get(puzzleId);
    if (!puzzle) return;

    clientRef.current?.dispose();
    const client = new PuzzleRuntimeClient();
    clientRef.current = client;

    const startedPayload: PuzzleStarted = {
      levelId: puzzle.payload.id,
      name: puzzle.payload.name,
      description: puzzle.payload.description,
      seed: stableSeedForPuzzle(puzzle.payload.id),
      goal: puzzle.payload.goal,
      allowHold: puzzle.payload.allowedMechanics.allowHold,
      visibilityPolicy: puzzle.payload.visibilityPolicy,
      puzzleId: puzzle.payload.id,
      timeline: puzzle.payload.timeline.map((event) => ({
        tick: event.kind === 'atTick' ? event.tick : undefined,
        afterPieces: event.kind === 'afterPieces' ? event.afterPieces : undefined,
        kind: event.hazard,
      })),
      benchmark: puzzle.payload.benchmark,
      referenceBaseline: puzzle.publicBaseline,
    };
    setStarted(startedPayload);

    client.onSnapshot((snap) => {
      const p = snap.gameState.players.puzzle;
      if (!p) return;
      setState({
        tick: snap.gameState.tick,
        board: p.board,
        activePiece: p.activePiece,
        holdPiece: p.holdPiece,
        canHold: p.canHold,
        swapCutoffRow: p.swapCutoffRow,
        allowHold: puzzle.payload.allowedMechanics.allowHold,
        holdFrozenUntilTick: p.holdFrozenUntilTick,
        activeEffects: p.activeEffects,
        nextQueue: p.nextQueue,
        score: p.score,
        linesCleared: p.linesCleared,
        piecesPlaced: snap.piecesUsed,
        pendingGarbage: p.pendingGarbage.reduce((sum, g) => sum + g.lines, 0),
        topOut: p.topOut,
        status: snap.status === 'solved' ? 'solved' : snap.status === 'top-out' ? 'topout' : 'playing',
        goal: puzzle.payload.goal,
        levelId: puzzle.payload.id,
        levelName: puzzle.payload.name,
        poisonBoard: p.poisonBoard,
        poisonSpread: p.poisonSpread,
        customNextPieceSourceCells: p.customNextPieceSourceCells,
        curtainDefenseLevel: p.curtainDefenseLevel,
        pendingHazardKinds: [],
      });
    });

    client.onFinished((event) => {
      clearInput();
      const endPayload: PuzzleEnd = {
        solved: event.result.solved,
        topOut: event.result.topOut,
        ticksUsed: event.result.ticksUsed,
        piecesUsed: event.result.piecesUsed,
        linesCleared: event.result.linesCleared,
        perfectClear: event.result.perfectClear,
        score: event.result.score,
        levelId: puzzle.payload.id,
      };
      setEnd(endPayload);
      if (event.result.solved) {
        const evalResult = calculatePuzzleStars(
          {
            solved: true,
            piecesUsed: event.result.piecesUsed,
            score: event.result.score,
            ticksUsed: event.result.ticksUsed,
            goalKind: puzzle.payload.goal.kind,
          },
          puzzle.publicBaseline,
        );
        setVictoryEvaluation(evalResult);
        savePuzzleRecord(
          puzzle.payload.id,
          evalResult.stars,
          event.result.piecesUsed,
          event.result.score,
          event.result.ticksUsed,
          puzzle.contentHash,
        );
        setRecords(loadAllPuzzleRecords());
      }
    });

    void client.load(puzzle);
  }, [clearInput]);

  const restartSame = useCallback(() => {
    const id = selectedPuzzleIdRef.current;
    if (id) startPuzzle(id);
  }, [startPuzzle]);

  const startRandom = useCallback(() => {
    if (catalog.length === 0) return;
    const randomEntry = catalog[Math.floor(Math.random() * catalog.length)];
    startPuzzle(randomEntry.id);
  }, [catalog, startPuzzle]);

  const pickAnother = useCallback(() => {
    clearInput();
    clientRef.current?.dispose();
    clientRef.current = null;
    setEnd(null);
    setState(null);
    setStarted(null);
    setVictoryEvaluation(null);
    setSelectedPuzzleId(null);
    setPicking(true);
  }, [clearInput]);

  const currentPuzzleIndex = catalog.findIndex(
    (c) => c.id === (started?.puzzleId ?? started?.levelId),
  );
  const nextPuzzleEntry =
    currentPuzzleIndex >= 0 && currentPuzzleIndex + 1 < catalog.length
      ? catalog[currentPuzzleIndex + 1]
      : null;

  const handleNextLevel = useCallback(() => {
    if (nextPuzzleEntry) {
      startPuzzle(nextPuzzleEntry.id);
    } else {
      pickAnother();
    }
  }, [nextPuzzleEntry, pickAnother, startPuzzle]);

  const totalStars = getTotalStarsEarned(records);

  const finished = puzzlePhase.kind === 'finished';

  useEffect(() => {
    if (!finished || (victoryEvaluation && end?.solved)) return;
    lossModalRef.current?.focus();
  }, [end?.solved, finished, victoryEvaluation]);

  const timelineHints = presentTimelineHints(
    (started?.timeline ?? []).map((event) => ({
      tick: typeof event.tick === 'number' ? event.tick : -1,
      ...(typeof event.afterPieces === 'number' ? { afterPieces: event.afterPieces } : {}),
      kind: event.kind,
    })),
    started?.visibilityPolicy,
    state?.tick ?? 0,
    state?.pendingHazardKinds ?? [],
    state?.piecesPlaced ?? 0,
  );

  const hasAuthoredHazards =
    (started?.timeline?.length ?? 0) > 0 &&
    started?.visibilityPolicy !== 'hidden' &&
    started?.visibilityPolicy !== 'unspecified';

  const handleTouchInput = useCallback((input: InputState) => {
    touchInputRef.current = input;
    emitCombinedInput();
  }, [emitCombinedInput]);

  const handleTouchAction = handlePuzzleAction;

  const layoutMode = usePlayfieldLayoutMode();
  const isNarrowLayout = layoutMode === 'phone';
  const viewportConstraints = usePuzzleViewportConstraints();
  const isShortWindow = viewportConstraints.short;
  const isLandscapeWindow = viewportConstraints.landscape;
  const useCompactHud = isShortWindow || isLandscapeWindow;
  const showHazardAside = hasAuthoredHazards && !isNarrowLayout && !isShortWindow && !isLandscapeWindow;
  const showHazardChip = hasAuthoredHazards && (isNarrowLayout || isShortWindow || isLandscapeWindow);

  const boardFitRef = useRef<HTMLDivElement>(null);
  const playfieldLayoutRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(CELL_SIZE);

  useLayoutEffect(() => {
    if (puzzlePhase.kind !== 'playing') return;
    const layoutNode = playfieldLayoutRef.current;
    const slotNode = boardFitRef.current;
    if (!layoutNode || !slotNode) return;

    const measure = () => {
      const layoutBox = layoutNode.getBoundingClientRect();
      const slotBox = slotNode.getBoundingClientRect();

      const heightBudget = slotBox.height;
      const widthBudget = Math.min(slotBox.width, layoutBox.width);
      if (!Number.isFinite(heightBudget) || !Number.isFinite(widthBudget) || heightBudget < 16 || widthBudget < 16) return;

      const next = fitMobilePlayfieldCellSize({ width: widthBudget, height: heightBudget });
      setCellSize((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(layoutNode);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [controlsPolicy.visible, puzzlePhase.kind, hasAuthoredHazards, useCompactHud, showHazardAside]);

  if (puzzlePhase.kind === 'picker') {
    return (
      <div className="relative flex min-h-dvh w-full flex-col items-center justify-start gap-4 bg-[#07080b] px-3 pt-4 pb-12 font-sans text-white select-none overflow-y-auto">
        <header className="sticky top-0 z-40 flex w-full max-w-md items-center justify-between rounded-xl border border-white/10 bg-[#08090d]/95 px-3 py-2 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setAppRoute('landing')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Menu</span>
          </button>
          <h1 className="text-sm sm:text-base font-black uppercase tracking-wider text-zinc-100">
            Choose a puzzle
          </h1>
          <div className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-950/40 px-2.5 py-1 text-xs font-black text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <span className="text-sm">⭐</span>
            <span>
              {totalStars} / {catalog.length * 3}
            </span>
          </div>
        </header>

        <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-white/10 bg-[#08090d] p-4 sm:p-5">
          {contentState === 'loading' && <p className="text-xs text-zinc-500">Loading puzzle catalog…</p>}
          {contentState === 'failed' && (
            <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-950/20 p-3">
              <p className="text-xs font-bold text-red-300">Failed to load puzzle catalog</p>
              {contentError && <p className="text-[11px] font-mono text-zinc-400">{contentError}</p>}
              <button
                type="button"
                onClick={loadPuzzleContent}
                className="mt-1 self-start rounded bg-red-800/40 px-2.5 py-1 text-xs font-bold text-red-200 hover:bg-red-800/60"
              >
                Retry
              </button>
            </div>
          )}
          {contentState === 'incompatible' && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
              <p className="text-xs font-bold text-amber-300">Incompatible puzzle version</p>
              {contentError && <p className="text-[11px] font-mono text-zinc-400">{contentError}</p>}
              <button
                type="button"
                onClick={loadPuzzleContent}
                className="mt-1 self-start rounded bg-amber-800/40 px-2.5 py-1 text-xs font-bold text-amber-200 hover:bg-amber-800/60"
              >
                Retry
              </button>
            </div>
          )}
          {contentState === 'corrupt-content' && (
            <div className="flex flex-col gap-2 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3">
              <p className="text-xs font-bold text-rose-300">Corrupt puzzle pack</p>
              {contentError && <p className="text-[11px] font-mono text-zinc-400">{contentError}</p>}
              <button
                type="button"
                onClick={loadPuzzleContent}
                className="mt-1 self-start rounded bg-rose-800/40 px-2.5 py-1 text-xs font-bold text-rose-200 hover:bg-rose-800/60"
              >
                Retry
              </button>
            </div>
          )}

          <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Practice</p>
          {catalog.map((entry, index) => {
            const record = records[entry.id];
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => startPuzzle(entry.id)}
                className="group flex flex-col items-start rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-left transition-all hover:border-amber-400/30 hover:bg-white/[0.07]"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 font-mono text-[10px] font-bold text-zinc-400">
                      {index + 1}
                    </span>
                    <span className="text-sm font-bold text-white group-hover:text-amber-200">
                      {entry.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-sm tracking-wider">
                    <span
                      className={
                        record && record.bestStars >= 1
                          ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                          : 'text-zinc-700'
                      }
                    >
                      ★
                    </span>
                    <span
                      className={
                        record && record.bestStars >= 2
                          ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                          : 'text-zinc-700'
                      }
                    >
                      ★
                    </span>
                    <span
                      className={
                        record && record.bestStars >= 3
                          ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                          : 'text-zinc-700'
                      }
                    >
                      ★
                    </span>
                  </div>
                </div>

                {entry.description && (
                  <span className="mt-1 text-xs text-zinc-400">{entry.description}</span>
                )}

                <div className="mt-2 flex w-full items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    {goalLabel(entry.goal)}
                    {entry.allowHold ? '' : ' · no hold'}
                    {' · '}
                    {entry.visibilityPolicy}
                  </span>
                  {record && (
                    <span className="font-mono text-[10px] font-bold text-amber-300">
                      {record.bestPieces !== undefined ? `${record.bestPieces} pcs` : ''}
                      {record.bestScore !== undefined
                        ? ` · ${record.bestScore.toLocaleString()} pts`
                        : ''}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={startRandom}
            className="rounded-lg bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/20"
          >
            Random curated
          </button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="puzzle-starting-screen relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[#07080b] p-4 text-center text-white">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-white/10 bg-[#08090d] p-6 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-300">Starting puzzle...</p>
          <p className="text-[10px] leading-5 text-zinc-500">Waiting for the first board snapshot.</p>
          <button
            type="button"
            onClick={pickAnother}
            className="min-h-[44px] rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.08]"
          >
            Levels
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shape-showdown-root puzzle-game-root relative flex h-dvh max-h-dvh min-h-0 w-full flex-col items-center justify-center overflow-hidden bg-[#07080b] p-1 sm:p-2 text-white select-none">
      <main
        inert={finished}
        className="shape-showdown-screen puzzle-game-screen relative z-10 flex h-full max-h-full min-h-0 w-full max-w-[480px] sm:max-w-[820px] md:max-w-[1020px] flex-col overflow-hidden"
      >
        {/* Header row (shrink-0) */}
        <header className="puzzle-game-header w-full shrink-0 flex items-center justify-between border-b border-white/10 bg-[#08090d]/95 px-2.5 sm:px-3 py-1.5 shadow-md backdrop-blur-md">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setAppRoute('landing')}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.08]"
            >
              <ArrowLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden min-[380px]:inline">Menu</span>
            </button>
            <button
              type="button"
              onClick={pickAnother}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.08]"
            >
              <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden min-[380px]:inline">Levels</span>
            </button>
          </div>

          <div className="flex flex-col items-center text-center min-w-0 px-1">
            <h1 className="truncate text-xs sm:text-base font-black uppercase tracking-wider max-w-[140px] sm:max-w-none">
              {started.name}
            </h1>
            <div className="mt-0.5 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] text-zinc-400">
              <span className="rounded bg-white/10 px-1.5 py-0.2 font-bold text-zinc-200">
                {goalLabel(started.goal)}
              </span>
              {started.allowHold === false && (
                <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[8px] font-bold text-amber-300">
                  No Hold
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <OnScreenControlsPreferenceButton
              onBeforeChange={(next) => {
                if (next === 'hidden') {
                  clearInput();
                  mobileControlsRef.current?.clearInput();
                }
              }}
            />
          </div>
        </header>

        {/* HUD and hazard status stay in normal flow except in landscape, where they move beside the board. */}
        <div className="puzzle-status-area">
        {/* HUD Row (shrink-0) */}
        {useCompactHud ? (
          <div className="puzzle-hud puzzle-hud--compact w-full shrink-0 mx-auto max-w-sm rounded-lg border border-white/10 bg-[#08090d]/95 px-2.5 py-1 mt-1 shadow-md">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <div className="flex items-center gap-1">
                <span className="font-sans text-[9px] font-bold uppercase text-zinc-400">Goal:</span>
                <span className="font-bold text-white">
                  {state?.linesCleared ?? 0}
                  {started.goal.lines !== undefined && (
                    <span className="text-zinc-500">/{started.goal.lines}L</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <span className="font-sans text-[9px] font-bold uppercase text-zinc-400">Pcs:</span>
                <span className="font-bold text-sky-300">{state?.piecesPlaced ?? 0}</span>
                {started.referenceBaseline && (
                  <span
                    className={`text-[9px] font-bold ${
                      (state?.piecesPlaced ?? 0) <= started.referenceBaseline.piecesUsed + 1
                        ? 'text-amber-400'
                        : 'text-zinc-500 line-through'
                    }`}
                  >
                    (≤{started.referenceBaseline.piecesUsed + 1}★)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <span className="font-sans text-[9px] font-bold uppercase text-zinc-400">Score:</span>
                <span className="font-bold text-emerald-400">{(state?.score ?? 0).toLocaleString()}</span>
              </div>
            </div>

            {started.referenceBaseline && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full transition-all duration-300 ${
                    (state?.piecesPlaced ?? 0) <= started.referenceBaseline.piecesUsed + 1
                      ? 'bg-gradient-to-r from-emerald-400 to-sky-400'
                      : 'bg-zinc-600'
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      ((state?.piecesPlaced ?? 0) / Math.max(1, started.referenceBaseline.piecesUsed + 1)) * 100,
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="puzzle-hud puzzle-hud--full w-full shrink-0 mx-auto max-w-3xl rounded-xl border border-white/10 bg-[#08090d]/95 p-3.5 mt-1.5 shadow-xl backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Your Score</span>
                  <span className="font-mono text-xl font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                    {(state?.score ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Pieces Placed</span>
                  <span className="font-mono text-xl font-black text-sky-300 drop-shadow-[0_0_8px_rgba(125,211,252,0.3)]">
                    {state?.piecesPlaced ?? 0}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Lines Cleared</span>
                  <span className="font-mono text-xl font-black text-white">
                    {state?.linesCleared ?? 0}
                    {started.goal.lines !== undefined && (
                      <span className="text-sm font-medium text-zinc-500"> / {started.goal.lines}</span>
                    )}
                  </span>
                </div>
              </div>

              {started.referenceBaseline && (
                <div
                  id="dev-victory-trigger"
                  onClick={
                    DEV_TOOLS_ENABLED
                      ? () => {
                          const baseline = started.referenceBaseline;
                          const piecesUsed = baseline?.piecesUsed ?? 15;
                          const evalResult = calculatePuzzleStars(
                            {
                              solved: true,
                              piecesUsed,
                              score: 2450,
                              ticksUsed: 800,
                              goalKind: started.goal.kind,
                            },
                            baseline,
                          );
                          setEnd({
                            levelId: started.puzzleId ?? started.levelId,
                            solved: true,
                            piecesUsed,
                            score: 2450,
                            ticksUsed: 800,
                            linesCleared: 4,
                            attemptId: 'dev-test',
                          });
                          setVictoryEvaluation(evalResult);
                        }
                      : undefined
                  }
                  className={`flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3.5 py-2 ${
                    DEV_TOOLS_ENABLED ? 'cursor-pointer select-none hover:bg-amber-500/[0.08]' : ''
                  }`}
                >
                  <div className="flex flex-col text-right">
                    <div className="flex items-center justify-end gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400">
                      <span>🎯</span>
                      <span>3★ Target Par</span>
                    </div>
                    <div className="font-mono text-xs font-bold text-zinc-200">
                      <span>≤ {started.referenceBaseline.piecesUsed + 1} pcs</span>
                      {started.referenceBaseline.score !== undefined && (
                        <span className="text-zinc-400"> · {started.referenceBaseline.score.toLocaleString()} pts</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {started.referenceBaseline && (
              <div className="mt-2.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (state?.piecesPlaced ?? 0) <= started.referenceBaseline.piecesUsed + 1
                        ? 'bg-gradient-to-r from-emerald-500 to-sky-400'
                        : 'bg-zinc-600'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        ((state?.piecesPlaced ?? 0) / Math.max(1, started.referenceBaseline.piecesUsed + 1)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compact Hazard Chip (shrink-0) */}
        {showHazardChip && (
          <div className="puzzle-hazard-chip w-full shrink-0 mx-auto max-w-sm flex items-center justify-between rounded-lg border border-white/10 bg-[#08090d]/90 px-2.5 py-0.5 mt-1 text-[11px] shadow-sm">
            <div className="flex items-center gap-1.5 truncate">
              {timelineHints.length > 0 ? (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                  </span>
                  <span className="font-bold text-rose-300 text-[10px] uppercase">Hazard:</span>
                  <span className="truncate text-zinc-200 text-[11px] font-bold">
                    {getEffectMeta(timelineHints[0].kind).name}
                  </span>
                  <span className="rounded bg-white/10 px-1 py-0.2 font-mono text-[9px] text-amber-300">
                    {getTriggerDetails(timelineHints[0], state?.piecesPlaced ?? 0, state?.tick ?? 0).label}
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-bold text-emerald-400 text-[11px]">All Hazards Cleared ✨</span>
                </>
              )}
            </div>
            {timelineHints.length > 1 && (
              <span className="ml-1 shrink-0 rounded bg-white/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-zinc-400">
                +{timelineHints.length - 1} more
              </span>
            )}
          </div>
        )}

        </div>

        {/* Playfield Area (flex-1 min-h-0 overflow-hidden) */}
        <div
          ref={playfieldLayoutRef}
          className="puzzle-playfield-area relative flex min-h-0 w-full flex-1 items-center justify-center gap-3 overflow-hidden py-0.5"
        >
          <div className="puzzle-board-slot relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
            {player ? (
              <GameField
                ref={myFieldRef}
                player={player}
                isMe
                title="Puzzle"
                showFunds={false}
                showPlayerName={false}
                showStats={false}
                showIncomingGarbage={false}
                cellSize={cellSize}
                boardFitRef={boardFitRef}
                hatchingEnabled={false}
                allowHold={started?.allowHold !== false}
                status={finished ? 'ended' : 'playing'}
              />
            ) : (
              <div className="flex h-[380px] w-[220px] items-center justify-center rounded-xl border border-white/10 bg-[#08090d] text-sm text-zinc-500">
                Loading puzzle…
              </div>
            )}
          </div>

          {showHazardAside && (
            <aside
              className="hidden min-[661px]:flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-white/10 bg-[#08090d]/95 p-3 shadow-2xl backdrop-blur-md"
              aria-label="Incoming hazards"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-1.5">
                  {timelineHints.length > 0 ? (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                    </span>
                  ) : (
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                  )}
                  <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-300">
                    Incoming Hazards
                  </h2>
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                    timelineHints.length > 0
                      ? 'bg-white/10 text-zinc-400'
                      : 'border border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                  }`}
                >
                  {timelineHints.length > 0 ? timelineHints.length : '✓'}
                </span>
              </div>

              {timelineHints.length > 0 ? (
                <div className="flex max-h-[380px] flex-col gap-1.5 overflow-y-auto pr-0.5">
                  {timelineHints.map((hint, index) => {
                    const meta = getEffectMeta(hint.kind);
                    const { label, isImminent, isUrgent } = getTriggerDetails(
                      hint,
                      state?.piecesPlaced ?? 0,
                      state?.tick ?? 0,
                    );

                    return (
                      <div
                        key={`${hint.kind}-${index}`}
                        className={`group flex items-center justify-between gap-2 rounded-lg border p-1.5 transition-all ${
                          isUrgent
                            ? `${meta.borderClass} ${meta.glowClass} bg-white/[0.08] ring-1 ring-rose-500/40`
                            : isImminent
                              ? `${meta.borderClass} bg-white/[0.05]`
                              : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm shadow-sm ${meta.badgeClass}`}
                            aria-hidden
                          >
                            {meta.icon}
                          </span>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-xs font-bold leading-none text-zinc-100">
                              {meta.name}
                            </span>
                            <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                              {meta.category}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
                            isUrgent
                              ? 'animate-pulse bg-rose-500/30 text-rose-200'
                              : isImminent
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-white/10 text-zinc-400'
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <span className="text-xl">✨</span>
                  <span className="mt-1 text-[11px] font-bold text-emerald-400">All Hazards Cleared</span>
                  <span className="mt-0.5 text-[9px] text-zinc-500">Focus on downstacking</span>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* On-Screen Touch Controls (shrink-0 mt-auto) */}
        {controlsPolicy.visible && gameplayInputActive && (
          <MobileControls
            ref={mobileControlsRef}
            onInput={handleTouchInput}
            onAction={handleTouchAction}
            availability={controlsAvailability}
          />
        )}
      </main>

      {victoryEvaluation && end?.solved && started && (
        <PuzzleVictoryModal
          evaluation={victoryEvaluation}
          levelName={started.name}
          piecesUsed={end.piecesUsed}
          score={end.score}
          linesCleared={end.linesCleared}
          hasNextLevel={Boolean(nextPuzzleEntry)}
          onNextLevel={handleNextLevel}
          onRetry={restartSame}
          onExit={pickAnother}
        />
      )}

      {finished && (!victoryEvaluation || !end?.solved) && (
        <div
          ref={lossModalRef}
          tabIndex={-1}
          role="alertdialog"
          aria-modal="true"
          aria-label="Puzzle result"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-rose-500/40 bg-[#0b0c13] p-6 text-center shadow-[0_0_50px_rgba(244,63,94,0.25)] ring-1 ring-rose-500/20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-500/10 text-3xl shadow-[0_0_20px_rgba(244,63,94,0.3)]">
              💀
            </div>
            <div>
              <p className="text-xl font-black uppercase tracking-wider text-rose-400">
                {end?.topOut || state?.status === 'topout'
                  ? 'Top Out!'
                  : 'Session Ended'}
              </p>
              <p className="mt-1.5 text-xs text-zinc-400">
                {end
                  ? `${end.linesCleared} lines cleared · ${end.piecesUsed} pieces placed`
                  : 'Stack reached the spawn ceiling'}
              </p>
            </div>
            <div className="mt-1 flex w-full flex-col gap-2">
              <button
                type="button"
                onPointerDown={(event) => {
                  retryPointerAllowedRef.current = !isPalmOrEdgeContact(event);
                }}
                onPointerCancel={() => {
                  retryPointerAllowedRef.current = false;
                }}
                onClick={(event) => {
                  if (event.detail > 0) {
                    const allowed = retryPointerAllowedRef.current;
                    retryPointerAllowedRef.current = false;
                    if (!allowed) return;
                  }
                  restartSame();
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-500 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-rose-900/40 transition-all hover:brightness-110 active:scale-98"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Try Again</span>
              </button>
              <div className="flex w-full gap-2">
                <button
                  type="button"
                  onClick={pickAnother}
                  className="flex min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 transition-all hover:bg-white/10 active:scale-98"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Levels</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAppRoute('landing')}
                  className="flex min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 transition-all hover:bg-white/10 active:scale-98"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Menu</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PuzzleScreen;

