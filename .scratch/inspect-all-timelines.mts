import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';

const levels = buildAuthoredLevels();

for (let i = 0; i < levels.length; i++) {
  const l = levels[i];
  const kinds = l.timeline.map(e => e.kind);
  console.log(`[#${i + 1}] id="${l.id}" name="${l.name}" events=${l.timeline.length}`);
  console.log(`     timeline: ${kinds.join(', ') || 'EMPTY'}`);
}
