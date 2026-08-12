import React, { memo, startTransition, useEffect, useRef, useState } from 'react';

/** Lobby / idle: light dim so the Voronoi pattern reads clearly. */
export const BG_SCRIM_IDLE = 0.35;
/** Playing: stronger focus on the playfields. */
export const BG_SCRIM_MATCH = 0.72;
/** Match-start blur is disabled for now; idle and active play stay crisp. */
export const BG_BLUR_IDLE = '0px';
export const BG_BLUR_MATCH = '0px';

const BG_ROWS = 54;
const BG_COLS = 54;
const CELL_SIZE = 4;
const GAP = 1;
const TILE_PX = (CELL_SIZE + GAP) * BG_ROWS;

const GRAYS: ReadonlyArray<readonly [number, number]> = [
  [26, 29],
  [32, 37],
  [42, 50],
  [46, 56],
  [54, 66],
];

const POLYGON_BASE_ANGLES: Record<number, Array<{ cos: number; sin: number }>> = {};
for (let sides = 5; sides <= 7; sides++) {
  POLYGON_BASE_ANGLES[sides] = Array.from({ length: sides }, (_, i) => {
    const a = (i * 2 * Math.PI) / sides;
    return { cos: Math.cos(a), sin: Math.sin(a) };
  });
}

interface TetrominoPiece {
  fill: string;
  stroke: string;
  shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

const TETROMINO_PIECES: readonly TetrominoPiece[] = [
  {
    fill: 'rgb(20, 52, 64)',
    stroke: 'rgb(45, 110, 130)',
    shapes: [[[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]]],
  },
  {
    fill: 'rgb(22, 40, 68)',
    stroke: 'rgb(50, 85, 140)',
    shapes: [
      [[0, 0], [1, 0], [1, 1], [1, 2]],
      [[0, 0], [0, 1], [1, 0], [2, 0]],
      [[0, 0], [0, 1], [0, 2], [1, 2]],
      [[0, 1], [1, 1], [2, 0], [2, 1]],
    ],
  },
  {
    fill: 'rgb(60, 42, 24)',
    stroke: 'rgb(125, 85, 45)',
    shapes: [
      [[0, 2], [1, 0], [1, 1], [1, 2]],
      [[0, 0], [1, 0], [2, 0], [2, 1]],
      [[0, 0], [0, 1], [0, 2], [1, 0]],
      [[0, 0], [0, 1], [1, 1], [2, 1]],
    ],
  },
  {
    fill: 'rgb(56, 52, 22)',
    stroke: 'rgb(115, 105, 40)',
    shapes: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  },
  {
    fill: 'rgb(22, 54, 34)',
    stroke: 'rgb(45, 110, 70)',
    shapes: [[[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]],
  },
  {
    fill: 'rgb(46, 28, 62)',
    stroke: 'rgb(95, 60, 125)',
    shapes: [
      [[0, 1], [1, 0], [1, 1], [1, 2]],
      [[0, 0], [1, 0], [1, 1], [2, 0]],
      [[0, 0], [0, 1], [0, 2], [1, 1]],
      [[0, 1], [1, 0], [1, 1], [2, 1]],
    ],
  },
  {
    fill: 'rgb(60, 26, 28)',
    stroke: 'rgb(125, 52, 58)',
    shapes: [[[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 1], [1, 0], [1, 1], [2, 0]]],
  },
];

interface PieceCell {
  fill: string;
  stroke: string;
  pieceId: number;
}

/** Reused across reseeds to avoid allocating a new canvas each purchase. */
let sharedTileCanvas: HTMLCanvasElement | null = null;

function getSharedTileCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!sharedTileCanvas) {
    sharedTileCanvas = document.createElement('canvas');
    sharedTileCanvas.width = TILE_PX;
    sharedTileCanvas.height = TILE_PX;
  }
  return sharedTileCanvas;
}

function randomRange(max: number, min = 0): number {
  return Math.random() * (max - min) + min;
}

function traceVoronoiBgPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  seed: number,
): void {
  const baseAngles = POLYGON_BASE_ANGLES[sides] ?? POLYGON_BASE_ANGLES[5];
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const base = baseAngles[i];
    const angleOffset = Math.sin(seed * 0.7 + i) * 0.14;
    const rad = radius + Math.cos(seed * 1.3 + i) * (radius * 0.18);
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

/** Jack Rugile–style tiled Voronoi mesh with ~4% dispersed tetromino clusters. Fresh Math.random seed each call. */
function generateDispersedVoronoiTileDataUrl(): string {
  const canvas = getSharedTileCanvas();
  if (!canvas) return '';
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grid: Array<Array<PieceCell | null>> = Array.from({ length: BG_ROWS }, () =>
    Array.from({ length: BG_COLS }, () => null),
  );

  const totalCells = BG_ROWS * BG_COLS;
  const targetPieces = Math.round((totalCells * 0.04) / 4);
  let piecesPlaced = 0;
  let attempts = 0;

  while (piecesPlaced < targetPieces && attempts < 1000) {
    attempts++;
    const pieceDef = TETROMINO_PIECES[Math.floor(Math.random() * TETROMINO_PIECES.length)];
    const shape = pieceDef.shapes[Math.floor(Math.random() * pieceDef.shapes.length)];
    const startR = Math.floor(Math.random() * (BG_ROWS - 4));
    const startC = Math.floor(Math.random() * (BG_COLS - 4));

    let canPlace = true;
    for (const [dr, dc] of shape) {
      const pr = startR + dr;
      const pc = startC + dc;
      if (pr >= BG_ROWS || pc >= BG_COLS) {
        canPlace = false;
        break;
      }
      outer: for (let nbr = -1; nbr <= 1; nbr++) {
        for (let nbc = -1; nbc <= 1; nbc++) {
          const nr = pr + nbr;
          const nc = pc + nbc;
          if (nr >= 0 && nr < BG_ROWS && nc >= 0 && nc < BG_COLS && grid[nr][nc] !== null) {
            canPlace = false;
            break outer;
          }
        }
      }
      if (!canPlace) break;
    }

    if (canPlace) {
      const pieceData: PieceCell = {
        fill: pieceDef.fill,
        stroke: pieceDef.stroke,
        pieceId: piecesPlaced + 1,
      };
      for (const [dr, dc] of shape) {
        grid[startR + dr][startC + dc] = pieceData;
      }
      piecesPlaced++;
    }
  }

  ctx.fillStyle = 'rgb(18, 18, 18)';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);

  for (let r = 0; r < BG_ROWS; r++) {
    for (let col = 0; col < BG_COLS; col++) {
      const x = col * (CELL_SIZE + GAP);
      const y = r * (CELL_SIZE + GAP);
      const sides = 5 + ((r + col) % 3);
      const cx = x + CELL_SIZE / 2;
      const cy = y + CELL_SIZE / 2;
      const cellPiece = grid[r][col];

      if (cellPiece) {
        ctx.fillStyle = cellPiece.fill;
        ctx.strokeStyle = cellPiece.stroke;
        ctx.lineWidth = 1;
        const pieceSizeVar = 1 + 0.28 * Math.abs(Math.sin(cellPiece.pieceId * 4.7));
        const radius = CELL_SIZE * 0.5 * pieceSizeVar;
        traceVoronoiBgPolygon(ctx, cx, cy, radius, sides, cellPiece.pieceId * 2.3 + (r + col) * 0.1);
      } else {
        const grayIdx = Math.floor(randomRange(GRAYS.length));
        const [fill, stroke] = GRAYS[grayIdx];
        ctx.fillStyle = `rgb(${fill}, ${fill}, ${fill})`;
        ctx.strokeStyle = `rgb(${stroke}, ${stroke}, ${stroke})`;
        ctx.lineWidth = 0.8;
        const sizeVar = 1 + 0.35 * Math.abs(Math.sin(r * 3.7 + col * 5.3));
        const radius = CELL_SIZE * 0.48 * sizeVar;
        traceVoronoiBgPolygon(ctx, cx, cy, radius, sides, r * 1.7 + col * 0.9);
      }

      ctx.fill();
      ctx.stroke();
    }
  }

  return canvas.toDataURL();
}

interface DispersedVoronoiBackgroundProps {
  /** Black scrim opacity over the tiled pattern (0–1). */
  scrimOpacity?: number;
  /** Backdrop blur on the scrim (CSS length, e.g. `5px`). */
  blur?: string;
  /** Bump to re-roll a fresh Voronoi tile (refresh, shop purchase, match-start 3-2-1 overlay). */
  seedKey?: number;
}

/**
 * Full-viewport Jack Rugile Voronoi background with a focus scrim.
 * Lazy-inits the first tile; reseeds via `seedKey` under startTransition.
 */
export const DispersedVoronoiBackground = memo(function DispersedVoronoiBackground({
  scrimOpacity = BG_SCRIM_IDLE,
  blur = BG_BLUR_IDLE,
  seedKey = 0,
}: DispersedVoronoiBackgroundProps) {
  const [tileUrl, setTileUrl] = useState(() => generateDispersedVoronoiTileDataUrl());
  const appliedSeedRef = useRef(seedKey);

  useEffect(() => {
    if (appliedSeedRef.current === seedKey) return;
    appliedSeedRef.current = seedKey;
    let cancelled = false;
    startTransition(() => {
      const next = generateDispersedVoronoiTileDataUrl();
      if (!cancelled) setTileUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [seedKey]);

  const blurFilter = blur === '0px' || blur === '0' ? 'none' : `blur(${blur})`;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 bg-[#050505]"
        style={{
          backgroundImage: tileUrl ? `url(${tileUrl})` : undefined,
          backgroundRepeat: 'repeat',
        }}
      />
      <div
        className="absolute inset-0 transition-[background-color,backdrop-filter] duration-300"
        style={{
          backgroundColor: `rgba(5, 5, 5, ${scrimOpacity})`,
          backdropFilter: blurFilter,
          WebkitBackdropFilter: blurFilter,
        }}
      />
    </div>
  );
});
