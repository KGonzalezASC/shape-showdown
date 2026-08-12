import React, { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from 'react';
import {
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  BOARD_VISIBLE_ROWS,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
  MatchStatus,
} from '../types';
import { SHAPES } from '../tetris/shapes';
import { SHAPE_COLORS } from '../presentation/shapePalette';
import { BoardCanvasOverlay } from '../board/BoardCanvasOverlay';
import { buildBoardVisualModel } from '../board/boardVisualModel';
import type { ReplayCandidateOverlay } from '../replayCandidateOverlay';
import { styleForFieldEffect } from '../shop/effectStyles';
import {
  normalizeHeldPiece,
  pendingGarbageTotal,
  publicPlayersEqual,
  PublicPlayerState,
} from '../state/publicSnapshots';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';
import { VoronoiFlowfieldCanvas } from './VoronoiFlowfieldCanvas';
import { IncomingGarbageReadout } from './IncomingGarbageReadout';

interface GameFieldProps {
  player: PublicPlayerState;
  isMe: boolean;
  title: string;
  borderColorClass: string;
  shadowColorClass: string;
  opacityClass?: string;
  /** When omitted, uses `PlayfieldCellSizeContext` (desktop layout). */
  cellSize?: number;
  /** Mobile-only flexible slot used to fit the board around real header and notification height. */
  boardFitRef?: React.RefObject<HTMLDivElement | null>;
  status?: MatchStatus;
  hatchingEnabled: boolean;
  performanceId?: string;
  /** Replay diagnostics can show effect pills for both players, not only the local player. */
  showEffectPills?: boolean;
  /** Current replay tick used to show remaining effect duration. */
  effectTick?: number;
  /** Replay-only counterfactual placement overlay for the inspected player. */
  replayCandidateOverlay?: ReplayCandidateOverlay | null;
}

type LandingForecastPhase = 'hidden' | 'visible' | 'timeout' | 'hard-drop';

interface LandingForecastRender {
  cells: Array<{ x: number; y: number }>;
  phase: LandingForecastPhase;
}

type LandingForecastAction =
  | { type: 'NOOP' }
  | { type: 'HIDE' }
  | { type: 'HARD_DROP'; cells: Array<{ x: number; y: number }>; fallbackCells: Array<{ x: number; y: number }> }
  | { type: 'SHOW'; cells: Array<{ x: number; y: number }>; phase: 'visible' | 'timeout' }
  | { type: 'TIMEOUT' }
  | { type: 'COMPLETE'; completedPhase: 'timeout' | 'hard-drop'; ticksRemaining: number; cells: Array<{ x: number; y: number }> };

function landingForecastReducer(
  state: LandingForecastRender,
  action: LandingForecastAction,
): LandingForecastRender {
  switch (action.type) {
    case 'HIDE':
      return { cells: [], phase: 'hidden' };
    case 'HARD_DROP':
      return action.cells.length > 0
        ? { cells: action.cells, phase: 'hard-drop' }
        : state.cells.length > 0
          ? { ...state, phase: 'hard-drop' }
          : { cells: action.fallbackCells, phase: 'visible' };
    case 'SHOW':
      return state.phase === 'hard-drop' ? state : { cells: action.cells, phase: action.phase };
    case 'TIMEOUT':
      return state.cells.length > 0 ? { ...state, phase: 'timeout' } : state;
    case 'COMPLETE':
      if (state.phase !== action.completedPhase) return state;
      if (action.completedPhase === 'hard-drop' && action.ticksRemaining > 0) {
        return {
          cells: action.cells,
          phase: action.ticksRemaining <= LANDING_FORECAST_FADE_TICKS ? 'timeout' : 'visible',
        };
      }
      return { cells: [], phase: 'hidden' };
    case 'NOOP':
    default:
      return state;
  }
}

export interface GameFieldRef {
  shake: (type: 'soft' | 'medium') => void;
  hardDrop: () => void;
}

const HOLD_PREVIEW_SIZE = 4;
const LANDING_FORECAST_FADE_TICKS = 2;
const LANDING_FORECAST_HARD_DROP_STAGGER_MS = 12;
/** Curtain: rows just below the swap line that stay frosted/semi-visible; everything deeper is fully opaque. */
const CURTAIN_FROST_ROWS = 3;

function getPieceOffsets(piece: PublicPlayerState['activePiece']): [number, number][] {
  if (!piece) return [];
  return piece.customOffsets ?? SHAPES[piece.type][piece.rotation];
}

function getLandingForecastCells(player: PublicPlayerState): Array<{ x: number; y: number }> {
  const piece = player.activePiece;
  if (!piece) return [];

  const offsets = getPieceOffsets(piece);
  const collidesAt = (baseY: number): boolean => offsets.some(([dx, dy]) => {
    const x = piece.x + dx;
    const y = baseY + dy;
    return (
      x < 0 ||
      x >= BOARD_COLS ||
      y >= BOARD_ROWS ||
      (y >= 0 && player.board[y]?.[x] !== null)
    );
  });

  let landingY = piece.y;
  while (!collidesAt(landingY + 1)) landingY += 1;

  return offsets
    .map(([dx, dy]) => ({
      x: piece.x + dx,
      y: landingY + dy - BOARD_HIDDEN_ROWS,
    }))
    .filter(({ x, y }) => x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_VISIBLE_ROWS);
}

const GameField = forwardRef<GameFieldRef, GameFieldProps>(({
  player,
  isMe,
  title,
  borderColorClass,
  shadowColorClass,
  opacityClass = '',
  cellSize: cellSizeProp,
  boardFitRef,
  status = 'playing',
  hatchingEnabled,
  performanceId = title,
  showEffectPills = false,
  effectTick,
  replayCandidateOverlay = null,
}, ref) => {
  const activeEffects = player.activeEffects || [];
  const effectPills = useMemo(() => {
    const grouped = new Map<string, {
      effect: typeof activeEffects[number];
      count: number;
      remaining: number | null;
    }>();
    for (const effect of activeEffects) {
      const key = `${effect.kind}:${effect.label}`;
      const remaining = effectTick === undefined || effect.expiresAtTick === undefined
        ? null
        : Math.max(0, effect.expiresAtTick - effectTick);
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        if (remaining !== null) existing.remaining = existing.remaining === null ? remaining : Math.min(existing.remaining, remaining);
      } else {
        grouped.set(key, { effect, count: 1, remaining });
      }
    }
    return [...grouped.values()];
  }, [activeEffects, effectTick]);
  const layoutCellSize = useContext(PlayfieldCellSizeContext);
  const cellSize = cellSizeProp ?? layoutCellSize;
  const [shakeClass, setShakeClass] = useState('');
  const [rotationBlocked, dispatchRotationBlocked] = useReducer(
    (_state: boolean, next: boolean) => next,
    false,
  );
  const startHardDropForecastRef = useRef<() => void>(() => { });

  useEffect(() => {
    if (!player.activePiece?.isWildcard || !player.activePiece.rotationBlockedNonce) return;
    dispatchRotationBlocked(false);
    const showTimer = window.setTimeout(() => dispatchRotationBlocked(true), 10);
    const hideTimer = window.setTimeout(() => dispatchRotationBlocked(false), 420);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [player.activePiece?.isWildcard, player.activePiece?.rotationBlockedNonce]);

  useImperativeHandle(ref, () => ({
    shake(type: 'soft' | 'medium') {
      const cls = type === 'soft' ? 'animate-shake-soft' : 'animate-shake-medium';
      setShakeClass('');
      setTimeout(() => setShakeClass(cls), 10);
      setTimeout(() => setShakeClass(''), 400);
    },
    hardDrop() {
      startHardDropForecastRef.current();
    },
  }));
  const visualModel = useMemo(
    () => buildBoardVisualModel(player, { hatchingEnabled, isMe }),
    [player, hatchingEnabled, isMe],
  );
  const visibleRows = useMemo(
    () =>
      Array.from({ length: BOARD_VISIBLE_ROWS }, (_, y) =>
        Array.from(
          { length: BOARD_COLS },
          (_, x) => visualModel.cellAt(x, y)?.value ?? null,
        ),
      ),
    [visualModel],
  );
  const visiblePoison = useMemo(
    () =>
      Array.from({ length: BOARD_VISIBLE_ROWS }, (_, y) =>
        Array.from(
          { length: BOARD_COLS },
          (_, x) => visualModel.cellAt(x, y)?.poisonVariant ?? 0,
        ),
      ),
    [visualModel],
  );
  const calculatedLandingForecastCells = useMemo(() => {
    if (status !== 'playing' || !isMe) return [];
    return getLandingForecastCells(player);
  }, [status, isMe, player]);
  const landingForecastTicksRemaining = player.landingForecastTicksRemaining ?? 0;
  const [landingForecastRender, dispatchLandingForecast] = useReducer(
    landingForecastReducer,
    { cells: [], phase: 'hidden' as const },
  );

  const prevForecastTicksRef = useRef(landingForecastTicksRemaining);
  const prevHardDropTickRef = useRef(player.lastHardDropTick ?? -1);
  const lastCalculatedForecastCellsRef = useRef(calculatedLandingForecastCells);

  startHardDropForecastRef.current = () => {
    const hardDropCells = lastCalculatedForecastCellsRef.current.length > 0
      ? lastCalculatedForecastCellsRef.current
      : calculatedLandingForecastCells;
    dispatchLandingForecast({
      type: 'HARD_DROP',
      cells: hardDropCells,
      fallbackCells: calculatedLandingForecastCells,
    });
  };

  useEffect(() => {
    let action: LandingForecastAction = { type: 'NOOP' };
    if (status !== 'playing' || !isMe) {
      action = { type: 'HIDE' };
      prevForecastTicksRef.current = landingForecastTicksRemaining;
      prevHardDropTickRef.current = player.lastHardDropTick ?? -1;
      lastCalculatedForecastCellsRef.current = [];
    } else {
      const hardDropOccurred = (player.lastHardDropTick ?? -1) !== prevHardDropTickRef.current;
      if (hardDropOccurred) {
        action = {
          type: 'HARD_DROP',
          cells: lastCalculatedForecastCellsRef.current,
          fallbackCells: calculatedLandingForecastCells,
        };
        prevForecastTicksRef.current = landingForecastTicksRemaining;
        prevHardDropTickRef.current = player.lastHardDropTick ?? -1;
        lastCalculatedForecastCellsRef.current = calculatedLandingForecastCells;
      } else if (landingForecastTicksRemaining > 0) {
        const nextPhase: 'timeout' | 'visible' =
          landingForecastTicksRemaining <= LANDING_FORECAST_FADE_TICKS
            ? 'timeout'
            : 'visible';
        action = {
          type: 'SHOW',
          cells: calculatedLandingForecastCells,
          phase: nextPhase,
        };
        prevForecastTicksRef.current = landingForecastTicksRemaining;
        lastCalculatedForecastCellsRef.current = calculatedLandingForecastCells;
      } else {
        if (prevForecastTicksRef.current > 0) action = { type: 'TIMEOUT' };
        prevForecastTicksRef.current = landingForecastTicksRemaining;
        prevHardDropTickRef.current = player.lastHardDropTick ?? -1;
        lastCalculatedForecastCellsRef.current = calculatedLandingForecastCells;
      }
    }

    dispatchLandingForecast(action);
  }, [
    calculatedLandingForecastCells,
    isMe,
    landingForecastTicksRemaining,
    player.lastHardDropTick,
    player.activePiece,
    status,
  ]);
  const maxActiveVisibleRow = useMemo(() => {
    if (!player.activePiece) return null;
    const offsets = player.activePiece.customOffsets ?? SHAPES[player.activePiece.type][player.activePiece.rotation];
    return Math.max(
      ...offsets.map(([, dy]) => player.activePiece!.y + dy - BOARD_HIDDEN_ROWS),
    );
  }, [player.activePiece]);

  const cutoffRow = player.swapCutoffRow ?? HOLD_SWAP_CUTOFF_VISIBLE_ROW;
  const canHoldByHeight = maxActiveVisibleRow !== null && maxActiveVisibleRow < cutoffRow;
  const heldPiece = useMemo(() => normalizeHeldPiece(player.holdPiece), [player.holdPiece]);
  const holdPreview = useMemo(() => {
    if (!heldPiece) return null;
    const rotations = SHAPES[heldPiece.type];
    const cells = rotations?.[0];
    if (!cells) return null;
    const occupied = new Set(cells.map(([dx, dy]) => `${dx},${dy}`));
    return Array.from({ length: HOLD_PREVIEW_SIZE }, (_, y) =>
      Array.from({ length: HOLD_PREVIEW_SIZE }, (_, x) => occupied.has(`${x},${y}`)),
    );
  }, [heldPiece]);
  const holdPreviewCell = Math.max(5, Math.round(cellSize * 0.31));
  const swapZoneText = `Swap rows 0-${cutoffRow - 1}`;
  const swapLineY = cutoffRow * cellSize;
  const showSwapLine = isMe && cutoffRow > 0 && cutoffRow < BOARD_VISIBLE_ROWS;

  const storageFrozen = isMe && activeEffects.some((e) => e.kind === 'freeze');
  const snagged = isMe && !!player.snagHardDropBlocked;
  const holdPoisoned = !!player.activePiece?.poisoned;
  const holdStatus = storageFrozen
    ? { text: 'Frozen — no store/swap', tone: 'text-sky-300' }
    : holdPoisoned
      ? { text: 'Poisoned — no hold', tone: 'text-fuchsia-300' }
      : snagged
        ? { text: 'Snagged — no hard drop', tone: 'text-orange-300' }
        : !player.activePiece
          ? { text: 'No active piece', tone: 'text-zinc-300' }
          : !player.canHold
            ? { text: 'Used this piece', tone: 'text-amber-300' }
            : !canHoldByHeight
              ? { text: 'Past swap line', tone: 'text-rose-300' }
              : { text: 'Ready', tone: 'text-emerald-300' };

  return (
    <div className={`relative flex h-full w-full flex-col ${opacityClass}`}>
      {/* ── Header row: title / active-effect pills / line counter ── */}
      <div className="mb-2 flex items-end justify-between gap-1.5">
        <h2
          className={`shrink-0 text-sm font-bold uppercase tracking-widest ${isMe ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {title}
        </h2>

        {/* Active-effect pills — only renders when effects are present */}
        {(isMe || showEffectPills) && effectPills.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1 overflow-hidden px-1">
            {effectPills.map(({ effect, count, remaining }) => {
              const style = styleForFieldEffect(effect);
              return (
                <span
                  key={effect.id}
                  className={[
                    'inline-flex items-center gap-0.5 border px-1.5 py-0.5',
                    'font-mono text-[9px] font-bold uppercase tracking-wider leading-none',
                    'animate-pulse',
                    style.bgClass,
                    style.borderClass,
                    style.textClass,
                    style.glowClass ?? '',
                  ].join(' ')}
                >
                  {effect.icon && <span className="text-[10px] leading-none">{effect.icon}</span>}
                  {effect.label}
                  {count > 1 && <span className="opacity-80">×{count}</span>}
                  {remaining !== null && <span className="opacity-80">{remaining}t</span>}
                </span>
              );
            })}
          </div>
        )}

        <span className="shrink-0 border border-white/10 bg-[#171919] px-2 py-0.5 font-mono text-[10px] tabular-nums text-zinc-300">
          {player.linesCleared} clears
        </span>
      </div>
      <div className="mb-1 flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
        <span>
          Funds <strong className={isMe ? 'text-cyan-200' : 'text-rose-200'}>{player.funds}</strong>
        </span>
        <span>
          Score <strong className={isMe ? 'text-emerald-200' : 'text-rose-200'}>{player.score}</strong>
        </span>
      </div>
      <IncomingGarbageReadout
        fieldTitle={title}
        lines={pendingGarbageTotal(player.pendingGarbage)}
        magnetLevel={player.magnetPermanentStacks ?? 0}
      />
      <div
        ref={boardFitRef}
        data-board-fit-slot={boardFitRef ? 'mobile' : undefined}
        className={boardFitRef
          ? 'relative flex min-h-0 w-full flex-1 items-center justify-center'
          : 'relative self-center'}
      >
        <div
          className={`relative overflow-hidden border ${borderColorClass} shadow-2xl ${shadowColorClass} ${shakeClass || ''}`}
          style={{ width: BOARD_COLS * cellSize, height: BOARD_VISIBLE_ROWS * cellSize }}
        >
          {showSwapLine && (
            <>
              <div
                className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-dashed border-white/90"
                style={{ top: swapLineY }}
              />
              <div
                className="pointer-events-none absolute right-1 z-20 -translate-y-1/2 border border-white/10 bg-black/80 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-white/80"
                style={{ top: swapLineY }}
              >
                swap line
              </div>
            </>
          )}
          {/* ── Curtain: a frosted band right below the swap line, fully opaque beyond it ── */}
          {visualModel.curtain && (
            <>
              {/* Frosted/blurred transition band — semi-visible for the first few rows */}
              <div
                className="pointer-events-none absolute left-0 right-0 bottom-0 z-20 overflow-hidden border-t-2 border-indigo-300/50 bg-indigo-950/30 backdrop-blur-md"
                style={{ top: swapLineY }}
              />
              {/* Solid blackout — impossible to see through — covers everything past the band */}
              <div
                className="pointer-events-none absolute left-0 right-0 bottom-0 z-30 flex items-center justify-center bg-[#0b0b16]"
                style={{ top: swapLineY + CURTAIN_FROST_ROWS * cellSize }}
              >
                <span className="select-none text-4xl opacity-50 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]">
                  🎭
                </span>
              </div>
            </>
          )}
          <div
            className="arena-grid grid relative"
            data-board-renderer="canvas"
            style={{
              gridTemplateColumns: `repeat(${BOARD_COLS}, ${cellSize}px)`,
              width: BOARD_COLS * cellSize,
              height: BOARD_VISIBLE_ROWS * cellSize,
              backgroundColor: '#101112',
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
              backgroundSize: `${cellSize}px ${cellSize}px`,
            }}
          >
            <VoronoiFlowfieldCanvas
              visibleRows={visibleRows}
              visiblePoison={visiblePoison}
              activeCells={visualModel.activeCells}
              activePieceKey={visualModel.activePieceKey}
              cellSize={cellSize}
              poisonSpread={player.poisonSpread}
              board={player.board}
              activePiece={player.activePiece}
              performanceId={performanceId}
            />
            <BoardCanvasOverlay
              model={visualModel}
              cellSize={cellSize}
              performanceId={performanceId}
            />
          </div>
          {landingForecastRender.phase !== 'hidden' && landingForecastRender.cells.length > 0 && (
            <svg
              className={`pointer-events-none absolute inset-0 z-10 overflow-visible ${landingForecastRender.phase === 'timeout'
                  ? 'landing-forecast-layer-timeout'
                  : landingForecastRender.phase === 'hard-drop'
                    ? 'landing-forecast-layer-hard-drop'
                    : ''
                }`}
              width={BOARD_COLS * cellSize}
              height={BOARD_VISIBLE_ROWS * cellSize}
              aria-label="Landing forecast"
            >
              {landingForecastRender.cells.map(({ x, y }, index) => (
                <rect
                  key={`landing-forecast-${x}-${y}`}
                  className={`landing-forecast-cell ${landingForecastRender.phase === 'timeout'
                      ? 'landing-forecast-timeout'
                      : landingForecastRender.phase === 'hard-drop'
                        ? 'landing-forecast-hard-drop'
                        : ''
                    }`}
                  onAnimationEnd={
                    (landingForecastRender.phase === 'timeout' || landingForecastRender.phase === 'hard-drop') &&
                      index === landingForecastRender.cells.length - 1
                      ? () => {
                        const completedPhase = landingForecastRender.phase;
                        dispatchLandingForecast({
                          type: 'COMPLETE',
                          completedPhase,
                          ticksRemaining: landingForecastTicksRemaining,
                          cells: calculatedLandingForecastCells,
                        });
                      }
                      : undefined
                  }
                  style={
                    landingForecastRender.phase === 'hard-drop'
                      ? { animationDelay: `${index * LANDING_FORECAST_HARD_DROP_STAGGER_MS}ms` }
                      : undefined
                  }
                  x={x * cellSize + 2}
                  y={y * cellSize + 2}
                  width={Math.max(1, cellSize - 4)}
                  height={Math.max(1, cellSize - 4)}
                  rx={Math.max(2, Math.round(cellSize * 0.12))}
                />
              ))}
            </svg>
          )}
          {replayCandidateOverlay && (
            <svg
              className="pointer-events-none absolute inset-0 z-[15] overflow-visible"
              width={BOARD_COLS * cellSize}
              height={BOARD_VISIBLE_ROWS * cellSize}
              aria-label="Solver candidate placement preview"
            >
              {replayCandidateOverlay.alternative?.cells.map(({ x, y }) => (
                <rect
                  key={`candidate-alternative-${x}-${y}`}
                  className="landing-forecast-cell replay-candidate-alternative"
                  x={x * cellSize + 2}
                  y={y * cellSize + 2}
                  width={Math.max(1, cellSize - 4)}
                  height={Math.max(1, cellSize - 4)}
                  rx={Math.max(2, Math.round(cellSize * 0.12))}
                />
              ))}
              {replayCandidateOverlay.botChoice.cells.map(({ x, y }) => (
                <rect
                  key={`candidate-bot-choice-${x}-${y}`}
                  className={replayCandidateOverlay.botChoice.lineClearCount === 0
                    ? 'replay-bot-choice-cell'
                    : 'replay-bot-choice-line-clear-cell'}
                  x={x * cellSize + 2}
                  y={y * cellSize + 2}
                  width={Math.max(1, cellSize - 4)}
                  height={Math.max(1, cellSize - 4)}
                  rx={Math.max(2, Math.round(cellSize * 0.12))}
                />
              ))}
            </svg>
          )}
          {status === 'playing' && isMe && landingForecastRender.phase !== 'hidden' && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
              <span className={`landing-forecast-label ${landingForecastRender.phase === 'timeout'
                  ? 'landing-forecast-timeout'
                  : landingForecastRender.phase === 'hard-drop'
                    ? 'landing-forecast-hard-drop'
                    : ''
                }`}>Landing forecast</span>
            </div>
          )}
          {rotationBlocked && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center">
              <span className="wildcard-rotation-blocked rounded border border-rose-200/80 bg-rose-950/90 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-rose-100">
                rotation blocked
              </span>
            </div>
          )}
        </div>
      </div>
      {isMe && (
        <div
          className="mt-1.5 flex items-center justify-between gap-2 border border-white/10 bg-[#101212]/90 px-2 py-1.5"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Storage (Shift)</p>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${holdStatus.tone}`}>{holdStatus.text}</p>
            <p className="text-[9px] font-mono text-zinc-400">{swapZoneText}</p>
          </div>
          <div className="shrink-0 border border-white/15 bg-zinc-950/80 p-1">
            {holdPreview ? (
              <div className="relative">
                <div
                  className="grid"
                  style={{ gridTemplateColumns: `repeat(${HOLD_PREVIEW_SIZE}, ${holdPreviewCell}px)` }}
                >
                  {holdPreview.flatMap((row, y) =>
                    row.map((filled, x) => {
                      const poisonVariant =
                        filled && heldPiece?.poisoned ? (heldPiece.poisonVariant ?? 1) : 0;
                      if (poisonVariant > 0) {
                        return (
                          <div
                            key={`hold-${x}-${y}`}
                            className={`poison-cell poison-cell-v${Math.min(poisonVariant, 4)}`}
                            style={{ width: holdPreviewCell, height: holdPreviewCell }}
                          />
                        );
                      }
                      return (
                        <div
                          key={`hold-${x}-${y}`}
                          className={`relative ${filled ? '' : 'arena-cell-empty'}`}
                          style={{ width: holdPreviewCell, height: holdPreviewCell }}
                        >
                          {filled && heldPiece && (
                            <div
                              className="shape-token absolute inset-[7%]"
                              style={{ backgroundColor: SHAPE_COLORS[heldPiece.type] }}
                            >
                              <div className="shape-token-highlight pointer-events-none absolute inset-0" aria-hidden />
                              {hatchingEnabled && !heldPiece.poisoned && !heldPiece.bomber && (
                                <div className="tetromino-hatch pointer-events-none absolute inset-0" aria-hidden />
                              )}
                              {heldPiece.bomber && (
                                <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-[8px] leading-none animate-bomb-wiggle">
                                  💣
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>
            ) : (
              <div
                className="flex items-center justify-center border border-dashed border-zinc-700 text-[10px] font-mono text-zinc-500"
                style={{ width: HOLD_PREVIEW_SIZE * holdPreviewCell, height: HOLD_PREVIEW_SIZE * holdPreviewCell }}
              >
                EMPTY
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default React.memo(GameField, (prev, next) => {
  if (
    prev.isMe !== next.isMe ||
    prev.title !== next.title ||
    prev.cellSize !== next.cellSize ||
    prev.boardFitRef !== next.boardFitRef ||
    prev.status !== next.status ||
    prev.hatchingEnabled !== next.hatchingEnabled
  ) {
    return false;
  }

  if (prev.replayCandidateOverlay !== next.replayCandidateOverlay) return false;

  return publicPlayersEqual(prev.player, next.player);
});
