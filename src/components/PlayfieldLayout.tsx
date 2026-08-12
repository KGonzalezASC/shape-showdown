import React, { useLayoutEffect, useRef, useState } from 'react';
import { fitDualPlayfieldCellSize } from './PlayfieldCellSizer';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';

interface PlayfieldLayoutProps {
  children: React.ReactNode;
}

export const PlayfieldLayout: React.FC<PlayfieldLayoutProps> = ({ children }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const updateCellSize = () => {
      requestAnimationFrame(() => {
        const outerElement = outerRef.current;
        if (!outerElement) return;
        const { width, height } = outerElement.getBoundingClientRect();
        if (width < 1 || height < 1) return;

        const nextCellSize = fitDualPlayfieldCellSize({ width, height });
        setCellSize((previous) => (previous === nextCellSize ? previous : nextCellSize));
      });
    };

    updateCellSize();
    const observer = new ResizeObserver(updateCellSize);
    observer.observe(outer);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className="mx-auto flex h-full min-h-0 w-full max-w-[1180px] min-w-0 flex-1 items-center justify-center overflow-visible px-2 py-2"
    >
      {cellSize !== null && (
        <PlayfieldCellSizeContext.Provider value={cellSize}>
          <div className="grid h-full w-full min-w-0 grid-cols-[8.875rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-3">
            {children}
          </div>
        </PlayfieldCellSizeContext.Provider>
      )}
    </div>
  );
};
