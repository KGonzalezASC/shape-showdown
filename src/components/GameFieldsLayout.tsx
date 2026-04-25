import React, { useLayoutEffect, useRef, useState } from 'react';
import { BOARD_COLS, BOARD_VISIBLE_ROWS, CELL_SIZE } from '../types';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';

function fitCellSizeForDualBoard(outerWidth: number, outerHeight: number): number {
  const gap = outerWidth >= 640 ? 24 : 12;
  const horizontalPad = 16;
  // Exact chrome height: title(~28px) + storage row layout(~58px) = 86px.
  // We use 90 to give a tiny bit of breathing room and ensure the board scales as large as mathematically possible without overflowing.
  const verticalPad = 90;
  const fromW = (outerWidth - horizontalPad - gap) / (2 * BOARD_COLS);
  const fromH = (outerHeight - verticalPad) / BOARD_VISIBLE_ROWS;
  const MIN_CELL_SIZE = 22;
  const MAX_CELL_SIZE = 48;
  return Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, Math.floor(Math.min(fromW, fromH))));
}

export const GameFieldsLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const updateCell = () => {
      requestAnimationFrame(() => {
        const outerEl = outerRef.current;
        if (!outerEl) return;
        const { width: ow, height: oh } = outerEl.getBoundingClientRect();
        if (ow < 1 || oh < 1) return;
        const newCellSize = fitCellSizeForDualBoard(ow, oh);
        setCellSize((prev) => (prev !== newCellSize ? newCellSize : prev));
      });
    };

    updateCell();
    const ro = new ResizeObserver(updateCell);
    ro.observe(outer);

    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-1 py-1 sm:px-2 sm:py-2"
    >
      {cellSize !== null && (
        <PlayfieldCellSizeContext.Provider value={cellSize}>
          <div className="flex w-max items-start justify-center gap-3 sm:gap-6">
            {children}
          </div>
        </PlayfieldCellSizeContext.Provider>
      )}
    </div>
  );
};
