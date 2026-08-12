import { snapshot as getBoardPerfSnapshot, type BoardPerformanceSnapshot } from './boardPerformance';

export interface DiagnosticFlags {
  disableAnimations: boolean;
  disableTransitions: boolean;
  disableBlurs: boolean;
  disableGlows: boolean;
  disableCanvasOverlays: boolean;
  simulateReducedMotion: boolean;
}

export interface FpsMetrics {
  fps: number;
  avgFrameTimeMs: number;
  p95FrameTimeMs: number;
  maxFrameTimeMs: number;
  frameDropCount60Hz: number;
  frameDropCount120Hz: number;
  sampleWindowCount: number;
}

export interface PerformanceSnapshot {
  timestamp: string;
  flags: DiagnosticFlags;
  fps: FpsMetrics;
  domNodeCount: number;
  heapUsedMb?: number;
  boardPerf: BoardPerformanceSnapshot;
  recommendations: string[];
}

export interface ShapeShowdownPerfDebug {
  toggleAnimations(enable?: boolean): void;
  toggleTransitions(enable?: boolean): void;
  toggleBlurs(enable?: boolean): void;
  toggleGlows(enable?: boolean): void;
  toggleCanvasOverlays(enable?: boolean): void;
  simulateReducedMotion(enable?: boolean): void;
  applyAllDisabled(): void;
  reset(): void;
  getFlags(): DiagnosticFlags;
  getFpsReport(): FpsMetrics;
  snapshot(): PerformanceSnapshot;
  startFpsMonitor(): void;
  stopFpsMonitor(): void;
}

declare global {
  interface Window {
    __shapeShowdownPerf?: ShapeShowdownPerfDebug;
  }
}

const currentFlags: DiagnosticFlags = {
  disableAnimations: false,
  disableTransitions: false,
  disableBlurs: false,
  disableGlows: false,
  disableCanvasOverlays: false,
  simulateReducedMotion: false,
};

// Rolling frame time window (last 120 frames)
const FRAME_WINDOW_SIZE = 120;
const frameDurations: number[] = [];
let lastFrameTimestamp: number | null = null;
let rAFHandle: number | null = null;
let frameDropCount60 = 0;
let frameDropCount120 = 0;

function syncDocumentClasses(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.classList.toggle('perf-no-animations', currentFlags.disableAnimations);
  root.classList.toggle('perf-no-transitions', currentFlags.disableTransitions);
  root.classList.toggle('perf-no-blurs', currentFlags.disableBlurs);
  root.classList.toggle('perf-no-glows', currentFlags.disableGlows);
  root.classList.toggle('perf-no-canvas', currentFlags.disableCanvasOverlays);
  root.classList.toggle('perf-reduced-motion', currentFlags.simulateReducedMotion);

  root.dataset.perfFlags = JSON.stringify(currentFlags);
}

function onFrame(timestamp: number): void {
  if (lastFrameTimestamp !== null) {
    const delta = timestamp - lastFrameTimestamp;
    frameDurations.push(delta);
    if (frameDurations.length > FRAME_WINDOW_SIZE) {
      frameDurations.shift();
    }
    if (delta > 16.67 + 2) frameDropCount60++;
    if (delta > 8.33 + 1.5) frameDropCount120++;
  }
  lastFrameTimestamp = timestamp;
  if (rAFHandle !== null && typeof window !== 'undefined') {
    rAFHandle = window.requestAnimationFrame(onFrame);
  }
}

function startFpsMonitor(): void {
  if (typeof window === 'undefined' || rAFHandle !== null) return;
  lastFrameTimestamp = null;
  rAFHandle = window.requestAnimationFrame(onFrame);
}

function stopFpsMonitor(): void {
  if (typeof window === 'undefined' || rAFHandle === null) return;
  window.cancelAnimationFrame(rAFHandle);
  rAFHandle = null;
  lastFrameTimestamp = null;
}

function calculateFpsMetrics(): FpsMetrics {
  if (frameDurations.length === 0) {
    return {
      fps: 0,
      avgFrameTimeMs: 0,
      p95FrameTimeMs: 0,
      maxFrameTimeMs: 0,
      frameDropCount60Hz: frameDropCount60,
      frameDropCount120Hz: frameDropCount120,
      sampleWindowCount: 0,
    };
  }

  const sorted = [...frameDurations].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  const avg = total / sorted.length;
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);

  return {
    fps: avg > 0 ? Math.round(1000 / avg) : 0,
    avgFrameTimeMs: Number(avg.toFixed(2)),
    p95FrameTimeMs: Number((sorted[p95Index] ?? 0).toFixed(2)),
    maxFrameTimeMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
    frameDropCount60Hz: frameDropCount60,
    frameDropCount120Hz: frameDropCount120,
    sampleWindowCount: sorted.length,
  };
}

export function areCanvasOverlaysDisabled(): boolean {
  return currentFlags.disableCanvasOverlays;
}

function generateRecommendations(flags: DiagnosticFlags, fps: FpsMetrics): string[] {
  const recs: string[] = [];

  if (fps.fps > 0 && fps.fps < 55) {
    recs.push(
      'FPS is below 55. Check Chrome Task Manager (Shift+Esc) to see if "GPU Process" CPU % is high.',
    );
  }

  if (fps.maxFrameTimeMs > 33) {
    recs.push(
      `Detected frame latency spike (${fps.maxFrameTimeMs}ms). Test disabling animations (window.__shapeShowdownPerf.toggleAnimations(true)) to verify CSS compositor load.`,
    );
  }

  if (!flags.disableAnimations && !flags.disableBlurs) {
    recs.push(
      'To test if infinite CSS animations or backdrop blurs are forcing GPU frame recompositing, run: window.__shapeShowdownPerf.applyAllDisabled()',
    );
  }

  if (flags.disableAnimations || flags.disableBlurs || flags.disableGlows) {
    recs.push(
      'Diagnostic overrides active. Run window.__shapeShowdownPerf.reset() when testing complete.',
    );
  }

  if (recs.length === 0) {
    recs.push('Performance metrics nominal. Frame pacing is stable.');
  }

  return recs;
}

export function createPerformanceSnapshot(): PerformanceSnapshot {
  const fps = calculateFpsMetrics();
  const boardPerf = getBoardPerfSnapshot();
  const domNodeCount =
    typeof document !== 'undefined' ? document.querySelectorAll('*').length : 0;

  let heapUsedMb: number | undefined;
  if (
    typeof performance !== 'undefined' &&
    'memory' in performance &&
    typeof (performance as unknown as { memory: { usedJSHeapSize: number } }).memory?.usedJSHeapSize === 'number'
  ) {
    heapUsedMb = Number(
      (
        (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize /
        (1024 * 1024)
      ).toFixed(2),
    );
  }

  return {
    timestamp: new Date().toISOString(),
    flags: { ...currentFlags },
    fps,
    domNodeCount,
    heapUsedMb,
    boardPerf,
    recommendations: generateRecommendations(currentFlags, fps),
  };
}

export function exposePerfDebugInterface(): ShapeShowdownPerfDebug {
  const debugApi: ShapeShowdownPerfDebug = {
    toggleAnimations(enable) {
      currentFlags.disableAnimations = enable ?? !currentFlags.disableAnimations;
      syncDocumentClasses();
    },
    toggleTransitions(enable) {
      currentFlags.disableTransitions = enable ?? !currentFlags.disableTransitions;
      syncDocumentClasses();
    },
    toggleBlurs(enable) {
      currentFlags.disableBlurs = enable ?? !currentFlags.disableBlurs;
      syncDocumentClasses();
    },
    toggleGlows(enable) {
      currentFlags.disableGlows = enable ?? !currentFlags.disableGlows;
      syncDocumentClasses();
    },
    toggleCanvasOverlays(enable) {
      currentFlags.disableCanvasOverlays = enable ?? !currentFlags.disableCanvasOverlays;
      syncDocumentClasses();
    },
    simulateReducedMotion(enable) {
      currentFlags.simulateReducedMotion = enable ?? !currentFlags.simulateReducedMotion;
      syncDocumentClasses();
    },
    applyAllDisabled() {
      currentFlags.disableAnimations = true;
      currentFlags.disableTransitions = true;
      currentFlags.disableBlurs = true;
      currentFlags.disableGlows = true;
      currentFlags.disableCanvasOverlays = true;
      currentFlags.simulateReducedMotion = true;
      syncDocumentClasses();
    },
    reset() {
      currentFlags.disableAnimations = false;
      currentFlags.disableTransitions = false;
      currentFlags.disableBlurs = false;
      currentFlags.disableGlows = false;
      currentFlags.disableCanvasOverlays = false;
      currentFlags.simulateReducedMotion = false;
      syncDocumentClasses();
    },
    getFlags() {
      return { ...currentFlags };
    },
    getFpsReport() {
      return calculateFpsMetrics();
    },
    snapshot() {
      return createPerformanceSnapshot();
    },
    startFpsMonitor,
    stopFpsMonitor,
  };

  if (typeof window !== 'undefined') {
    window.__shapeShowdownPerf = debugApi;
  }

  return debugApi;
}

async function runAutoProfileSuite(): Promise<Record<string, PerformanceSnapshot>> {
  const perf = exposePerfDebugInterface();
  perf.startFpsMonitor();
  perf.reset();

  const results: Record<string, PerformanceSnapshot> = {};

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // 1. Baseline
  await delay(1200);
  results['baseline'] = perf.snapshot();

  // 2. All Disabled
  perf.applyAllDisabled();
  await delay(1000);
  results['allDisabled'] = perf.snapshot();

  // 3. Animations Disabled
  perf.reset();
  perf.toggleAnimations(true);
  await delay(1000);
  results['animationsDisabled'] = perf.snapshot();

  // 4. Blurs Disabled
  perf.reset();
  perf.toggleBlurs(true);
  await delay(1000);
  results['blursDisabled'] = perf.snapshot();

  // 5. Glows Disabled
  perf.reset();
  perf.toggleGlows(true);
  await delay(1000);
  results['glowsDisabled'] = perf.snapshot();

  // 6. Canvas Overlays Disabled
  perf.reset();
  perf.toggleCanvasOverlays(true);
  await delay(1000);
  results['canvasOverlaysDisabled'] = perf.snapshot();

  // Reset to default
  perf.reset();

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.autoProfileReport = JSON.stringify(results);
  }
  console.log('[PERF_PROFILE_SUITE_COMPLETE]', JSON.stringify(results, null, 2));

  return results;
}

export function initPerfDiagnostics(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const shouldEnable =
    import.meta.env?.DEV ||
    params.has('profile') ||
    params.has('profileBoard') ||
    params.has('perf') ||
    params.has('autoProfile');

  if (shouldEnable) {
    exposePerfDebugInterface();
    startFpsMonitor();
    syncDocumentClasses();

    if (params.has('autoProfile')) {
      setTimeout(() => {
        runAutoProfileSuite();
      }, 2000);
    }
  }
}
