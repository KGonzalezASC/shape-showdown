from pathlib import Path
path = Path(r"C:\Users\Keithythefrog\source\BubbleBlitzers\server\puzzle\catalog\authoredLevels.ts")
text = path.read_text(encoding="utf-8")

old = r'''/**
 * Trial import — ronylicha/tetris Master 61 (expert category).
 * Source: https://github.com/ronylicha/tetris scripts/puzzles/puzzleData.js
 * (`generatePuzzles` → first Master entry id 61, `generateExpertGrid(14)` +
 * `generateMixedPieceSet(5)`). Master grids are Math.random() at runtime; this
 * trial freezes the expert pattern deterministically (filled cells → G) and
 * uses 8 pattern rows (same row%3 rules) for spawn headroom / baseline solvability
 * vs the source's 14. objective "mixed" / targetLines 4 → clear-lines:4.
 * pieces I,O,T,S,Z from generateMixedPieceSet(5), plus J/L to complete a bag.
 */
export function buildImportRonylichaMaster61Level(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // generateExpertGrid pattern for source rows 12–19 (fromBottom 0..7):
  // row%3==1 → odd filled; ==0 → even filled; ==2 → center well holes at 4–5.
  paintGarbageRow(board, 0, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 1, [1, 3, 5, 7, 9]);
  paintGarbageRow(board, 2, [4, 5]);
  paintGarbageRow(board, 3, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 4, [1, 3, 5, 7, 9]);
  paintGarbageRow(board, 5, [4, 5]);
  paintGarbageRow(board, 6, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 7, [1, 3, 5, 7, 9]);

  const queuePrefix: ShapeType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const timeline: TimelineEvent[] = [
    { tick: 240, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'import-ronylicha-master-61',
    name: 'Ronylicha: Master 61',
    seed: 61061,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 4 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

export function buildAuthoredLevels(): CuratedPuzzleLevel[] {
  return [
    buildCheeseKeyholeLevel(),
    buildFrozenWellLevel(),
    buildSkewStairsLevel(),
    buildPulseGarbageLevel(),
    buildCheeseLadderLevel(),
    buildDigShaftLevel(),
    buildTSlotSetupLevel(),
    buildFourWideLevel(),
    buildHoldDisciplineLevel(),
    buildPoisonBeatLevel(),
    buildCurtainDropLevel(),
    buildLateIWellLevel(),
    // Trial imports (picker only; not on DAILY_SCHEDULE slots).
    buildImportJstrisCheckboardLevel(),
    buildImportRonylichaMaster61Level(),
  ];
}
'''

new = r'''/**
 * Trial import — Jstris map 255 "Ultimate 29-combo"
 * Source: https://jstris.jezevec10.com/map/255 (API maps/api/255).
 * Board decoded from base64 `data` as 200 nibbles (20×10); non-zero → garbage.
 * Upper combo rows omitted for spawn headroom (authentic bottom 10 rows).
 * Static queue from API used exactly as queuePrefix. finish=1 (PC) approximated
 * as clear-lines:8 partial dig along the combo path (full PC needs all 19 rows).
 */
export function buildImportJstrisUltimate29ComboLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Bottom 10 rows of decoded combo path (jstris rows 10–19).
  paintGarbageRow(board, 0, [9]);
  paintGarbageRow(board, 1, [6]);
  paintGarbageRow(board, 2, [3]);
  paintGarbageRow(board, 3, [1]);
  paintGarbageRow(board, 4, [7]);
  paintGarbageRow(board, 5, [8]);
  paintGarbageRow(board, 6, [6]);
  paintGarbageRow(board, 7, [3]);
  paintGarbageRow(board, 8, [8]);
  paintGarbageRow(board, 9, [5]);

  // Exact API queue: ILZSJOITLZJOITSLOTISJZJOITZSLZI
  const queuePrefix: ShapeType[] = [
    'I', 'L', 'Z', 'S', 'J', 'O', 'I', 'T', 'L', 'Z', 'J', 'O', 'I', 'T', 'S',
    'L', 'O', 'T', 'I', 'S', 'J', 'Z', 'J', 'O', 'I', 'T', 'Z', 'S', 'L', 'Z', 'I',
  ];
  const timeline: TimelineEvent[] = [
    { tick: 360, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'import-jstris-ultimate-29-combo',
    name: 'Jstris: Ultimate 29-combo',
    seed: 255255,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 8 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

/**
 * Trial import — Hard Drop center 4-wide (3 residuals) dig/combo board.
 * Source: https://harddrop.com/forums/index.php?topic=7955 (published fumen;
 * editor https://harddrop.com/fumen/?v115@deC8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeF8DeD8wwA8DeC8whxwDei0whwwAtDeRpg0whBtR4BeRpglwhAtR4CeilJeAgWNAzno2AyYU5DkQ0CETBAAA).
 * Decoded via tetris-fumen; colored cells → G. Kept bottom 10 rows (3-res
 * residual + wall columns) for spawn headroom vs full 16-row source stack.
 * No quiz queue in fumen; fixed 4-wide-oriented prefix. clear-lines:6 dig goal.
 */
export function buildImportFumenC4w3resLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Bottom residual rows from decoded fumen (y=0 floor), then center-4 walls.
  paintGarbageRow(board, 0, [4, 5, 6]);
  paintGarbageRow(board, 1, [5, 6]);
  paintGarbageRow(board, 2, [3, 4, 5, 6]);
  paintGarbageRow(board, 3, [3, 4, 5, 6]);
  paintGarbageRow(board, 4, [3, 4, 5, 6]);
  paintGarbageRow(board, 5, [3, 4, 5, 6]);
  paintGarbageRow(board, 6, [3, 4, 5, 6]);
  paintGarbageRow(board, 7, [3, 4, 5, 6]);
  paintGarbageRow(board, 8, [3, 4, 5, 6]);
  paintGarbageRow(board, 9, [3, 4, 5, 6]);

  const queuePrefix: ShapeType[] = ['I', 'T', 'L', 'J', 'S', 'Z', 'O', 'I', 'T', 'L', 'J', 'S', 'Z', 'O'];
  const timeline: TimelineEvent[] = [
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'import-fumen-c4w-3res',
    name: 'Hard Drop: Center 4-wide 3-res',
    seed: 79557,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 6 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'partial',
  });
}

export function buildAuthoredLevels(): CuratedPuzzleLevel[] {
  return [
    buildCheeseKeyholeLevel(),
    buildFrozenWellLevel(),
    buildSkewStairsLevel(),
    buildPulseGarbageLevel(),
    buildCheeseLadderLevel(),
    buildDigShaftLevel(),
    buildTSlotSetupLevel(),
    buildFourWideLevel(),
    buildHoldDisciplineLevel(),
    buildPoisonBeatLevel(),
    buildCurtainDropLevel(),
    buildLateIWellLevel(),
    // Trial imports (picker only; not on DAILY_SCHEDULE slots).
    buildImportJstrisCheckboardLevel(),
    buildImportJstrisUltimate29ComboLevel(),
    buildImportFumenC4w3resLevel(),
  ];
}
'''

if old not in text:
    raise SystemExit("target block not found")
path.write_text(text.replace(old, new), encoding="utf-8")
print("patched ok", path)
print("has ultimate", "import-jstris-ultimate-29-combo" in path.read_text(encoding="utf-8"))
print("has fumen", "import-fumen-c4w-3res" in path.read_text(encoding="utf-8"))
print("no ronylicha fn", "buildImportRonylichaMaster61Level" not in path.read_text(encoding="utf-8"))
