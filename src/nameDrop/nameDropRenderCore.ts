import {
  NAME_DROP_COLUMNS,
  NAME_DROP_ROWS,
  type NameDropPiece,
  type NameDropPlan,
} from './nameDropShared';

const BOARD_FILL = '#10131a';
const GRID_LINE = 'rgba(255, 255, 255, 0.035)';
const CELL_BORDER = 'rgba(255, 255, 255, 0.2)';

const PIECE_COLORS: Record<NameDropPiece['type'], string> = {
  I: '#67e8f9',
  J: '#60a5fa',
  L: '#fdba74',
  O: '#fef08a',
  S: '#6ee7b7',
  T: '#f0abfc',
  Z: '#fda4af',
};

export type CanvasLike = OffscreenCanvas | HTMLCanvasElement;

export type CanvasContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Matches the CSS cubic-bezier(0.18, 0.82, 0.24, 1) used by the prior DOM animation. */
function cubicBezierEase(t: number, x1: number, y1: number, x2: number, y2: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  let guess = t;
  for (let i = 0; i < 8; i += 1) {
    const u = 1 - guess;
    const x =
      3 * u * u * guess * x1 +
      3 * u * guess * guess * x2 +
      guess * guess * guess;
    const dx =
      3 * u * u * x1 +
      6 * u * guess * (x2 - x1) +
      3 * guess * guess * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    guess -= (x - t) / dx;
    guess = Math.min(1, Math.max(0, guess));
  }

  const u = 1 - guess;
  return (
    3 * u * u * guess * y1 +
    3 * u * guess * guess * y2 +
    guess * guess * guess
  );
}

export function pieceMotion(piece: NameDropPiece, cellSize: number, elapsedMs: number) {
  const local = (elapsedMs - piece.delayMs) / piece.durationMs;
  if (local <= 0) {
    return {
      opacity: 0,
      translateY: -Math.max(4, piece.y + 4) * cellSize,
      scale: 0.94,
      visible: false,
      settled: false,
    };
  }

  const progress = Math.min(1, local);
  const opacity = progress < 0.12 ? progress / 0.12 : 1;
  // Canvas has no separate target layer, so keep the piece moving until its
  // actual settlement time instead of leaving it visibly paused above the letter.
  const eased = cubicBezierEase(progress, 0.18, 0.82, 0.24, 1);
  const startY = -Math.max(4, piece.y + 4) * cellSize;

  return {
    opacity,
    translateY: startY * (1 - eased),
    scale: 0.94 + 0.06 * eased,
    visible: true,
    settled: progress >= 1,
  };
}

export function pieceSettledAt(piece: NameDropPiece): number {
  return piece.delayMs + piece.durationMs;
}

export function collectNewlySettledPieceIndices(
  pieces: readonly NameDropPiece[],
  elapsedMs: number,
  settledIndices: ReadonlySet<number>,
): number[] {
  const newlySettled: number[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    if (!settledIndices.has(index) && pieceSettledAt(pieces[index]) <= elapsedMs) {
      newlySettled.push(index);
    }
  }
  return newlySettled;
}

function pieceGeometryKey(piece: NameDropPiece): string {
  return piece.cells
    .map((cell) => `${cell.x - piece.x},${cell.y - piece.y}`)
    .sort()
    .join('|');
}

/** Relative cell geometry atlas keyed by piece shape and cell size.
 *
 * Keep this as plain geometry instead of caching Path2D objects: Path2D is not
 * consistently available in OffscreenCanvas workers across browsers.
 */
class PiecePathAtlas {
  private readonly cache = new Map<string, ReadonlyArray<{ x: number; y: number }>>();

  get(piece: NameDropPiece, cellSize: number): ReadonlyArray<{ x: number; y: number }> {
    const key = `${pieceGeometryKey(piece)}@${cellSize}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const geometry = piece.cells.map((cell) => ({
      x: (cell.x - piece.x) * cellSize,
      y: (cell.y - piece.y) * cellSize,
    }));
    this.cache.set(key, geometry);
    return geometry;
  }

  clear(): void {
    this.cache.clear();
  }
}

function drawPiece(
  ctx: CanvasContext,
  atlas: PiecePathAtlas,
  piece: NameDropPiece,
  cellSize: number,
): void {
  ctx.beginPath();
  for (const cell of atlas.get(piece, cellSize)) {
    ctx.rect(cell.x + 0.5, cell.y + 0.5, cellSize - 1, cellSize - 1);
  }
  ctx.fillStyle = PIECE_COLORS[piece.type];
  ctx.fill();
  ctx.strokeStyle = CELL_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function createLayer(width: number, height: number): { canvas: CanvasLike; ctx: CanvasContext } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2d unavailable');
    return { canvas, ctx };
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    return { canvas, ctx };
  }

  throw new Error('Canvas layers unavailable');
}

function drawGridTo(ctx: CanvasContext, cellSize: number): void {
  const width = NAME_DROP_COLUMNS * cellSize;
  const height = NAME_DROP_ROWS * cellSize;

  ctx.fillStyle = BOARD_FILL;
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.018)');
  gradient.addColorStop(0.58, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (cellSize >= 4) {
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < NAME_DROP_COLUMNS; x += 1) {
      const px = x * cellSize + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    for (let y = 1; y < NAME_DROP_ROWS; y += 1) {
      const py = y * cellSize + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();
  }

  const veil = ctx.createLinearGradient(0, 0, 0, height);
  veil.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
  veil.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  veil.addColorStop(1, 'rgba(52, 211, 153, 0.03)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);
}

function drawSettledPiece(
  ctx: CanvasContext,
  atlas: PiecePathAtlas,
  piece: NameDropPiece,
  cellSize: number,
): void {
  const x = piece.x * cellSize;
  const y = piece.y * cellSize;

  ctx.save();
  ctx.translate(x, y);
  drawPiece(ctx, atlas, piece, cellSize);
  ctx.restore();
}

function drawActivePiece(
  ctx: CanvasContext,
  atlas: PiecePathAtlas,
  piece: NameDropPiece,
  cellSize: number,
  elapsedMs: number,
): void {
  const motion = pieceMotion(piece, cellSize, elapsedMs);
  if (!motion.visible || motion.opacity <= 0 || motion.settled) return;

  const originX = piece.x * cellSize + cellSize * 2;
  const originY = piece.y * cellSize + cellSize * 2;
  const x = piece.x * cellSize;
  const y = piece.y * cellSize;

  ctx.save();
  ctx.globalAlpha = motion.opacity;
  ctx.translate(originX, originY + motion.translateY);
  ctx.scale(motion.scale, motion.scale);
  ctx.translate(-originX, -originY);
  ctx.translate(x, y);
  drawPiece(ctx, atlas, piece, cellSize);
  ctx.restore();
}

/** Layered renderer: static grid, incrementally composited settled pieces, active-only redraw. */
export class NameDropLayeredRenderer {
  private baseLayer: CanvasLike | null = null;
  private settledLayer: CanvasLike | null = null;
  private settledCtx: CanvasContext | null = null;
  private readonly atlas = new PiecePathAtlas();
  private cellSize = 0;
  private dpr = 1;
  private readonly settledIndices = new Set<number>();
  private plan: NameDropPlan | null = null;

  configure(display: CanvasLike, cellSize: number, dpr: number): CanvasContext {
    this.cellSize = cellSize;
    this.dpr = dpr;
    this.atlas.clear();
    this.settledIndices.clear();

    const width = Math.floor(NAME_DROP_COLUMNS * cellSize * dpr);
    const height = Math.floor(NAME_DROP_ROWS * cellSize * dpr);
    display.width = width;
    display.height = height;
    if ('style' in display) {
      display.style.width = `${NAME_DROP_COLUMNS * cellSize}px`;
      display.style.height = `${NAME_DROP_ROWS * cellSize}px`;
    }

    const ctx = display.getContext('2d') as CanvasContext;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const logicalWidth = NAME_DROP_COLUMNS * cellSize;
    const logicalHeight = NAME_DROP_ROWS * cellSize;
    const base = createLayer(logicalWidth, logicalHeight);
    this.baseLayer = base.canvas;
    const baseCtx = base.ctx;
    drawGridTo(baseCtx, cellSize);

    const settled = createLayer(logicalWidth, logicalHeight);
    this.settledLayer = settled.canvas;
    this.settledCtx = settled.ctx;
    this.settledCtx.clearRect(0, 0, logicalWidth, logicalHeight);

    return ctx;
  }

  begin(plan: NameDropPlan): void {
    this.plan = plan;
    this.settledIndices.clear();
    if (this.settledCtx && this.baseLayer) {
      this.settledCtx.clearRect(0, 0, this.baseLayer.width, this.baseLayer.height);
    }
  }

  /** Paint one frame; returns true when the cycle has fully settled. */
  paint(ctx: CanvasContext, elapsedMs: number): boolean {
    if (!this.plan || !this.baseLayer || !this.settledLayer || !this.settledCtx) return true;

    const plan = this.plan;
    const cellSize = this.cellSize;
    const width = NAME_DROP_COLUMNS * cellSize;
    const height = NAME_DROP_ROWS * cellSize;
    const newlySettled = collectNewlySettledPieceIndices(
      plan.pieces,
      elapsedMs,
      this.settledIndices,
    );
    for (const index of newlySettled) {
      drawSettledPiece(this.settledCtx, this.atlas, plan.pieces[index], cellSize);
      this.settledIndices.add(index);
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.baseLayer, 0, 0, width, height);
    ctx.drawImage(this.settledLayer, 0, 0, width, height);

    // Keep the transition frame visible even if a browser defers a layer
    // upload/composite between drawImage calls. The duplicate is only for
    // pieces that settled during this frame and disappears on the next one.
    for (const index of newlySettled) {
      drawSettledPiece(ctx, this.atlas, plan.pieces[index], cellSize);
    }

    for (let index = 0; index < plan.pieces.length; index += 1) {
      if (!this.settledIndices.has(index)) {
        drawActivePiece(ctx, this.atlas, plan.pieces[index], cellSize, elapsedMs);
      }
    }

    return elapsedMs >= plan.totalDurationMs && this.settledIndices.size >= plan.pieces.length;
  }

  paintFinal(ctx: CanvasContext): void {
    if (!this.plan) return;
    this.paint(ctx, this.plan.totalDurationMs);
  }

  paintPlaceholder(ctx: CanvasContext): void {
    const width = NAME_DROP_COLUMNS * this.cellSize;
    const height = NAME_DROP_ROWS * this.cellSize;
    ctx.fillStyle = BOARD_FILL;
    ctx.fillRect(0, 0, width, height);
  }
}
