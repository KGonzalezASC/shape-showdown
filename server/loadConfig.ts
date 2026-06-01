import fs from "fs";
import path from "path";

export type ServerConfig = {
  port: number;
  host: string;
  serveClient: boolean;
  replayKeyframeIntervalTicks: number;
};

const defaults: ServerConfig = {
  port: 3000,
  host: "0.0.0.0",
  serveClient: false,
  replayKeyframeIntervalTicks: 30,
};

/**
 * Loads config/server.json from cwd (the directory you run node from — usually project root).
 * If PORT or SERVE_CLIENT is set in the environment, they override the file (for PaaS / systemd).
 */
export function loadServerConfig(cwd: string = process.cwd()): ServerConfig {
  const file = path.join(cwd, "config", "server.json");
  let fromFile: Partial<ServerConfig> = {};
  try {
    fromFile = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ServerConfig>;
  } catch {
    // missing or invalid JSON — use defaults
  }

  const merged: ServerConfig = {
    port:
      typeof fromFile.port === "number" && Number.isFinite(fromFile.port)
        ? fromFile.port
        : defaults.port,
    host: typeof fromFile.host === "string" && fromFile.host.length > 0 ? fromFile.host : defaults.host,
    serveClient: typeof fromFile.serveClient === "boolean" ? fromFile.serveClient : defaults.serveClient,
    replayKeyframeIntervalTicks:
      typeof fromFile.replayKeyframeIntervalTicks === "number" &&
      Number.isFinite(fromFile.replayKeyframeIntervalTicks) &&
      fromFile.replayKeyframeIntervalTicks > 0
        ? Math.floor(fromFile.replayKeyframeIntervalTicks)
        : defaults.replayKeyframeIntervalTicks,
  };

  let port = merged.port;
  if (process.env.PORT !== undefined && process.env.PORT !== "") {
    const n = Number(process.env.PORT);
    if (Number.isFinite(n)) port = n;
  }

  let serveClient = merged.serveClient;
  if (process.env.SERVE_CLIENT === "true") serveClient = true;
  if (process.env.SERVE_CLIENT === "false") serveClient = false;

  let replayKeyframeIntervalTicks = merged.replayKeyframeIntervalTicks;
  if (process.env.REPLAY_KEYFRAME_INTERVAL_TICKS !== undefined && process.env.REPLAY_KEYFRAME_INTERVAL_TICKS !== "") {
    const n = Number(process.env.REPLAY_KEYFRAME_INTERVAL_TICKS);
    if (Number.isFinite(n) && n > 0) replayKeyframeIntervalTicks = Math.max(1, Math.floor(n));
  }

  return { ...merged, port, serveClient, replayKeyframeIntervalTicks };
}
