import fs from 'node:fs';
const path = 'server/puzzle/catalog/authoredLevels.ts';
let s = fs.readFileSync(path, 'utf8');
const late = `export function buildLateIWellLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Deep well at col 4; tall shoulders. Floor hole is simply the open well column.
  paintColumnStack(board, 0, 6);
  paintColumnStack(board, 1, 7);
  paintColumnStack(board, 2, 6);
  paintColumnStack(board, 3, 5);
  // col 4 open
  paintColumnStack(board, 5, 5);
  paintColumnStack(board, 6, 6);
  paintColumnStack(board, 7, 7);
  paintColumnStack(board, 8, 6);
  paintColumnStack(board, 9, 5);

  const queuePrefix: ShapeType[] = ['S', 'Z', 'O', 'J', 'L', 'T', 'I'];

  return freezeLevel({
    id: 'authored-late-i-well',
    name: 'Late I Well',
    seed: 12880,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
    timeline: [],
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

`;
const lateStart = s.indexOf('export function buildLateIWellLevel()');
const authStart = s.indexOf('export function buildAuthoredLevels()');
if (lateStart < 0 || authStart < 0) throw new Error('markers');
s = s.slice(0, lateStart) + late + s.slice(authStart);
fs.writeFileSync(path, s);
console.log('patched late-i-well');
