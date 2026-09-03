import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';

const levels = buildAuthoredLevels();
const gcLevels = levels.filter(l => l.goal.kind === 'garbage-clear');

console.log(`Found ${gcLevels.length} garbage-clear puzzles:`);
for (const l of gcLevels) {
  console.log(`\n[${l.id}] (${l.name}) - current events: ${l.timeline.length}`);
  console.log(JSON.stringify(l.timeline, null, 2));
}
