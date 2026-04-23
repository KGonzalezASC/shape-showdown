import React, { useLayoutEffect, useRef, useState } from 'react';
import { BOARD_COLS, BOARD_VISIBLE_ROWS, CELL_SIZE } from '../types';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';

type Dims = { scale: number; iw: number; ih: number };

function fitCellSizeForDualBoard(outerWidth: number, outerHeight: number): number {
  // Keep the original full-size boards on roomy desktop layouts.
  if (outerWidth >= 1180) return CELL_SIZE;

  const gap = outerWidth >= 640 ? 24 : 12;
  const horizontalPad = 16;
  const verticalPad = 8;
  const fromW = (outerWidth - horizontalPad - gap) / (2 * BOARD_COLS);
  const fromH = (outerHeight - verticalPad) / BOARD_VISIBLE_ROWS;
  return Math.max(24, Math.min(CELL_SIZE, Math.floor(Math.min(fromW, fromH))));
}

/**
 * Measures intrinsic size of children (two game fields + gap), then scales down
 * with transform-origin top-left so everything fits the available flex area without page scroll.
 * Cell size is reduced on narrow viewports (before scaling) so boards stay readable.
 */
export const GameFieldsLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(CELL_SIZE);
  const [dims, setDims] = useState<Dims>({ scale: 1, iw: 832, ih: 640 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const updateCell = () => {
      const { width: ow, height: oh } = outer.getBoundingClientRect();
      if (ow < 1 || oh < 1) return;
      setCellSize(fitCellSizeForDualBoard(ow, oh));
    };

    updateCell();
    const ro = new ResizeObserver(updateCell);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const iw = inner.scrollWidth;
      const ih = inner.scrollHeight;
      const { width: ow, height: oh } = outer.getBoundingClientRect();
      if (iw < 1 || ih < 1 || ow < 1 || oh < 1) return;
      const s = Math.min(1, ow / iw, oh / ih) * 0.995;
      setDims({ scale: s, iw, ih });
    };

    update();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(update);
    });

    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [cellSize]);

  const { scale, iw, ih } = dims;

  return (
    <div
      ref={outerRef}
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-1 py-1 sm:px-2 sm:py-2"
    >
      <div
        className="overflow-hidden rounded-sm"
        style={{
          width: Math.max(1, iw * scale),
          height: Math.max(1, ih * scale),
        }}
      >
        <PlayfieldCellSizeContext.Provider value={cellSize}>
          <div
            ref={innerRef}
            className="flex w-max items-start justify-center gap-3 sm:gap-6"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
            {children}
          </div>
        </PlayfieldCellSizeContext.Provider>
      </div>
    </div>
  );
};
