/**
 * Socket.IO soak against Railway staging.
 *
 * Usage:
 *   bun .scratch/production-multiplayer-deployment/soak-railway-staging-socketio.mts
 *
 * Env:
 *   RAILWAY_STAGING_HOST=shape-showdown-staging.up.railway.app
 *   SOAK_MINUTES=35
 *   SOAK_CLIENTS=2
 */

import { io, type Socket } from "socket.io-client";

type EventRow = {
  at: string;
  client: number;
  type: string;
  detail?: string;
};

const host =
  process.env.RAILWAY_STAGING_HOST?.trim() || "shape-showdown-staging.up.railway.app";
const minutes = Math.max(1, Number(process.env.SOAK_MINUTES ?? 35) || 35);
const clientCount = Math.max(1, Number(process.env.SOAK_CLIENTS ?? 2) || 2);
const url = `https://${host}`;
const durationMs = minutes * 60_000;
const startedAt = new Date();
const events: EventRow[] = [];
const sockets: Socket[] = [];

function log(client: number, type: string, detail?: string) {
  const row: EventRow = {
    at: new Date().toISOString(),
    client,
    type,
    detail,
  };
  events.push(row);
  console.log(`[${row.at}] c${client} ${type}${detail ? ` ${detail}` : ""}`);
}

function attach(client: number, socket: Socket) {
  socket.on("connect", () => log(client, "connect", `id=${socket.id}`));
  socket.on("disconnect", (reason) => log(client, "disconnect", String(reason)));
  socket.on("connect_error", (err) => log(client, "connect_error", err.message));
  socket.io.on("reconnect_attempt", (n) => log(client, "reconnect_attempt", String(n)));
  socket.io.on("reconnect", (n) => log(client, "reconnect", String(n)));
  socket.io.on("reconnect_error", (err) =>
    log(client, "reconnect_error", err instanceof Error ? err.message : String(err)),
  );
  socket.io.on("reconnect_failed", () => log(client, "reconnect_failed"));
}

for (let i = 0; i < clientCount; i++) {
  const socket = io(url, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 20_000,
  });
  attach(i, socket);
  sockets.push(socket);
}

const heartbeat = setInterval(() => {
  const connected = sockets.filter((s) => s.connected).length;
  log(-1, "heartbeat", `connected=${connected}/${clientCount}`);
}, 60_000);

await Bun.sleep(durationMs);
clearInterval(heartbeat);

const disconnects = events.filter((e) => e.type === "disconnect").length;
const connectErrors = events.filter((e) => e.type === "connect_error").length;
const reconnects = events.filter((e) => e.type === "reconnect").length;
const reconnectFailed = events.filter((e) => e.type === "reconnect_failed").length;

const result = {
  measuredAt: new Date().toISOString(),
  startedAt: startedAt.toISOString(),
  endedAt: new Date().toISOString(),
  host,
  url,
  minutes,
  clientCount,
  transports: ["websocket"],
  totals: {
    events: events.length,
    disconnects,
    connectErrors,
    reconnects,
    reconnectFailed,
    stillConnected: sockets.filter((s) => s.connected).length,
  },
  events,
};

for (const socket of sockets) {
  socket.removeAllListeners();
  socket.close();
}

const outPath = new URL("./soak-railway-staging-socketio.result.json", import.meta.url);
await Bun.write(outPath, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      written: outPath.pathname,
      totals: result.totals,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
    },
    null,
    2,
  ),
);
