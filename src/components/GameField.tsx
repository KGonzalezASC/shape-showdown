import React, { useContext, useMemo } from 'react';
import {
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
  shakeClass?: string;
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

const GameField: React.FC<GameFieldProps> = ({
  player,
  isMe,
  title,
  borderColorClass,
  shadowColorClass,
  opacityClass = '',
  cellSize: cellSizeProp,
  shakeClass = '',
}) => {
  const layoutCellSize = useContext(PlayfieldCellSizeContext);
  const cellSize = cellSizeProp ?? layoutCellSize;
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

  const canHoldByHeight = maxActiveVisibleRow !== null && maxActiveVisibleRow < HOLD_SWAP_CUTOFF_VISIBLE_ROW;
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
    ? `Swap rows 0-${HOLD_SWAP_CUTOFF_VISIBLE_ROW - 1}`
    : `Swap zone rows 0-${HOLD_SWAP_CUTOFF_VISIBLE_ROW - 1}`;
  const swapLineY = HOLD_SWAP_CUTOFF_VISIBLE_ROW * cellSize;
  const showSwapLine = isMe && HOLD_SWAP_CUTOFF_VISIBLE_ROW > 0 && HOLD_SWAP_CUTOFF_VISIBLE_ROW < BOARD_VISIBLE_ROWS;

  const holdStatus = !player.activePiece
    ? { text: 'No active piece', tone: 'text-zinc-300' }
    : !player.canHold
      ? { text: 'Used this piece', tone: 'text-amber-300' }
      : !canHoldByHeight
        ? { text: 'Past swap line', tone: 'text-rose-300' }
        : { text: 'Ready', tone: 'text-emerald-300' };

  return (
    <div className={`relative ${opacityClass}`}>
      <div className="mb-2 flex justify-between items-end">
        <h2
          className={`text-sm font-bold uppercase tracking-widest ${isMe ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {title}
        </h2>
        <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-mono tabular-nums">
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
};

export default React.memo(GameField, (prev, next) => {
  return prev.isMe === next.isMe &&
         prev.title === next.title &&
         prev.cellSize === next.cellSize &&
         prev.shakeClass === next.shakeClass &&
         JSON.stringify(prev.player) === JSON.stringify(next.player);
});
