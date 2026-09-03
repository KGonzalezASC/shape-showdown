import fs from 'node:fs';
const path = 'server/puzzle/puzzleTypes.ts';
let s = fs.readFileSync(path, 'utf8');
if (!s.includes("| 'retrim'")) {
  s = s.replace(
    "  | 'storage-poison'\n  | 'purge'",
    "  | 'storage-poison'\n  | 'retrim'\n  | 'purge'",
  );
  fs.writeFileSync(path, s);
  console.log('added retrim');
} else {
  console.log('already present');
}
console.log(s.split('\n').slice(23, 40).join('\n'));
