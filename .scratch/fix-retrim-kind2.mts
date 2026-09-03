import fs from 'node:fs';
const path = 'server/puzzle/puzzleTypes.ts';
let s = fs.readFileSync(path, 'utf8');
// Normalize and rewrite HazardKind block explicitly
const re = /export type HazardKind =[\s\S]*?\| 'satellite';/;
if (!re.test(s)) throw new Error('HazardKind block not found');
s = s.replace(
  re,
  `export type HazardKind =
  | 'poison'
  | 'storage-poison'
  | 'retrim'
  | 'purge'
  | 'curtain'
  | 'freeze'
  | 'magnet'
  | 'snag'
  | 'sticky'
  | 'bomber'
  | 'wildcard'
  | 'tectonic'
  | 'garbage'
  | 'satellite';`,
);
fs.writeFileSync(path, s);
const check = fs.readFileSync(path, 'utf8');
console.log(check.includes("| 'retrim'"));
console.log(check.split(/\r?\n/).slice(23, 40).join('\n'));
