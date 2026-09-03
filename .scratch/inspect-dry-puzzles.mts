import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';

const levels = buildAuthoredLevels();

for (let i = 0; i < levels.length; i++) {
  const l = levels[i];
  if (l.timeline.length <= 8) {
    console.log(`[#${i + 1}] id="${l.id}" name="${l.name}" goal=${l.goal.kind} events=${l.timeline.length}`);
    for (const e of l.timeline) {
      console.log(`    afterPieces=${e.afterPieces}, tick=${e.tick}, kind=${e.kind}`);
    }
  }
}
