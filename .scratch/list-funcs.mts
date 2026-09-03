import fs from 'fs';
const content = fs.readFileSync('server/puzzle/catalog/authoredLevels.ts', 'utf-8');
const matches = content.match(/export function (build\w+)/g);
console.log(matches?.join('\n'));
