import fs from 'node:fs';
const path = 'server/puzzle/catalog/authoredLevels.ts';
let s = fs.readFileSync(path, 'utf8');

const dig = `export function buildDigShaftLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Deep flanks with an imperfect shaft — not a clean single-hole I-tetris.
  // Extra gaps in the walls mean packing + dig work before 3 clears land.
  // Heights: 0:5 1:6 2:4 3:3 4:0 5:0 6:2 7:4 8:6 9:5
  paintColumnStack(board, 0, 5);
  paintColumnStack(board, 1, 6);
  paintColumnStack(board, 2, 4);
  paintColumnStack(board, 3, 3);
  // open shaft cols 4-5
  paintColumnStack(board, 6, 2);
  paintColumnStack(board, 7, 4);
  paintColumnStack(board, 8, 6);
  paintColumnStack(board, 9, 5);

  // Awkward openers first; I arrives mid-queue after setup.
  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'J', 'L', 'I', 'O'];
  const timeline: TimelineEvent[] = [
    // ~2s: one garbage line mid-dig so the shaft geometry shifts.
    { tick: 120, kind: 'garbage', params: { lines: 1, delayTicks: 18 } },
  ];

  return freezeLevel({
    id: 'authored-dig-shaft',
    name: 'Dig Shaft',
    seed: 6208,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

`;

const four = `export function buildFourWideLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Side walls cols 0-2 and 7-9; textured 4-wide corridor cols 3-6.
  paintColumnStack(board, 0, 7);
  paintColumnStack(board, 1, 8);
  paintColumnStack(board, 2, 6);
  paintColumnStack(board, 7, 6);
  paintColumnStack(board, 8, 8);
  paintColumnStack(board, 9, 7);
  // Corridor texture: uneven floor so a single I cannot skim 3 clears.
  paintColumnStack(board, 3, 2);
  paintColumnStack(board, 4, 1);
  paintColumnStack(board, 5, 3);
  paintColumnStack(board, 6, 1);

  const queuePrefix: ShapeType[] = ['O', 'J', 'L', 'T', 'S', 'Z', 'I'];

  return freezeLevel({
    id: 'authored-four-wide',
    name: 'Four Wide',
    seed: 8412,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
    timeline: [],
    shopPolicy: 'none',
    allowHold: false,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

`;

const hold = `export function buildHoldDisciplineLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Imperfect center well — shoulders have gaps so early I cannot skim tetrises.
  // Heights: 0:3 1:5 2:2 3:4 4:1 5:0 6:1 7:3 8:5 9:2
  paintColumnStack(board, 0, 3);
  paintColumnStack(board, 1, 5);
  paintColumnStack(board, 2, 2);
  paintColumnStack(board, 3, 4);
  paintColumnStack(board, 4, 1);
  // col 5 open well
  paintColumnStack(board, 6, 1);
  paintColumnStack(board, 7, 3);
  paintColumnStack(board, 8, 5);
  paintColumnStack(board, 9, 2);

  // Early I wants banking; S/Z/O force setup before the well is ready.
  const queuePrefix: ShapeType[] = ['I', 'S', 'Z', 'O', 'J', 'L', 'T'];
  const timeline: TimelineEvent[] = [
    { tick: 360, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'authored-hold-discipline',
    name: 'Hold Discipline',
    seed: 9550,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: {
      metric: 'ticks',
      direction: 'minimize',
      tieBreakers: [{ metric: 'pieces', direction: 'minimize' }],
    },
    visibilityPolicy: 'partial',
  });
}

`;

const digStart = s.indexOf('export function buildDigShaftLevel()');
const tslotStart = s.indexOf('export function buildTSlotSetupLevel()');
const fourStart = s.indexOf('export function buildFourWideLevel()');
const poisonStart = s.indexOf('export function buildPoisonBeatLevel()');
if (digStart < 0 || tslotStart < 0 || fourStart < 0 || poisonStart < 0) throw new Error('markers');
s = s.slice(0, digStart) + dig + s.slice(tslotStart, fourStart) + four + hold + s.slice(poisonStart);
fs.writeFileSync(path, s);
console.log('hardened dig/four/hold');
