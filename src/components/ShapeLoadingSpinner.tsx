import React, { useEffect, useRef } from 'react';
import { SHAPES } from '../puzzleEngine/shapes';
import { useThemePackage } from '../presentation/ThemeProvider';
import type { ShapeType } from '../types';

interface ShapeLoadingSpinnerProps {
  cellSize?: number;
  orbitDurationMs?: number;
  className?: string;
}

const PIECE_SEQUENCE: readonly ShapeType[] = ['I', 'T', 'O', 'L', 'J', 'S', 'Z'];

export const ShapeLoadingSpinner: React.FC<ShapeLoadingSpinnerProps> = ({
  cellSize = 11,
  orbitDurationMs = 4200,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = useThemePackage();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gridDim = 22;
    const width = gridDim * cellSize;
    const height = gridDim * cellSize;

    // Handle high-DPI displays cleanly
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    let animationFrameId = 0;
    const startTime = performance.now();

    const render = (now: number) => {
      const elapsedMs = now - startTime;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const radius = width * 0.32;

      // In Seasalt theme, draw a dark comic ink annular ring behind the rotating pieces
      if (theme.id === 'seasalt') {
        const ringThickness = cellSize * 4.4;
        const innerRadius = radius - ringThickness / 2;
        const outerRadius = radius + ringThickness / 2;

        ctx.save();
        // Dark ink ring fill
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.lineWidth = ringThickness;
        ctx.strokeStyle = 'rgba(5, 6, 11, 0.92)';
        ctx.shadowColor = 'rgba(2, 15, 26, 0.8)';
        ctx.shadowBlur = 12;
        ctx.stroke();

        // Subtle cyan border lines matching Seasalt theme
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(42, 174, 245, 0.45)';
        ctx.lineWidth = 1.5;

        // Inner rim
        ctx.beginPath();
        ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Outer rim
        ctx.beginPath();
        ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }

      // Draw each orbiting shape piece
      const count = PIECE_SEQUENCE.length;
      for (let i = 0; i < count; i++) {
        const type = PIECE_SEQUENCE[i];
        const baseAngle = (i / count) * Math.PI * 2;
        const orbitAngle = baseAngle + (elapsedMs / orbitDurationMs) * Math.PI * 2;
        const px = cx + Math.cos(orbitAngle) * radius;
        const py = cy + Math.sin(orbitAngle) * radius;
        const pieceRotAngle = orbitAngle + Math.PI / 2;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(pieceRotAngle);

        const offsets = SHAPES[type][0];
        const color = theme.piecePalette[type];

        // Soft outer bloom
        ctx.shadowColor = color;
        ctx.shadowBlur = 3.5;

        for (let j = 0; j < offsets.length; j++) {
          const [dx, dy] = offsets[j];
          const ox = (dx - 1.5) * cellSize;
          const oy = (dy - 1) * cellSize;

          // Main filled cell
          ctx.fillStyle = color;
          ctx.fillRect(ox + 1, oy + 1, cellSize - 2, cellSize - 2);

          // Top and left interior highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.fillRect(ox + 1, oy + 1, cellSize - 2, 1.5);
          ctx.fillRect(ox + 1, oy + 1, 1.5, cellSize - 2);

          // Dark crisp border
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(ox + 0.5, oy + 0.5, cellSize - 1, cellSize - 1);
        }

        ctx.restore();
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [cellSize, orbitDurationMs, theme]);

  return (
    <canvas
      ref={canvasRef}
      role="status"
      aria-label="Searching for opponent"
      className={`block drop-shadow-[0_0_24px_rgba(0,0,0,0.8)] ${className}`}
    />
  );
};
