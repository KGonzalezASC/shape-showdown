import React, { memo, startTransition, useEffect, useRef, useState } from 'react';

import { DEFAULT_VORONOI_TILE_PALETTE } from '../presentation/themePackage';
import { createDecorationRandom } from '../presentation/decorationSeed';
import { SHAPE_COLORS } from '../presentation/shapePalette';

/** Lobby / idle: light dim so the Voronoi pattern reads clearly. */
const BG_SCRIM_IDLE = 0.35;
/** Playing: stronger focus on the playfields. */
const BG_SCRIM_MATCH = 0.72;
/** Match-start blur is disabled for now; idle and active play stay crisp. */
export const BG_BLUR_IDLE = '0px';
export const BG_BLUR_MATCH = '0px';

const BG_ROWS = 54;
const BG_COLS = 54;
const CELL_SIZE = 4;
const GAP = 1;
const TILE_PX = (CELL_SIZE + GAP) * BG_ROWS;

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

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function makePieceStyle(hex: string): { fill: string; stroke: string } {
  const [r, g, b] = hexToRgb(hex);
  return {
    fill: `rgb(${Math.round(r * 0.28)}, ${Math.round(g * 0.28)}, ${Math.round(b * 0.28)})`,
    stroke: `rgb(${Math.round(r * 0.65)}, ${Math.round(g * 0.65)}, ${Math.round(b * 0.65)})`,
  };
}

const TETROMINO_PIECES: readonly TetrominoPiece[] = [
  {
    ...makePieceStyle(SHAPE_COLORS.I),
    shapes: [[[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]]],
  },
  {
    ...makePieceStyle(SHAPE_COLORS.J),
    shapes: [
      [[0, 0], [1, 0], [1, 1], [1, 2]],
      [[0, 0], [0, 1], [1, 0], [2, 0]],
      [[0, 0], [0, 1], [0, 2], [1, 2]],
      [[0, 1], [1, 1], [2, 0], [2, 1]],
    ],
  },
  {
    ...makePieceStyle(SHAPE_COLORS.L),
    shapes: [
      [[0, 2], [1, 0], [1, 1], [1, 2]],
      [[0, 0], [1, 0], [2, 0], [2, 1]],
      [[0, 0], [0, 1], [0, 2], [1, 0]],
      [[0, 0], [0, 1], [1, 1], [2, 1]],
    ],
  },
  {
    ...makePieceStyle(SHAPE_COLORS.O),
    shapes: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  },
  {
    ...makePieceStyle(SHAPE_COLORS.S),
    shapes: [[[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]],
  },
  {
    ...makePieceStyle(SHAPE_COLORS.T),
    shapes: [
      [[0, 1], [1, 0], [1, 1], [1, 2]],
      [[0, 0], [1, 0], [1, 1], [2, 0]],
      [[0, 0], [0, 1], [0, 2], [1, 1]],
      [[0, 1], [1, 0], [1, 1], [2, 1]],
    ],
  },
  {
    ...makePieceStyle(SHAPE_COLORS.Z),
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

function randomRange(random: () => number, max: number, min = 0): number {
  return random() * (max - min) + min;
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

/** Jack Rugile–style tiled Voronoi mesh with ~4% dispersed tetromino clusters, driven by the presentation seed. */
function generateDispersedVoronoiTileDataUrl(
  decorationSeed: number,
  palette: ReadonlyArray<readonly [number, number]> = DEFAULT_VORONOI_TILE_PALETTE,
): string {
  const canvas = getSharedTileCanvas();
  if (!canvas) return '';
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const random = createDecorationRandom(decorationSeed);

  const grid: Array<Array<PieceCell | null>> = Array.from({ length: BG_ROWS }, () =>
    Array.from({ length: BG_COLS }, () => null),
  );

  const totalCells = BG_ROWS * BG_COLS;
  const targetPieces = Math.round((totalCells * 0.04) / 4);
  let piecesPlaced = 0;
  let attempts = 0;

  while (piecesPlaced < targetPieces && attempts < 1000) {
    attempts++;
    const pieceDef = TETROMINO_PIECES[Math.floor(random() * TETROMINO_PIECES.length)];
    const shape = pieceDef.shapes[Math.floor(random() * pieceDef.shapes.length)];
    const startR = Math.floor(random() * (BG_ROWS - 4));
    const startC = Math.floor(random() * (BG_COLS - 4));

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
        const grayIdx = Math.floor(randomRange(random, palette.length));
        const [fill, stroke] = palette[grayIdx];
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
  /** Presentation seed shared with other seeded theme decoration. */
  decorationSeed?: number;
  palette?: ReadonlyArray<readonly [number, number]>;
}

/**
 * Full-viewport Jack Rugile Voronoi background with a focus scrim.
 * Lazy-inits the first tile; regenerates when its presentation seed or palette changes.
 */
export const DispersedVoronoiBackground = memo(function DispersedVoronoiBackground({
  scrimOpacity = BG_SCRIM_IDLE,
  blur = BG_BLUR_IDLE,
  decorationSeed = 0,
  palette = DEFAULT_VORONOI_TILE_PALETTE,
}: DispersedVoronoiBackgroundProps) {
  const [tileUrl, setTileUrl] = useState(() => generateDispersedVoronoiTileDataUrl(decorationSeed, palette));
  const appliedSeedRef = useRef(decorationSeed);
  const appliedPaletteRef = useRef(palette);

  useEffect(() => {
    if (appliedSeedRef.current === decorationSeed && appliedPaletteRef.current === palette) return;
    appliedSeedRef.current = decorationSeed;
    appliedPaletteRef.current = palette;
    let cancelled = false;
    startTransition(() => {
      const next = generateDispersedVoronoiTileDataUrl(decorationSeed, palette);
      if (!cancelled) setTileUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [decorationSeed, palette]);

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
