/**
 * Option B single-origin path router (Bun.serve + fetch proxy).
 * One public host; regional backends selected by path prefix.
 *
 *   /region/east/*  → http://127.0.0.1:3000  (prefix stripped)
 *   /region/west/*  → http://127.0.0.1:3001  (prefix stripped)
 *   everything else → http://127.0.0.1:3000  (UI / default)
 *
 * Usage:
 *   bun .scratch/production-multiplayer-deployment/option-b-path-router.mts
 */

const routerPort = Number(process.env.OPTION_B_ROUTER_PORT ?? 3002) || 3002;
const eastOrigin = process.env.OPTION_B_EAST_ORIGIN?.trim() || "http://127.0.0.1:3000";
const westOrigin = process.env.OPTION_B_WEST_ORIGIN?.trim() || "http://127.0.0.1:3001";

type Route = { target: string; pathname: string; region: "east" | "west" | "default" };

function routeFor(pathname: string): Route {
  const eastPrefixes = ["/region/east", "/region-east"];
  const westPrefixes = ["/region/west", "/region-west"];

  for (const prefix of eastPrefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const rest = pathname.slice(prefix.length);
      return {
        target: eastOrigin,
        pathname: rest.length === 0 ? "/" : rest,
        region: "east",
      };
    }
  }

  for (const prefix of westPrefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const rest = pathname.slice(prefix.length);
      return {
        target: westOrigin,
        pathname: rest.length === 0 ? "/" : rest,
        region: "west",
      };
    }
  }

  return { target: eastOrigin, pathname, region: "default" };
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

const server = Bun.serve({
  port: routerPort,
  hostname: "0.0.0.0",
  async fetch(req) {
    const incoming = new URL(req.url);
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return new Response("WebSocket upgrade not proxied by this probe router; use polling", {
        status: 426,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const route = routeFor(incoming.pathname);
    const target = new URL(route.pathname + incoming.search, route.target);
    console.log(
      `[option-b-router] ${req.method} ${incoming.pathname} → ${route.region} ${target.toString()}`,
    );

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers: hopHeaders(req),
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
        redirect: "manual",
        // @ts-expect-error Bun/Node duplex streaming body
        duplex: "half",
      });

      const outHeaders = new Headers(upstream.headers);
      outHeaders.delete("content-encoding");
      outHeaders.delete("transfer-encoding");
      outHeaders.delete("content-length");

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: outHeaders,
      });
    } catch (error) {
      console.error("[option-b-router] upstream error:", error);
      return new Response("Bad gateway", { status: 502, headers: { "Content-Type": "text/plain" } });
    }
  },
});

console.log(
  `[option-b-router] listening on http://0.0.0.0:${server.port} (east=${eastOrigin}, west=${westOrigin})`,
);
