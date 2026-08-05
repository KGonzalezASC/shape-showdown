import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { recordBoardCanvasPaint } from '../performance/boardPerformance';
import { areCanvasOverlaysDisabled } from '../performance/perfDiagnostic';
import type { BoardVisualCell, BoardVisualModel } from './boardVisualModel';
import {
  isCanvasLayoutVisible,
  syncCanvasBackingStore,
} from './boardRenderer';

interface BoardCanvasOverlayProps {
  model: BoardVisualModel;
  cellSize: number;
  performanceId: string;
}

function drawHatching(
  ctx: CanvasRenderingContext2D,
  cell: BoardVisualCell,
  cellSize: number,
  phase: number,
): void {
  const left = cell.x * cellSize;
  const top = cell.y * cellSize;
  const spacing = Math.max(3, cellSize * 0.18);
  const offset = phase % spacing;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left + 1, top + 1, cellSize - 2, cellSize - 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.38)';
  ctx.lineWidth = Math.max(1, cellSize * 0.035);
  ctx.beginPath();
  for (let x = -cellSize + offset; x < cellSize * 2; x += spacing) {
    ctx.moveTo(left + x, top + cellSize);
    ctx.lineTo(left + x + cellSize, top);
  }
  ctx.stroke();
  ctx.restore();
}

function drawMagnetAura(
  ctx: CanvasRenderingContext2D,
  cell: BoardVisualCell,
  cellSize: number,
  elapsedMs: number,
): void {
  const hue = (elapsedMs * 0.18 + (cell.x + cell.y) * 14) % 360;
  const inset = Math.max(1, cellSize * 0.07);
  ctx.save();
  ctx.strokeStyle = `hsl(${hue} 88% 72%)`;
  ctx.shadowColor = `hsl(${(hue + 65) % 360} 92% 62%)`;
  ctx.shadowBlur = Math.max(3, cellSize * 0.28);
  ctx.lineWidth = Math.max(1.5, cellSize * 0.07);
  ctx.strokeRect(
    cell.x * cellSize + inset,
    cell.y * cellSize + inset,
    cellSize - inset * 2,
    cellSize - inset * 2,
  );
  ctx.restore();
}

export function paintBoardCanvasOverlay(
  ctx: CanvasRenderingContext2D,
  model: BoardVisualModel,
  cellSize: number,
  elapsedMs: number,
): void {
  ctx.clearRect(0, 0, model.columns * cellSize, model.rows * cellSize);
  if (areCanvasOverlaysDisabled()) return;

  const hatchPhase = Math.floor(elapsedMs / 100) * 2;

  for (const cell of model.cells) {
    if (cell.hatched) drawHatching(ctx, cell, cellSize, hatchPhase);
    if (cell.magnetAura) drawMagnetAura(ctx, cell, cellSize, elapsedMs);
    if (cell.bomber) {
      ctx.save();
      ctx.font = `${Math.max(10, cellSize * 0.48)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 2;
      ctx.fillText(
        '💣',
        (cell.x + 0.5) * cellSize,
        (cell.y + 0.53) * cellSize,
      );
      ctx.restore();
    }
  }

  if (model.wildcardOutline.length > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgb(250 232 255)';
    ctx.lineWidth = Math.max(1.5, cellSize * 0.08);
    ctx.lineCap = 'round';
    ctx.setLineDash([2, 4]);
    ctx.lineDashOffset = -(elapsedMs / 58) % 12;
    ctx.shadowColor = 'rgba(217,70,239,0.95)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of model.wildcardOutline) {
      ctx.moveTo(x1 * cellSize, y1 * cellSize);
      ctx.lineTo(x2 * cellSize, y2 * cellSize);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export const BoardCanvasOverlay: React.FC<BoardCanvasOverlayProps> = ({
  model,
  cellSize,
  performanceId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef(model);
  const cellSizeRef = useRef(cellSize);
  modelRef.current = model;
  cellSizeRef.current = cellSize;
  const hasContinuousAnimation =
    model.wildcardOutline.length > 0 ||
    model.cells.some((cell) => cell.magnetAura);
  const hasSteppedAnimation = model.cells.some((cell) => cell.hatched);

  const paintRef = useRef<(now: number) => void>(() => {});
  paintRef.current = (now: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !isCanvasLayoutVisible(canvas)) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const paintStartedAt = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBoardCanvasOverlay(ctx, modelRef.current, cellSizeRef.current, now);
    recordBoardCanvasPaint(
      'board-canvas',
      performanceId,
      performance.now() - paintStartedAt,
    );
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = syncCanvasBackingStore(
      canvas,
      cellSize,
      window.devicePixelRatio || 1,
    );
    canvas.style.width = `${size.cssWidth}px`;
    canvas.style.height = `${size.cssHeight}px`;
  }, [cellSize]);

  useLayoutEffect(() => {
    paintRef.current(performance.now());
  }, [model, cellSize]);

  useEffect(() => {
    if (!hasContinuousAnimation) return;
    let frame = 0;
    const animate = (now: number) => {
      paintRef.current(now);
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [hasContinuousAnimation]);

  useEffect(() => {
    if (!hasSteppedAnimation || hasContinuousAnimation) return;
    const timer = window.setInterval(() => {
      paintRef.current(performance.now());
    }, 100);
    return () => window.clearInterval(timer);
  }, [hasContinuousAnimation, hasSteppedAnimation]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10"
      aria-label="Board effect overlay"
      data-occupied-cells={
        model.cells.filter(
          (cell) => cell.value !== null || cell.poisonVariant > 0,
        ).length
      }
    />
  );
};
