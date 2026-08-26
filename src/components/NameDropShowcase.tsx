import React, { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { ArrowUpRight, Github, Play, Sparkles, Swords } from 'lucide-react';
import { NameDropLayeredRenderer } from '../nameDrop/nameDropCanvas';
import {
  syncNameDropPlaybackClock,
  type NameDropPlaybackClock,
} from '../nameDrop/nameDropPlayback';
import { getPrebakedNameDropPlan } from '../nameDrop/nameDropPrebaked';
import {
  NAME_DROP_COLUMNS,
  NAME_DROP_ROWS,
  normalizeName,
  type NameDropPlan,
} from '../nameDrop/nameDropShared';
import { buildAppUrl, navigateInApp, openExternalUrl } from '../discordContext';


type RenderWorkerOut =
  | { type: 'ready' }
  | { type: 'cycleComplete' }
  | { type: 'error'; message: string };

const PLAN_CACHE = new Map<string, NameDropPlan>();

type NameDropResult = { name: string; plan: NameDropPlan } | null;
type NameDropPlanAction = { type: 'SET'; value: { name: string; plan: NameDropPlan } };

function initialNameDropResult(name: string): NameDropResult {
  const plan = getPrebakedNameDropPlan(name) ?? PLAN_CACHE.get(name);
  return plan ? { name, plan } : null;
}

function nameDropPlanReducer(_state: NameDropResult, action: NameDropPlanAction): NameDropResult {
  return action.value;
}

function useFittedCellSize(containerRef: React.RefObject<HTMLDivElement | null>): number {
  const [cellSize, setCellSize] = useState(12);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const { width, height } = container.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      const next = Math.max(1, Math.min(42, Math.floor(Math.min(
        width / NAME_DROP_COLUMNS,
        height / NAME_DROP_ROWS,
      ))));
      setCellSize((previous) => (previous === next ? previous : next));
    };
    const scheduleUpdate = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [containerRef]);

  return cellSize;
}

function useNameDropPlan(name: string): NameDropPlan | null {
  const [result, dispatchResult] = useReducer(
    nameDropPlanReducer,
    name,
    initialNameDropResult,
  );
  const currentPlan = result?.name === name ? result.plan : null;

  useEffect(() => {
    const prebaked = getPrebakedNameDropPlan(name);
    if (prebaked) {
      PLAN_CACHE.set(name, prebaked);
      dispatchResult({ type: 'SET', value: { name, plan: prebaked } });
      return;
    }

    const cached = PLAN_CACHE.get(name);
    if (cached) {
      dispatchResult({ type: 'SET', value: { name, plan: cached } });
      return;
    }

    let disposed = false;
    let worker: Worker | null = null;
    let fallbackStarted = false;

    const finish = (plan: NameDropPlan) => {
      PLAN_CACHE.set(name, plan);
      if (!disposed) dispatchResult({ type: 'SET', value: { name, plan } });
    };
    const calculateFallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      void import('../nameDrop/nameDrop').then(({ createNameDropPlan }) => {
        finish(createNameDropPlan(name));
      });
    };

    try {
      worker = new Worker(
        new URL('../nameDrop/nameDrop.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.addEventListener('message', (event: MessageEvent<NameDropPlan>) => {
        finish(event.data);
        worker?.terminate();
        worker = null;
      });
      worker.addEventListener('error', () => {
        worker?.terminate();
        worker = null;
        calculateFallback();
      });
      worker.postMessage(name);
    } catch {
      calculateFallback();
    }

    return () => {
      disposed = true;
      worker?.terminate();
    };
  }, [name]);

  return currentPlan;
}

function useNameDropCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  plan: NameDropPlan | null,
  cellSize: number,
  cycle: number,
): void {
  const workerRef = useRef<Worker | null>(null);
  const transferredRef = useRef(false);
  const fallbackRendererRef = useRef<NameDropLayeredRenderer | null>(null);
  const playbackClockRef = useRef<NameDropPlaybackClock>({
    plan: null,
    cycle: -1,
    startedAt: 0,
  });
  // Keep rendering on the main thread until OffscreenCanvas worker output is
  // consistently observable in the supported browser matrix. The canvas
  // renderer still removes the per-cell DOM cost; planning remains worker-backed
  // for custom names and prebaked plans bypass planning entirely.
  const useWorkerRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cellSize < 1) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let disposed = false;
    let frame = 0;

    const displayWidth = NAME_DROP_COLUMNS * cellSize;
    const displayHeight = NAME_DROP_ROWS * cellSize;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    if (!transferredRef.current) {
      canvas.width = Math.floor(displayWidth * dpr);
      canvas.height = Math.floor(displayHeight * dpr);
    }

    const paintFallback = () => {
      if (!canvas || !plan) return;
      const renderer = fallbackRendererRef.current ?? new NameDropLayeredRenderer();
      fallbackRendererRef.current = renderer;
      const ctx = renderer.configure(canvas, cellSize, dpr);
      renderer.begin(plan);
      playbackClockRef.current = syncNameDropPlaybackClock(
        playbackClockRef.current,
        plan,
        cycle,
        performance.now(),
      );
      const startedAt = playbackClockRef.current.startedAt;

      const tick = (now: number) => {
        if (disposed) return;
        const elapsed = now - startedAt;
        const done = renderer.paint(ctx, Math.min(elapsed, plan.totalDurationMs));
        if (!done) frame = window.requestAnimationFrame(tick);
        else renderer.paintFinal(ctx);
      };

      tick(performance.now());
    };

    const startWorkerPlayback = (worker: Worker) => {
      if (!plan) {
        worker.postMessage({ type: 'resize', cellSize, dpr });
        return;
      }
      worker.postMessage({ type: 'play', plan, cellSize });
    };

    const attachWorker = () => {
      if (!useWorkerRef.current || transferredRef.current) return;
      if (typeof canvas.transferControlToOffscreen !== 'function') {
        useWorkerRef.current = false;
        return;
      }

      try {
        const worker = new Worker(
          new URL('../nameDrop/nameDropRender.worker.ts', import.meta.url),
          { type: 'module' },
        );
        workerRef.current = worker;
        worker.addEventListener('message', (event: MessageEvent<RenderWorkerOut>) => {
          if (event.data.type === 'error') {
            console.error('[name-drop render worker]', event.data.message);
            useWorkerRef.current = false;
          }
        });
        worker.addEventListener('error', () => {
          console.error('[name-drop render worker] crashed');
          useWorkerRef.current = false;
        });

        const offscreen = canvas.transferControlToOffscreen();
        transferredRef.current = true;
        worker.postMessage({ type: 'attach', canvas: offscreen, dpr }, [offscreen]);
        startWorkerPlayback(worker);
      } catch {
        useWorkerRef.current = false;
      }
    };

    if (!plan) {
      if (useWorkerRef.current && !transferredRef.current) attachWorker();
      if (!useWorkerRef.current) {
        const renderer = fallbackRendererRef.current ?? new NameDropLayeredRenderer();
        fallbackRendererRef.current = renderer;
        const ctx = renderer.configure(canvas, cellSize, dpr);
        renderer.paintPlaceholder(ctx);
      }
      return () => {
        disposed = true;
        if (frame) window.cancelAnimationFrame(frame);
        workerRef.current?.postMessage({ type: 'stop' });
      };
    }

    if (useWorkerRef.current) {
      if (!transferredRef.current) attachWorker();
      else workerRef.current?.postMessage({ type: 'play', plan, cellSize });
    } else {
      paintFallback();
    }

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      workerRef.current?.postMessage({ type: 'stop' });
    };
  }, [canvasRef, plan, cellSize, cycle]);

  useEffect(() => () => {
    workerRef.current?.postMessage({ type: 'stop' });
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);
}

export interface NameDropShowcaseProps {
  name?: string;
  statusLabel?: string;
}

/** Landing-page visual: deterministic falling shape drops reveal a compact block-letter name. */
const NameDropShowcase: React.FC<NameDropShowcaseProps> = ({
  name = 'KEITH GONZALEZ',
  statusLabel = 'Live name drop',
}) => {
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellSize = useFittedCellSize(boardAreaRef);
  const normalizedName = normalizeName(name);
  const plan = useNameDropPlan(normalizedName);
  const [cycle, setCycle] = useState(0);

  useNameDropCanvas(canvasRef, plan, cellSize, cycle);

  useEffect(() => {
    if (!plan) return;
    const timer = window.setTimeout(() => setCycle((value) => value + 1), plan.totalDurationMs);
    return () => window.clearTimeout(timer);
  }, [cycle, plan]);

  return (
    <main className="relative flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-[#07080b] text-white selection:bg-emerald-300 selection:text-[#07080b]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-emerald-400/[0.08] blur-[110px]" />
        <div className="absolute -right-24 top-0 h-72 w-72 rounded-full bg-fuchsia-500/[0.07] blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:32px_32px]" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl shrink-0 items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-6">
        <a href={buildAppUrl('/')} onClick={(e) => navigateInApp(e, '/')} className="group flex min-w-0 items-center gap-3 sm:gap-4" aria-label="Shape Showdown home">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.16)] transition-colors group-hover:bg-emerald-300/15 sm:h-12 sm:w-12">
            <Swords className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300/70 sm:text-xs">
              Shape Showdown
            </span>
            <span className="block truncate text-sm font-semibold text-zinc-200 sm:text-base">
              Fall into place.
            </span>
          </span>
        </a>

        <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 backdrop-blur-sm sm:px-4 sm:py-2 sm:text-xs">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.8)]" />
          <span className="sm:hidden">Live</span>
          <span className="hidden sm:inline">{statusLabel}</span>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 pb-4 sm:px-8 sm:pb-8">
        <div className="mb-4 shrink-0 text-center sm:mb-6">
          <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.34em] text-zinc-500 sm:text-xs">
            <Sparkles className="h-3.5 w-3.5 text-fuchsia-300/80" />
            <span>Designed &amp; built by</span>
          </div>
          <h1 className="text-balance text-2xl font-black tracking-[-0.04em] text-zinc-100 sm:text-4xl">
            A signature made of falling pieces.
          </h1>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <div aria-hidden="true" className="absolute inset-x-[12%] inset-y-[8%] rounded-[2rem] bg-emerald-300/[0.04] blur-3xl" />
          <div ref={boardAreaRef} className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden">
            <canvas
              ref={canvasRef}
              className="name-drop-board relative shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,.55),0_0_80px_rgba(16,185,129,.09),inset_0_0_40px_rgba(255,255,255,.02)] sm:rounded-2xl"
              role="img"
              aria-busy={!plan}
              aria-label={plan
                ? `Animated piece showcase spelling ${plan.name}`
                : `Preparing piece showcase spelling ${normalizedName}`}
            />
          </div>
        </div>

        <footer className="mt-4 flex shrink-0 flex-col items-center justify-between gap-4 sm:mt-6 sm:flex-row">
          <div className="text-center sm:text-left">
            <p className="font-mono text-xs uppercase tracking-[0.35em] text-zinc-300 sm:text-sm">
              {plan?.name ?? normalizedName}
            </p>
            <p className="mt-1 text-xs text-zinc-600 sm:text-sm">
              {plan
                ? `${plan.pieces.length} game pieces. One name.`
                : 'Preparing the piece arrangement…'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://github.com/KGonzalezASC/shape-showdown"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                void openExternalUrl('https://github.com/KGonzalezASC/shape-showdown');
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-xs font-bold text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white sm:h-11 sm:text-sm"
            >
              <Github className="h-4 w-4" />
              Source
              <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
            </a>
            <a
              href={buildAppUrl('/game/')}
              onClick={(e) => navigateInApp(e, '/game/')}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-emerald-300 px-5 text-xs font-black text-[#07110d] shadow-[0_0_30px_rgba(110,231,183,.18)] transition-colors hover:bg-emerald-200 sm:h-11 sm:text-sm"
            >
              <Play className="h-4 w-4 fill-current" />
              Play game
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
};

export default NameDropShowcase;
