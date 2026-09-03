import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { BOARD_ROWS, BOARD_COLS } from '../src/constants.js';

const levels = buildAuthoredLevels();

for (let i = 0; i < levels.length; i++) {
  const level = levels[i];
  let garbageCount = 0;
  let poisonCount = 0;
  let normalCount = 0;
  let topFilledRow = 20;

  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      const cell = level.initialBoard[y][x];
      if (cell !== null) {
        if (y < topFilledRow) topFilledRow = y;
        if (cell === 'G') garbageCount++;
        else if (typeof cell === 'number') poisonCount++;
        else normalCount++;
      }
    }
  }

  console.log(`[#${i + 1}] ${level.id} ("${level.name}"):`);
  console.log(`  Goal: ${JSON.stringify(level.goal)} | Queue: [${level.queuePrefix.join(', ')}] | Hold: ${level.allowHold ?? true} | Shop: ${level.shopPolicy}`);
  console.log(`  Board: topRow=${topFilledRow} (height ${20 - topFilledRow}), garbage=${garbageCount}, poison=${poisonCount}, normal=${normalCount}`);
}
