/**
 * Ticket 02 — local runtime/network budget harness.
 * Does not modify product source. Run:
 *   bun .scratch/production-multiplayer-deployment/measure-runtime-budget.mts
 */
import { io as ioClient, type Socket } from 'socket.io-client';
import { startGameServer } from '../../server/gameServer.js';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';

type WireState = {
  status: string;
  tick: number;
  players: Record<string, unknown>;
};

function waitFor(check: () => boolean, label: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

function memSnapshot() {
  const m = process.memoryUsage();
  return {
    rssMb: +(m.rss / 1024 / 1024).toFixed(2),
    heapUsedMb: +(m.heapUsed / 1024 / 1024).toFixed(2),
    heapTotalMb: +(m.heapTotal / 1024 / 1024).toFixed(2),
    externalMb: +(m.external / 1024 / 1024).toFixed(2),
  };
}

async function sampleEventLoopLag(samples = 40, intervalMs = 25): Promise<{ p50Ms: number; p95Ms: number; maxMs: number }> {
  const lags: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await new Promise<void>((r) => setTimeout(r, intervalMs));
    lags.push(Math.max(0, performance.now() - start - intervalMs));
  }
  lags.sort((a, b) => a - b);
  const at = (p: number) => lags[Math.min(lags.length - 1, Math.floor((p / 100) * lags.length))]!;
  return {
    p50Ms: +at(50).toFixed(2),
    p95Ms: +at(95).toFixed(2),
    maxMs: +lags[lags.length - 1]!.toFixed(2),
  };
}

function attachByteMeter(socket: Socket) {
  let messages = 0;
  let utf8Bytes = 0;
  let maxUtf8 = 0;
  let lastState: WireState | null = null;
  socket.on('gameState', (state: WireState) => {
    lastState = state;
    messages += 1;
    const encoded = Buffer.byteLength(JSON.stringify(state), 'utf8');
    utf8Bytes += encoded;
    if (encoded > maxUtf8) maxUtf8 = encoded;
  });
  return {
    get lastState() {
      return lastState;
    },
    snapshot() {
      return { messages, utf8Bytes, maxUtf8 };
    },
    reset() {
      messages = 0;
      utf8Bytes = 0;
      maxUtf8 = 0;
    },
  };
}

async function main() {
  const report: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      arch: process.arch,
      bunOrNode: typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.version}`,
    },
    assumptions: {
      architectureToday: 'one GameManager / one isolated 1v1 match per process',
      netcastDefaultHz: 30,
      simHz: 60,
      discordActivityRtt: 'NOT MEASURED — requires real Discord Activity (ticket 03)',
      productionReconnectRate: 'NOT MEASURED — no production traffic yet',
    },
  };

  // --- Floor: process before listen work settles ---
  if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') Bun.gc(true);
  report.memoryFloorBeforeServer = memSnapshot();

  const server = await startGameServer({
    mode: 'production',
    config: {
      port: 0,
      host: '127.0.0.1',
      serveClient: false,
      replayKeyframeIntervalTicks: 30,
    },
  });

  await new Promise((r) => setTimeout(r, 200));
  if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') Bun.gc(true);
  report.memoryIdleServerNoPlayers = memSnapshot();
  report.eventLoopIdle = await sampleEventLoopLag();

  const url = server.origin;
  const s1 = ioClient(url, { transports: ['websocket'] });
  const s2 = ioClient(url, { transports: ['websocket'] });
  const m1 = attachByteMeter(s1);
  const m2 = attachByteMeter(s2);

  let reportError: unknown = null;
  try {
    await Promise.all([
      waitFor(() => s1.connected, 'socket1'),
      waitFor(() => s2.connected, 'socket2'),
    ]);
    await waitFor(
      () => m1.lastState !== null && Object.keys(m1.lastState.players).length === 2,
      'two players',
    );
    await waitFor(() => m1.lastState?.status === 'playing', 'playing', 8000);

    if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') Bun.gc(true);
    report.memoryOneMatchJustPlaying = memSnapshot();

    // Steady-state playing window with light input
    m1.reset();
    m2.reset();
    const windowMs = 5000;
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    const inputTimer = setInterval(() => {
      s1.emit('inputState', { left: false, right: true, softDrop: true });
      s2.emit('inputState', { left: true, right: false, softDrop: false });
      if (Math.random() < 0.15) s1.emit('action', 'rotateCW');
      if (Math.random() < 0.1) s2.emit('action', 'hardDrop');
    }, 50);

    const lagDuring = sampleEventLoopLag(60, 25);
    await new Promise((r) => setTimeout(r, windowMs));
    clearInterval(inputTimer);
    const lagPlaying = await lagDuring;

    const wallSec = (performance.now() - wallStart) / 1000;
    const cpu = process.cpuUsage(cpuStart);
    const cpuUserMs = cpu.user / 1000;
    const cpuSystemMs = cpu.system / 1000;
    const cpuTotalMs = cpuUserMs + cpuSystemMs;

    const b1 = m1.snapshot();
    const b2 = m2.snapshot();
    const utf8PerClientPerSec = b1.utf8Bytes / wallSec;
    const utf8TotalFanoutPerSec = (b1.utf8Bytes + b2.utf8Bytes) / wallSec;
    const msgsPerClientPerSec = b1.messages / wallSec;

    report.steadyStatePlaying = {
      windowSec: +wallSec.toFixed(2),
      memory: memSnapshot(),
      eventLoopLagMs: lagPlaying,
      cpu: {
        userMs: +cpuUserMs.toFixed(1),
        systemMs: +cpuSystemMs.toFixed(1),
        totalMs: +cpuTotalMs.toFixed(1),
        cpuMsPerWallSec: +(cpuTotalMs / wallSec).toFixed(1),
        note: 'process-wide; one match on this host',
      },
      netcast: {
        clientMessagesPerSec: +msgsPerClientPerSec.toFixed(2),
        avgUtf8BytesPerMessage: b1.messages ? Math.round(b1.utf8Bytes / b1.messages) : 0,
        maxUtf8BytesPerMessage: b1.maxUtf8,
        utf8BytesPerPlayerPerSec_received: Math.round(utf8PerClientPerSec),
        utf8BytesPerMatchPerSec_fanoutUpperBound: Math.round(utf8TotalFanoutPerSec),
        note: 'UTF-8 JSON size before websocket framing/deflate. perMessageDeflate threshold=1024 may shrink wire size.',
      },
    };

    // Skip reconnect churn for the primary budget numbers — current server
    // tears down seats on disconnect and can race the process lifetime.
    report.socketReconnectTransportOnly = {
      status: 'skipped_in_harness',
      note: 'Seat reclaim not implemented; localhost transport RTT is not a capacity input. Measure after ticket 01 implementation.',
    };

    const rssFloor = (report.memoryIdleServerNoPlayers as { rssMb: number }).rssMb;
    const rssMatch = (report.steadyStatePlaying as { memory: { rssMb: number } }).memory.rssMb;
    const rssDelta = Math.max(0.5, rssMatch - rssFloor);
    const cpuMsPerSec = (report.steadyStatePlaying as { cpu: { cpuMsPerWallSec: number } }).cpu.cpuMsPerWallSec;
    report.capacitySketch_singleProcess = {
      rssDeltaMbPerMatch_observed: +rssDelta.toFixed(2),
      cpuMsPerWallSec_oneMatch: cpuMsPerSec,
      roughMatchesBefore1vCPU: cpuMsPerSec > 0 ? Math.floor(1000 / cpuMsPerSec) : null,
      roughMatchesAt512MbHeadroom: Math.floor(512 / rssDelta),
      caveat:
        'Today: 1 match/process. Multi-match-in-one-process needs ticket 06 boundary; do not treat these as proven N-match numbers.',
    };

    report.discordActivityRtt = {
      status: 'unmeasured',
      blocker: 'Requires production Discord Activity client instrumentation (ticket 03 / field probe).',
    };
    report.productionReconnectRate = {
      status: 'unmeasured',
      blocker: 'No production multiplayer traffic. Track disconnect_start/reconnect after reliability ship.',
    };
  } catch (err) {
    reportError = err;
    report.harnessError = err instanceof Error ? { message: err.message, stack: err.stack } : String(err);
  }

  try {
    s1.disconnect();
    s2.disconnect();
  } catch {
    /* ignore */
  }

  const outPath = path.resolve(
    process.cwd(),
    '.scratch/production-multiplayer-deployment/measure-runtime-budget.result.json',
  );
  const text = JSON.stringify(report, null, 2);
  fs.writeFileSync(outPath, text, 'utf8');
  process.stdout.write(`WROTE_REPORT ${outPath} bytes=${text.length}\n`);
  process.stdout.write(text + '\n');

  try {
    await server.stop();
  } catch (err) {
    process.stdout.write(`STOP_ERROR ${err}\n`);
  }

  if (reportError) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
