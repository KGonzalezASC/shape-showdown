import fs from 'fs';
const src = fs.readFileSync('server/puzzle/catalog/authoredLevels.ts','utf8');
const fnRe = /export function (build\w+Level)\(\)[\s\S]*?return freezeLevel\(\{([\s\S]*?)\n  \}\);/g;
const levels: any[] = [];
let m: RegExpExecArray | null;
while ((m = fnRe.exec(src))) {
  const body = m[0];
  const idM = body.match(/id:\s*['"]([^'"]+)['"]/);
  const tlM = body.match(/const timeline: TimelineEntry\[] = \[([\s\S]*?)\];/);
  if (!tlM || !idM) continue;
  const kinds = [...tlM[1].matchAll(/kind:\s*'(\w+)'/g)].map((x) => x[1]);
  levels.push({ id: idM[1], count: kinds.length, kinds });
}
const PREV: Record<string, number> = {"authored-cheese-keyhole":10,"authored-well-freeze":14,"authored-skew-stairs":13,"authored-pulse-garbage":13,"authored-cheese-ladder":13,"authored-dig-shaft":10,"authored-tslot-setup":14,"authored-four-wide":12,"authored-hold-discipline":14,"authored-poison-beat":10,"authored-curtain-drop":13,"authored-late-i-well":14,"import-jstris-checkboard":13,"import-jstris-ultimate-29-combo":10,"import-fumen-c4w-3res":12,"import-jstris-perfect-clear-how":13,"import-jstris-clear-the-rainbow":12,"import-jstris-lspins-easy":12,"import-jstris-cheese-10":10,"import-jstris-clog":13,"import-jstris-s-spin-triple":12,"import-jstris-drilltris-1":11,"import-jstris-drilltris-2":11,"import-jstris-srs-tower":12,"import-jstris-srs-training":12,"import-jstris-dt-cannon-practice":12,"import-jstris-godspin":13,"import-jstris-many-stsd":10,"import-jstris-tripz":13,"import-jstris-the-gutter":12,"import-jstris-1v1-downstack":13,"import-jstris-aaron-s-t-spin-tower":10,"import-jstris-dhd":10,"import-jstris-t-spin-triples":13,"import-jstris-mash-space":13};
console.log('levels', levels.length);
const gram3 = new Map<string, Set<string>>();
for (const L of levels) {
  const prev = PREV[L.id];
  if (L.count < prev - 1 || L.count < 6) console.log('COUNT FAIL', L.id, L.count, prev);
  for (let i = 1; i < L.kinds.length; i++) if (L.kinds[i] === L.kinds[i - 1]) console.log('DUP', L.id, L.kinds[i], 'at', i);
  for (let i = 0; i <= L.kinds.length - 3; i++) {
    const g = L.kinds.slice(i, i + 3).join('>');
    if (!gram3.has(g)) gram3.set(g, new Set());
    gram3.get(g)!.add(L.id);
  }
}
const bad5 = [...gram3.entries()].filter(([, s]) => s.size >= 5).sort((a, b) => b[1].size - a[1].size);
console.log('bad5', bad5.length);
for (const [g, s] of bad5) console.log(g, s.size, [...s].join(','));
const top = [...gram3.entries()].filter(([, s]) => s.size >= 3).sort((a, b) => b[1].size - a[1].size);
console.log('top >=3', top.length);
for (const [g, s] of top.slice(0, 15)) console.log(g, s.size, [...s].join(','));
const ck = levels.find((l) => l.id.includes('cheese-keyhole'));
const c10 = levels.find((l) => l.id.includes('cheese-10'));
console.log('cheese same?', ck.kinds.join('>') === c10.kinds.join('>'));
