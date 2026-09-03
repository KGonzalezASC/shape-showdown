import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';

const levels = buildAuthoredLevels();
for (const l of levels) {
  console.log(`[${l.id}] goal=${JSON.stringify(l.goal)} initialGarbageRows=${l.initialBoard.filter(r => r.some(c => c === 'G')).length}`);
}
