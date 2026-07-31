export type BoardPerformanceRenderer = 'dom' | 'board-canvas' | 'voronoi-canvas';

interface ReactCommitSample {
  kind: 'react-render' | 'react-render-to-commit';
  renderer: BoardPerformanceRenderer;
  id: string;
  phase: 'mount' | 'update' | 'nested-update';
  durationMs: number;
  baseDurationMs: number;
}

interface CanvasPaintSample {
  kind: 'canvas-paint';
  renderer: BoardPerformanceRenderer;
  id: string;
  durationMs: number;
}

type BoardPerformanceSample = ReactCommitSample | CanvasPaintSample;

interface BoardPerformanceSummary {
  count: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface BoardPerformanceSnapshot {
  enabled: boolean;
  samples: number;
  groups: Record<string, BoardPerformanceSummary>;
}

interface BoardPerformanceDebug {
  reset(): void;
  snapshot(): BoardPerformanceSnapshot;
}

declare global {
  interface Window {
    __shapeShowdownBoardPerf?: BoardPerformanceDebug;
  }
}

const MAX_SAMPLES = 2_000;
const samples: BoardPerformanceSample[] = [];

export function isBoardPerformanceProfilingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('profileBoard') === '1';
}

function summarize(values: number[]): BoardPerformanceSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    count: sorted.length,
    averageMs: sorted.length > 0 ? total / sorted.length : 0,
    p95Ms: sorted[p95Index] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

function snapshot(): BoardPerformanceSnapshot {
  const grouped = new Map<string, number[]>();
  for (const sample of samples) {
    const key =
      sample.kind === 'canvas-paint'
        ? `${sample.kind}:${sample.renderer}:${sample.id}`
        : `${sample.kind}:${sample.renderer}:${sample.id}`;
    const values = grouped.get(key) ?? [];
    values.push(sample.durationMs);
    grouped.set(key, values);
  }
  return {
    enabled: isBoardPerformanceProfilingEnabled(),
    samples: samples.length,
    groups: Object.fromEntries(
      [...grouped].map(([key, values]) => [key, summarize(values)]),
    ),
  };
}

function exposeDebugInterface(): void {
  if (typeof window === 'undefined' || window.__shapeShowdownBoardPerf) return;
  window.__shapeShowdownBoardPerf = {
    reset() {
      samples.length = 0;
    },
    snapshot,
  };
}

if (isBoardPerformanceProfilingEnabled()) {
  exposeDebugInterface();
}

let publishScheduled = false;

function scheduleDatasetPublish(): void {
  if (publishScheduled || typeof document === 'undefined') return;
  publishScheduled = true;
  window.setTimeout(() => {
    publishScheduled = false;
    document.documentElement.dataset.boardPerf = JSON.stringify(snapshot());
  }, 250);
}

function record(sample: BoardPerformanceSample): void {
  if (!isBoardPerformanceProfilingEnabled()) return;
  exposeDebugInterface();
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
  scheduleDatasetPublish();
}

export function recordBoardReactCommit(
  renderer: BoardPerformanceRenderer,
  id: string,
  phase: ReactCommitSample['phase'],
  durationMs: number,
  baseDurationMs: number,
  startTimeMs: number,
  commitTimeMs: number,
): void {
  record({
    kind: 'react-render',
    renderer,
    id,
    phase,
    durationMs,
    baseDurationMs,
  });
  record({
    kind: 'react-render-to-commit',
    renderer,
    id,
    phase,
    durationMs: Math.max(0, commitTimeMs - startTimeMs),
    baseDurationMs,
  });
}

export function recordBoardCanvasPaint(
  renderer: Extract<BoardPerformanceRenderer, 'board-canvas' | 'voronoi-canvas'>,
  id: string,
  durationMs: number,
): void {
  record({ kind: 'canvas-paint', renderer, id, durationMs });
}
