/**
 * Option C distributed WebSocket gateway (HTTP/polling probe).
 *
 * Clients always talk to this one origin. The gateway picks a regional backend from
 * an allocation hint (matchId / region query — stand-in for resume-ticket lookup)
 * and sticks subsequent Engine.IO `sid` traffic to that backend.
 *
 * Regional hosts are never exposed to the client.
 *
 *   GET /socket.io/?EIO=4&transport=polling&region=east|west
 *   GET /socket.io/?EIO=4&transport=polling&sid=...   (sticky)
 *   GET /health
 *
 * Usage:
 *   bun .scratch/production-multiplayer-deployment/option-c-gateway.mts
 */

const gatewayPort = Number(process.env.OPTION_C_GATEWAY_PORT ?? 3003) || 3003;
const eastOrigin = process.env.OPTION_C_EAST_ORIGIN?.trim() || "http://127.0.0.1:3000";
const westOrigin = process.env.OPTION_C_WEST_ORIGIN?.trim() || "http://127.0.0.1:3001";

type Region = "east" | "west";

const stickyBySid = new Map<string, Region>();
const stickyByMatchId = new Map<string, Region>();

function regionFromMatchId(matchId: string): Region {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = (hash * 31 + matchId.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? "east" : "west";
}

function resolveRegion(url: URL): Region {
  const sid = url.searchParams.get("sid");
  if (sid && stickyBySid.has(sid)) {
    return stickyBySid.get(sid)!;
  }

  const matchId = url.searchParams.get("matchId")?.trim();
  if (matchId) {
    const existing = stickyByMatchId.get(matchId);
    if (existing) return existing;
    const assigned = regionFromMatchId(matchId);
    stickyByMatchId.set(matchId, assigned);
    return assigned;
  }

  const region = url.searchParams.get("region")?.trim().toLowerCase();
  if (region === "west") return "west";
  if (region === "east") return "east";
  return "east";
}

function originFor(region: Region): string {
  return region === "west" ? westOrigin : eastOrigin;
}

function hopHeaders(req: Request): Headers {
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("keep-alive");
  headers.delete("proxy-connection");
  headers.delete("transfer-encoding");
  headers.delete("upgrade");
  return headers;
}

function rememberSid(body: string, region: Region) {
  // Engine.IO open packet: 0{"sid":"...","upgrades":...}
  if (!body.startsWith("0{")) return;
  try {
    const json = JSON.parse(body.slice(1)) as { sid?: unknown };
    if (typeof json.sid === "string" && json.sid.length > 0) {
      stickyBySid.set(json.sid, region);
    }
  } catch {
    /* ignore parse errors */
  }
}

const server = Bun.serve({
  port: gatewayPort,
  hostname: "0.0.0.0",
  async fetch(req) {
    const incoming = new URL(req.url);

    if (incoming.pathname === "/health") {
      return Response.json({
        ok: true,
        role: "option-c-gateway",
        stickySids: stickyBySid.size,
        stickyMatches: stickyByMatchId.size,
        eastOrigin,
        westOrigin,
      });
    }

    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return new Response("WebSocket upgrade not proxied by this probe gateway; use polling", {
        status: 426,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Only Socket.IO is allocation-routed. Everything else goes to east (UI shell).
    const isSocketIo =
      incoming.pathname === "/socket.io" || incoming.pathname.startsWith("/socket.io/");

    const region = isSocketIo ? resolveRegion(incoming) : "east";
    const targetOrigin = originFor(region);
    const target = new URL(incoming.pathname + incoming.search, targetOrigin);

    // Strip allocator hints so backends see a normal Engine.IO URL.
    if (isSocketIo) {
      target.searchParams.delete("region");
      target.searchParams.delete("matchId");
    }

    console.log(
      `[option-c-gateway] ${req.method} ${incoming.pathname} region=${region} → ${target.toString()}`,
    );

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers: hopHeaders(req),
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
        redirect: "manual",
        // @ts-expect-error Bun streaming request body
        duplex: "half",
      });

      const text = await upstream.text();
      if (isSocketIo && req.method === "GET") {
        rememberSid(text, region);
      }

      const outHeaders = new Headers(upstream.headers);
      outHeaders.delete("content-encoding");
      outHeaders.delete("transfer-encoding");
      outHeaders.set("x-option-c-region", region);
      outHeaders.set("x-option-c-backend", targetOrigin);

      return new Response(text, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: outHeaders,
      });
    } catch (error) {
      console.error("[option-c-gateway] upstream error:", error);
      return new Response("Bad gateway", { status: 502, headers: { "Content-Type": "text/plain" } });
    }
  },
});

console.log(
  `[option-c-gateway] listening on http://0.0.0.0:${server.port} (east=${eastOrigin}, west=${westOrigin})`,
);
