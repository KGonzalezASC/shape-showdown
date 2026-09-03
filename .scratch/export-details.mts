import fs from 'fs';

const raw = fs.readFileSync('.scratch/rulesbot-traces.json', 'utf-8');
const traces = JSON.parse(raw);

const out = [];

for (let i = 0; i < traces.length; i++) {
  const t = traces[i];
  const rbTicks = t.totalTicks;
  const rbPieces = t.totalPieces;
  const rbPPS = rbTicks > 0 ? (rbPieces / (rbTicks / 60)).toFixed(2) : '0';
  const humanSecLow = Math.round(rbPieces * 1.0);
  const humanSecHigh = Math.round(rbPieces * 2.0);
  const humanTicksLow = humanSecLow * 60;
  const humanTicksHigh = humanSecHigh * 60;
  
  const firedMap = t.eventsFired.map((ef: any) => `tick ${ef.tick} [${(ef.tick/60).toFixed(1)}s, locked:${ef.piecesLocked}]: ${ef.kind}`);
  
  out.push({
    index: i + 1,
    id: t.id,
    name: t.name,
    goal: t.goal,
    hold: t.hold,
    rb: { pieces: rbPieces, ticks: rbTicks, timeSec: (rbTicks/60).toFixed(1), pps: rbPPS, solved: t.solved },
    human: { pieces: rbPieces, timeSec: `${humanSecLow}-${humanSecHigh}s`, ticks: `${humanTicksLow}-${humanTicksHigh}` },
    timeline: t.timeline,
    eventsFiredCount: t.eventsFired.length,
    eventsFired: firedMap,
  });
}

fs.writeFileSync('.scratch/all-35-details.json', JSON.stringify(out, null, 2));
console.log('Saved all 35 details to .scratch/all-35-details.json');
