/// <reference lib="webworker" />

import {
  NameDropLayeredRenderer,
  type CanvasContext,
} from './nameDropRenderCore';
import type { NameDropPlan } from './nameDropShared';

declare const self: DedicatedWorkerGlobalScope;

type AttachMessage = {
  type: 'attach';
  canvas: OffscreenCanvas;
  dpr: number;
};

type PlayMessage = {
  type: 'play';
  plan: NameDropPlan;
  cellSize: number;
};

type ResizeMessage = {
  type: 'resize';
  cellSize: number;
  dpr: number;
};

type StopMessage = { type: 'stop' };

type InMessage = AttachMessage | PlayMessage | ResizeMessage | StopMessage;

let display: OffscreenCanvas | null = null;
let ctx: CanvasContext | null = null;
let renderer: NameDropLayeredRenderer | null = null;
let raf = 0;
let startedAt = 0;
let activePlan: NameDropPlan | null = null;
let cellSize = 12;
let dpr = 1;

function requestFrame(callback: FrameRequestCallback): number {
  return self.setTimeout(() => callback(performance.now()), 16) as unknown as number;
}

function cancelLoop(): void {
  if (raf) {
    self.clearTimeout(raf);
    raf = 0;
  }
}

function ensureRenderer(): NameDropLayeredRenderer {
  if (!renderer) renderer = new NameDropLayeredRenderer();
  return renderer;
}

function configureDisplay(): void {
  if (!display || !ctx) return;
  ensureRenderer().configure(display, cellSize, dpr);
}

function paintFrame(now: number): void {
  if (!ctx || !activePlan) return;

  try {
    const elapsed = now - startedAt;
    const done = ensureRenderer().paint(ctx, Math.min(elapsed, activePlan.totalDurationMs));

    if (done) {
      ensureRenderer().paintFinal(ctx);
      raf = 0;
      self.postMessage({ type: 'cycleComplete' });
      return;
    }

    raf = requestFrame(paintFrame);
  } catch (error) {
    cancelLoop();
    activePlan = null;
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

let pendingPlay: PlayMessage | null = null;

function startCycle(plan: NameDropPlan): void {
  cancelLoop();
  activePlan = plan;
  ensureRenderer().begin(plan);
  startedAt = performance.now();
  raf = requestFrame(paintFrame);
}

self.addEventListener('message', (event: MessageEvent<InMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'attach':
      display = message.canvas;
      dpr = message.dpr;
      ctx = display.getContext('2d') as CanvasContext | null;
      if (!ctx) {
        self.postMessage({ type: 'error', message: '2d context unavailable' });
        return;
      }
      configureDisplay();
      self.postMessage({ type: 'ready' });
      if (pendingPlay) {
        cellSize = pendingPlay.cellSize;
        configureDisplay();
        startCycle(pendingPlay.plan);
        pendingPlay = null;
      }
      break;
    case 'resize':
      cellSize = message.cellSize;
      dpr = message.dpr;
      configureDisplay();
      if (activePlan) startCycle(activePlan);
      break;
    case 'play':
      if (!display || !ctx) {
        pendingPlay = message;
        return;
      }
      cellSize = message.cellSize;
      configureDisplay();
      startCycle(message.plan);
      break;
    case 'stop':
      cancelLoop();
      activePlan = null;
      break;
    default:
      break;
  }
});

export {};
