/**
 * Option A connectivity + RTT probe for Discord regional URL mappings.
 * Measures Socket.IO polling handshake latency to finite preconfigured hosts.
 *
 * Usage:
 *   bun .scratch/production-multiplayer-deployment/measure-option-a-rtt.mts
 *
 * Env overrides:
 *   OPTION_A_EAST_HOST=host.trycloudflare.com
 *   OPTION_A_WEST_HOST=host.trycloudflare.com
 *   OPTION_A_DISCORD_APP_ID=...
 *   OPTION_A_SAMPLES=5
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

const samples = Math.max(1, Number(process.env.OPTION_A_SAMPLES ?? 5) || 5);
const eastHost =
  process.env.OPTION_A_EAST_HOST?.trim() || "sterling-webster-rail-manager.trycloudflare.com";
const westHost =
  process.env.OPTION_A_WEST_HOST?.trim() || "bond-fuji-cigarettes-previous.trycloudflare.com";
const appId = process.env.OPTION_A_DISCORD_APP_ID?.trim() || "1538301343708618815";

const targets: Array<{ label: string; url: string }> = [
  {
    label: "east-direct",
    url: `https://${eastHost}/socket.io/?EIO=4&transport=polling`,
  },
  {
    label: "west-direct",
    url: `https://${westHost}/socket.io/?EIO=4&transport=polling`,
  },
  {
    label: "east-via-discord-proxy",
    url: `https://${appId}.discordsays.com/region-east/socket.io/?EIO=4&transport=polling`,
  },
  {
    label: "west-via-discord-proxy",
    url: `https://${appId}.discordsays.com/region-west/socket.io/?EIO=4&transport=polling`,
  },
];

async function sampleOnce(label: string, url: string): Promise<Sample> {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "*/*" },
      redirect: "manual",
    });
    const ms = performance.now() - started;
    const text = await res.text();
    return {
      label,
      url,
      ok: res.ok && text.startsWith("0{"),
      status: res.status,
      ms,
      bodyPreview: text.slice(0, 120),
    };
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      status: null,
      ms: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(rows: Sample[]) {
  const ok = rows.filter((r) => r.ok);
  if (ok.length === 0) {
    return { count: rows.length, ok: 0, min: null, max: null, mean: null, p50: null };
  }
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    count: rows.length,
    ok: ok.length,
    min: times[0],
    max: times[times.length - 1],
    mean: sum / times.length,
    p50: times[Math.floor((times.length - 1) / 2)],
  };
}

const all: Sample[] = [];
for (const target of targets) {
  for (let i = 0; i < samples; i++) {
    all.push(await sampleOnce(target.label, target.url));
  }
}

const byLabel = new Map<string, Sample[]>();
for (const row of all) {
  const list = byLabel.get(row.label) ?? [];
  list.push(row);
  byLabel.set(row.label, list);
}

const summary = [...byLabel.entries()].map(([label, rows]) => ({
  label,
  url: rows[0]?.url,
  ...summarize(rows),
  lastError: rows.find((r) => !r.ok)?.error ?? rows.find((r) => !r.ok)?.bodyPreview ?? null,
}));

const out = {
  measuredAt: new Date().toISOString(),
  machine: "single-local-dev",
  note:
    "One-machine Option A connectivity proof. Direct tunnel RTT is local POP latency, not true multi-region. Discord proxy rows require URL mappings /region-east and /region-west.",
  hosts: { eastHost, westHost, appId, samples },
  summary,
  samples: all,
};

const outPath = new URL("./measure-option-a-rtt.result.json", import.meta.url);
await Bun.write(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${outPath.pathname}`);
