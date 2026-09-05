import type { CSSProperties } from 'react';
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from '../types';

/**
 * Continuous playfield hairlines.
 * CSS square-tile gradients drop vertical segments; full-span sizes still alias.
 * Explicit SVG lines stay continuous on both axes.
 */
export function BoardGridLines({
  cellSize,
  className,
  style,
}: {
  cellSize: number;
  className?: string;
  style?: CSSProperties;
}) {
  const width = BOARD_COLS * cellSize;
  const height = BOARD_VISIBLE_ROWS * cellSize;
  const stroke = 'var(--ss-grid-line, rgba(255,255,255,0.18))';

  const verticals = Array.from({ length: BOARD_COLS + 1 }, (_, column) => {
    const x = column * cellSize + 0.5;
    return (
      <line
        key={`v-${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke={stroke}
        strokeWidth={1}
      />
    );
  });

  const horizontals = Array.from({ length: BOARD_VISIBLE_ROWS + 1 }, (_, row) => {
    const y = row * cellSize + 0.5;
    return (
      <line
        key={`h-${y}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke={stroke}
        strokeWidth={1}
      />
    );
  });

  return (
    <svg
      aria-hidden
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
    >
      {verticals}
      {horizontals}
    </svg>
  );
}
