import fs from 'node:fs';

const filePath = 'server/puzzle/catalog/authoredLevels.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. authored-cheese-keyhole
content = content.replace(
  `export function buildCheeseKeyholeLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4, 5]);
  paintGarbageRow(board, 1, [4, 5]);
  paintGarbageRow(board, 2, [3, 6]);
  paintGarbageRow(board, 3, [3, 6]);

  const queuePrefix: ShapeType[] = ['O', 'I', 'L', 'J', 'S', 'Z', 'T'];
  const timeline: TimelineEntry[] = [
    {"afterPieces":2,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":4,"kind":"snag"},
    {"afterPieces":6,"kind":"magnet"},
    {"afterPieces":7,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":9,"kind":"sticky"},
    {"afterPieces":11,"kind":"freeze","params":{"durationTicks":360}},
  ];

  return freezeLevel({
    id: 'authored-cheese-keyhole',
    name: 'Cheese Keyhole',
    seed: 1001,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 4 },`,
  `export function buildCheeseKeyholeLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4, 5]);
  paintGarbageRow(board, 1, [4, 5]);
  paintGarbageRow(board, 2, [3, 6]);
  paintGarbageRow(board, 3, [3, 6]);

  const queuePrefix: ShapeType[] = ['O', 'I', 'L', 'J', 'S', 'Z', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'sticky' },
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 6, kind: 'retrim' },
    { afterPieces: 8, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 10, kind: 'sticky' },
    { afterPieces: 12, kind: 'snag' },
    { afterPieces: 15, kind: 'magnet' },
    { afterPieces: 18, kind: 'retrim' },
    { afterPieces: 21, kind: 'freeze', params: { durationTicks: 360 } },
  ];

  return freezeLevel({
    id: 'authored-cheese-keyhole',
    name: 'Cheese Keyhole',
    description: 'Downstack through the central keyhole and wipe out all 4 cheese rows under lateral snags and hold freezes.',
    seed: 1001,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

// 2. authored-cheese-ladder
content = content.replace(
  `export function buildCheeseLadderLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [1]);
  paintGarbageRow(board, 1, [2, 8]);
  paintGarbageRow(board, 2, [3]);
  paintGarbageRow(board, 3, [4, 0]);
  paintGarbageRow(board, 4, [5]);

  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'S', 'Z', 'I', 'T'];
  const timeline: TimelineEntry[] = [
    {"afterPieces":2,"kind":"sticky"},
    {"afterPieces":4,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":6,"kind":"snag"},
    {"afterPieces":8,"kind":"magnet"},
    {"afterPieces":10,"kind":"freeze","params":{"durationTicks":360}},
    {"afterPieces":12,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
  ];

  return freezeLevel({
    id: 'authored-cheese-ladder',
    name: 'Cheese Ladder',
    seed: 5103,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`,
  `export function buildCheeseLadderLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [1]);
  paintGarbageRow(board, 1, [2, 8]);
  paintGarbageRow(board, 2, [3]);
  paintGarbageRow(board, 3, [4, 0]);
  paintGarbageRow(board, 4, [5]);

  const queuePrefix: ShapeType[] = ['J', 'L', 'O', 'S', 'Z', 'I', 'T'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 4, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 8, kind: 'magnet' },
    { afterPieces: 10, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 12, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 14, kind: 'retrim' },
    { afterPieces: 16, kind: 'sticky' },
    { afterPieces: 19, kind: 'snag' },
    { afterPieces: 22, kind: 'magnet' },
    { afterPieces: 25, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 28, kind: 'retrim' },
    { afterPieces: 32, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'authored-cheese-ladder',
    name: 'Cheese Ladder',
    description: 'Clean the diagonal cheese ladder while managing shifting swap lines, freeze pressure, and sticky lock limits.',
    seed: 5103,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

// 3. authored-dig-shaft
content = content.replace(
  `export function buildDigShaftLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4, 8]);
  paintGarbageRow(board, 1, [4, 1]);
  paintGarbageRow(board, 2, [3, 4]);
  paintGarbageRow(board, 3, [4, 7]);
  paintGarbageRow(board, 4, [4, 2]);

  const queuePrefix: ShapeType[] = ['I', 'J', 'L', 'T', 'O', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    {"afterPieces":2,"kind":"snag"},
    {"afterPieces":4,"kind":"retrim"},
    {"afterPieces":6,"kind":"freeze","params":{"durationTicks":360}},
    {"afterPieces":8,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":10,"kind":"magnet"},
    {"afterPieces":12,"kind":"sticky"},
  ];

  return freezeLevel({
    id: 'authored-dig-shaft',
    name: 'Dig Shaft',
    seed: 6006,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 9 },`,
  `export function buildDigShaftLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4, 8]);
  paintGarbageRow(board, 1, [4, 1]);
  paintGarbageRow(board, 2, [3, 4]);
  paintGarbageRow(board, 3, [4, 7]);
  paintGarbageRow(board, 4, [4, 2]);

  const queuePrefix: ShapeType[] = ['I', 'J', 'L', 'T', 'O', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 4, kind: 'snag' },
    { afterPieces: 7, kind: 'retrim' },
    { afterPieces: 10, kind: 'magnet' },
    { afterPieces: 13, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 16, kind: 'sticky' },
    { afterPieces: 20, kind: 'snag' },
    { afterPieces: 24, kind: 'magnet' },
    { afterPieces: 28, kind: 'retrim' },
    { afterPieces: 32, kind: 'freeze', params: { durationTicks: 360 } },
  ];

  return freezeLevel({
    id: 'authored-dig-shaft',
    name: 'Dig Shaft',
    description: 'Drill through column 4 and eliminate all garbage under recurring retrim and hold freeze cycles.',
    seed: 6006,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

// 4. import-jstris-perfect-clear-how
content = content.replace(
  `export function buildImportJstrisPerfectClearHowLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [2, 3, 4, 5, 7, 8]);
  paintGarbageRow(board, 1, [2, 3, 4, 5]);
  paintGarbageRow(board, 2, [2, 3, 4, 5, 7, 8]);
  paintGarbageRow(board, 3, [2, 3, 4, 5, 6, 7, 8, 9]);

  const queuePrefix: ShapeType[] = ['S', 'J', 'I', 'L', 'S', 'Z', 'Z'];
  const timeline: TimelineEntry[] = [
    {"afterPieces":1,"kind":"retrim"},
    {"afterPieces":3,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":5,"kind":"magnet"},
    {"afterPieces":6,"kind":"sticky"},
    {"afterPieces":8,"kind":"snag"},
    {"afterPieces":9,"kind":"freeze","params":{"durationTicks":360}},
  ];

  return freezeLevel({
    id: 'import-jstris-perfect-clear-how',
    name: 'Jstris: Perfect clear how?',
    seed: 2002,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`,
  `export function buildImportJstrisPerfectClearHowLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [2, 3, 4, 5, 7, 8]);
  paintGarbageRow(board, 1, [2, 3, 4, 5]);
  paintGarbageRow(board, 2, [2, 3, 4, 5, 7, 8]);
  paintGarbageRow(board, 3, [2, 3, 4, 5, 6, 7, 8, 9]);

  const queuePrefix: ShapeType[] = ['S', 'J', 'I', 'L', 'S', 'Z', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'retrim' },
    { afterPieces: 3, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 6, kind: 'sticky' },
    { afterPieces: 8, kind: 'snag' },
    { afterPieces: 9, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 11, kind: 'retrim' },
    { afterPieces: 13, kind: 'magnet' },
    { afterPieces: 15, kind: 'sticky' },
    { afterPieces: 18, kind: 'snag' },
    { afterPieces: 21, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 24, kind: 'retrim' },
    { afterPieces: 27, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'import-jstris-perfect-clear-how',
    name: 'Jstris: Perfect clear how?',
    description: 'Downstack the 4-row cheese block to clear all garbage while navigating alternating magnets, snags, and swap re-trims.',
    seed: 2002,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

// 5. import-jstris-clear-the-rainbow
content = content.replace(
  `export function buildImportJstrisClearTheRainbowLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [7, 8, 9]);
  paintGarbageRow(board, 1, [7, 8, 9]);
  paintGarbageRow(board, 2, [7, 8, 9]);
  paintGarbageRow(board, 3, [7, 8, 9]);
  paintGarbageRow(board, 4, [7, 8, 9]);
  paintGarbageRow(board, 5, [7, 8, 9]);
  paintGarbageRow(board, 6, [7, 8, 9]);
  paintGarbageRow(board, 7, [7, 8, 9]);

  const queuePrefix: ShapeType[] = ['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    {"afterPieces":1,"kind":"retrim"},
    {"afterPieces":2,"kind":"sticky"},
    {"afterPieces":3,"kind":"magnet"},
    {"afterPieces":4,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":5,"kind":"snag"},
  ];

  return freezeLevel({
    id: 'import-jstris-clear-the-rainbow',
    name: 'Jstris: Clear the rainbow',
    seed: 15015,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`,
  `export function buildImportJstrisClearTheRainbowLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [7, 8, 9]);
  paintGarbageRow(board, 1, [7, 8, 9]);
  paintGarbageRow(board, 2, [7, 8, 9]);
  paintGarbageRow(board, 3, [7, 8, 9]);
  paintGarbageRow(board, 4, [7, 8, 9]);
  paintGarbageRow(board, 5, [7, 8, 9]);
  paintGarbageRow(board, 6, [7, 8, 9]);
  paintGarbageRow(board, 7, [7, 8, 9]);

  const queuePrefix: ShapeType[] = ['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'retrim' },
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 3, kind: 'magnet' },
    { afterPieces: 4, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 5, kind: 'snag' },
    { afterPieces: 7, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 9, kind: 'retrim' },
    { afterPieces: 11, kind: 'magnet' },
    { afterPieces: 13, kind: 'sticky' },
    { afterPieces: 15, kind: 'snag' },
    { afterPieces: 18, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 21, kind: 'retrim' },
  ];

  return freezeLevel({
    id: 'import-jstris-clear-the-rainbow',
    name: 'Jstris: Clear the rainbow',
    description: 'Clear the entire 8-row rainbow stack using an I-piece stream while weathering magnets, stickies, and snags.',
    seed: 15015,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

// 6. import-jstris-cheese-10
content = content.replace(
  `export function buildImportJstrisCheese10Level(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4]);
  paintGarbageRow(board, 1, [0]);
  paintGarbageRow(board, 2, [3]);
  paintGarbageRow(board, 3, [8]);
  paintGarbageRow(board, 4, [6]);
  paintGarbageRow(board, 5, [2]);
  paintGarbageRow(board, 6, [7]);
  paintGarbageRow(board, 7, [9]);
  paintGarbageRow(board, 8, [5]);
  paintGarbageRow(board, 9, [1]);

  const queuePrefix: ShapeType[] = ['J', 'L', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'I', 'O', 'T', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    {"afterPieces":2,"kind":"snag"},
    {"afterPieces":4,"kind":"retrim"},
    {"afterPieces":6,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":8,"kind":"freeze","params":{"durationTicks":360}},
    {"afterPieces":11,"kind":"sticky"},
    {"afterPieces":13,"kind":"magnet"},
  ];

  return freezeLevel({
    id: 'import-jstris-cheese-10',
    name: 'Jstris: Cheese 10',
    seed: 28028,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 8 },`,
  `export function buildImportJstrisCheese10Level(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [4]);
  paintGarbageRow(board, 1, [0]);
  paintGarbageRow(board, 2, [3]);
  paintGarbageRow(board, 3, [8]);
  paintGarbageRow(board, 4, [6]);
  paintGarbageRow(board, 5, [2]);
  paintGarbageRow(board, 6, [7]);
  paintGarbageRow(board, 7, [9]);
  paintGarbageRow(board, 8, [5]);
  paintGarbageRow(board, 9, [1]);

  const queuePrefix: ShapeType[] = ['J', 'L', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'I', 'O', 'T', 'S', 'Z'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'sticky' },
    { afterPieces: 5, kind: 'snag' },
    { afterPieces: 8, kind: 'magnet' },
    { afterPieces: 12, kind: 'retrim' },
    { afterPieces: 16, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 20, kind: 'sticky' },
    { afterPieces: 25, kind: 'snag' },
    { afterPieces: 30, kind: 'magnet' },
    { afterPieces: 36, kind: 'retrim' },
    { afterPieces: 42, kind: 'freeze', params: { durationTicks: 360 } },
  ];

  return freezeLevel({
    id: 'import-jstris-cheese-10',
    name: 'Jstris: Cheese 10',
    description: 'Classic 10-line Cheese Race downstack: clear all 10 lines of messy single-hole cheese while surviving hazards.',
    seed: 28028,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

// 7. import-jstris-drilltris-1
content = content.replace(
  `export function buildImportJstrisDrilltris1Level(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, []);
  paintGarbageRow(board, 1, []);
  paintGarbageRow(board, 2, [4]);
  paintGarbageRow(board, 3, [4]);
  paintGarbageRow(board, 4, [4]);
  paintGarbageRow(board, 5, [4]);
  paintGarbageRow(board, 6, []);
  paintGarbageRow(board, 7, [4]);

  const queuePrefix: ShapeType[] = [
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I'
  ];
  const timeline: TimelineEntry[] = [
    {"afterPieces":1,"kind":"garbage","params":{"lines":1,"delayTicks":6}},
    {"afterPieces":1,"kind":"retrim"},
    {"afterPieces":2,"kind":"freeze","params":{"durationTicks":360}},
    {"afterPieces":2,"kind":"snag"},
  ];

  return freezeLevel({
    id: 'import-jstris-drilltris-1',
    name: 'Jstris: drilltris 1',
    seed: 70070,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`,
  `export function buildImportJstrisDrilltris1Level(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, []);
  paintGarbageRow(board, 1, []);
  paintGarbageRow(board, 2, [4]);
  paintGarbageRow(board, 3, [4]);
  paintGarbageRow(board, 4, [4]);
  paintGarbageRow(board, 5, [4]);
  paintGarbageRow(board, 6, []);
  paintGarbageRow(board, 7, [4]);

  const queuePrefix: ShapeType[] = [
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I'
  ];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'garbage', params: { lines: 1, delayTicks: 6 } },
    { afterPieces: 1, kind: 'retrim' },
    { afterPieces: 2, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 4, kind: 'magnet' },
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 7, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 8, kind: 'sticky' },
    { afterPieces: 10, kind: 'magnet' },
  ];

  return freezeLevel({
    id: 'import-jstris-drilltris-1',
    name: 'Jstris: drilltris 1',
    description: 'Drill through the central vertical channel and completely eliminate all solid garbage walls.',
    seed: 70070,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

// 8. import-jstris-drilltris-2
content = content.replace(
  `export function buildImportJstrisDrilltris2Level(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, []);
  paintGarbageRow(board, 1, []);
  paintGarbageRow(board, 2, [4]);
  paintGarbageRow(board, 3, [4]);
  paintGarbageRow(board, 4, [4]);
  paintGarbageRow(board, 5, [4]);
  paintGarbageRow(board, 6, []);
  paintGarbageRow(board, 7, [4]);

  const queuePrefix: ShapeType[] = [
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I'
  ];
  const timeline: TimelineEntry[] = [
    {"afterPieces":1,"kind":"retrim"},
    {"afterPieces":1,"kind":"garbage","params":{"lines":1,"delayTicks":6}},
    {"afterPieces":2,"kind":"snag"},
    {"afterPieces":2,"kind":"freeze","params":{"durationTicks":360}},
  ];

  return freezeLevel({
    id: 'import-jstris-drilltris-2',
    name: 'Jstris: drilltris 2',
    seed: 71071,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`,
  `export function buildImportJstrisDrilltris2Level(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, []);
  paintGarbageRow(board, 1, []);
  paintGarbageRow(board, 2, [4]);
  paintGarbageRow(board, 3, [4]);
  paintGarbageRow(board, 4, [4]);
  paintGarbageRow(board, 5, [4]);
  paintGarbageRow(board, 6, []);
  paintGarbageRow(board, 7, [4]);

  const queuePrefix: ShapeType[] = [
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 
    'I'
  ];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'retrim' },
    { afterPieces: 1, kind: 'garbage', params: { lines: 1, delayTicks: 6 } },
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 2, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 3, kind: 'magnet' },
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 5, kind: 'retrim' },
    { afterPieces: 6, kind: 'snag' },
    { afterPieces: 7, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 8, kind: 'magnet' },
    { afterPieces: 10, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'import-jstris-drilltris-2',
    name: 'Jstris: drilltris 2',
    description: 'Drill shaft variant: drop I-pieces rapidly to eliminate all garbage before hazards lock you down.',
    seed: 71071,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

// 9. import-jstris-mash-space
content = content.replace(
  `export function buildImportJstrisMashSpaceLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3, 4, 5, 6]);
  paintGarbageRow(board, 1, [3, 4, 5, 6]);
  paintGarbageRow(board, 2, [3, 4, 5, 6]);
  paintGarbageRow(board, 3, [3, 4, 5, 6]);
  paintGarbageRow(board, 4, [3, 4, 5, 6]);
  paintGarbageRow(board, 5, [3, 4, 5, 6]);
  paintGarbageRow(board, 6, [3, 4, 5, 6]);
  paintGarbageRow(board, 7, [3, 4, 5, 6]);

  const queuePrefix: ShapeType[] = ['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    {"afterPieces":1,"kind":"retrim"},
    {"afterPieces":2,"kind":"snag"},
    {"afterPieces":3,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":4,"kind":"sticky"},
    {"afterPieces":5,"kind":"magnet"},
    {"afterPieces":6,"kind":"freeze","params":{"durationTicks":360}},
  ];

  return freezeLevel({
    id: 'import-jstris-mash-space',
    name: 'Jstris: Mash space',
    seed: 160063,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`,
  `export function buildImportJstrisMashSpaceLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3, 4, 5, 6]);
  paintGarbageRow(board, 1, [3, 4, 5, 6]);
  paintGarbageRow(board, 2, [3, 4, 5, 6]);
  paintGarbageRow(board, 3, [3, 4, 5, 6]);
  paintGarbageRow(board, 4, [3, 4, 5, 6]);
  paintGarbageRow(board, 5, [3, 4, 5, 6]);
  paintGarbageRow(board, 6, [3, 4, 5, 6]);
  paintGarbageRow(board, 7, [3, 4, 5, 6]);

  const queuePrefix: ShapeType[] = ['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 1, kind: 'retrim' },
    { afterPieces: 2, kind: 'snag' },
    { afterPieces: 3, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 4, kind: 'sticky' },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 6, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 7, kind: 'retrim' },
    { afterPieces: 9, kind: 'snag' },
    { afterPieces: 11, kind: 'sticky' },
    { afterPieces: 13, kind: 'magnet' },
    { afterPieces: 15, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 17, kind: 'retrim' },
    { afterPieces: 20, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'import-jstris-mash-space',
    name: 'Jstris: Mash space',
    description: 'Fast-drop I-pieces down the central corridor to wipe out the flanking garbage walls.',
    seed: 160063,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

// 10. import-jstris-1v1-downstack
content = content.replace(
  `export function buildImportJstris1v1DownstackLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3]);
  paintGarbageRow(board, 1, [3]);
  paintGarbageRow(board, 2, [7]);
  paintGarbageRow(board, 3, [7]);
  paintGarbageRow(board, 4, [5]);
  paintGarbageRow(board, 5, [5]);
  paintGarbageRow(board, 6, [1]);
  paintGarbageRow(board, 7, [1]);

  const queuePrefix: ShapeType[] = ['O', 'I', 'J', 'T', 'L', 'L', 'J', 'S', 'I'];
  const timeline: TimelineEntry[] = [
    {"afterPieces":2,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":3,"kind":"sticky"},
    {"afterPieces":5,"kind":"magnet"},
    {"afterPieces":6,"kind":"garbage","params":{"lines":1,"delayTicks":12}},
    {"afterPieces":7,"kind":"curtain"},
    {"afterPieces":8,"kind":"snag"},
  ];

  return freezeLevel({
    id: 'import-jstris-1v1-downstack',
    name: 'Jstris: 1v1 downstack',
    seed: 355064,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`,
  `export function buildImportJstris1v1DownstackLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [3]);
  paintGarbageRow(board, 1, [3]);
  paintGarbageRow(board, 2, [7]);
  paintGarbageRow(board, 3, [7]);
  paintGarbageRow(board, 4, [5]);
  paintGarbageRow(board, 5, [5]);
  paintGarbageRow(board, 6, [1]);
  paintGarbageRow(board, 7, [1]);

  const queuePrefix: ShapeType[] = ['O', 'I', 'J', 'T', 'L', 'L', 'J', 'S', 'I'];
  const timeline: TimelineEntry[] = [
    { afterPieces: 2, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 3, kind: 'sticky' },
    { afterPieces: 5, kind: 'magnet' },
    { afterPieces: 6, kind: 'garbage', params: { lines: 1, delayTicks: 12 } },
    { afterPieces: 7, kind: 'curtain' },
    { afterPieces: 8, kind: 'snag' },
    { afterPieces: 10, kind: 'retrim' },
    { afterPieces: 12, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 14, kind: 'sticky' },
    { afterPieces: 17, kind: 'magnet' },
    { afterPieces: 20, kind: 'snag' },
    { afterPieces: 23, kind: 'retrim' },
    { afterPieces: 26, kind: 'sticky' },
  ];

  return freezeLevel({
    id: 'import-jstris-1v1-downstack',
    name: 'Jstris: 1v1 downstack',
    description: 'Downstack an intense 8-line opponent attack until all garbage is cleared, surviving late-game curtain and magnet spikes.',
    seed: 355064,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'garbage-clear' },`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched authoredLevels.ts!');
