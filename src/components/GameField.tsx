import React, { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  ActiveFieldEffect,
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  BOARD_VISIBLE_ROWS,
  CellValue,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
  PlayerState,
  TetrominoType,
  MatchStatus,
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
  status?: MatchStatus;
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
  W: 'bg-fuchsia-500',
};

const GHOST_COLORS: Record<Exclude<CellValue, null>, string> = {
  I: 'border-cyan-400/40 bg-cyan-400/10',
  J: 'border-blue-500/40 bg-blue-500/10',
  L: 'border-orange-400/40 bg-orange-400/10',
  O: 'border-yellow-300/40 bg-yellow-300/10',
  S: 'border-green-400/40 bg-green-400/10',
  T: 'border-purple-400/40 bg-purple-400/10',
  Z: 'border-red-500/40 bg-red-500/10',
  G: 'border-zinc-500/40 bg-zinc-500/10',
  W: 'border-fuchsia-500/40 bg-fuchsia-500/10',
};

const POISON_GHOST_COLORS: Record<number, string> = {
  1: 'border-fuchsia-400/40 bg-fuchsia-500/10',
  2: 'border-lime-400/40 bg-lime-500/10',
  3: 'border-indigo-400/40 bg-indigo-500/10',
  4: 'border-teal-400/40 bg-teal-500/10',
};

const MemoizedCell = React.memo(
  ({
    color,
    poison,
    bomber,
    magnetAura,
    size,
    ghostType,
    ghostPoisonVariant,
    ghostBomber,
  }: {
    color: CellValue;
    poison: number;
    bomber: boolean;
    magnetAura: boolean;
    size: number;
    ghostType?: TetrominoType | 'W' | null;
    ghostPoisonVariant?: number;
    ghostBomber?: boolean;
  }) => {
    if (poison > 0 && color !== null) {
      // Synced (no per-cell stagger) so poisoned cells share the same sprite frame,
      // like the Gen III battle poison overlay on a contiguous region.
      return (
        <div
          className={`poison-cell poison-cell-v${Math.min(Math.max(poison, 1), 4)}`}
          style={{ width: size, height: size }}
        />
      );
    }

    if (color === null && ghostType) {
      const isPoisoned = ghostPoisonVariant !== undefined && ghostPoisonVariant > 0;
      const ghostCls = isPoisoned
        ? POISON_GHOST_COLORS[Math.min(Math.max(ghostPoisonVariant, 1), 4)]
        : GHOST_COLORS[ghostType];

      return (
        <div className="relative" style={{ width: size, height: size }}>
          <div
            className={`absolute inset-0 border-2 border-dashed ${ghostCls}`}
          />
          {ghostBomber && (
            <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-[10px] opacity-35 leading-none">
              💣
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="relative" style={{ width: size, height: size }} title={bomber ? 'Bomber' : undefined}>
        <div
          className={`absolute inset-0 border border-black/20 ${color ? COLORS[color] : 'bg-zinc-900'}`}
        />
        {magnetAura && <div className="magnet-pull-ring pointer-events-none absolute -inset-px z-10" aria-hidden />}
        {bomber && (
          <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-[11px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
            💣
          </span>
        )}
      </div>
    );
  },
);

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
  status = 'playing',
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

  const ghostY = useMemo(() => {
    if (!player.activePiece) return null;
    const piece = { ...player.activePiece };
    const getCellsLocal = (p: typeof piece) => {
      if (p.customOffsets) {
        return p.customOffsets.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }));
      }
      return SHAPES[p.type][p.rotation].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }));
    };
    const collidesLocal = (p: typeof piece) => {
      for (const cell of getCellsLocal(p)) {
        if (cell.x < 0 || cell.x >= BOARD_COLS || cell.y >= BOARD_ROWS) return true;
        if (cell.y >= 0 && player.board[cell.y][cell.x] !== null) return true;
      }
      return false;
    };
    while (!collidesLocal(piece)) {
      piece.y += 1;
    }
    return piece.y - 1;
  }, [player.activePiece, player.board]);

  const ghostCells = useMemo(() => {
    const cells = new Map<string, { type: TetrominoType | 'W'; poisoned?: boolean; poisonVariant?: number; bomber?: boolean }>();
    if (status !== 'playing' || player.tectonicShiftNextStepTick != null) {
      return cells;
    }
    if (!player.activePiece || ghostY === null || ghostY === player.activePiece.y) {
      return cells;
    }
    const offsets = player.activePiece.customOffsets ?? SHAPES[player.activePiece.type][player.activePiece.rotation];
    const type = player.activePiece.isWildcard ? 'W' : player.activePiece.type;
    const poisoned = player.activePiece.poisoned;
    const poisonVariant = player.activePiece.poisonVariant;
    const bomber = player.activePiece.bomber;

    for (const [dx, dy] of offsets) {
      const x = player.activePiece.x + dx;
      const y = ghostY + dy - BOARD_HIDDEN_ROWS;
      if (y >= 0 && y < BOARD_VISIBLE_ROWS && x >= 0 && x < BOARD_COLS) {
        cells.set(`${x},${y}`, { type, poisoned, poisonVariant, bomber });
      }
    }
    return cells;
  }, [player.activePiece, ghostY, status, player.tectonicShiftNextStepTick]);

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

  const storageFrozen = isMe && activeEffects.some((e) => e.id.startsWith('freeze-active'));
  const snagged = isMe && !!player.snagHardDropBlocked;
  const holdStatus = storageFrozen
    ? { text: 'Frozen — no store/swap', tone: 'text-sky-300' }
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
            row.map((cell, x) => {
              const ghost = ghostCells.get(`${x},${y}`);
              return (
                <MemoizedCell
                  key={`${x}-${y}`}
                  color={cell}
                  poison={visiblePoison[y][x]}
                  bomber={visibleBomber[y][x]}
                  magnetAura={visibleMagnetAura[y][x]}
                  size={cellSize}
                  ghostType={ghost?.type}
                  ghostPoisonVariant={ghost?.poisoned ? ghost.poisonVariant : undefined}
                  ghostBomber={ghost?.bomber}
                />
              );
            }),
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
    prev.cellSize !== next.cellSize ||
    prev.status !== next.status
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
