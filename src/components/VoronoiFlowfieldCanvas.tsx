import React, { useEffect, useRef } from 'react';
import { BOARD_COLS, BOARD_VISIBLE_ROWS, CellValue } from '../types';
import { SHAPE_COLORS } from '../presentation/shapePalette';

/**
 * Toxic poison color variants chosen to contrast distinctly against all piece colors,
 * specifically avoiding clashes with T-piece (#a3e635 lime) and O-piece (#a78bfa purple).
 */
const POISON_COLORS: Record<number, string> = {
  1: '#EF4444', // Bio-Toxin Crimson Red
  2: '#EC4899', // Cyber-Glitch Neon Magenta
  3: '#6D28D9', // EMP Dark Plasma Violet
  4: '#059669', // Quantum Decay Slime Emerald
};

// Pre-computed static polygon unit circle angles for N=5, N=6, N=7
const POLYGON_BASE_ANGLES: Record<number, { cos: number; sin: number }[]> = {};
for (let sides = 5; sides <= 7; sides++) {
  POLYGON_BASE_ANGLES[sides] = Array.from({ length: sides }, (_, i) => {
    const a = (i * 2 * Math.PI) / sides;
    return { cos: Math.cos(a), sin: Math.sin(a) };
  });
}

// ── Cell map: pre-built occupancy index, rebuilt only when board state changes ──

interface CellEntry {
  r: number;
  c: number;
  sides: number;
  isPoison: boolean;
}

interface CellMap {
  /** Occupied cells grouped by fill color for batched path rendering. */
  colorBuckets: Map<string, CellEntry[]>;
  /** Subset of cells that are poisoned (for poison-specific overlays). */
  poisonCells: CellEntry[];
}

function buildCellMap(rows: CellValue[][], poison: number[][]): CellMap {
  const colorBuckets = new Map<string, CellEntry[]>();
  const poisonCells: CellEntry[] = [];

  for (let r = 0; r < BOARD_VISIBLE_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = rows[r]?.[c];
      const p = poison[r]?.[c] ?? 0;
      if (!cell && p === 0) continue;

      const isPoison = p > 0;
      const color = isPoison
        ? POISON_COLORS[p] || '#EF4444'
        : (cell ? SHAPE_COLORS[cell] || '#38bdf8' : '#38bdf8');
      const sides = 5 + ((r + c) % 3);
      const entry: CellEntry = { r, c, sides, isPoison };

      let bucket = colorBuckets.get(color);
      if (!bucket) {
        bucket = [];
        colorBuckets.set(color, bucket);
      }
      bucket.push(entry);

      if (isPoison) poisonCells.push(entry);
    }
  }

  return { colorBuckets, poisonCells };
}

// ── Polygon tracing: matches the exact per-vertex morphing math from flowfields_mockup.html ──

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sides: number,
  cellSize: number,
  time: number,
  wobbleSpeed: number,
  r: number,
): void {
  const baseAngles = POLYGON_BASE_ANGLES[sides];
  for (let i = 0; i < sides; i++) {
    const base = baseAngles[i];
    // Exact vertex-by-vertex morphing perturbation from mockup: (time * wobbleSpeed + i)
    const angleOffset = Math.sin(time * wobbleSpeed + i) * 0.15;
    const rad = cellSize * 0.42 + Math.cos(time * wobbleSpeed * 2 + r + i) * 3;

    const cosO = Math.cos(angleOffset);
    const sinO = Math.sin(angleOffset);
    const cosVal = base.cos * cosO - base.sin * sinO;
    const sinVal = base.sin * cosO + base.cos * sinO;

    const px = cx + rad * cosVal;
    const py = cy + rad * sinVal;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ── Component ──

interface VoronoiFlowfieldCanvasProps {
  visibleRows: CellValue[][];
  visiblePoison: number[][];
  cellSize: number;
}

export const VoronoiFlowfieldCanvas: React.FC<VoronoiFlowfieldCanvasProps> = React.memo(({
  visibleRows,
  visiblePoison,
  cellSize,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Stable refs prevent animation loop teardown on 60Hz state updates
  const visibleRowsRef = useRef(visibleRows);
  const visiblePoisonRef = useRef(visiblePoison);
  const cellSizeRef = useRef(cellSize);
  const timeRef = useRef(0);

  // Cached cell map — rebuilt only when board occupancy changes
  const cellMapRef = useRef<CellMap | null>(null);
  const cellMapDirtyRef = useRef(true);

  useEffect(() => {
    visibleRowsRef.current = visibleRows;
    visiblePoisonRef.current = visiblePoison;
    cellSizeRef.current = cellSize;
    cellMapDirtyRef.current = true;
  }, [visibleRows, visiblePoison, cellSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTimestamp: number | null = null;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = BOARD_COLS * cellSizeRef.current;
    const cssHeight = BOARD_VISIBLE_ROWS * cellSizeRef.current;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;

    const render = (timestamp: number) => {
      if (lastTimestamp === null) lastTimestamp = timestamp;
      const deltaSec = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
      lastTimestamp = timestamp;

      timeRef.current += deltaSec;
      const time = timeRef.current;
      const cs = cellSizeRef.current;
      const halfCs = cs / 2;

      // Rebuild cell map only when board state changed
      if (cellMapDirtyRef.current) {
        cellMapRef.current = buildCellMap(visibleRowsRef.current, visiblePoisonRef.current);
        cellMapDirtyRef.current = false;
      }
      const cellMap = cellMapRef.current!;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // ── Pass 1: Color-batched polygon fills ──
      for (const [color, cells] of cellMap.colorBuckets) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const { r, c, sides, isPoison } of cells) {
          const wobbleSpeed = isPoison ? 0.55 : 0.3325;
          const cx = c * cs + halfCs;
          const cy = r * cs + halfCs;
          tracePolygon(ctx, cx, cy, sides, cs, time, wobbleSpeed, r);
        }
        ctx.fill();
      }

      // ── Pass 2: Batched regular-cell strokes ──
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [, cells] of cellMap.colorBuckets) {
        for (const { r, c, sides, isPoison } of cells) {
          if (isPoison) continue;
          const wobbleSpeed = 0.3325;
          const cx = c * cs + halfCs;
          const cy = r * cs + halfCs;
          tracePolygon(ctx, cx, cy, sides, cs, time, wobbleSpeed, r);
        }
      }
      ctx.stroke();

      // ── Pass 3: Batched poison-cell strokes ──
      if (cellMap.poisonCells.length > 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const { r, c, sides } of cellMap.poisonCells) {
          const wobbleSpeed = 0.55;
          const cx = c * cs + halfCs;
          const cy = r * cs + halfCs;
          tracePolygon(ctx, cx, cy, sides, cs, time, wobbleSpeed, r);
        }
        ctx.stroke();

        // ── Pass 4: Batched poison toxic white circles ──
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (const { r, c } of cellMap.poisonCells) {
          const cx = c * cs + halfCs;
          const cy = r * cs + halfCs;
          const bX = cx + Math.sin(time * 3.6 + r + c) * 2.2;
          const bY = cy + Math.cos(time * 3.6 + r) * 2.2;
          const bRad = Math.max(2, cs * 0.22 + Math.sin(time * 4.2 + r) * 2.8);
          ctx.moveTo(bX + bRad, bY);
          ctx.arc(bX, bY, bRad, 0, Math.PI * 2);
        }
        ctx.stroke();
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: BOARD_COLS * cellSize,
        height: BOARD_VISIBLE_ROWS * cellSize,
        filter: 'drop-shadow(0 0 6px rgba(0, 0, 0, 0.4))',
      }}
      className="pointer-events-none absolute inset-0 z-0"
    />
  );
});
