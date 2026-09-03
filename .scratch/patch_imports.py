from pathlib import Path
path = Path(r'C:\Users\Keithythefrog\source\BubbleBlitzers\server\puzzle\catalog\authoredLevels.ts')
# When run on box after copy, use arg; default windows path for machine run
import sys
if len(sys.argv) > 1:
    path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')

if 'import-jstris-checkboard' in text:
    print('already patched')
    raise SystemExit(0)

new_builders = r'''
/**
 * Trial import — Jstris map 66 "Checkboard pattern"
 * Source: https://jstris.jezevec10.com/map/66 (API maps/api/66).
 * Famous as "theoretically hardest map to downstack." Board decoded from base64
 * `data` as 200 nibbles (20×10); non-zero cells → garbage. Upper checkerboard
 * rows omitted for spawn headroom (kept authentic bottom 8 rows from decode).
 * Original queue was null (random); authored dig-oriented prefix. finish=0
 * (default clear-map) approximated as clear-lines:4 partial dig.
 */
export function buildImportJstrisCheckboardLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Bottom 8 rows of decoded checkerboard (jstris rows 12–19), holes alternate.
  paintGarbageRow(board, 0, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 1, [1, 3, 5, 7, 9]);
  paintGarbageRow(board, 2, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 3, [1, 3, 5, 7, 9]);
  paintGarbageRow(board, 4, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 5, [1, 3, 5, 7, 9]);
  paintGarbageRow(board, 6, [0, 2, 4, 6, 8]);
  paintGarbageRow(board, 7, [1, 3, 5, 7, 9]);

  // Map queue was null; provide a dig-friendly bag prefix.
  const queuePrefix: ShapeType[] = ['I', 'T', 'L', 'J', 'O', 'S', 'Z'];
  const timeline: TimelineEvent[] = [
    // Thematic mid-solve freeze (no fake jstris powerups).
    { tick: 300, kind: 'freeze', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: 'import-jstris-checkboard',
    name: 'Jstris: Checkboard pattern',
    seed: 66066,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 4 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}

/**
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

'''

old_return = '''export function buildAuthoredLevels(): CuratedPuzzleLevel[] {
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
  ];
}'''

new_return = '''export function buildAuthoredLevels(): CuratedPuzzleLevel[] {
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
}'''

if old_return not in text:
    raise SystemExit('buildAuthoredLevels block not found exactly')

text = text.replace(old_return, new_builders + new_return)
path.write_text(text, encoding='utf-8')
print('patched', path)
print('lines', len(text.splitlines()))
