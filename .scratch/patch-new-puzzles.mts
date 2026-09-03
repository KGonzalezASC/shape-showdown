import fs from 'node:fs';

const path = 'server/puzzle/catalog/authoredLevels.ts';
let s = fs.readFileSync(path, 'utf8');

const four = `export function buildFourWideLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Side walls cols 0-2 and 7-9; 4-wide corridor cols 3-6 with intentional floor texture.
  paintColumnStack(board, 0, 7);
  paintColumnStack(board, 1, 8);
  paintColumnStack(board, 2, 6);
  paintColumnStack(board, 7, 6);
  paintColumnStack(board, 8, 8);
  paintColumnStack(board, 9, 7);
  // Corridor floor stubs (supported): shallow mid bumps keep clears intentional.
  paintColumnStack(board, 3, 1);
  paintColumnStack(board, 4, 2);
  paintColumnStack(board, 5, 2);
  paintColumnStack(board, 6, 1);

  const queuePrefix: ShapeType[] = ['I', 'O', 'J', 'L', 'T', 'S', 'Z'];

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
  // Center well at col 5; messy shoulders tempt early I misuse. No post-stack row overwrite.
  paintColumnStack(board, 0, 4);
  paintColumnStack(board, 1, 5);
  paintColumnStack(board, 2, 4);
  paintColumnStack(board, 3, 3);
  paintColumnStack(board, 4, 2);
  // col 5 open well
  paintColumnStack(board, 6, 2);
  paintColumnStack(board, 7, 4);
  paintColumnStack(board, 8, 5);
  paintColumnStack(board, 9, 4);

  // Early I wants banking; S/Z/O burn if I is spent wrong.
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

const fourStart = s.indexOf('export function buildFourWideLevel()');
const poisonStart = s.indexOf('export function buildPoisonBeatLevel()');
if (fourStart < 0 || poisonStart < 0) throw new Error('markers missing');
s = s.slice(0, fourStart) + four + hold + s.slice(poisonStart);
fs.writeFileSync(path, s);
console.log('patched four-wide + hold-discipline');
