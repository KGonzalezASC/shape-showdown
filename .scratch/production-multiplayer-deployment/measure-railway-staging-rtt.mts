/**
 * Direct Engine.IO polling RTT to Railway staging game service.
 *
 * Usage:
 *   bun .scratch/production-multiplayer-deployment/measure-railway-staging-rtt.mts
 *
 * Env:
 *   RAILWAY_STAGING_HOST=shape-showdown-staging.up.railway.app
 *   RTT_SAMPLES=20
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

const samples = Math.max(1, Number(process.env.RTT_SAMPLES ?? 20) || 20);
const host =
  process.env.RAILWAY_STAGING_HOST?.trim() || "shape-showdown-staging.up.railway.app";

const targets: Array<{ label: string; url: string }> = [
  {
    label: "health-direct",
    url: `https://${host}/health`,
  },
  {
    label: "socketio-polling-direct",
    url: `https://${host}/socket.io/?EIO=4&transport=polling`,
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
    const ok =
      label === "health-direct"
        ? res.ok && text.trim() === "ok"
        : res.ok && text.startsWith("0{");
    return {
      label,
      url,
      ok,
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
    return { count: rows.length, ok: 0, min: null, max: null, mean: null, p50: null, p95: null };
  }
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const p95Index = Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1);
  return {
    count: rows.length,
    ok: ok.length,
    min: times[0],
    max: times[times.length - 1],
    mean: sum / times.length,
    p50: times[Math.floor((times.length - 1) / 2)],
    p95: times[p95Index],
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
  host,
  samplesPerTarget: samples,
  note: "CLI/fetch RTT from this workstation to Railway public hostname (not Discord-mapped).",
  summary,
  samples: all,
};

const outPath = new URL("./measure-railway-staging-rtt.result.json", import.meta.url);
await Bun.write(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ written: outPath.pathname, summary }, null, 2));
