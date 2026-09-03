import fs from 'node:fs';

const filePath = 'server/puzzle/catalog/authoredLevels.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Replace dated JSDoc references
content = content.replace(/Goal clear-lines:6\./g, 'Goal garbage-clear: clear all garbage.');
content = content.replace(/Goal clear-lines:7\./g, 'Goal garbage-clear: clear all garbage.');
content = content.replace(/Goal clear-lines:8\./g, 'Goal garbage-clear: clear all garbage.');
content = content.replace(/Goal clear-lines:9\./g, 'Goal garbage-clear: clear all garbage.');
content = content.replace(/Goal clear-lines:4\./g, 'Goal garbage-clear: clear all garbage.');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Cleaned JSDoc comments!');
