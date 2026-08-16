/**
 * Option C gateway RTT / sticky-routing probe.
 *
 * Usage:
 *   bun .scratch/production-multiplayer-deployment/measure-option-c-rtt.mts
 */

type Sample = {
  label: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  regionHeader?: string | null;
  backendHeader?: string | null;
  error?: string;
  bodyPreview?: string;
};

const samples = Math.max(1, Number(process.env.OPTION_C_SAMPLES ?? 5) || 5);
const rootHost =
  process.env.OPTION_C_ROOT_HOST?.trim() || "applying-follow-surfaces-transmit.trycloudflare.com";
const appId = process.env.OPTION_C_DISCORD_APP_ID?.trim() || "1538301343708618815";

const targets: Array<{ label: string; url: string; expectRegion?: "east" | "west" }> = [
  {
    label: "gateway-health-direct",
    url: `https://${rootHost}/health`,
  },
  {
    label: "socket-east-alloc-direct",
    url: `https://${rootHost}/socket.io/?EIO=4&transport=polling&region=east`,
    expectRegion: "east",
  },
  {
    label: "socket-west-alloc-direct",
    url: `https://${rootHost}/socket.io/?EIO=4&transport=polling&region=west`,
    expectRegion: "west",
  },
  {
    label: "socket-matchId-sticky-a-direct",
    url: `https://${rootHost}/socket.io/?EIO=4&transport=polling&matchId=match-option-c-alpha`,
  },
  {
    label: "socket-matchId-sticky-b-direct",
    url: `https://${rootHost}/socket.io/?EIO=4&transport=polling&matchId=match-option-c-beta`,
  },
  {
    label: "socket-east-alloc-via-discord-proxy",
    url: `https://${appId}.discordsays.com/socket.io/?EIO=4&transport=polling&region=east`,
    expectRegion: "east",
  },
  {
    label: "socket-west-alloc-via-discord-proxy",
    url: `https://${appId}.discordsays.com/socket.io/?EIO=4&transport=polling&region=west`,
    expectRegion: "west",
  },
];

function isOk(
  label: string,
  status: number | null,
  body: string,
  regionHeader: string | null,
  expectRegion?: "east" | "west",
): boolean {
  if (label.includes("health")) {
    return status === 200 && body.includes('"ok":true');
  }
  if (!(status === 200 && body.startsWith("0{"))) return false;
  if (expectRegion && regionHeader && regionHeader !== expectRegion) return false;
  return true;
}

async function sampleOnce(
  label: string,
  url: string,
  expectRegion?: "east" | "west",
): Promise<Sample> {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "*/*" },
      redirect: "manual",
    });
    const ms = performance.now() - started;
    const text = await res.text();
    const regionHeader = res.headers.get("x-option-c-region");
    const backendHeader = res.headers.get("x-option-c-backend");
    return {
      label,
      url,
      ok: isOk(label, res.status, text, regionHeader, expectRegion),
      status: res.status,
      ms,
      regionHeader,
      backendHeader,
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
    all.push(await sampleOnce(target.label, target.url, target.expectRegion));
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
  regionHeader: rows.find((r) => r.regionHeader)?.regionHeader ?? null,
  backendHeader: rows.find((r) => r.backendHeader)?.backendHeader ?? null,
  lastError: rows.find((r) => !r.ok)?.error ?? rows.find((r) => !r.ok)?.bodyPreview ?? null,
}));

const out = {
  measuredAt: new Date().toISOString(),
  machine: "single-local-dev",
  note:
    "Option C: client uses one gateway origin only. Region comes from allocation query (region/matchId), not Discord multi-host mappings or client path prefixes. Gateway hop RTT included.",
  hosts: { rootHost, appId, samples },
  summary,
  samples: all,
};

const outPath = new URL("./measure-option-c-rtt.result.json", import.meta.url);
await Bun.write(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${outPath.pathname}`);
