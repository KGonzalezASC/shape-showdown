import React, { useEffect, useRef } from 'react';
import { recordBoardCanvasPaint } from '../performance/boardPerformance';
import {
  isCanvasLayoutVisible,
  syncCanvasBackingStore,
} from '../board/boardRenderer';
import {
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_VISIBLE_ROWS,
  CellValue,
  PoisonSpreadState,
  TetrisPiece,
} from '../types';
import { SHAPES } from '../tetris/shapes';
import { SHAPE_COLORS } from '../presentation/shapePalette';
import {
  ACTIVE_PIECE_MOTION_MS,
  collectActivePieceStackHandoffs,
  interpolateActivePiecePoint,
  shouldRestartActivePieceVisualLifetime,
  shouldSnapActivePieceMotion,
  type ActivePieceMotion,
  type ActivePiecePoint,
} from '../board/activePieceMotion';
import type { ActiveVisualCell } from '../board/boardVisualModel';
import { shouldAnimateBomberExplosion } from '../replayVisualEffects';
import {
  activeVoronoiCellHandoff,
  activeVoronoiCellMorph,
  type ActiveVoronoiCellHandoff,
  voronoiCellSides,
  voronoiCellWobblePhase,
} from '../board/voronoiCellStyle';

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

const REGULAR_PIECE_WOBBLE_SPEED = 0.3325 * 1.05;
const ACTIVE_MORPH_VERTEX_COUNT = 24;

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
  variant: number;
  activeOffsetIndex?: number;
  wobblePhase: number;
}

interface CellMap {
  /** Occupied cells grouped by fill color for batched path rendering. */
  colorBuckets: Map<string, CellEntry[]>;
  /** Subset of cells that are poisoned (for poison-specific overlays). */
  poisonCells: CellEntry[];
}

interface ActivePolygonGeometry {
  points: ActivePiecePoint[] | null;
  sides: number;
}

interface ActiveStackHandoff extends ActiveVoronoiCellHandoff {
  motion: ActivePieceMotion;
}

interface ExplosionShardPoint {
  x: number;
  y: number;
}

interface ExplosionShard {
  points: [ExplosionShardPoint, ExplosionShardPoint, ExplosionShardPoint];
  vx: number;
  vy: number;
  color: string;
  ageSeconds: number;
}

function createExplosionShardsForCell(
  row: number,
  column: number,
  color: string,
  cellSize: number,
  time: number,
): ExplosionShard[] {
  const centerX = column * cellSize + cellSize / 2;
  const centerY = row * cellSize + cellSize / 2;
  const sides = voronoiCellSides(row, column);
  const vertices = polygonVertices(
    centerX,
    centerY,
    sides,
    cellSize,
    time,
    REGULAR_PIECE_WOBBLE_SPEED,
    voronoiCellWobblePhase(row),
  );
  const shards: ExplosionShard[] = [];

  for (let index = 0; index < vertices.length; index += 1) {
    const first = vertices[index];
    const second = vertices[(index + 1) % vertices.length];
    const shardCenterX = (centerX + first.x + second.x) / 3;
    const shardCenterY = (centerY + first.y + second.y) / 3;
    const angle = Math.atan2(shardCenterY - centerY, shardCenterX - centerX);
    const random = Math.abs(
      Math.sin((row + 1) * 12.9898 + (column + 1) * 78.233 + (index + 1) * 37.719),
    );
    const speed = 60 + (random - Math.floor(random)) * 80;

    shards.push({
      points: [
        { x: centerX, y: centerY },
        { x: first.x, y: first.y },
        { x: second.x, y: second.y },
      ],
      vx: Math.cos(angle) * speed * (cellSize / 33),
      vy: Math.sin(angle) * speed * (cellSize / 33),
      color,
      ageSeconds: 0,
    });
  }
  return shards;
}

function buildCellMap(
  rows: CellValue[][],
  poison: number[][],
  activeCells: readonly ActiveVisualCell[],
): CellMap {
  const colorBuckets = new Map<string, CellEntry[]>();
  const poisonCells: CellEntry[] = [];
  const activeByKey = new Map(
    activeCells.map((cell) => [`${cell.y},${cell.x}`, cell.offsetIndex]),
  );

  for (let r = 0; r < BOARD_VISIBLE_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = rows[r]?.[c];
      const p = poison[r]?.[c] ?? 0;
      if (!cell && p === 0) continue;

      const isPoison = p > 0;
      const color = isPoison
        ? POISON_COLORS[p] || '#EF4444'
        : (cell ? SHAPE_COLORS[cell] || '#38bdf8' : '#38bdf8');
      const activeOffsetIndex = activeByKey.get(`${r},${c}`);
      const entry: CellEntry = {
        r,
        c,
        sides: voronoiCellSides(r, c, activeOffsetIndex),
        isPoison,
        variant: isPoison ? p : 0,
        activeOffsetIndex,
        wobblePhase: voronoiCellWobblePhase(r, activeOffsetIndex),
      };

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

function polygonVertices(
  cx: number,
  cy: number,
  sides: number,
  cellSize: number,
  time: number,
  wobbleSpeed: number,
  wobblePhase: number,
): ActivePiecePoint[] {
  return POLYGON_BASE_ANGLES[sides].map((base, index) => {
    const angleOffset = Math.sin(time * wobbleSpeed + index) * 0.15;
    const rad =
      cellSize * 0.42 +
      Math.cos(time * wobbleSpeed * 2 + wobblePhase + index) * 3;
    const cosO = Math.cos(angleOffset);
    const sinO = Math.sin(angleOffset);
    return {
      x: cx + rad * (base.cos * cosO - base.sin * sinO),
      y: cy + rad * (base.sin * cosO + base.cos * sinO),
    };
  });
}

function resampleClosedPolygon(
  vertices: readonly ActivePiecePoint[],
  sampleCount: number,
): ActivePiecePoint[] {
  const lengths = vertices.map((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  const samples: ActivePiecePoint[] = [];
  let segmentIndex = 0;
  let segmentStart = 0;

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const distance = (perimeter * sampleIndex) / sampleCount;
    while (
      segmentIndex < lengths.length - 1 &&
      segmentStart + lengths[segmentIndex] < distance
    ) {
      segmentStart += lengths[segmentIndex];
      segmentIndex += 1;
    }
    const start = vertices[segmentIndex];
    const end = vertices[(segmentIndex + 1) % vertices.length];
    const segmentLength = lengths[segmentIndex];
    const progress = segmentLength > 0 ? (distance - segmentStart) / segmentLength : 0;
    samples.push({
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    });
  }

  return samples;
}

function samplePolygonMorph(
  cx: number,
  cy: number,
  cellSize: number,
  time: number,
  wobbleSpeed: number,
  fromWobblePhase: number,
  fromSides: number,
  toWobblePhase: number,
  toSides: number,
  progress: number,
): ActivePiecePoint[] {
  const clamped = Math.max(0, Math.min(1, progress));
  const fromVertices = resampleClosedPolygon(
    polygonVertices(cx, cy, fromSides, cellSize, time, wobbleSpeed, fromWobblePhase),
    ACTIVE_MORPH_VERTEX_COUNT,
  );
  if (clamped === 0 && fromSides === toSides && fromWobblePhase === toWobblePhase) {
    return fromVertices;
  }
  const toVertices = resampleClosedPolygon(
    polygonVertices(cx, cy, toSides, cellSize, time, wobbleSpeed, toWobblePhase),
    ACTIVE_MORPH_VERTEX_COUNT,
  );
  return fromVertices.map((from, index) => {
    const to = toVertices[index];
    return {
      x: from.x + (to.x - from.x) * clamped,
      y: from.y + (to.y - from.y) * clamped,
    };
  });
}

function traceMorphedActivePolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellSize: number,
  time: number,
  wobbleSpeed: number,
  wobblePhase: number,
  lifetimeSeconds: number,
  activeOffsetIndex: number,
  geometryCache: Array<ActivePolygonGeometry | undefined>,
): void {
  let geometry = geometryCache[activeOffsetIndex];
  if (!geometry) {
    const morph = activeVoronoiCellMorph(lifetimeSeconds, activeOffsetIndex);
    if (morph.fromSides === morph.toSides || morph.progress <= 0) {
      geometry = { points: null, sides: morph.fromSides };
    } else {
      const fromVertices = resampleClosedPolygon(
        polygonVertices(cx, cy, morph.fromSides, cellSize, time, wobbleSpeed, wobblePhase),
        ACTIVE_MORPH_VERTEX_COUNT,
      );
      const toVertices = resampleClosedPolygon(
        polygonVertices(cx, cy, morph.toSides, cellSize, time, wobbleSpeed, wobblePhase),
        ACTIVE_MORPH_VERTEX_COUNT,
      );
      geometry = {
        sides: morph.toSides,
        points: fromVertices.map((from, index) => {
          const to = toVertices[index];
          return {
            x: from.x + (to.x - from.x) * morph.progress,
            y: from.y + (to.y - from.y) * morph.progress,
          };
        }),
      };
    }
    geometryCache[activeOffsetIndex] = geometry;
  }

  if (!geometry.points) {
    tracePolygon(
      ctx,
      cx,
      cy,
      geometry.sides,
      cellSize,
      time,
      wobbleSpeed,
      wobblePhase,
    );
    return;
  }

  for (let i = 0; i < geometry.points.length; i++) {
    const point = geometry.points[i];
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
}

function traceStackHandoffPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellSize: number,
  time: number,
  wobbleSpeed: number,
  handoff: ActiveStackHandoff,
  timestamp: number,
  geometryCache: Map<string, ActivePolygonGeometry>,
  cacheKey: string,
): void {
  let geometry = geometryCache.get(cacheKey);
  if (!geometry) {
    const handoffProgress = Math.max(
      0,
      Math.min(1, (timestamp - handoff.motion.startedAt) / ACTIVE_PIECE_MOTION_MS),
    );
    const easedProgress = 1 - Math.pow(1 - handoffProgress, 3);
    const sourcePoints = samplePolygonMorph(
      cx,
      cy,
      cellSize,
      time,
      wobbleSpeed,
      handoff.sourceWobblePhase,
      handoff.sourceMorph.fromSides,
      handoff.sourceWobblePhase,
      handoff.sourceMorph.toSides,
      handoff.sourceMorph.progress,
    );
    const targetPoints = samplePolygonMorph(
      cx,
      cy,
      cellSize,
      time,
      wobbleSpeed,
      handoff.targetWobblePhase,
      handoff.targetSides,
      handoff.targetWobblePhase,
      handoff.targetSides,
      1,
    );
    geometry = {
      points: sourcePoints.map((source, index) => {
        const target = targetPoints[index];
        return {
          x: source.x + (target.x - source.x) * easedProgress,
          y: source.y + (target.y - source.y) * easedProgress,
        };
      }),
      sides: ACTIVE_MORPH_VERTEX_COUNT,
    };
    geometryCache.set(cacheKey, geometry);
  }

  for (let i = 0; i < geometry.points!.length; i++) {
    const point = geometry.points![i];
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
}

function traceCellPolygon(
  ctx: CanvasRenderingContext2D,
  cell: CellEntry,
  cx: number,
  cy: number,
  cellSize: number,
  time: number,
  wobbleSpeed: number,
  activeLifetimeSeconds: number,
  geometryCache: Array<ActivePolygonGeometry | undefined>,
  stackHandoff: ActiveStackHandoff | undefined,
  handoffGeometryCache: Map<string, ActivePolygonGeometry>,
  handoffCacheKey: string,
  timestamp: number,
): void {
  if (cell.activeOffsetIndex !== undefined) {
    traceMorphedActivePolygon(
      ctx,
      cx,
      cy,
      cellSize,
      time,
      wobbleSpeed,
      cell.wobblePhase,
      activeLifetimeSeconds,
      cell.activeOffsetIndex,
      geometryCache,
    );
    return;
  }
  if (stackHandoff) {
    traceStackHandoffPolygon(
      ctx,
      cx,
      cy,
      cellSize,
      time,
      wobbleSpeed,
      stackHandoff,
      timestamp,
      handoffGeometryCache,
      handoffCacheKey,
    );
    return;
  }
  tracePolygon(ctx, cx, cy, cell.sides, cellSize, time, wobbleSpeed, cell.wobblePhase);
}

// ── Component ──

interface VoronoiFlowfieldCanvasProps {
  visibleRows: CellValue[][];
  visiblePoison: number[][];
  activeCells: readonly ActiveVisualCell[];
  activePieceKey: string | null;
  cellSize: number;
  poisonSpread?: PoisonSpreadState | null;
  board?: CellValue[][];
  activePiece?: TetrisPiece | null;
  /** Sparse replay snapshots cannot attribute every cleared cell to Bomber. */
  suppressBomberExplosionAnimation?: boolean;
  performanceId: string;
}

interface PoisonAnimationCell {
  r: number;
  c: number;
  variant: number;
  sourceR: number;
  sourceC: number;
}

interface PoisonAnimation {
  startedAt: number;
  cells: PoisonAnimationCell[];
}

interface VisualPoisonCell extends CellEntry {
  weight: number;
  x: number;
  y: number;
}

function poisonSnapshotEqual(a: number[][] | null, b: number[][]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let y = 0; y < b.length; y++) {
    const rowA = a[y];
    const rowB = b[y];
    if (!rowA || rowA.length !== rowB.length) return false;
    for (let x = 0; x < rowB.length; x++) {
      if (rowA[x] !== rowB[x]) return false;
    }
  }
  return true;
}

function findPreviousPoisonNeighbour(
  previous: number[][],
  r: number,
  c: number,
): [number, number] | null {
  const neighbours: Array<[number, number]> = [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ];
  return neighbours.find(([ny, nx]) => previous[ny]?.[nx] > 0) ?? null;
}

function connectedPoisonGroups(cells: CellEntry[]): CellEntry[][] {
  const byKey = new Map(cells.map((cell) => [`${cell.r},${cell.c}`, cell]));
  const visited = new Set<string>();
  const groups: CellEntry[][] = [];

  for (const start of cells) {
    const startKey = `${start.r},${start.c}`;
    if (visited.has(startKey)) continue;
    const group: CellEntry[] = [];
    const queue = [start];
    visited.add(startKey);

    while (queue.length > 0) {
      const current = queue.pop()!;
      group.push(current);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextKey = `${current.r + dr},${current.c + dc}`;
        const next = byKey.get(nextKey);
        if (next && !visited.has(nextKey)) {
          visited.add(nextKey);
          queue.push(next);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function drawPoisonBlob(
  ctx: CanvasRenderingContext2D,
  blobCtx: CanvasRenderingContext2D,
  cells: VisualPoisonCell[],
  cellSize: number,
  time: number,
): void {
  if (cells.length === 0) return;

  const cellKeys = new Set(cells.map(({ r, c }) => `${r},${c}`));
  const first = cells[0];
  const phase = (first.r * 1.7 + first.c * 0.9) % (Math.PI * 2);
  const sharedX = Math.sin(time * 0.77 + phase) * cellSize * 0.04;
  const sharedY = Math.cos(time * 0.66 + phase) * cellSize * 0.04;
  const pulse = 1 + Math.sin(time * 0.88 + phase) * 0.045;
  const influence = cellSize * 0.82;
  const influence2 = influence * influence;
  const threshold = 1.7;
  const edgeInset = Math.max(2, cellSize * 0.075);
  const cornerRadius = cellSize * 0.22;
  const rgb = hexToRgb(POISON_COLORS[first.variant] || POISON_COLORS[1]);

  const animatedCells = cells.map((cell, index) => ({
    ...cell,
    x: cell.x + sharedX + Math.sin(time * 1.1 + index + cell.r) * cellSize * 0.045,
    y: cell.y + sharedY + Math.cos(time * 0.95 + index + cell.c) * cellSize * 0.045,
    weight: cell.weight * (pulse + Math.sin(time * 1.3 + index) * 0.025),
  }));

  let minC = BOARD_COLS;
  let maxC = 0;
  let minR = BOARD_VISIBLE_ROWS;
  let maxR = 0;
  for (const { r, c } of animatedCells) {
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
  }

  const pad = Math.ceil(cellSize * 0.15);
  const x0 = Math.max(0, minC * cellSize - pad);
  const y0 = Math.max(0, minR * cellSize - pad);
  const x1 = Math.min(BOARD_COLS * cellSize, (maxC + 1) * cellSize + pad);
  const y1 = Math.min(BOARD_VISIBLE_ROWS * cellSize, (maxR + 1) * cellSize + pad);
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const image = blobCtx.createImageData(width, height);
  const pixels = image.data;
  const mask = new Uint8Array(width * height);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = x0 + px + 0.5;
      const y = y0 + py + 0.5;
      const c = Math.floor(x / cellSize);
      const r = Math.floor(y / cellSize);
      if (!cellKeys.has(`${r},${c}`)) continue;

      const localX = x - c * cellSize;
      const localY = y - r * cellSize;
      const outerLeft = !cellKeys.has(`${r},${c - 1}`);
      const outerRight = !cellKeys.has(`${r},${c + 1}`);
      const outerTop = !cellKeys.has(`${r - 1},${c}`);
      const outerBottom = !cellKeys.has(`${r + 1},${c}`);
      if (
        (outerLeft && localX < edgeInset) ||
        (outerRight && localX > cellSize - edgeInset) ||
        (outerTop && localY < edgeInset) ||
        (outerBottom && localY > cellSize - edgeInset)
      ) continue;
      if (
        (outerLeft && outerTop && Math.hypot(localX, localY) < cornerRadius) ||
        (outerRight && outerTop && Math.hypot(localX - cellSize, localY) < cornerRadius) ||
        (outerLeft && outerBottom && Math.hypot(localX, localY - cellSize) < cornerRadius) ||
        (outerRight && outerBottom && Math.hypot(localX - cellSize, localY - cellSize) < cornerRadius)
      ) continue;

      let field = 0;
      for (const cell of animatedCells) {
        const dx = x - cell.x;
        const dy = y - cell.y;
        field += influence2 * cell.weight / (dx * dx + dy * dy + 1);
        if (field >= threshold) break;
      }
      if (field < threshold) continue;

      const index = py * width + px;
      mask[index] = 1;
      const i = index * 4;
      pixels[i] = rgb[0];
      pixels[i + 1] = rgb[1];
      pixels[i + 2] = rgb[2];
      pixels[i + 3] = 255;
    }
  }

  // Inward 2px contour. Eight-neighbor detection keeps diagonal corners closed.
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const index = py * width + px;
      if (!mask[index]) continue;
      let edge = false;
      for (const [dx, dy] of [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],            [1, 0],
        [-1, 1],  [0, 1],  [1, 1],
      ]) {
        for (let distance = 1; distance <= 2; distance++) {
          const nx = px + dx * distance;
          const ny = py + dy * distance;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
            edge = true;
            break;
          }
        }
        if (edge) break;
      }
      if (edge) {
        const i = index * 4;
        pixels[i] = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
        pixels[i + 3] = 225;
      }
    }
  }

  blobCtx.putImageData(image, x0, y0);
  ctx.drawImage(blobCtx.canvas, x0, y0, width, height, x0, y0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,.82)';
  ctx.lineWidth = Math.max(1, cellSize * 0.03);
  ctx.fillStyle = '#fff';
  for (const cell of animatedCells) {
    const radius = Math.max(2, cellSize * 0.19 * Math.min(1, cell.weight));
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, Math.max(1.5, cellSize * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
}

export const VoronoiFlowfieldCanvas: React.FC<VoronoiFlowfieldCanvasProps> = React.memo(({
  visibleRows,
  visiblePoison,
  activeCells,
  activePieceKey,
  cellSize,
  poisonSpread,
  board,
  activePiece,
  suppressBomberExplosionAnimation = false,
  performanceId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Stable refs prevent animation loop teardown on 60Hz state updates
  const visibleRowsRef = useRef(visibleRows);
  const visiblePoisonRef = useRef(visiblePoison);
  const activeCellsRef = useRef(activeCells);
  const cellSizeRef = useRef(cellSize);
  const timeRef = useRef(0);
  const previousPoisonRef = useRef<number[][] | null>(null);
  const previousSpreadRef = useRef<PoisonSpreadState | null>(null);
  const poisonAnimationRef = useRef<PoisonAnimation | null>(null);
  const previousBoardRef = useRef<CellValue[][] | null>(null);
  const previousActivePieceRef = useRef<TetrisPiece | null>(null);
  const explosionShardsRef = useRef<ExplosionShard[]>([]);

  // Cached cell map — rebuilt only when board occupancy changes
  const cellMapRef = useRef<CellMap | null>(null);
  const cellMapDirtyRef = useRef(true);
  const activeMotionRef = useRef(new Map<number, {
    from: ActivePiecePoint;
    to: ActivePiecePoint;
    startedAt: number;
  }>());
  const activeStackHandoffRef = useRef(new Map<string, ActiveStackHandoff>());
  const activeVisualStartedAtRef = useRef<number | null>(null);
  const previousActiveCellsRef = useRef<readonly ActiveVisualCell[]>([]);
  const previousActivePieceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const previousBoard = previousBoardRef.current;
    const previousActivePiece = previousActivePieceRef.current;
    const previousPoison = previousPoisonRef.current;
    const previousSpread = previousSpreadRef.current;
    const spreadAdvanced = previousSpread && (
      poisonSpread == null ||
      poisonSpread.nextSpreadTick !== previousSpread.nextSpreadTick ||
      poisonSpread.generationsRemaining < previousSpread.generationsRemaining
    );

    const pieceLocked = previousActivePiece != null && (
      activePiece == null ||
      activePiece.type !== previousActivePiece.type ||
      activePiece.y < previousActivePiece.y
    );
    if (
      previousBoard &&
      board &&
      pieceLocked &&
      shouldAnimateBomberExplosion(suppressBomberExplosionAnimation, previousActivePiece)
    ) {
      for (let row = 0; row < BOARD_VISIBLE_ROWS; row += 1) {
        const boardRow = BOARD_HIDDEN_ROWS + row;
        for (let column = 0; column < BOARD_COLS; column += 1) {
          const previousValue = previousBoard[boardRow]?.[column] ?? null;
          const currentValue = board[boardRow]?.[column] ?? null;
          if (previousValue === null || currentValue !== null) continue;
          const poisonVariant = previousPoison?.[row]?.[column] ?? 0;
          const color = poisonVariant > 0
            ? POISON_COLORS[poisonVariant] || '#EF4444'
            : SHAPE_COLORS[previousValue] || '#38bdf8';
          explosionShardsRef.current.push(
            ...createExplosionShardsForCell(row, column, color, cellSize, timeRef.current),
          );
        }
      }

      const offsets = previousActivePiece.customOffsets ??
        SHAPES[previousActivePiece.type][previousActivePiece.rotation];
      for (const [dx, dy] of offsets) {
        const column = previousActivePiece.x + dx;
        const boardRow = previousActivePiece.y + dy;
        const row = boardRow - BOARD_HIDDEN_ROWS;
        if (
          row < 0 || row >= BOARD_VISIBLE_ROWS ||
          column < 0 || column >= BOARD_COLS ||
          (board[boardRow]?.[column] ?? null) !== null
        ) continue;
        const color = SHAPE_COLORS[previousActivePiece.type] || '#38bdf8';
        explosionShardsRef.current.push(
          ...createExplosionShardsForCell(row, column, color, cellSize, timeRef.current),
        );
      }
    }

    if (previousPoison && spreadAdvanced && !poisonSnapshotEqual(previousPoison, visiblePoison)) {
      const animationCells: PoisonAnimationCell[] = [];
      for (let r = 0; r < visiblePoison.length; r++) {
        for (let c = 0; c < (visiblePoison[r]?.length ?? 0); c++) {
          if ((visiblePoison[r]?.[c] ?? 0) === 0 || (previousPoison[r]?.[c] ?? 0) !== 0) continue;
          const source = findPreviousPoisonNeighbour(previousPoison, r, c);
          if (!source) continue;
          animationCells.push({
            r,
            c,
            variant: visiblePoison[r][c],
            sourceR: source[0],
            sourceC: source[1],
          });
        }
      }
      if (animationCells.length > 0) {
        poisonAnimationRef.current = {
          startedAt: performance.now(),
          cells: animationCells,
        };
      }
    }

    previousBoardRef.current = board ?? null;
    previousActivePieceRef.current = activePiece ?? null;
    previousPoisonRef.current = visiblePoison;
    previousSpreadRef.current = poisonSpread ?? null;
    visibleRowsRef.current = visibleRows;
    visiblePoisonRef.current = visiblePoison;
    const now = performance.now();
    const priorActiveCells = previousActiveCellsRef.current;
    const activeSequenceRestarted = shouldRestartActivePieceVisualLifetime(
      priorActiveCells,
      activeCells,
    );
    const pieceChanged = previousActivePieceKeyRef.current !== activePieceKey;
    if ((pieceChanged || activeSequenceRestarted) && priorActiveCells.length > 0) {
      const sourceLifetimeSeconds = activeVisualStartedAtRef.current === null
        ? 0
        : Math.max(0, (now - activeVisualStartedAtRef.current) / 1000);
      for (const cell of collectActivePieceStackHandoffs(
        priorActiveCells,
        activeCells,
        ({ x, y }) => visibleRows[y]?.[x] != null || (visiblePoison[y]?.[x] ?? 0) > 0,
      )) {
        const existing = activeMotionRef.current.get(cell.offsetIndex);
        const from = existing
          ? interpolateActivePiecePoint(
            existing.from,
            existing.to,
            (now - existing.startedAt) / ACTIVE_PIECE_MOTION_MS,
          )
          : cell;
        activeStackHandoffRef.current.set(`${cell.y},${cell.x}`, {
          motion: {
            from,
            to: { x: cell.x, y: cell.y },
            startedAt: now,
          },
          ...activeVoronoiCellHandoff(
            cell.y,
            cell.x,
            cell.offsetIndex,
            sourceLifetimeSeconds,
          ),
        });
      }
    }
    if (pieceChanged) {
      activeMotionRef.current.clear();
      previousActiveCellsRef.current = [];
    }
    if (activeCells.length === 0) {
      activeVisualStartedAtRef.current = null;
    } else if (activeSequenceRestarted || activeVisualStartedAtRef.current === null) {
      activeVisualStartedAtRef.current = now;
    }
    const previousById = new Map<number, ActiveVisualCell>(
      previousActiveCellsRef.current.map((cell) => [cell.offsetIndex, cell]),
    );
    const nextMotion = new Map<number, {
      from: ActivePiecePoint;
      to: ActivePiecePoint;
      startedAt: number;
    }>();
    for (const cell of activeCells) {
      const previous = previousById.get(cell.offsetIndex);
      const existing = activeMotionRef.current.get(cell.offsetIndex);
      const jumped = previous && shouldSnapActivePieceMotion(previous, cell);
      if (!previous || jumped || (previous.x === cell.x && previous.y === cell.y)) {
        nextMotion.set(cell.offsetIndex, existing ?? {
          from: cell,
          to: cell,
          startedAt: now,
        });
        continue;
      }
      const from = existing
        ? interpolateActivePiecePoint(
          existing.from,
          existing.to,
          (now - existing.startedAt) / ACTIVE_PIECE_MOTION_MS,
        )
        : previous;
      nextMotion.set(cell.offsetIndex, {
        from,
        to: cell,
        startedAt: now,
      });
    }
    activeMotionRef.current = nextMotion;
    previousActiveCellsRef.current = activeCells;
    previousActivePieceKeyRef.current = activePieceKey;
    activeCellsRef.current = activeCells;
    cellSizeRef.current = cellSize;
    cellMapDirtyRef.current = true;
  }, [
    visibleRows,
    visiblePoison,
    activeCells,
    activePieceKey,
    cellSize,
    poisonSpread,
    board,
    activePiece,
    suppressBomberExplosionAnimation,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let hiddenTimer = 0;
    let lastTimestamp: number | null = null;

    const blobCanvas = document.createElement('canvas');
    const blobCtx = blobCanvas.getContext('2d');
    if (!blobCtx) return;

    const render = (timestamp: number) => {
      if (!isCanvasLayoutVisible(canvas)) {
        lastTimestamp = null;
        hiddenTimer = window.setTimeout(() => {
          animationFrameId = requestAnimationFrame(render);
        }, 100);
        return;
      }
      const paintStartedAt = performance.now();
      if (lastTimestamp === null) lastTimestamp = timestamp;
      const deltaSec = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
      lastTimestamp = timestamp;

      timeRef.current += deltaSec;
      const time = timeRef.current;
      const activeLifetimeSeconds = activeVisualStartedAtRef.current === null
        ? 0
        : Math.max(0, (timestamp - activeVisualStartedAtRef.current) / 1000);
      const activeGeometryCache: Array<ActivePolygonGeometry | undefined> = [];
      const handoffGeometryCache = new Map<string, ActivePolygonGeometry>();
      const cs = cellSizeRef.current;
      const halfCs = cs / 2;
      for (const [key, handoff] of activeStackHandoffRef.current) {
        if (timestamp - handoff.motion.startedAt >= ACTIVE_PIECE_MOTION_MS) {
          activeStackHandoffRef.current.delete(key);
        }
      }
      const size = syncCanvasBackingStore(
        canvas,
        cs,
        window.devicePixelRatio || 1,
      );
      const { cssWidth, cssHeight, dpr } = size;
      if (blobCanvas.width !== cssWidth || blobCanvas.height !== cssHeight) {
        blobCanvas.width = cssWidth;
        blobCanvas.height = cssHeight;
      }

      // Rebuild cell map only when board state changed
      if (cellMapDirtyRef.current) {
        cellMapRef.current = buildCellMap(
          visibleRowsRef.current,
          visiblePoisonRef.current,
          activeCellsRef.current,
        );
        cellMapDirtyRef.current = false;
      }
      const cellMap = cellMapRef.current!;
      const cellCenter = (cell: CellEntry): ActivePiecePoint => {
        const motion = cell.activeOffsetIndex === undefined
          ? null
          : activeMotionRef.current.get(cell.activeOffsetIndex);
        const handoff = activeStackHandoffRef.current.get(`${cell.r},${cell.c}`);
        const point = motion
          ? interpolateActivePiecePoint(
            motion.from,
            motion.to,
            (timestamp - motion.startedAt) / ACTIVE_PIECE_MOTION_MS,
          )
          : handoff
            ? interpolateActivePiecePoint(
              handoff.motion.from,
              handoff.motion.to,
              (timestamp - handoff.motion.startedAt) / ACTIVE_PIECE_MOTION_MS,
            )
          : { x: cell.c, y: cell.r };
        return {
          x: point.x * cs + halfCs,
          y: point.y * cs + halfCs,
        };
      };

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // ── Pass 1: Color-batched regular polygon fills ──
      for (const [color, cells] of cellMap.colorBuckets) {
        const regularCells = cells.filter((cell) => !cell.isPoison);
        if (regularCells.length === 0) continue;
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const cell of regularCells) {
          const wobbleSpeed = REGULAR_PIECE_WOBBLE_SPEED;
          const { x: cx, y: cy } = cellCenter(cell);
          traceCellPolygon(
            ctx,
            cell,
            cx,
            cy,
            cs,
            time,
            wobbleSpeed,
            activeLifetimeSeconds,
            activeGeometryCache,
            activeStackHandoffRef.current.get(`${cell.r},${cell.c}`),
            handoffGeometryCache,
            `${cell.r},${cell.c}`,
            timestamp,
          );
        }
        ctx.fill();
      }

      // ── Pass 2: Batched regular-cell strokes ──
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [, cells] of cellMap.colorBuckets) {
        for (const cell of cells) {
          if (cell.isPoison) continue;
          const wobbleSpeed = REGULAR_PIECE_WOBBLE_SPEED;
          const { x: cx, y: cy } = cellCenter(cell);
          traceCellPolygon(
            ctx,
            cell,
            cx,
            cy,
            cs,
            time,
            wobbleSpeed,
            activeLifetimeSeconds,
            activeGeometryCache,
            activeStackHandoffRef.current.get(`${cell.r},${cell.c}`),
            handoffGeometryCache,
            `${cell.r},${cell.c}`,
            timestamp,
          );
        }
      }
      ctx.stroke();

      // ── Pass 3: Continuous animated poison blobs ──
      if (cellMap.poisonCells.length > 0) {
        const animation = poisonAnimationRef.current;
        const progress = animation
          ? Math.min(1, (timestamp - animation.startedAt) / 720)
          : 1;
        const growth = 1 - Math.pow(1 - progress, 3);
        const animatedByKey = new Map<string, PoisonAnimationCell>(
          animation?.cells.map((cell) => [`${cell.r},${cell.c}`, cell]) ?? [],
        );
        const groups = new Map<number, CellEntry[]>();
        for (const cell of cellMap.poisonCells) {
          const group = groups.get(cell.variant) ?? [];
          group.push(cell);
          groups.set(cell.variant, group);
        }

        for (const variantCells of groups.values()) {
          for (const group of connectedPoisonGroups(variantCells)) {
            const visualCells: VisualPoisonCell[] = group.map((cell) => {
              const animated = animatedByKey.get(`${cell.r},${cell.c}`);
              const center = cellCenter(cell);
              if (!animated || progress >= 1) {
                return {
                  ...cell,
                  weight: 1,
                  x: center.x,
                  y: center.y,
                };
              }
              return {
                ...cell,
                weight: Math.max(0.12, growth),
                x:
                  (animated.sourceC * cs + halfCs) +
                  (center.x - animated.sourceC * cs - halfCs) * growth,
                y:
                  (animated.sourceR * cs + halfCs) +
                  (center.y - animated.sourceR * cs - halfCs) * growth,
              };
            });
            drawPoisonBlob(ctx, blobCtx, visualCells, cs, time);
          }
        }
        if (animation && progress >= 1) poisonAnimationRef.current = null;
      }

      // ── Pass 4: Bomber Voronoi shards ──
      if (explosionShardsRef.current.length > 0) {
        const shards = explosionShardsRef.current;
        let writeIndex = 0;
        ctx.save();
        for (let readIndex = 0; readIndex < shards.length; readIndex += 1) {
          const shard = shards[readIndex];
          for (const point of shard.points) {
            point.x += shard.vx * deltaSec;
            point.y += shard.vy * deltaSec;
          }
          const drag = Math.pow(0.88, deltaSec * 60);
          shard.vx *= drag;
          shard.vy = shard.vy * drag + 60 * (cs / 33) * deltaSec;
          shard.ageSeconds += deltaSec;
          const alpha = Math.max(0, 1 - shard.ageSeconds * 1.4);
          if (alpha <= 0) continue;

          ctx.globalAlpha = alpha;
          ctx.fillStyle = shard.color;
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(shard.points[0].x, shard.points[0].y);
          ctx.lineTo(shard.points[1].x, shard.points[1].y);
          ctx.lineTo(shard.points[2].x, shard.points[2].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          shards[writeIndex] = shard;
          writeIndex += 1;
        }
        ctx.restore();
        shards.length = writeIndex;
      }

      ctx.restore();
      recordBoardCanvasPaint(
        'voronoi-canvas',
        performanceId,
        performance.now() - paintStartedAt,
      );
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.clearTimeout(hiddenTimer);
    };
  }, [performanceId]);

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
