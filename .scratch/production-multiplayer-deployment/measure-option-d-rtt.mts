/**
 * Option D probe: provider-issued dynamic hostname unknown at Discord Activity config time.
 *
 * Expectation under Discord Activities CSP/proxy:
 * - Direct public Socket.IO to the dynamic host works (endpoint is real).
 * - The Activity cannot open that host unless it was pre-mapped (or covered by an
 *   explicit URL-mapping pattern). Unmapped discordsays paths do not invent hosts.
 *
 * Usage:
 *   bun .scratch/production-multiplayer-deployment/measure-option-d-rtt.mts
 *
 * Env:
 *   OPTION_D_DYNAMIC_HOST=fresh-unmapped.trycloudflare.com
 *   OPTION_D_MAPPED_ROOT_HOST=ray-cruise-officially-rhode.trycloudflare.com
 *   OPTION_D_DISCORD_APP_ID=...
 *   OPTION_D_SAMPLES=5
 */

type Sample = {
  label: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
  bodyPreview?: string;
};

const samples = Math.max(1, Number(process.env.OPTION_D_SAMPLES ?? 5) || 5);
const dynamicHost = process.env.OPTION_D_DYNAMIC_HOST?.trim();
const mappedRootHost =
  process.env.OPTION_D_MAPPED_ROOT_HOST?.trim() || "ray-cruise-officially-rhode.trycloudflare.com";
const appId = process.env.OPTION_D_DISCORD_APP_ID?.trim() || "1538301343708618815";

if (!dynamicHost) {
  throw new Error("OPTION_D_DYNAMIC_HOST is required (unmapped provider-style hostname)");
}

const targets: Array<{ label: string; url: string; expectOk: boolean }> = [
  {
    label: "dynamic-host-direct-socket",
    url: `https://${dynamicHost}/socket.io/?EIO=4&transport=polling`,
    expectOk: true,
  },
  {
    label: "mapped-gateway-control-socket",
    url: `https://${mappedRootHost}/socket.io/?EIO=4&transport=polling&region=east`,
    expectOk: true,
  },
  {
    // Unmapped path on the Activity proxy does not create a route to the dynamic host.
    label: "discordsays-unmapped-dynamic-path",
    url: `https://${appId}.discordsays.com/provider-dynamic/socket.io/?EIO=4&transport=polling`,
    expectOk: false,
  },
  {
    // Raw external host is not the Discord-approved Activity origin.
    label: "discordsays-cannot-alias-external-host",
    url: `https://${appId}.discordsays.com/.proxy/${dynamicHost}/socket.io/?EIO=4&transport=polling`,
    expectOk: false,
  },
];

function isSocketOk(status: number | null, body: string): boolean {
  return status === 200 && body.startsWith("0{");
}

async function sampleOnce(label: string, url: string, expectOk: boolean): Promise<Sample & { expectOk: boolean }> {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "*/*" },
      redirect: "manual",
    });
    const ms = performance.now() - started;
    const text = await res.text();
    const socketOk = isSocketOk(res.status, text);
    return {
      label,
      url,
      expectOk,
      ok: expectOk ? socketOk : !socketOk,
      status: res.status,
      ms,
      bodyPreview: text.slice(0, 160),
    };
  } catch (error) {
    const ms = performance.now() - started;
    const failed = true;
    return {
      label,
      url,
      expectOk,
      ok: expectOk ? false : failed,
      status: null,
      ms,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(rows: Array<Sample & { expectOk: boolean }>) {
  const matched = rows.filter((r) => r.ok);
  const socketPass = rows.filter((r) => r.status === 200 && (r.bodyPreview ?? "").startsWith("0{"));
  return {
    count: rows.length,
    expectationMatched: matched.length,
    socketHandshakePass: socketPass.length,
  };
}

const all: Array<Sample & { expectOk: boolean }> = [];
for (const target of targets) {
  for (let i = 0; i < samples; i++) {
    all.push(await sampleOnce(target.label, target.url, target.expectOk));
  }
}

const byLabel = new Map<string, Array<Sample & { expectOk: boolean }>>();
for (const row of all) {
  const list = byLabel.get(row.label) ?? [];
  list.push(row);
  byLabel.set(row.label, list);
}

const summary = [...byLabel.entries()].map(([label, rows]) => {
  const first = rows[0]!;
  const socketTimes = rows
    .filter((r) => r.status === 200 && (r.bodyPreview ?? "").startsWith("0{"))
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  return {
    label,
    url: first.url,
    expectOk: first.expectOk,
    ...summarize(rows),
    socketP50: socketTimes.length ? socketTimes[Math.floor((socketTimes.length - 1) / 2)] : null,
    lastStatus: rows[rows.length - 1]?.status ?? null,
    lastError: rows.find((r) => r.error)?.error ?? rows.find((r) => !(r.status === 200 && (r.bodyPreview ?? "").startsWith("0{")))?.bodyPreview ?? null,
  };
});

const dynamicDirect = summary.find((s) => s.label === "dynamic-host-direct-socket");
const unmappedProxy = summary.find((s) => s.label === "discordsays-unmapped-dynamic-path");
const aliasProxy = summary.find((s) => s.label === "discordsays-cannot-alias-external-host");

const verdict =
  (dynamicDirect?.socketHandshakePass ?? 0) === samples &&
  (unmappedProxy?.socketHandshakePass ?? 0) === 0 &&
  (aliasProxy?.socketHandshakePass ?? 0) === 0
    ? "DENY_FOR_DISCORD_ACTIVITY"
    : "INCONCLUSIVE";

const out = {
  measuredAt: new Date().toISOString(),
  machine: "single-local-dev",
  verdict,
  note:
    "Option D: dynamic host is a fresh Cloudflare quick-tunnel hostname never added to Discord URL Mappings. Direct reachability proves the endpoint exists; discordsays failures prove the Activity proxy cannot use unknown hosts without a portal mapping/pattern.",
  hosts: { dynamicHost, mappedRootHost, appId, samples },
  summary,
  samples: all,
};

const outPath = new URL("./measure-option-d-rtt.result.json", import.meta.url);
await Bun.write(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ verdict, summary }, null, 2));
console.log(`Wrote ${outPath.pathname}`);
