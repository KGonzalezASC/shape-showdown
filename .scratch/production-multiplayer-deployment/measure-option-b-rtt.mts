/**
 * Option B connectivity + RTT probe (single origin, path-based regions).
 *
 * Usage:
 *   bun .scratch/production-multiplayer-deployment/measure-option-b-rtt.mts
 *
 * Env:
 *   OPTION_B_ROOT_HOST=host.trycloudflare.com
 *   OPTION_B_DISCORD_APP_ID=...
 *   OPTION_B_SAMPLES=5
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

const samples = Math.max(1, Number(process.env.OPTION_B_SAMPLES ?? 5) || 5);
const rootHost =
  process.env.OPTION_B_ROOT_HOST?.trim() || "applying-follow-surfaces-transmit.trycloudflare.com";
const appId = process.env.OPTION_B_DISCORD_APP_ID?.trim() || "1538301343708618815";

const targets: Array<{ label: string; url: string }> = [
  {
    label: "root-ui-health-direct",
    url: `https://${rootHost}/health`,
  },
  {
    label: "east-path-direct",
    url: `https://${rootHost}/region/east/socket.io/?EIO=4&transport=polling`,
  },
  {
    label: "west-path-direct",
    url: `https://${rootHost}/region/west/socket.io/?EIO=4&transport=polling`,
  },
  {
    label: "east-path-via-discord-proxy",
    url: `https://${appId}.discordsays.com/region/east/socket.io/?EIO=4&transport=polling`,
  },
  {
    label: "west-path-via-discord-proxy",
    url: `https://${appId}.discordsays.com/region/west/socket.io/?EIO=4&transport=polling`,
  },
];

function isOk(label: string, status: number | null, body: string): boolean {
  if (label.includes("health")) return status === 200 && body.trim() === "ok";
  return status === 200 && body.startsWith("0{");
}

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
      ok: isOk(label, res.status, text),
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
    "Option B: one Discord root origin; region selected by path (/region/east vs /region/west). One-machine RTT is not geo differentiation.",
  hosts: { rootHost, appId, samples },
  summary,
  samples: all,
};

const outPath = new URL("./measure-option-b-rtt.result.json", import.meta.url);
await Bun.write(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${outPath.pathname}`);
