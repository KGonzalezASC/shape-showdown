import fs from 'node:fs';

const filePath = 'server/puzzle/catalog/authoredLevels.ts';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/goal:\s*\{\s*kind:\s*'garbage-clear'\s*\}\s*,\s*lines:\s*\d+\s*\},/g, "goal: { kind: 'garbage-clear' },");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Cleaned up garbage-clear goal lines!');
