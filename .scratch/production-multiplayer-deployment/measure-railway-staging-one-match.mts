/**
 * Ticket 04 — one-match CPU / memory / egress on Railway staging.
 *
 * Runs two Socket.IO clients against the live staging host for a timed window,
 * meters UTF-8 gameState payload size (pre-deflate planning bound), then pulls
 * Railway platform metrics for the same window (on-wire public egress with
 * perMessageDeflate enabled server-side).
 *
 * Usage:
 *   bun .scratch/production-multiplayer-deployment/measure-railway-staging-one-match.mts
 *
 * Env:
 *   RAILWAY_STAGING_HOST=shape-showdown-staging.up.railway.app
 *   MATCH_SECONDS=300
 */

import { io, type Socket } from "socket.io-client";
import { $ } from "bun";

type WireState = {
  status?: string;
  tick?: number;
  players?: Record<string, unknown>;
};

const host =
  process.env.RAILWAY_STAGING_HOST?.trim() || "shape-showdown-staging.up.railway.app";
const matchSeconds = Math.max(60, Number(process.env.MATCH_SECONDS ?? 300) || 300);
const url = `https://${host}`;

function attachMeter(socket: Socket) {
  let messages = 0;
  let utf8Bytes = 0;
  let maxUtf8 = 0;
  let lastStatus: string | null = null;
  socket.on("gameState", (state: WireState) => {
    messages += 1;
    lastStatus = typeof state?.status === "string" ? state.status : lastStatus;
    const encoded = Buffer.byteLength(JSON.stringify(state), "utf8");
    utf8Bytes += encoded;
    if (encoded > maxUtf8) maxUtf8 = encoded;
  });
  return {
    get lastStatus() {
      return lastStatus;
    },
    snapshot() {
      return { messages, utf8Bytes, maxUtf8 };
    },
  };
}

function connectClient(label: string): Promise<{ socket: Socket; meter: ReturnType<typeof attachMeter> }> {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 20_000,
    });
    const meter = attachMeter(socket);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${label} connect timeout`));
    }, 20_000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve({ socket, meter });
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on("error", (msg) => {
      // server emits string "Game is full"
      console.warn(`[${label}] server error:`, msg);
    });
  });
}

const startedAt = new Date();
console.log(`one-match start ${startedAt.toISOString()} → ${url} for ${matchSeconds}s`);

const a = await connectClient("a");
const b = await connectClient("b");
console.log(`connected a=${a.socket.id} b=${b.socket.id}`);

const inputTimer = setInterval(() => {
  // Light left/right wiggle so the sim isn't fully idle.
  a.socket.emit("inputState", { left: true, right: false, softDrop: false });
  b.socket.emit("inputState", { left: false, right: true, softDrop: false });
  setTimeout(() => {
    a.socket.emit("inputState", { left: false, right: false, softDrop: false });
    b.socket.emit("inputState", { left: false, right: false, softDrop: false });
  }, 120);
}, 1000);

await Bun.sleep(matchSeconds * 1000);
clearInterval(inputTimer);

const endedAt = new Date();
const wallSec = (endedAt.getTime() - startedAt.getTime()) / 1000;
const meterA = a.meter.snapshot();
const meterB = b.meter.snapshot();
const statusA = a.meter.lastStatus;
const statusB = b.meter.lastStatus;

a.socket.close();
b.socket.close();

const sinceArg = `${Math.ceil(matchSeconds / 60) + 1}m`;
console.log(`pulling railway metrics --since ${sinceArg}`);
const metricsText = await $`railway metrics --cpu --memory --network --json --since ${sinceArg}`.text();
const metrics = JSON.parse(metricsText);

const utf8FanoutPerSec = (meterA.utf8Bytes + meterB.utf8Bytes) / wallSec;
const utf8PerPlayerPerSec = utf8FanoutPerSec / 2;
const egressMaxMb = metrics?.public_network_traffic?.egress?.max_mb ?? null;
const egressAvgMb = metrics?.public_network_traffic?.egress?.average_mb ?? null;
// Railway metric points are cumulative-ish window summaries; convert max MB in window
// to an approximate KB/s using wall duration as the active-match lower bound.
const egressMaxKbPerSec =
  egressMaxMb === null ? null : (egressMaxMb * 1024) / wallSec;

const out = {
  measuredAt: endedAt.toISOString(),
  host,
  url,
  matchSeconds,
  wallSec,
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  clients: {
    a: { id: a.socket.id, status: statusA, ...meterA },
    b: { id: b.socket.id, status: statusB, ...meterB },
  },
  utf8: {
    note: "JSON.stringify(gameState) byteLength — pre-WebSocket-frame / pre-deflate planning bound",
    fanoutBytesPerSec: utf8FanoutPerSec,
    perPlayerBytesPerSec: utf8PerPlayerPerSec,
    fanoutKbPerSec: utf8FanoutPerSec / 1024,
    perPlayerKbPerSec: utf8PerPlayerPerSec / 1024,
  },
  railwayMetrics: {
    note: "Platform public network = on-wire bytes (perMessageDeflate threshold 1024 enabled in gameServer.ts). N=1 match only; small-N>1 blocked until multi-match boundary (ticket 06).",
    since: sinceArg,
    ...metrics,
    derived: {
      egressMaxMb,
      egressAvgMb,
      egressMaxKbPerSecApprox: egressMaxKbPerSec,
    },
  },
  idleComparisonMb: {
    note: "Compare memory_current during match vs prior cold-idle ~157 MB (and today's quiet ~56 MB).",
  },
};

const outPath = new URL("./measure-railway-staging-one-match.result.json", import.meta.url);
await Bun.write(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      written: outPath.pathname,
      statusA,
      statusB,
      utf8KbPerSecFanout: +(utf8FanoutPerSec / 1024).toFixed(1),
      memoryCurrentMb: metrics?.memory?.current_mb,
      cpuCurrent: metrics?.cpu?.current,
      egressMaxMb,
    },
    null,
    2,
  ),
);
