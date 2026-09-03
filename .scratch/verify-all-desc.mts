import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';

const levels = buildAuthoredLevels();
console.log(`Total levels: ${levels.length}`);
for (const l of levels) {
  if (!l.description) {
    console.log(`MISSING description: ${l.id}`);
  }
}
console.log('All checked!');
