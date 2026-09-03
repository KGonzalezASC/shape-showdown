import fs from 'node:fs';
const path = 'server/puzzle/catalog/authoredLevels.ts';
let s = fs.readFileSync(path, 'utf8');

const dig = `export function buildDigShaftLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Cheese dig with a preferred shaft lane (holes cluster near col 4) plus
  // staggered side holes so one vertical I cannot skim the goal alone.
  paintGarbageRow(board, 0, [4, 8]);
  paintGarbageRow(board, 1, [4, 1]);
  paintGarbageRow(board, 2, [3, 4]);
  paintGarbageRow(board, 3, [4, 7]);
  paintGarbageRow(board, 4, [2, 5]);
  paintColumnStack(board, 0, 3);
  paintColumnStack(board, 9, 4);

  // Openers force packing into the shaft before I arrives.
  const queuePrefix: ShapeType[] = ['T', 'S', 'Z', 'O', 'J', 'L', 'I'];
  const timeline: TimelineEvent[] = [
    // ~2s: garbage pulse mid-dig shifts the shaft geometry.
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

const digStart = s.indexOf('export function buildDigShaftLevel()');
const tslotStart = s.indexOf('export function buildTSlotSetupLevel()');
if (digStart < 0 || tslotStart < 0) throw new Error('markers');
s = s.slice(0, digStart) + dig + s.slice(tslotStart);
fs.writeFileSync(path, s);
console.log('retuned dig-shaft');
