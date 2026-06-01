import React, { forwardRef, useContext, useImperativeHandle, useMemo, useState } from 'react';
import {
  ActiveFieldEffect,
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_VISIBLE_ROWS,
  CellValue,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
  PlayerState,
  TetrominoType,
} from '../types';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';

interface GameFieldProps {
  player: PlayerState;
  isMe: boolean;
  title: string;
  borderColorClass: string;
  shadowColorClass: string;
  opacityClass?: string;
  /** When omitted, uses `PlayfieldCellSizeContext` (desktop layout). */
  cellSize?: number;
}

export interface GameFieldRef {
  shake: (type: 'soft' | 'medium') => void;
}

const COLORS: Record<Exclude<CellValue, null>, string> = {
  I: 'bg-cyan-400',
  J: 'bg-blue-500',
  L: 'bg-orange-400',
  O: 'bg-yellow-300',
  S: 'bg-green-400',
  T: 'bg-purple-400',
  Z: 'bg-red-500',
  G: 'bg-zinc-500',
};

const MemoizedCell = React.memo(({ color, size }: { color: CellValue; size: number }) => (
  <div
    className={`border border-black/20 ${color ? COLORS[color] : 'bg-zinc-900'}`}
    style={{ width: size, height: size }}
  />
));

const SHAPES: Record<TetrominoType, [number, number][][]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
};

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
}, ref) => {
  const activeEffects = player.activeEffects || [];
  const layoutCellSize = useContext(PlayfieldCellSizeContext);
  const cellSize = cellSizeProp ?? layoutCellSize;
  const [shakeClass, setShakeClass] = useState('');

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
      for (const [dx, dy] of SHAPES[player.activePiece.type][player.activePiece.rotation]) {
        const x = player.activePiece.x + dx;
        const y = player.activePiece.y + dy - BOARD_HIDDEN_ROWS;
        if (y >= 0 && y < BOARD_VISIBLE_ROWS && x >= 0 && x < BOARD_COLS) {
          rows[y][x] = player.activePiece.type;
        }
      }
    }
    return rows;
  }, [player.board, player.activePiece]);

  const maxActiveVisibleRow = useMemo(() => {
    if (!player.activePiece) return null;
    return Math.max(
      ...SHAPES[player.activePiece.type][player.activePiece.rotation].map(([, dy]) => player.activePiece!.y + dy - BOARD_HIDDEN_ROWS),
    );
  }, [player.activePiece]);

  const cutoffRow = player.swapCutoffRow ?? HOLD_SWAP_CUTOFF_VISIBLE_ROW;
  const canHoldByHeight = maxActiveVisibleRow !== null && maxActiveVisibleRow < cutoffRow;
  const holdPreview = useMemo(() => {
    if (!player.holdPiece) return null;
    const occupied = new Set(SHAPES[player.holdPiece][0].map(([dx, dy]) => `${dx},${dy}`));
    return Array.from({ length: HOLD_PREVIEW_SIZE }, (_, y) =>
      Array.from({ length: HOLD_PREVIEW_SIZE }, (_, x) => occupied.has(`${x},${y}`)),
    );
  }, [player.holdPiece]);
  const holdPreviewCell = Math.max(5, Math.round(cellSize * 0.31));
  const compactStorageLayout = cellSize <= 20;
  const swapZoneText = compactStorageLayout
    ? `Swap rows 0-${cutoffRow - 1}`
    : `Swap zone rows 0-${cutoffRow - 1}`;
  const swapLineY = cutoffRow * cellSize;
  const showSwapLine = isMe && cutoffRow > 0 && cutoffRow < BOARD_VISIBLE_ROWS;

  const holdStatus = !player.activePiece
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
            {activeEffects.map((effect) => (
              <span
                key={effect.id}
                className={[
                  'inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5',
                  'font-mono text-[9px] font-bold uppercase tracking-wider leading-none',
                  'animate-pulse',
                  effect.bgClass,
                  effect.borderClass,
                  effect.textClass ?? 'text-white',
                  effect.glowClass ?? '',
                ].join(' ')}
              >
                {effect.icon && <span className="text-[10px] leading-none">{effect.icon}</span>}
                {effect.label}
              </span>
            ))}
          </div>
        )}

        <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] tabular-nums text-zinc-300">
          {player.linesCleared} lines
        </span>
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
        {isMe && activeEffects.some((e) => e.id.startsWith('curtain-active')) && (
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
          className="grid bg-[#141414]"
          style={{ gridTemplateColumns: `repeat(${BOARD_COLS}, ${cellSize}px)` }}
        >
          {visibleRows.flatMap((row, y) =>
            row.map((cell, x) => (
              <MemoizedCell key={`${x}-${y}`} color={cell} size={cellSize} />
            )),
          )}
        </div>
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
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${HOLD_PREVIEW_SIZE}, ${holdPreviewCell}px)` }}
              >
                {holdPreview.flatMap((row, y) =>
                  row.map((filled, x) => (
                    <div
                      key={`hold-${x}-${y}`}
                      className={`border border-black/30 ${filled && player.holdPiece ? COLORS[player.holdPiece] : 'bg-zinc-900'}`}
                      style={{ width: holdPreviewCell, height: holdPreviewCell }}
                    />
                  )),
                )}
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
    prev.cellSize !== next.cellSize
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
    pA.holdPiece !== pB.holdPiece ||
    pA.canHold !== pB.canHold ||
    pA.linesCleared !== pB.linesCleared ||
    pA.swapCutoffRow !== pB.swapCutoffRow
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
      aA.type !== aB.type
    ) {
      return false;
    }
  }

  for (let y = 0; y < pA.board.length; y++) {
    const rowA = pA.board[y];
    const rowB = pB.board[y];
    for (let x = 0; x < rowA.length; x++) {
      if (rowA[x] !== rowB[x]) return false;
    }
  }

  return true;
});
