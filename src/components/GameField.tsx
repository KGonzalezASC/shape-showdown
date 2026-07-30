import React, { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  BOARD_VISIBLE_ROWS,
  CellValue,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
  MatchStatus,
} from '../types';
import { SHAPES } from '../tetris/shapes';
import { SHAPE_COLORS } from '../presentation/shapePalette';
import { styleForFieldEffect } from '../shop/effectStyles';
import { normalizeHeldPiece, PublicPlayerState } from '../state/publicSnapshots';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';
import { VoronoiFlowfieldCanvas } from './VoronoiFlowfieldCanvas';

interface GameFieldProps {
  player: PublicPlayerState;
  isMe: boolean;
  title: string;
  borderColorClass: string;
  shadowColorClass: string;
  opacityClass?: string;
  /** When omitted, uses `PlayfieldCellSizeContext` (desktop layout). */
  cellSize?: number;
  status?: MatchStatus;
  hatchingEnabled: boolean;
}

export interface GameFieldRef {
  shake: (type: 'soft' | 'medium') => void;
}

const MemoizedCell = React.memo(
  ({
    color,
    poison,
    bomber,
    magnetAura,
    size,
    hatchingEnabled,
  }: {
    color: CellValue;
    poison: number;
    bomber: boolean;
    magnetAura: boolean;
    size: number;
    hatchingEnabled: boolean;
  }) => {
    return (
      <div
        className={`arena-cell relative pointer-events-none ${color || poison > 0 ? '' : 'arena-cell-empty'}`}
        style={{ width: size, height: size }}
        title={bomber ? 'Bomber' : undefined}
      >
        {(color || poison > 0) && (
          <div className="pointer-events-none absolute inset-0">
            {hatchingEnabled && !poison && !bomber && !magnetAura && (
              <div className="tetromino-hatch pointer-events-none absolute inset-0" aria-hidden />
            )}
            {magnetAura && <div className="magnet-pull-ring pointer-events-none absolute inset-0 z-10" aria-hidden />}
            {bomber && (
              <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-[11px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                💣
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);

const HOLD_PREVIEW_SIZE = 4;
/** Curtain: rows just below the swap line that stay frosted/semi-visible; everything deeper is fully opaque. */
const CURTAIN_FROST_ROWS = 3;

const GameField = forwardRef<GameFieldRef, GameFieldProps>(({
  player,
  isMe,
  title,
  borderColorClass,
  shadowColorClass,
  opacityClass = '',
  cellSize: cellSizeProp,
  status = 'playing',
  hatchingEnabled,
}, ref) => {
  const activeEffects = player.activeEffects || [];
  const layoutCellSize = useContext(PlayfieldCellSizeContext);
  const cellSize = cellSizeProp ?? layoutCellSize;
  const [shakeClass, setShakeClass] = useState('');
  const [rotationBlocked, setRotationBlocked] = useState(false);

  useEffect(() => {
    if (!player.activePiece?.isWildcard || !player.activePiece.rotationBlockedNonce) return;
    setRotationBlocked(false);
    const showTimer = window.setTimeout(() => setRotationBlocked(true), 10);
    const hideTimer = window.setTimeout(() => setRotationBlocked(false), 420);
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
    }
  }));
  const visibleRows = useMemo(() => {
    const rows = player.board.slice(BOARD_HIDDEN_ROWS, BOARD_HIDDEN_ROWS + BOARD_VISIBLE_ROWS).map((r) => [...r]);
    if (player.activePiece) {
      // This mirrors spawn orientation for client visuals; server remains authority.
      const offsets = player.activePiece.customOffsets ?? SHAPES[player.activePiece.type][player.activePiece.rotation];
      for (const [dx, dy] of offsets) {
        const x = player.activePiece.x + dx;
        const y = player.activePiece.y + dy - BOARD_HIDDEN_ROWS;
        if (y >= 0 && y < BOARD_VISIBLE_ROWS && x >= 0 && x < BOARD_COLS) {
          rows[y][x] = player.activePiece.isWildcard ? 'W' : player.activePiece.type;
        }
      }
    }
    return rows;
  }, [player.board, player.activePiece]);

  // Parallel poison overlay grid (0 = clean, 1..4 = poison variant), mirroring
  // visibleRows. The poisoned active piece previews as wave-1 poison.
  const visiblePoison = useMemo(() => {
    const src = player.poisonBoard;
    const rows: number[][] = Array.from({ length: BOARD_VISIBLE_ROWS }, (_, y) =>
      Array.from({ length: BOARD_COLS }, (_, x) =>
        src ? (src[BOARD_HIDDEN_ROWS + y]?.[x] ?? 0) : 0,
      ),
    );
    if (player.activePiece?.poisoned) {
      // The whole piece is a single poison type — the variant (1–4) chosen for
      // this Elixir event. Every cell it later infects keeps this same colour.
      const variant = player.activePiece.poisonVariant ?? 1;
      const offsets = player.activePiece.customOffsets ?? SHAPES[player.activePiece.type][player.activePiece.rotation];
      for (const [dx, dy] of offsets) {
        const x = player.activePiece.x + dx;
        const y = player.activePiece.y + dy - BOARD_HIDDEN_ROWS;
        if (y >= 0 && y < BOARD_VISIBLE_ROWS && x >= 0 && x < BOARD_COLS) {
          rows[y][x] = variant;
        }
      }
    }
    return rows;
  }, [player.poisonBoard, player.activePiece]);

  const visibleBomber = useMemo(() => {
    const rows: boolean[][] = Array.from({ length: BOARD_VISIBLE_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => false),
    );
    if (player.activePiece?.bomber) {
      const offsets = player.activePiece.customOffsets ?? SHAPES[player.activePiece.type][player.activePiece.rotation];
      for (const [dx, dy] of offsets) {
        const x = player.activePiece.x + dx;
        const y = player.activePiece.y + dy - BOARD_HIDDEN_ROWS;
        if (y >= 0 && y < BOARD_VISIBLE_ROWS && x >= 0 && x < BOARD_COLS) {
          rows[y][x] = true;
        }
      }
    }
    return rows;
  }, [player.activePiece]);

  const visibleMagnetAura = useMemo(() => {
    const rows: boolean[][] = Array.from({ length: BOARD_VISIBLE_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => false),
    );
    const pulled =
      (player.magnetPermanentStacks ?? 0) > 0 || (player.magnetPieceBoost ?? 0) > 0;
    if (player.activePiece && pulled) {
      const offsets = player.activePiece.customOffsets ?? SHAPES[player.activePiece.type][player.activePiece.rotation];
      for (const [dx, dy] of offsets) {
        const x = player.activePiece.x + dx;
        const y = player.activePiece.y + dy - BOARD_HIDDEN_ROWS;
        if (y >= 0 && y < BOARD_VISIBLE_ROWS && x >= 0 && x < BOARD_COLS) {
          rows[y][x] = true;
        }
      }
    }
    return rows;
  }, [player.activePiece, player.magnetPermanentStacks, player.magnetPieceBoost]);

  const wildcardSourceOutline = useMemo(() => {
    const sourceCells = player.customNextPieceSourceCells;
    if (!sourceCells || sourceCells.length === 0) return [];

    const visible = sourceCells
      .map(([x, y]) => ({ x, y: y - BOARD_HIDDEN_ROWS }))
      .filter(({ x, y }) => x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_VISIBLE_ROWS);
    const occupied = new Set(visible.map(({ x, y }) => `${x},${y}`));
    const edges: Array<[number, number, number, number]> = [];

    for (const { x, y } of visible) {
      if (!occupied.has(`${x},${y - 1}`)) edges.push([x, y, x + 1, y]);
      if (!occupied.has(`${x + 1},${y}`)) edges.push([x + 1, y, x + 1, y + 1]);
      if (!occupied.has(`${x},${y + 1}`)) edges.push([x, y + 1, x + 1, y + 1]);
      if (!occupied.has(`${x - 1},${y}`)) edges.push([x, y, x, y + 1]);
    }
    return edges;
  }, [player.customNextPieceSourceCells]);

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
  const compactStorageLayout = cellSize <= 20;
  const swapZoneText = compactStorageLayout
    ? `Swap rows 0-${cutoffRow - 1}`
    : `Swap zone rows 0-${cutoffRow - 1}`;
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
    <div className={`relative ${opacityClass}`}>
      {/* ── Header row: title / active-effect pills / line counter ── */}
      <div className="mb-2 flex items-end justify-between gap-1.5">
        <h2
          className={`shrink-0 text-sm font-bold uppercase tracking-widest ${isMe ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {title}
        </h2>

        {/* Active-effect pills — only renders when effects are present */}
        {isMe && activeEffects.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1 overflow-hidden px-1">
            {activeEffects.map((effect) => {
              const style = styleForFieldEffect(effect);
              return (
              <span
                key={effect.id}
                className={[
                  'inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5',
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
              </span>
              );
            })}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-white/10 bg-zinc-900/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            {BOARD_COLS}×{BOARD_VISIBLE_ROWS} arena
          </span>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] tabular-nums text-zinc-300">
            {player.linesCleared} clears
          </span>
        </div>
      </div>
      <div
        className={`relative overflow-hidden rounded-xl border-2 ${borderColorClass} shadow-2xl ${shadowColorClass} ${shakeClass || ''}`}
        style={{ width: BOARD_COLS * cellSize, height: BOARD_VISIBLE_ROWS * cellSize }}
      >
        {showSwapLine && (
          <>
            <div
              className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-dashed border-white/90"
              style={{ top: swapLineY }}
            />
            <div
              className="pointer-events-none absolute right-1 z-10 -translate-y-1/2 rounded bg-black/70 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-white/80"
              style={{ top: swapLineY }}
            >
              swap line
            </div>
          </>
        )}
        {/* ── Curtain: a frosted band right below the swap line, fully opaque beyond it ── */}
        {isMe && activeEffects.some((e) => e.kind === 'curtain') && (
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
          style={{ gridTemplateColumns: `repeat(${BOARD_COLS}, ${cellSize}px)` }}
        >
          <VoronoiFlowfieldCanvas
            visibleRows={visibleRows}
            visiblePoison={visiblePoison}
            cellSize={cellSize}
          />
          {visibleRows.flatMap((row, y) =>
            row.map((cell, x) => (
                <MemoizedCell
                  key={`${x}-${y}`}
                  color={cell}
                  poison={visiblePoison[y][x]}
                  bomber={visibleBomber[y][x]}
                  magnetAura={visibleMagnetAura[y][x]}
                  size={cellSize}
                  hatchingEnabled={hatchingEnabled}
                />
              )),
          )}
        </div>
        {wildcardSourceOutline.length > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 z-20 overflow-visible"
            width={BOARD_COLS * cellSize}
            height={BOARD_VISIBLE_ROWS * cellSize}
            aria-label="Selected puzzle-piece source shape"
          >
            {wildcardSourceOutline.map(([x1, y1, x2, y2], index) => (
              <line
                key={`${x1}-${y1}-${x2}-${y2}-${index}`}
                className="wildcard-source-outline"
                x1={x1 * cellSize}
                y1={y1 * cellSize}
                x2={x2 * cellSize}
                y2={y2 * cellSize}
              />
            ))}
          </svg>
        )}
        {rotationBlocked && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center">
            <span className="wildcard-rotation-blocked rounded border border-rose-200/80 bg-rose-950/90 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-rose-100">
              rotation blocked
            </span>
          </div>
        )}
      </div>
      {isMe && (
        <div
          className={`mt-1.5 rounded-lg border border-white/10 bg-black/25 px-2 py-1 ${
            compactStorageLayout ? 'flex flex-col gap-1.5' : 'flex items-center justify-between gap-2'
          }`}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Storage (Shift)</p>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${holdStatus.tone}`}>{holdStatus.text}</p>
            <p className="text-[9px] font-mono text-zinc-400">{swapZoneText}</p>
          </div>
          <div className={`${compactStorageLayout ? 'self-end' : 'shrink-0'} rounded border border-white/15 bg-zinc-950/80 p-1`}>
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
                                <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-[8px] leading-none">
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
                className="flex items-center justify-center rounded border border-dashed border-zinc-700 text-[10px] font-mono text-zinc-500"
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
    prev.status !== next.status ||
    prev.hatchingEnabled !== next.hatchingEnabled
  ) {
    return false;
  }

  const pA = prev.player;
  const pB = next.player;
  if (pA === pB) return true;

  if (JSON.stringify(pA.activeEffects) !== JSON.stringify(pB.activeEffects)) {
    return false;
  }

  if (
    pA.holdPiece?.type !== pB.holdPiece?.type ||
    !!pA.holdPiece?.poisoned !== !!pB.holdPiece?.poisoned ||
    pA.holdPiece?.poisonVariant !== pB.holdPiece?.poisonVariant ||
    !!pA.holdPiece?.bomber !== !!pB.holdPiece?.bomber ||
    pA.canHold !== pB.canHold ||
    pA.linesCleared !== pB.linesCleared ||
    pA.swapCutoffRow !== pB.swapCutoffRow ||
    pA.holdFrozenUntilTick !== pB.holdFrozenUntilTick ||
    pA.magnetPermanentStacks !== pB.magnetPermanentStacks ||
    pA.magnetPieceBoost !== pB.magnetPieceBoost ||
    pA.snagHardDropBlocked !== pB.snagHardDropBlocked ||
    pA.pieceHasHardDropped !== pB.pieceHasHardDropped ||
    pA.tectonicShiftNextStepTick !== pB.tectonicShiftNextStepTick
  ) {
    return false;
  }

  const aA = pA.activePiece;
  const aB = pB.activePiece;
  if ((!aA && aB) || (aA && !aB)) return false;
  if (aA && aB) {
    if (
      aA.x !== aB.x ||
      aA.y !== aB.y ||
      aA.rotation !== aB.rotation ||
      aA.type !== aB.type ||
      !!aA.poisoned !== !!aB.poisoned ||
      aA.poisonVariant !== aB.poisonVariant ||
      !!aA.bomber !== !!aB.bomber ||
      aA.rotationBlockedNonce !== aB.rotationBlockedNonce ||
      JSON.stringify(aA.customOffsets) !== JSON.stringify(aB.customOffsets)
    ) {
      return false;
    }
  }

  if (JSON.stringify(pA.customNextPieceSourceCells) !== JSON.stringify(pB.customNextPieceSourceCells)) {
    return false;
  }

  for (let y = 0; y < pA.board.length; y++) {
    const rowA = pA.board[y];
    const rowB = pB.board[y];
    for (let x = 0; x < rowA.length; x++) {
      if (rowA[x] !== rowB[x]) return false;
    }
  }

  // Diff the poison overlay — the spread changes it without touching `board`.
  const poA = pA.poisonBoard;
  const poB = pB.poisonBoard;
  if (poA || poB) {
    if (!poA || !poB || poA.length !== poB.length) return false;
    for (let y = 0; y < poA.length; y++) {
      const rowA = poA[y];
      const rowB = poB[y];
      for (let x = 0; x < rowA.length; x++) {
        if (rowA[x] !== rowB[x]) return false;
      }
    }
  }

  return true;
});
