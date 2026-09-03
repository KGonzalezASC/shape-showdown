import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import fs from 'node:fs';

const levels = buildAuthoredLevels();

interface LevelStats {
  id: string;
  name: string;
  goalKind: string;
  targetCount: number;
  initialGarbageCells: number;
  maxGarbageRow: number;
  allowHold: boolean;
  visibility: string;
  eventCount: number;
  hasCurtain: boolean;
  hasPoison: boolean;
  baselinePieces?: number;
  baselineScore?: number;
}

const stats: LevelStats[] = [];

for (const l of levels) {
  let initialG = 0;
  let maxRow = 0;
  for (let r = 0; r < l.initialBoard.length; r++) {
    const gInRow = l.initialBoard[r].filter(c => c === 'G').length;
    if (gInRow > 0) {
      initialG += gInRow;
      maxRow = Math.max(maxRow, r + 1);
    }
  }

  let valData: any = null;
  const valPath = `fixtures/puzzle-validation/${l.id}.json`;
  if (fs.existsSync(valPath)) {
    valData = JSON.parse(fs.readFileSync(valPath, 'utf8'));
  }

  stats.push({
    id: l.id,
    name: l.name,
    goalKind: l.goal.kind,
    targetCount: (l.goal as any).lines ?? (l.goal as any).ticks ?? initialG,
    initialGarbageCells: initialG,
    maxGarbageRow: maxRow,
    allowHold: l.allowHold ?? true,
    visibility: l.visibilityPolicy ?? 'revealed',
    eventCount: l.timeline.length,
    hasCurtain: l.timeline.some(e => e.kind === 'curtain'),
    hasPoison: l.timeline.some(e => e.kind === 'poison'),
    baselinePieces: valData?.selectedBaseline?.piecesUsed,
    baselineScore: valData?.selectedBaseline?.score,
  });
}

console.log(JSON.stringify(stats, null, 2));
