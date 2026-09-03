import fs from 'fs';

const raw = fs.readFileSync('.scratch/eval-all-levels-report.json', 'utf-8');
// remove the first line "Total levels: 35"
const jsonStr = raw.substring(raw.indexOf('['));
const data = JSON.parse(jsonStr);

console.log(`Loaded ${data.length} levels.`);
for (const item of data.slice(0, 16)) {
  const rb = item.rulesBot;
  const pps = rb && rb.ticks > 0 ? (rb.pieces / (rb.ticks / 60)).toFixed(2) : 'N/A';
  const humanEstTicksLow = rb ? rb.pieces * 60 : 'N/A'; // 1 piece/sec
  const humanEstTicksHigh = rb ? rb.pieces * 120 : 'N/A'; // 2 sec/piece
  
  console.log(`\n#${item.index} [${item.id}] "${item.name}"`);
  console.log(`  Goal: ${JSON.stringify(item.goal)} | Hold: ${item.allowHold}`);
  console.log(`  RulesBot: Solved=${rb?.solved} | Pieces=${rb?.pieces} | Ticks=${rb?.ticks} (${(rb?.ticks/60).toFixed(1)}s, ${pps} PPS)`);
  console.log(`  Human Est: ~${(humanEstTicksLow/60).toFixed(0)}-${(humanEstTicksHigh/60).toFixed(0)}s (${humanEstTicksLow}-${humanEstTicksHigh} ticks)`);
  console.log(`  Timeline (${item.timeline.length} entries):`);
  for (const e of item.timeline) {
    if (e.loop) {
      console.log(`    - LOOP startTick=${e.loop.startTick}, period=${e.loop.periodTicks}, seq=${JSON.stringify(e.loop.sequence)}`);
    } else if (e.afterPieces !== undefined) {
      console.log(`    - PIECE: afterPieces=${e.afterPieces}, kind=${e.kind}, params=${JSON.stringify(e.params)}`);
    } else {
      console.log(`    - TICK: tick=${e.tick} (${(e.tick/60).toFixed(1)}s), kind=${e.kind}, params=${JSON.stringify(e.params)}`);
    }
  }
}
