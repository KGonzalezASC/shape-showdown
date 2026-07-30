/**
 * Headless profiling via Chrome DevTools Protocol over a pre-launched
 * Chromium instance (--remote-debugging-port=9222).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ProfileLabel = 'preopt' | 'optimized';

type ScenarioMetrics = {
  scenario: string;
  domNodes: number;
  boardDescendants: number;
  canvasCount: number;
  animatedElements: number;
  longTasks: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
  frames: number;
  avgFrameMs: number;
  p95FrameMs: number;
  droppedFrames: number;
};

type RunResult = {
  label: ProfileLabel;
  url: string;
  scenarios: ScenarioMetrics[];
};

const TARGETS: Array<{ label: ProfileLabel; url: string }> = [
  { label: 'preopt', url: 'http://localhost:3001/landing/?name=SHAPE%20SHOWDOWN' },
  { label: 'optimized', url: 'http://localhost:3002/landing/?name=SHAPE%20SHOWDOWN' },
];

const CDP_HTTP = process.env.NAME_DROP_CDP_URL ?? 'http://127.0.0.1:9222';

class CdpSession {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (message.id == null) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async connect(browserWsUrl: string): Promise<CdpSession> {
    const ws = new WebSocket(browserWsUrl);
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket connect timeout')), 15_000);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolvePromise();
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('CDP websocket error'));
      });
    });
    return new CdpSession(ws);
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolvePromise(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}

async function evaluateValue<T>(page: CdpSession, expression: string): Promise<T> {
  const evaluated = await page.send<{ result: { value: T; subtype?: string; description?: string } }>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return evaluated.result.value;
}

async function waitForBoard(page: CdpSession): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await evaluateValue<boolean>(page, `!!document.querySelector('.name-drop-board')`);
    if (ready) return;
    await Bun.sleep(250);
  }
  throw new Error('Timed out waiting for .name-drop-board');
}

async function measureScenario(
  page: CdpSession,
  scenario: string,
  durationMs: number,
  mutate?: () => Promise<void>,
): Promise<ScenarioMetrics> {
  await evaluateValue(page, `(() => {
    const w = window;
    if (w.__nameDropProfile?.raf) cancelAnimationFrame(w.__nameDropProfile.raf);
    w.__nameDropProfile?.observer?.disconnect();
    w.__nameDropProfile = { longTasks: [], frames: [] };
    try {
      const observer = new PerformanceObserver((list) => {
        w.__nameDropProfile.longTasks.push(...list.getEntries());
      });
      observer.observe({ type: 'longtask', buffered: false });
      w.__nameDropProfile.observer = observer;
    } catch {}
    let last = performance.now();
    const tick = (now) => {
      w.__nameDropProfile.frames.push(now - last);
      last = now;
      w.__nameDropProfile.raf = requestAnimationFrame(tick);
    };
    w.__nameDropProfile.raf = requestAnimationFrame(tick);
    return true;
  })()`);

  if (mutate) await mutate();
  await Bun.sleep(durationMs);

  return evaluateValue<ScenarioMetrics>(page, `(() => {
    const profile = window.__nameDropProfile;
    if (profile.raf) cancelAnimationFrame(profile.raf);
    profile.observer?.disconnect();
    const frames = profile.frames.slice(1);
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    const avg = frames.length ? frames.reduce((sum, value) => sum + value, 0) / frames.length : 0;
    const longTasks = profile.longTasks;
    const board = document.querySelector('.name-drop-board');
    return {
      scenario: ${JSON.stringify(scenario)},
      domNodes: document.getElementsByTagName('*').length,
      boardDescendants: !board ? 0 : board.tagName === 'CANVAS' ? 0 : board.querySelectorAll('*').length,
      canvasCount: document.querySelectorAll('canvas').length,
      animatedElements: document.querySelectorAll('.name-drop-falling-piece').length,
      longTasks: longTasks.length,
      longTaskTotalMs: Math.round(longTasks.reduce((sum, entry) => sum + entry.duration, 0) * 10) / 10,
      longTaskMaxMs: Math.round(longTasks.reduce((max, entry) => Math.max(max, entry.duration), 0) * 10) / 10,
      frames: frames.length,
      avgFrameMs: Math.round(avg * 100) / 100,
      p95FrameMs: Math.round(p95 * 100) / 100,
      droppedFrames: frames.filter((ms) => ms > 20).length,
    };
  })()`);
}

function summarize(results: RunResult[]) {
  const byScenario = new Map<string, Record<string, ScenarioMetrics>>();
  for (const result of results) {
    for (const scenario of result.scenarios) {
      const row = byScenario.get(scenario.scenario) ?? {};
      row[result.label] = scenario;
      byScenario.set(scenario.scenario, row);
    }
  }

  return [...byScenario.entries()].map(([scenario, row]) => {
    const before = row.preopt;
    const after = row.optimized;
    const delta = (key: keyof ScenarioMetrics) => {
      const a = Number(before?.[key] ?? 0);
      const b = Number(after?.[key] ?? 0);
      const pct = a === 0 ? (b === 0 ? 0 : null) : Math.round(((b - a) / a) * 1000) / 10;
      return { before: a, after: b, delta: Math.round((b - a) * 100) / 100, pct };
    };
    return {
      scenario,
      domNodes: delta('domNodes'),
      boardDescendants: delta('boardDescendants'),
      animatedElements: delta('animatedElements'),
      avgFrameMs: delta('avgFrameMs'),
      p95FrameMs: delta('p95FrameMs'),
      droppedFrames: delta('droppedFrames'),
      longTasks: delta('longTasks'),
      longTaskTotalMs: delta('longTaskTotalMs'),
      longTaskMaxMs: delta('longTaskMaxMs'),
      canvasCount: delta('canvasCount'),
    };
  });
}

const created = await fetch(`${CDP_HTTP}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json()) as {
  webSocketDebuggerUrl: string;
};

const page = await CdpSession.connect(created.webSocketDebuggerUrl);
await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});

const results: RunResult[] = [];
for (const target of TARGETS) {
  console.error(`profiling ${target.label}...`);
  await page.send('Page.navigate', { url: target.url });
  await waitForBoard(page);
  await Bun.sleep(2500);

  const scenarios: ScenarioMetrics[] = [];
  scenarios.push(await measureScenario(page, 'mid-drop', 2500));
  await Bun.sleep(12000);
  scenarios.push(await measureScenario(page, 'completed-board', 1500));
  scenarios.push(await measureScenario(page, 'resize-during-cycle', 2000, async () => {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await Bun.sleep(250);
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await Bun.sleep(250);
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 820,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }));

  results.push({ label: target.label, url: target.url, scenarios });
}

const report = {
  generatedAt: new Date().toISOString(),
  method: 'Bun-native CDP against pre-launched Chromium; rAF frame deltas + Long Task observer + DOM counts',
  viewport: '1280x800 with resize scenario to 390 and 820',
  results,
  comparison: summarize(results),
};

const outPath = resolve('tmp-name-drop-profile.json');
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.error(`wrote ${outPath}`);
page.close();
