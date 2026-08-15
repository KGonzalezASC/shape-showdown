import React, { useEffect, useRef } from 'react';

const DOT_SPACING = 22;
const RIPPLE_FORCE = 0.65;
const RIPPLE_RADIUS = 220;
const UTILITY_HALFTONE_RADIUS = 190;
const UTILITY_HALFTONE_SWELL = 2.8;
const MAX_DEVICE_PIXEL_RATIO = 1.5;

/** Dominant title-card blue sampled from the Invincible reference. */
const BASE_COLOR = '#2aaef5';
const DOT_COLORS = {
  ink: 'rgba(5, 6, 11, 0.52)',
  yellow: 'rgba(249, 254, 14, 0.72)',
  blue: 'rgba(8, 96, 156, 0.5)',
} satisfies Record<'ink' | 'yellow' | 'blue', string>;

type DotColor = keyof typeof DOT_COLORS;
const DOT_COLOR_KEYS: readonly DotColor[] = ['ink', 'yellow', 'blue'];

interface HalftoneDot {
  x: number;
  y: number;
  radius: number;
  color: DotColor;
}

interface CanvasSize {
  width: number;
  height: number;
  devicePixelRatio: number;
  left: number;
  top: number;
}

interface PointerPosition {
  x: number;
  y: number;
  active: boolean;
}

function sampleHalftoneField(column: number, row: number): number {
  return (
    Math.sin(column * 0.43 + row * 0.57)
    + Math.cos(column * 0.67 - row * 0.29) * 0.75
    + Math.sin(column * 0.18 - row * 0.71) * 0.45
  );
}

function colorForHalftoneField(field: number): DotColor {
  if (field > 0.72) return 'yellow';
  if (field < -0.62) return 'ink';
  return 'blue';
}

/**
 * Invincible's interactive halftone field.
 *
 * The idle field is cached after resize. Pointer interaction copies that cache
 * and redraws only the dots inside the ripple, avoiding a permanent full-screen
 * animation loop.
 */
export const ComicHalftoneBackground = React.memo(function ComicHalftoneBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const cachedCanvas = document.createElement('canvas');
    const cachedContext = cachedCanvas.getContext('2d');
    if (!cachedContext) return;

    const size: CanvasSize = {
      width: 0,
      height: 0,
      devicePixelRatio: 1,
      left: 0,
      top: 0,
    };
    const pointer: PointerPosition = { x: -RIPPLE_RADIUS, y: -RIPPLE_RADIUS, active: false };
    let dots: HalftoneDot[] = [];
    let resizeFrame = 0;
    let renderFrame = 0;

    const fillDots = (
      target: CanvasRenderingContext2D,
      visibleDots: readonly HalftoneDot[],
      ripple: PointerPosition | null,
    ) => {
      for (const color of DOT_COLOR_KEYS) {
        target.beginPath();
        for (const dot of visibleDots) {
          if (dot.color !== color) continue;

          let drawX = dot.x;
          let drawY = dot.y;
          let radius = dot.radius;
          if (ripple) {
            const dx = dot.x - ripple.x;
            const dy = dot.y - ripple.y;
            const distance = Math.hypot(dx, dy);
            const normalizedDistance = 1 - distance / RIPPLE_RADIUS;
            const swell = normalizedDistance ** 2 * (14 * RIPPLE_FORCE);
            const push = normalizedDistance * (12 * RIPPLE_FORCE);
            radius += swell;
            drawX += (dx / (distance || 1)) * push;
            drawY += (dy / (distance || 1)) * push;
          }

          target.moveTo(drawX + radius, drawY);
          target.arc(drawX, drawY, radius, 0, Math.PI * 2);
        }
        target.fillStyle = DOT_COLORS[color];
        target.fill();
      }
    };

    const rebuildCache = () => {
      if (size.width < 1 || size.height < 1) return;

      cachedContext.setTransform(size.devicePixelRatio, 0, 0, size.devicePixelRatio, 0, 0);
      cachedContext.globalCompositeOperation = 'source-over';
      cachedContext.fillStyle = BASE_COLOR;
      cachedContext.fillRect(0, 0, size.width, size.height);

      const columns = Math.ceil(size.width / DOT_SPACING) + 1;
      const rows = Math.ceil(size.height / DOT_SPACING) + 1;
      const utilityFocusX = size.width < 901 ? size.width * 0.82 : size.width * 0.14;
      const utilityFocusY = size.height * 0.8;
      const nextDots: HalftoneDot[] = [];

      for (let column = 0; column < columns; column++) {
        for (let row = 0; row < rows; row++) {
          const baseX = column * DOT_SPACING;
          const baseY = row * DOT_SPACING;
          const halftoneField = sampleHalftoneField(column, row);
          const color = colorForHalftoneField(halftoneField);
          const waveX = Math.sin(column * 0.2) * 1.8;
          const waveY = Math.cos(row * 0.25) * 1.8;
          let radius = 2.4 + waveX + waveY + halftoneField * 0.35;

          const utilityDistance = Math.hypot(baseX - utilityFocusX, baseY - utilityFocusY);
          if (utilityDistance < UTILITY_HALFTONE_RADIUS) {
            const utilityStrength = 1 - utilityDistance / UTILITY_HALFTONE_RADIUS;
            radius += utilityStrength ** 1.4 * UTILITY_HALFTONE_SWELL;
          }

          radius = Math.max(0.8, Math.min(radius, DOT_SPACING * 0.85));
          nextDots.push({ x: baseX, y: baseY, radius, color });
        }
      }

      dots = nextDots;
      fillDots(cachedContext, dots, null);
      cachedContext.globalCompositeOperation = 'source-over';
    };

    const render = () => {
      if (size.width < 1 || size.height < 1) return;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = 'source-over';
      context.drawImage(cachedCanvas, 0, 0);

      if (!pointer.active) return;

      const rippleRadiusSquared = RIPPLE_RADIUS * RIPPLE_RADIUS;
      const rippleDots = dots.filter((dot) => {
        const dx = dot.x - pointer.x;
        const dy = dot.y - pointer.y;
        return dx * dx + dy * dy < rippleRadiusSquared;
      });

      context.setTransform(size.devicePixelRatio, 0, 0, size.devicePixelRatio, 0, 0);
      context.save();
      context.beginPath();
      context.arc(pointer.x, pointer.y, RIPPLE_RADIUS, 0, Math.PI * 2);
      context.clip();
      context.fillStyle = BASE_COLOR;
      context.fillRect(
        pointer.x - RIPPLE_RADIUS,
        pointer.y - RIPPLE_RADIUS,
        RIPPLE_RADIUS * 2,
        RIPPLE_RADIUS * 2,
      );
      fillDots(context, rippleDots, pointer);
      context.restore();
      context.globalCompositeOperation = 'source-over';
    };

    const scheduleRender = () => {
      if (renderFrame !== 0) return;
      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = 0;
        render();
      });
    };

    const resizeNow = () => {
      resizeFrame = 0;
      const rect = canvas.getBoundingClientRect();
      const devicePixelRatio = Math.min(
        Math.max(window.devicePixelRatio || 1, 1),
        MAX_DEVICE_PIXEL_RATIO,
      );
      const width = Math.max(1, Math.round(rect.width * devicePixelRatio));
      const height = Math.max(1, Math.round(rect.height * devicePixelRatio));

      size.width = rect.width;
      size.height = rect.height;
      size.left = rect.left;
      size.top = rect.top;
      size.devicePixelRatio = devicePixelRatio;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (cachedCanvas.width !== width || cachedCanvas.height !== height) {
        cachedCanvas.width = width;
        cachedCanvas.height = height;
      }

      rebuildCache();
      render();
    };

    const scheduleResize = () => {
      if (resizeFrame !== 0) return;
      resizeFrame = window.requestAnimationFrame(resizeNow);
    };

    const updatePointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.x = event.clientX - size.left;
      pointer.y = event.clientY - size.top;
      pointer.active = true;
      scheduleRender();
    };

    const clearPointer = () => {
      if (!pointer.active) return;
      pointer.active = false;
      scheduleRender();
    };

    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(canvas);
    window.addEventListener('resize', scheduleResize, { passive: true });
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('blur', clearPointer);
    document.addEventListener('mouseleave', clearPointer);

    resizeNow();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleResize);
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('blur', clearPointer);
      document.removeEventListener('mouseleave', clearPointer);
      if (resizeFrame !== 0) window.cancelAnimationFrame(resizeFrame);
      if (renderFrame !== 0) window.cancelAnimationFrame(renderFrame);
    };
  }, []);

  return (
    <div
      className="ss-comic-halftone-background pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <canvas ref={canvasRef} className="ss-comic-halftone-background__canvas" />
    </div>
  );
});
