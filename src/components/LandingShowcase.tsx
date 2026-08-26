import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HelpCircle, Play, X } from 'lucide-react';
import { useSetThemeId, useThemePackage } from '../presentation/ThemeProvider';
import { THEME_IDS, type ThemeId } from '../presentation/themePackage';
import { buildAppUrl, isDiscordActivityContext, navigateInApp, openExternalUrl } from '../discordContext';
import {
  readPreferredMatchScope,
  writePreferredMatchScope,
  type SearchScope,
} from '../matchmaking/searchScope';
import { MatchScopePicker } from './MatchScopePicker';

type PieceKey = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

const SHAPES: Record<PieceKey, number[][][]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
};

const POLYGON_BASE_ANGLES: Record<number, Array<{ cos: number; sin: number }>> = {};
for (let sides = 5; sides <= 7; sides++) {
  POLYGON_BASE_ANGLES[sides] = Array.from({ length: sides }, (_, i) => {
    const a = (i * 2 * Math.PI) / sides;
    return { cos: Math.cos(a), sin: Math.sin(a) };
  });
}

function voronoiCellSides(offsetIndex: number): number {
  return 5 + (offsetIndex % 3);
}

const RAW_PIECES: Array<readonly [PieceKey, number, number, number]> = [
  ['T', 3, 9, 24], ['Z', 3, 25, 24], ['T', 2, 33, 24], ['T', 1, 48, 24], ['J', 0, 1, 24],
  ['J', 2, 2, 23], ['J', 0, 13, 24], ['O', 3, 18, 24], ['O', 3, 28, 24], ['J', 2, 34, 23],
  ['O', 2, 42, 24], ['J', 3, 53, 23], ['T', 0, 56, 24], ['O', 3, 60, 24], ['S', 2, 8, 22],
  ['Z', 0, 13, 23], ['T', 1, 24, 22], ['T', 2, 32, 22], ['T', 2, 49, 22], ['J', 1, 52, 22],
  ['S', 1, 56, 22], ['O', 2, 4, 22], ['L', 0, 16, 22], ['J', 0, 21, 22], ['Z', 3, 27, 21],
  ['T', 0, 28, 22], ['O', 0, 36, 22], ['L', 0, 40, 22], ['T', 0, 45, 22], ['S', 1, 50, 21],
  ['J', 0, 61, 22], ['T', 0, 8, 21], ['S', 2, 13, 20], ['S', 0, 16, 21], ['T', 2, 21, 20],
  ['Z', 3, 26, 20], ['T', 1, 29, 20], ['J', 3, 33, 20], ['S', 2, 40, 20], ['L', 2, 45, 20],
  ['L', 1, 48, 20], ['J', 2, 56, 20], ['T', 2, 61, 20], ['O', 3, 2, 20], ['S', 2, 10, 19],
  ['S', 0, 12, 20], ['Z', 1, 24, 19], ['T', 3, 28, 19], ['T', 3, 32, 19], ['L', 1, 36, 19],
  ['L', 3, 49, 19], ['T', 2, 51, 19], ['J', 3, 53, 19], ['Z', 0, 8, 19], ['Z', 0, 16, 19],
  ['J', 0, 21, 19], ['L', 3, 37, 18], ['L', 0, 40, 19], ['J', 0, 45, 19], ['J', 3, 57, 18],
  ['J', 2, 59, 18], ['T', 1, 61, 18], ['O', 1, 0, 18], ['T', 3, 9, 17], ['J', 3, 13, 17],
  ['J', 2, 16, 17], ['T', 2, 21, 17], ['Z', 3, 25, 17], ['S', 1, 28, 17], ['S', 3, 33, 17],
  ['T', 2, 40, 17], ['Z', 2, 45, 17], ['T', 1, 52, 17], ['T', 3, 56, 17], ['J', 1, 12, 16],
  ['Z', 0, 48, 17], ['T', 0, 59, 17], ['L', 2, 3, 15], ['L', 0, 4, 16], ['S', 0, 8, 16],
  ['O', 1, 18, 16], ['S', 0, 24, 16], ['S', 3, 29, 15], ['L', 0, 34, 16], ['O', 0, 42, 16],
  ['S', 3, 49, 15], ['Z', 2, 53, 15], ['T', 3, 57, 15], ['Z', 1, 58, 15], ['J', 0, 33, 15],
  ['Z', 3, 33, 10], ['Z', 1, 36, 10], ['J', 1, 45, 10], ['Z', 1, 46, 10], ['I', 2, 13, 9],
  ['O', 3, 20, 10], ['O', 0, 24, 10], ['O', 2, 28, 10], ['J', 1, 44, 9], ['O', 0, 48, 10],
  ['I', 0, 13, 9], ['I', 3, 32, 7], ['Z', 3, 37, 8], ['O', 0, 16, 8], ['J', 3, 20, 7],
  ['J', 1, 21, 7], ['O', 3, 24, 8], ['O', 1, 28, 8], ['T', 1, 33, 7], ['J', 3, 36, 6],
  ['S', 2, 45, 6], ['O', 1, 14, 6], ['Z', 2, 23, 5], ['S', 3, 25, 5], ['I', 0, 28, 6],
  ['Z', 3, 32, 5], ['L', 0, 38, 6], ['J', 3, 44, 5], ['J', 2, 46, 5], ['L', 0, 20, 5],
  ['T', 0, 29, 5], ['L', 3, 33, 4], ['Z', 0, 37, 5], ['O', 3, 12, 4], ['Z', 3, 21, 3],
  ['S', 3, 25, 3], ['S', 2, 28, 3], ['O', 1, 40, 4], ['S', 1, 44, 3], ['Z', 2, 36, 2],
  ['I', 2, 15, 1], ['Z', 1, 20, 1], ['Z', 2, 25, 1], ['O', 2, 30, 2], ['L', 0, 38, 2],
  ['S', 3, 45, 1], ['L', 2, 47, 1], ['L', 0, 48, 2], ['I', 0, 15, 1], ['T', 0, 37, 1]
];

const COLS = 64;
const ROWS = 28;
const ANIMATION_DURATION_MS = 2200;
const LOOP_HOLD_MS = 1000;

interface RevealPiece {
  type: PieceKey;
  rotation: number;
  x: number;
  y: number;
  letterIdx: number;
}

interface RevealCell {
  x: number;
  y: number;
  type: PieceKey;
  sides: number;
  revealTime: number;
}

function letterIndexFor(px: number, py: number): number {
  if (py < 15) {
    if (px < 18) return 0;
    if (px < 26) return 1;
    if (px < 34) return 2;
    if (px < 42) return 3;
    return 4;
  }
  return 5 + Math.min(7, Math.floor(px / 8));
}

const PIECES: RevealPiece[] = RAW_PIECES.map(([type, rotation, px, py]) => ({
  type,
  rotation,
  x: px,
  y: py,
  letterIdx: letterIndexFor(px, py),
}));

const ALL_CELLS: RevealCell[] = (() => {
  const cells: RevealCell[] = [];
  const byLetter = new Map<number, RevealPiece[]>();
  for (const piece of PIECES) {
    const group = byLetter.get(piece.letterIdx);
    if (group) group.push(piece);
    else byLetter.set(piece.letterIdx, [piece]);
  }
  const revealTimes = new Map<string, number>();
  for (const letterPieces of byLetter.values()) {
    letterPieces.sort((a, b) => b.y - a.y || a.x - b.x);
    const interval = (ANIMATION_DURATION_MS * 0.82) / letterPieces.length;
    letterPieces.forEach((piece, idx) => {
      const baseTime = idx * interval;
      SHAPES[piece.type][piece.rotation].forEach(([dx, dy], cellIdx) => {
        revealTimes.set(`${piece.x + dx},${piece.y + dy}`, baseTime + cellIdx * 12);
      });
    });
  }
  for (const piece of PIECES) {
    SHAPES[piece.type][piece.rotation].forEach(([dx, dy], offsetIndex) => {
      cells.push({
        x: piece.x + dx,
        y: piece.y + dy,
        type: piece.type,
        sides: voronoiCellSides(offsetIndex),
        revealTime: revealTimes.get(`${piece.x + dx},${piece.y + dy}`) ?? 0,
      });
    });
  }
  return cells;
})();

interface RevealCanvasStyle {
  bg: string;
  grid: string;
  border: string;
}

const REVEAL_CANVAS_STYLES: Record<ThemeId, RevealCanvasStyle> = {
  default: {
    bg: '#08090d',
    grid: 'rgba(255, 255, 255, 0.035)',
    border: 'rgba(255, 255, 255, 0.32)',
  },
  bloodbucket: {
    bg: '#171717',
    grid: 'rgba(222, 222, 222, 0.04)',
    border: 'rgba(222, 222, 222, 0.28)',
  },
  seasalt: {
    bg: '#0c121e',
    grid: 'rgba(123, 175, 233, 0.04)',
    border: 'rgba(123, 175, 233, 0.28)',
  },
};

const THEME_OPTIONS: Array<{ id: ThemeId; label: string; accent: string }> = [
  { id: 'default', label: 'Default', accent: '#34d399' },
  { id: 'bloodbucket', label: 'Bloodbucket', accent: '#e5484d' },
  { id: 'seasalt', label: 'Seasalt', accent: '#7bafe9' },
];

function traceCrispVoronoiPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sides: number,
  cellSize: number
): void {
  const baseAngles = POLYGON_BASE_ANGLES[sides] ?? POLYGON_BASE_ANGLES[5];
  const rad = cellSize * 0.46;

  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const base = baseAngles[i];
    const px = cx + rad * base.cos;
    const py = cy + rad * base.sin;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const LandingShowcase: React.FC = () => {
  const theme = useThemePackage();
  const setThemeId = useSetThemeId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const elapsedRef = useRef(0);

  const inDiscordActivity = isDiscordActivityContext();
  const [matchScope, setMatchScope] = useState<SearchScope>(
    () => readPreferredMatchScope() ?? 'global',
  );

  const changeMatchScope = (scope: SearchScope) => {
    if (scope === matchScope) return;
    setMatchScope(scope);
    writePreferredMatchScope(scope);
  };

  const restartAnimation = () => {
    elapsedRef.current = 0;
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastTimestamp = performance.now();

    const renderFrame = () => {
      const currentTheme = themeRef.current;
      const style = REVEAL_CANVAS_STYLES[currentTheme.id] ?? REVEAL_CANVAS_STYLES.default;
      const palette = currentTheme.piecePalette;
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) return;

      const cellW = width / COLS;
      const cellH = height / ROWS;
      const cellSize = Math.min(cellW, cellH);
      const strokeWidth = Math.max(0.6, cellSize * 0.075);

      ctx.fillStyle = style.bg;
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = style.grid;
      ctx.lineWidth = Math.max(0.5, cellSize * 0.035);
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellW, 0);
        ctx.lineTo(x * cellW, height);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellH);
        ctx.lineTo(width, y * cellH);
        ctx.stroke();
      }

      const elapsed = elapsedRef.current;

      for (const cell of ALL_CELLS) {
        if (elapsed < cell.revealTime) continue;

        const cellAge = elapsed - cell.revealTime;
        let scale = 1.0;
        let opacity = 1.0;
        if (cellAge < 140) {
          const t = cellAge / 140;
          scale = 0.88 + t * 0.12;
          opacity = 0.4 + t * 0.6;
        }

        const cx = (cell.x + 0.5) * cellW;
        const cy = (cell.y + 0.5) * cellH;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        traceCrispVoronoiPolygon(ctx, cx, cy, cell.sides, cellSize);

        ctx.fillStyle = palette[cell.type];
        ctx.fill();

        const innerGrad = ctx.createLinearGradient(
          cx - cellSize / 2,
          cy - cellSize / 2,
          cx + cellSize / 2,
          cy + cellSize / 2
        );
        innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
        innerGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
        innerGrad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = innerGrad;
        ctx.fill();

        ctx.strokeStyle = style.border;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();

        ctx.restore();
      }
    };

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetWidth = Math.round(rect.width * dpr);
      const targetHeight = Math.round(rect.height * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        renderFrame(); // Synchronously repaint immediately so there is never a blank frame
      }
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);

    const tick = (timestamp: number) => {
      const delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;
      elapsedRef.current += delta;

      const totalCycle = ANIMATION_DURATION_MS + LOOP_HOLD_MS;
      if (elapsedRef.current > totalCycle) {
        elapsedRef.current = 0;
      }

      renderFrame();
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const activeOption = THEME_OPTIONS.find((t) => t.id === theme.id) ?? THEME_OPTIONS[0];

  return (
    <div className="relative flex min-h-dvh flex-col justify-between overflow-x-hidden bg-[#07080b] p-4 font-sans text-white sm:p-6 lg:p-8">
      {/* Background ambient lighting */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          style={{
            backgroundColor: activeOption.accent,
            opacity: 0.06,
          }}
          className="absolute left-1/2 top-1/3 h-96 w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[140px] transition-colors duration-500"
        />
        <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      {/* Top Bar: Theme Switcher moved below the action row */}

      {/* Main Center Stage */}
      <main className="relative z-10 my-auto flex w-full flex-col items-center justify-center py-4 sm:py-6">
        <div className="w-full max-w-5xl">
          {/* Animated Name Frame */}
          <div
            ref={containerRef}
            onClick={restartAnimation}
            title="Click to replay animation"
            className="cursor-pointer relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#08090d] shadow-[0_20px_60px_rgba(0,0,0,0.7)] sm:rounded-2xl"
            style={{ aspectRatio: `${COLS} / ${ROWS}` }}
          >
            <canvas
              ref={canvasRef}
              className="block h-full w-full"
              role="img"
              aria-label="Shape Showdown animated Voronoi polyomino name assembly"
            />
          </div>

          {/* Action Row */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:mt-6 sm:flex-nowrap sm:gap-4">
            <a
              href={buildAppUrl('/game/')}
              onClick={(e) => navigateInApp(e, '/game/')}
              style={{
                backgroundColor: activeOption.accent,
                boxShadow: `0 0 24px ${activeOption.accent}33`,
              }}
              className="inline-flex h-10 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-xl px-4 text-[9px] font-black uppercase tracking-wider text-[#07110d] transition-all hover:brightness-110 active:scale-[0.98] sm:h-12 sm:gap-2 sm:px-8 sm:text-xs"
            >
              <Play className="h-3.5 w-3.5 fill-current sm:h-4 sm:w-4" />
              <span>Play Game</span>
            </a>

            <button
              type="button"
              onClick={() => setShowHowToPlay(true)}
              className="inline-flex h-10 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[9px] font-bold uppercase tracking-wider text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white sm:h-12 sm:gap-2 sm:px-6 sm:text-xs"
            >
              <HelpCircle className="h-3.5 w-3.5 text-zinc-400 sm:h-4 sm:w-4" />
              <span>How To Play</span>
            </button>
          </div>

          {/* Opponent search scope — only meaningful inside a Discord Activity */}
          {inDiscordActivity && (
            <div className="mt-3 flex justify-center">
              <MatchScopePicker value={matchScope} onChange={changeMatchScope} />
            </div>
          )}

          {/* Theme Picker */}
          <div
            role="radiogroup"
            aria-label="Theme selection"
            className="-mx-1 mt-4 flex max-w-full items-center gap-x-1 overflow-x-auto px-1 py-1 [justify-content:safe_center] [scrollbar-width:none] sm:mt-5 [&::-webkit-scrollbar]:hidden"
          >
            {THEME_OPTIONS.map((item, i) => {
              const isActive = theme.id === item.id;
              return (
                <span key={`${item.id}-${i}`} className="flex shrink-0 items-center">
                  {i > 0 && (
                    <span aria-hidden="true" className="mx-1.5 text-zinc-700">
                      ·
                    </span>
                  )}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setThemeId(item.id)}
                    style={isActive ? { color: item.accent } : undefined}
                    className={`px-1 py-1.5 text-[10px] font-bold uppercase tracking-tight transition-colors hover:text-zinc-300 sm:text-xs ${
                      isActive
                        ? 'underline decoration-2 underline-offset-4'
                        : 'text-zinc-500'
                    }`}
                  >
                    {item.label}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-center border-t border-white/[0.08] pt-3 text-[10px] uppercase tracking-wider text-zinc-500 sm:justify-start sm:pt-4">
        <p className="text-center leading-relaxed">
          Designed &amp; built by{' '}
          <a
            href="https://keithgonzalez.vercel.app/"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              e.preventDefault();
              void openExternalUrl('https://keithgonzalez.vercel.app/');
            }}
            className="font-bold text-zinc-300 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-white hover:decoration-zinc-400"
          >
            Keith Gonzalez
          </a>
        </p>
      </footer>

      {/* How To Play Modal */}
      {showHowToPlay && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How to play Shape Showdown"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#10121a] p-5 shadow-2xl sm:p-6">
            <button
              type="button"
              onClick={() => setShowHowToPlay(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-white sm:text-base">
              How To Play
            </h2>

            <div className="space-y-3 text-[10px] text-zinc-300 sm:text-xs">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="font-bold text-white">Controls</p>
                <p className="mt-1 leading-relaxed text-zinc-400">
                  <span className="font-mono text-zinc-200">← / →</span> Move •{' '}
                  <span className="font-mono text-zinc-200">↓</span> Soft Drop •{' '}
                  <span className="font-mono text-zinc-200">↑ / Space</span> Hard Drop •{' '}
                  <span className="font-mono text-zinc-200">Z / X</span> Rotate •{' '}
                  <span className="font-mono text-zinc-200">Shift</span> Storage •{' '}
                  <span className="font-mono text-zinc-200">C</span> Shop
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="font-bold text-white">Line Clears &amp; Shop</p>
                <p className="mt-1 leading-relaxed text-zinc-400">
                  Clear rows to earn cash and roll powers in your shop rail. Buy offensive abilities to poison, freeze, or disrupt your opponent's board.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="font-bold text-white">Victory</p>
                <p className="mt-1 leading-relaxed text-zinc-400">
                  Survive the attacks. The first player to top out above the visible board loses.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHowToPlay(false)}
                style={{ backgroundColor: activeOption.accent }}
                className="rounded-xl px-5 py-2 text-xs font-black uppercase tracking-wider text-[#07110d]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingShowcase;
