import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Sparkles, Swords } from 'lucide-react';
import {
  createNameDropPlan,
  NAME_DROP_COLUMNS,
  NAME_DROP_ROWS,
  type NameDropPiece,
} from '../nameDrop/nameDrop';

const PIECE_COLORS: Record<NameDropPiece['type'], string> = {
  I: 'bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.85)]',
  J: 'bg-blue-400 shadow-[0_0_14px_rgba(96,165,250,0.85)]',
  L: 'bg-orange-300 shadow-[0_0_14px_rgba(253,186,116,0.85)]',
  O: 'bg-yellow-200 shadow-[0_0_14px_rgba(253,224,71,0.85)]',
  S: 'bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.85)]',
  T: 'bg-fuchsia-300 shadow-[0_0_14px_rgba(240,171,252,0.85)]',
  Z: 'bg-rose-300 shadow-[0_0_14px_rgba(253,164,175,0.85)]',
};

function useFittedCellSize(containerRef: React.RefObject<HTMLDivElement | null>): number {
  const [cellSize, setCellSize] = useState(12);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      const next = Math.max(1, Math.min(42, Math.floor(Math.min(
        width / NAME_DROP_COLUMNS,
        height / NAME_DROP_ROWS,
      ))));
      setCellSize((previous) => (previous === next ? previous : next));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  return cellSize;
}

export interface NameDropShowcaseProps {
  name?: string;
  statusLabel?: string;
}

/** Landing-page visual: deterministic tetromino drops reveal a compact block-letter name. */
export const NameDropShowcase: React.FC<NameDropShowcaseProps> = ({
  name = 'SHAPE SHOWDOWN',
  statusLabel = 'Auto-playing showcase',
}) => {
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const cellSize = useFittedCellSize(boardAreaRef);
  const plan = useMemo(() => createNameDropPlan(name), [name]);
  const [cycle, setCycle] = useState(0);

  useLayoutEffect(() => {
    const timer = window.setTimeout(() => setCycle((value) => value + 1), plan.totalDurationMs);
    return () => window.clearTimeout(timer);
  }, [cycle, plan.totalDurationMs]);

  const boardStyle = {
    width: NAME_DROP_COLUMNS * cellSize,
    height: NAME_DROP_ROWS * cellSize,
    gridTemplateColumns: `repeat(${NAME_DROP_COLUMNS}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${NAME_DROP_ROWS}, ${cellSize}px)`,
  } as React.CSSProperties;

  return (
    <main className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-[#08090d] text-white">
      <div className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.16)] sm:h-12 sm:w-12">
            <Swords className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300/70 sm:text-xs">
              Shape Showdown
            </p>
            <p className="truncate text-sm font-semibold text-zinc-200 sm:text-base">
              Fall into place.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 sm:px-4 sm:py-2 sm:text-xs">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
          <span className="sm:hidden">Live animation</span>
          <span className="hidden sm:inline">{statusLabel}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 pb-5 sm:px-8 sm:pb-10">
        <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 sm:mb-6 sm:text-xs">
          <Sparkles className="h-3.5 w-3.5 text-fuchsia-300/80" />
          <span>Build your legend</span>
          <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
        </div>

        <div ref={boardAreaRef} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          <div
            key={cycle}
            className="name-drop-board relative grid shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#10131a] shadow-[0_0_80px_rgba(16,185,129,0.08),inset_0_0_40px_rgba(255,255,255,0.02)] sm:rounded-2xl"
            style={boardStyle}
            role="img"
            aria-label={`Animated tetromino showcase spelling ${plan.name}`}
          >
            {Array.from({ length: NAME_DROP_COLUMNS * NAME_DROP_ROWS }, (_, index) => (
              <div key={index} className="name-drop-grid-cell" aria-hidden="true" />
            ))}

            {plan.pieces.map((piece, index) => (
              <div
                key={`piece-${index}`}
                className="name-drop-falling-piece pointer-events-none absolute z-20"
                style={{
                  left: piece.x * cellSize,
                  top: piece.y * cellSize,
                  width: cellSize * 4,
                  height: cellSize * 4,
                  animationDelay: `${piece.delayMs}ms`,
                  ['--name-drop-start' as string]: `${-Math.max(4, piece.y + 4) * cellSize}px`,
                  ['--name-drop-duration' as string]: `${piece.durationMs}ms`,
                }}
                aria-hidden="true"
              >
                {piece.cells.map((cell) => (
                  <div
                    key={`${cell.x},${cell.y}`}
                    className={`absolute border border-white/20 ${PIECE_COLORS[piece.type]}`}
                    style={{
                      left: (cell.x - piece.x) * cellSize,
                      top: (cell.y - piece.y) * cellSize,
                      width: cellSize,
                      height: cellSize,
                    }}
                  />
                ))}
              </div>
            ))}

            <div className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] border border-white/5 bg-gradient-to-b from-white/[0.03] via-transparent to-emerald-300/[0.03]" />
          </div>
        </div>

        <div className="mt-5 text-center sm:mt-7">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-zinc-500 sm:text-sm">{plan.name}</p>
          <p className="mt-2 text-xs text-zinc-600 sm:text-sm">
            {plan.pieces.length} playable tetrominoes, arranged into something bigger.
          </p>
        </div>
      </div>
    </main>
  );
};

export default NameDropShowcase;
