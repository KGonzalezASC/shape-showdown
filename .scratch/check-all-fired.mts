import fs from 'fs';
const traces = JSON.parse(fs.readFileSync('.scratch/rulesbot-traces.json', 'utf-8'));
for (let i = 0; i < traces.length; i++) {
  const t = traces[i];
  console.log(`[#${i+1}] ${t.id} ("${t.name}"): pieces=${t.totalPieces}, fired=${t.eventsFired.length}/${t.timeline.length}`);
  console.log(`    Fired: ${t.eventsFired.map((e: any) => e.kind).join(', ') || 'NONE'}`);
}
