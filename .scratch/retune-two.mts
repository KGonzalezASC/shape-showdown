import fs from "node:fs";
const path = "server/puzzle/catalog/authoredLevels.ts";
let s = fs.readFileSync(path, "utf8");
const holdStart = s.indexOf("export function buildHoldDisciplineLevel()");
const poisonStart = s.indexOf("export function buildPoisonBeatLevel()");
const lateStart = s.indexOf("export function buildLateIWellLevel()");
const authStart = s.indexOf("export function buildAuthoredLevels()");
if (holdStart < 0 || poisonStart < 0 || lateStart < 0 || authStart < 0) throw new Error("markers");

const hold = `export function buildHoldDisciplineLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Messy left ramp + right basin; early I is valuable later but dumping it
  // into the shallow gaps wastes the only vertical cleaner before freeze.
  paintGarbageRow(board, 0, [2, 7]);
  paintGarbageRow(board, 1, [3, 6]);
  paintGarbageRow(board, 2, [4, 5, 8]);
  paintGarbageRow(board, 3, [1, 4, 9]);
  paintColumnStack(board, 0, 5);
  paintColumnStack(board, 9, 4);

  // Hold I through S/Z/T setup; freeze arrives ~5s to punish late banking.
  const queuePrefix: ShapeType[] = ["I", "S", "Z", "T", "J", "L", "O"];
  const timeline: TimelineEvent[] = [
    { tick: 300, kind: "freeze", params: { durationTicks: 720 } },
  ];

  return freezeLevel({
    id: "authored-hold-discipline",
    name: "Hold Discipline",
    seed: 5531,
    initialBoard: board,
    queuePrefix,
    goal: { kind: "clear-lines", lines: 3 },
    timeline,
    shopPolicy: "none",
    allowHold: true,
    benchmark: {
      metric: "ticks",
      direction: "minimize",
      tieBreakers: [{ metric: "pieces", direction: "minimize" }],
    },
    visibilityPolicy: "partial",
  });
}

`;

const late = `export function buildLateIWellLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Almost-I-well with crumbs in the lane and uneven walls so early J/L/O
  // must prep before the late I cleans multiple residual lines.
  paintColumnStack(board, 0, 3);
  paintColumnStack(board, 1, 5);
  paintColumnStack(board, 2, 5);
  paintColumnStack(board, 3, 4);
  paintColumnStack(board, 4, 5);
  // col 5 well with floor crumb + mid blockage (not a free Tetris).
  board[BOARD_ROWS - 1][5] = "G";
  board[BOARD_ROWS - 3][5] = "G";
  paintColumnStack(board, 6, 5);
  paintColumnStack(board, 7, 4);
  paintColumnStack(board, 8, 5);
  paintColumnStack(board, 9, 3);
  // Side cheese holes so clears are not only the well.
  board[BOARD_ROWS - 1][3] = null;
  board[BOARD_ROWS - 2][7] = null;

  const queuePrefix: ShapeType[] = ["J", "L", "O", "T", "S", "Z", "I"];

  return freezeLevel({
    id: "authored-late-i-well",
    name: "Late I Well",
    seed: 5866,
    initialBoard: board,
    queuePrefix,
    goal: { kind: "clear-lines", lines: 3 },
    timeline: [],
    shopPolicy: "none",
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: "revealed",
  });
}

`;

s = s.slice(0, holdStart) + hold + s.slice(poisonStart, lateStart) + late + s.slice(authStart);
fs.writeFileSync(path, s);
console.log("retuned");
