/**
 * Lever: decode Jstris maps/api payloads → authored catalog builders.
 * Usage: bun .scratch/import-jstris-batch20.mts
 * Input: .scratch/jstris-selected-20.json (array of {id,name,queue,finish,data})
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const JSON_PATH = path.join(ROOT, '.scratch/jstris-selected-20.json');
const TARGET = path.join(ROOT, 'server/puzzle/catalog/authoredLevels.ts');

type JMap = { id: number; name: string; queue: string; finish: number; data: string };

const SHAPES = new Set(['I', 'O', 'T', 'L', 'J', 'S', 'Z']);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function pascal(slug: string): string {
  return slug.split('-').filter(Boolean).map((p) => p[0]!.toUpperCase() + p.slice(1)).join('');
}

function decodeRows(data: string): number[][] {
  const buf = Buffer.from(data, 'base64');
  const cells: number[] = [];
  for (const b of buf) {
    cells.push((b >> 4) & 0xf);
    cells.push(b & 0xf);
  }
  const rows: number[][] = [];
  for (let r = 0; r < 20; r++) rows.push(cells.slice(r * 10, r * 10 + 10));
  return rows;
}

function keepBottomRows(rows: number[][], keep: number): number[][] {
  return rows.slice(20 - keep);
}

function holeCols(row: number[]): number[] {
  return row.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
}

function queueToShapes(queue: string): string[] {
  const out: string[] = [];
  for (const ch of queue.toUpperCase()) {
    if (SHAPES.has(ch)) out.push(`'${ch}'`);
  }
  return out;
}

/** Per-map keep / goal / timeline recipes (varied hazards). */
type Recipe = {
  keep: number;
  lines: number;
  timeline: string; // TS expression body for TimelineEntry[]
  note: string;
};

const RECIPES: Record<number, Recipe> = {
  // PC-ish short stack — piece-scheduled pressure
  2: {
    keep: 4,
    lines: 4,
    timeline: `[
    { afterPieces: 3, kind: 'curtain' },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 9, kind: 'magnet' },
  ]`,
    note: 'PC opener; piece-scheduled curtain→snag→magnet',
  },
  // Rainbow well dig
  15: {
    keep: 8,
    lines: 6,
    timeline: `[
    { tick: 90, kind: 'retrim' },
    { tick: 180, kind: 'magnet' },
    { tick: 300, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ]`,
    note: 'Well dig; retrim→magnet + garbage pulse',
  },
  // L-spins — sticky / freeze / snag mix
  24: {
    keep: 8,
    lines: 5,
    timeline: `[
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 8, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 12, kind: 'snag' },
  ]`,
    note: 'L-spin stack; sticky→freeze→snag afterPieces',
  },
  // Cheese
  45: {
    keep: 10,
    lines: 8,
    timeline: `[
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { tick: 240, kind: 'purge', params: { variant: 2 } },
    { tick: 420, kind: 'magnet' },
  ]`,
    note: 'Cheese 10; garbage→purge→magnet ticks',
  },
  // Clog chambers
  53: {
    keep: 8,
    lines: 7,
    timeline: `[
    { tick: 150, kind: 'snag' },
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 10, kind: 'curtain' },
  ]`,
    note: 'Clog chambers; snag + piece retrim/curtain',
  },
  // S-spin
  61: {
    keep: 8,
    lines: 5,
    timeline: `[
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 7, kind: 'magnet' },
    { tick: 480, kind: 'purge', params: { variant: 2 } },
  ]`,
    note: 'S-spin triple; sticky→magnet + late purge',
  },
  // Drill 1 — one of few freeze-forward
  70: {
    keep: 8,
    lines: 6,
    timeline: `[
    { tick: 240, kind: 'freeze', params: { durationTicks: 600 } },
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
  ]`,
    note: 'Drill shaft; early garbage + mid freeze',
  },
  // Drill 2 — sparse curtain loop
  71: {
    keep: 8,
    lines: 7,
    timeline: `[
    { tick: 90, kind: 'retrim' },
    { loop: { startTick: 360, periodTicks: 720, sequence: [{ at: 0, kind: 'curtain' }] } },
    { tick: 900, kind: 'magnet' },
  ]`,
    note: 'Drill 2; retrim + sparse curtain loop + late magnet',
  },
  // SRS Tower — poison+wildcard (open enough after keep)
  76: {
    keep: 8,
    lines: 10,
    timeline: `[
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    { tick: 200, kind: 'wildcard', params: { variant: 2 } },
    { afterPieces: 14, kind: 'snag' },
  ]`,
    note: 'SRS tower; poison→wildcard (+ late snag)',
  },
  // L-spin mania
  77: {
    keep: 8,
    lines: 9,
    timeline: `[
    { afterPieces: 4, kind: 'snag' },
    { afterPieces: 8, kind: 'sticky' },
    { afterPieces: 12, kind: 'purge', params: { variant: 2 } },
  ]`,
    note: 'L-spin mania; snag→sticky→purge afterPieces',
  },
  // SRS Training
  89: {
    keep: 8,
    lines: 8,
    timeline: `[
    { tick: 120, kind: 'retrim' },
    { tick: 280, kind: 'magnet' },
    { tick: 480, kind: 'curtain' },
  ]`,
    note: 'SRS training; retrim→magnet→curtain',
  },
  // DT Cannon
  97: {
    keep: 8,
    lines: 6,
    timeline: `[
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 5, kind: 'curtain' },
    { afterPieces: 8, kind: 'magnet' },
  ]`,
    note: 'DT cannon; snag→curtain→magnet afterPieces',
  },
  // Godspin
  99: {
    keep: 8,
    lines: 7,
    timeline: `[
    { tick: 150, kind: 'purge', params: { variant: 2 } },
    { tick: 300, kind: 'sticky' },
    { tick: 450, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
  ]`,
    note: 'Godspin; purge→sticky→garbage',
  },
  // Many STSD
  105: {
    keep: 8,
    lines: 11,
    timeline: `[
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 9, kind: 'snag' },
    { afterPieces: 14, kind: 'freeze', params: { durationTicks: 360 } },
  ]`,
    note: 'STSD tower; magnet→snag→freeze afterPieces',
  },
  // tripz
  216: {
    keep: 8,
    lines: 9,
    timeline: `[
    { tick: 100, kind: 'curtain' },
    { tick: 220, kind: 'retrim' },
    { tick: 400, kind: 'sticky' },
  ]`,
    note: 'Tripz; curtain→retrim→sticky',
  },
  // Gutter — freeze-primary (2nd)
  305: {
    keep: 8,
    lines: 6,
    timeline: `[
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ]`,
    note: 'Gutter; freeze-primary mid-solve',
  },
  // 1v1 downstack
  355: {
    keep: 8,
    lines: 8,
    timeline: `[
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
    { tick: 240, kind: 'magnet' },
    { afterPieces: 10, kind: 'snag' },
  ]`,
    note: 'Downstack; garbage→magnet + late snag',
  },
  // T-spin tower
  368: {
    keep: 8,
    lines: 10,
    timeline: `[
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 7, kind: 'curtain' },
    { afterPieces: 12, kind: 'snag' },
  ]`,
    note: 'T-spin tower; sticky→curtain→snag afterPieces',
  },
  // DHD — poison+wildcard #2
  410: {
    keep: 8,
    lines: 12,
    timeline: `[
    { tick: 90, kind: 'poison', params: { variant: 1 } },
    { tick: 210, kind: 'wildcard', params: { variant: 1 } },
    { tick: 480, kind: 'magnet' },
  ]`,
    note: 'DHD; poison→wildcard + magnet',
  },
  // T-spin triples — freeze-primary #3
  9100: {
    keep: 8,
    lines: 8,
    timeline: `[
    { tick: 360, kind: 'freeze', params: { durationTicks: 720 } },
  ]`,
    note: 'T-spin triples; freeze-primary',
  },
};

function emitBuilder(m: JMap, recipe: Recipe): { fn: string; id: string; call: string } {
  const slug = slugify(m.name);
  const id = `import-jstris-${slug}`;
  const fnName = `buildImportJstris${pascal(slug)}Level`;
  const rows = decodeRows(m.data);
  const kept = keepBottomRows(rows, recipe.keep);
  // paint from bottom: rowFromBottom 0 = floor = last kept row
  const paints: string[] = [];
  for (let i = 0; i < kept.length; i++) {
    const rowFromBottom = i;
    const src = kept[kept.length - 1 - i]!;
    const holes = holeCols(src);
    // If entire row empty, skip paint (emptyBoard already null)
    if (holes.length === 10) continue;
    paints.push(`  paintGarbageRow(board, ${rowFromBottom}, [${holes.join(', ')}]);`);
  }
  const shapes = queueToShapes(m.queue);
  // Cap extremely long queues for catalog readability (keep exact letters but wrap)
  const queueLit = shapes.length <= 40
    ? `[${shapes.join(', ')}]`
    : `[\n    ${shapes.map((s, i) => (i > 0 && i % 16 === 0 ? `\n    ${s}` : s)).join(', ')}\n  ]`;

  const body = `
/**
 * Import — Jstris map ${m.id} "${m.name}"
 * Source: https://jstris.jezevec10.com/map/${m.id} (API maps/api/${m.id}).
 * Board decoded from base64 data (200 nibbles); non-zero → G. Kept bottom
 * ${recipe.keep} row(s) for spawn headroom. Exact API queue as queuePrefix.
 * ${recipe.note}. Goal clear-lines:${recipe.lines}.
 */
export function ${fnName}(): CuratedPuzzleLevel {
  const board = emptyBoard();
${paints.join('\n')}

  const queuePrefix: ShapeType[] = ${queueLit};
  const timeline: TimelineEntry[] = ${recipe.timeline};

  return freezeLevel({
    id: '${id}',
    name: 'Jstris: ${m.name.replace(/'/g, "\\'")}',
    seed: ${m.id * 1000 + (m.id % 97)},
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: ${recipe.lines} },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}
`.trimStart();

  return { fn: body, id, call: `${fnName}()` };
}

function main() {
  const maps = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) as JMap[];
  if (maps.length !== 20) throw new Error(`expected 20 maps, got ${maps.length}`);

  const builders: ReturnType<typeof emitBuilder>[] = [];
  for (const m of maps) {
    const recipe = RECIPES[m.id];
    if (!recipe) throw new Error(`missing recipe for map ${m.id}`);
    if (!m.queue || !m.queue.length) throw new Error(`null queue for ${m.id}`);
    builders.push(emitBuilder(m, recipe));
  }

  // uniqueness check
  const ids = new Set(builders.map((b) => b.id));
  if (ids.size !== builders.length) throw new Error('duplicate ids');

  let src = fs.readFileSync(TARGET, 'utf8');

  // Ensure TimelineEntry import (already present in file)
  if (!src.includes('TimelineEntry')) {
    throw new Error('authoredLevels.ts missing TimelineEntry import');
  }

  const marker = 'export function buildAuthoredLevels(): CuratedPuzzleLevel[] {';
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error('buildAuthoredLevels not found');

  // Remove prior batch insert if re-running
  const begin = '// --- BEGIN JSTRIS BATCH20 ---';
  const end = '// --- END JSTRIS BATCH20 ---';
  if (src.includes(begin)) {
    const a = src.indexOf(begin);
    const b = src.indexOf(end);
    if (b < 0) throw new Error('broken batch markers');
    src = src.slice(0, a) + src.slice(b + end.length + 1);
  }

  const block =
    begin +
    '\n' +
    builders.map((b) => b.fn).join('\n') +
    end +
    '\n\n';

  // Re-find marker after possible strip
  const idx2 = src.indexOf(marker);
  src = src.slice(0, idx2) + block + src.slice(idx2);

  // Wire into array — find trial imports section
  const wireMarker = '    buildImportFumenC4w3resLevel(),';
  if (!src.includes(wireMarker)) throw new Error('fumen wire marker missing');
  const wireLines = builders.map((b) => `    ${b.call},`).join('\n');
  // strip previous batch wires if present
  src = src.replace(/\n    \/\/ JSTRIS BATCH20[\s\S]*?\/\/ JSTRIS BATCH20 END\n/, '\n');
  src = src.replace(
    wireMarker,
    `${wireMarker}\n    // JSTRIS BATCH20\n${wireLines}\n    // JSTRIS BATCH20 END`,
  );

  fs.writeFileSync(TARGET, src, 'utf8');

  const report = builders.map((b, i) => {
    const m = maps[i]!;
    const r = RECIPES[m.id]!;
    return {
      id: b.id,
      jstrisId: m.id,
      queueLen: m.queue.length,
      goal: `clear-lines:${r.lines}`,
      timeline: r.note,
      keep: r.keep,
    };
  });
  fs.writeFileSync(
    path.join(ROOT, '.scratch/jstris-batch20-report.json'),
    JSON.stringify(report, null, 2) + '\n',
    'utf8',
  );
  console.log(`Patched ${TARGET} with ${builders.length} imports`);
  for (const row of report) {
    console.log(`${row.id}  jstris=${row.jstrisId} qlen=${row.queueLen} ${row.goal} | ${row.timeline}`);
  }
}

main();

