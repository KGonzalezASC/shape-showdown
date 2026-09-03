from pathlib import Path

path = Path("server/puzzle/catalog/authoredLevels.ts")
text = path.read_text(encoding="utf-8")

curtain_old = '''/**
 * Curtain Drop - retrim once, then curtain that loops with 200 clear ticks after each curtain ends.
 * Goal stays at 2 lines (short blackout-pressure beat).
 */
export function buildCurtainDropLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [0, 5]);
  paintGarbageRow(board, 1, [1, 6]);
  paintGarbageRow(board, 2, [2, 7]);
  paintGarbageRow(board, 3, [3, 8]);

  const queuePrefix: ShapeType[] = [\'T\', \'J\', \'L\', \'O\', \'S\', \'Z\', \'I\'];
  const timeline: TimelineEntry[] = [
    // Retrim once (synergy setup before first curtain).
    { tick: 60, kind: \'retrim\' },
    // First curtain at 180; after curtain finishes, 200 idle ticks, then curtain again.
    {
      loop: {
        startTick: 180,
        periodTicks: 200,
        sequence: [{ at: 0, kind: \'curtain\' }],
      },
    },
  ];

  return freezeLevel({
    id: \'authored-curtain-drop\',
    name: \'Curtain Drop\',
    seed: 11770,
    initialBoard: board,
    queuePrefix,
    goal: { kind: \'clear-lines\', lines: 14 },
    timeline,
    shopPolicy: \'none\',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: \'hidden\',
  });
}'''

curtain_new = '''/**
 * Curtain Drop — hybrid survive + lines (compound goal).
 * Bot clears ~12 lines in ~750 ticks under sparse curtain pressure; human horizon
 * is ×3 ≈ 2250 ticks. Retrim once up front; curtains stay sparse (not a dense
 * loop); mid/late magnet escalator punishes lingering. Win = alive at horizon
 * AND linesCleared >= 12.
 */
export function buildCurtainDropLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  paintGarbageRow(board, 0, [0, 5]);
  paintGarbageRow(board, 1, [1, 6]);
  paintGarbageRow(board, 2, [2, 7]);
  paintGarbageRow(board, 3, [3, 8]);

  const queuePrefix: ShapeType[] = [\'T\', \'J\', \'L\', \'O\', \'S\', \'Z\', \'I\'];
  // Bot clear ≈ 750 ticks with this sparse beat → human horizon 2250 (×3).
  const timeline: TimelineEntry[] = [
    { tick: 60, kind: \'retrim\' },
    { tick: 480, kind: \'curtain\' },
    { tick: 1200, kind: \'curtain\' },
    // Escalator: lingering players eat magnet pressure near the horizon.
    { tick: 1800, kind: \'magnet\' },
  ];

  return freezeLevel({
    id: \'authored-curtain-drop\',
    name: \'Curtain Drop\',
    seed: 11770,
    initialBoard: board,
    queuePrefix,
    goal: { kind: \'survive-clear\', ticks: 2250, lines: 12 },
    timeline,
    shopPolicy: \'none\',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: \'hidden\',
  });
}'''

ultimate_old = '''/**
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
    \'I\', \'L\', \'Z\', \'S\', \'J\', \'O\', \'I\', \'T\', \'L\', \'Z\', \'J\', \'O\', \'I\', \'T\', \'S\',
    \'L\', \'O\', \'T\', \'I\', \'S\', \'J\', \'Z\', \'J\', \'O\', \'I\', \'T\', \'Z\', \'S\', \'L\', \'Z\', \'I\',
  ];
  const timeline: TimelineEvent[] = [
    { tick: 360, kind: \'freeze\', params: { durationTicks: 900 } },
  ];

  return freezeLevel({
    id: \'import-jstris-ultimate-29-combo\',
    name: \'Jstris: Ultimate 29-combo\',
    seed: 255255,
    initialBoard: board,
    queuePrefix,
    goal: { kind: \'clear-lines\', lines: 8 },
    timeline,
    shopPolicy: \'none\',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: \'revealed\',
  });
}'''

ultimate_new = '''/**
 * Trial import — Jstris map 255 "Ultimate 29-combo"
 * Source: https://jstris.jezevec10.com/map/255 (API maps/api/255).
 * Board decoded from base64 `data` as 200 nibbles (20×10); non-zero → garbage.
 * Authentic bottom 2 combo rows (filled except the hole column) kept for spawn
 * headroom + RulesBot PC solvability; full 19-row stack tops out the bot.
 * Exact API static queue as queuePrefix. finish=1 → perfect-clear.
 * Bot PC ≈ 1493 ticks (no hazards); human horizon ×3 ≈ 4479 — longer
 * freeze/curtain/magnet/snag sequence taxes time without hard-bricking the PC path.
 * Avoids poison/wildcard on this map.
 */
export function buildImportJstrisUltimate29ComboLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Authentic jstris bottom 2 rows (r19 hole@9, r18 hole@6): walls filled, hole open.
  paintGarbageRow(board, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  paintGarbageRow(board, 1, [0, 1, 2, 3, 4, 5, 7, 8, 9]);

  // Exact API queue: ILZSJOITLZJOITSLOTISJZJOITZSLZI
  const queuePrefix: ShapeType[] = [
    \'I\', \'L\', \'Z\', \'S\', \'J\', \'O\', \'I\', \'T\', \'L\', \'Z\', \'J\', \'O\', \'I\', \'T\', \'S\',
    \'L\', \'O\', \'T\', \'I\', \'S\', \'J\', \'Z\', \'J\', \'O\', \'I\', \'T\', \'Z\', \'S\', \'L\', \'Z\', \'I\',
  ];
  // Human window ≈ 4479 ticks. Early light freeze; mid curtain; late magnet/snag.
  const timeline: TimelineEvent[] = [
    { tick: 300, kind: \'freeze\', params: { durationTicks: 480 } },
    { tick: 1600, kind: \'curtain\' },
    { tick: 3000, kind: \'magnet\' },
    { tick: 4000, kind: \'snag\' },
  ];

  return freezeLevel({
    id: \'import-jstris-ultimate-29-combo\',
    name: \'Jstris: Ultimate 29-combo\',
    seed: 255255,
    initialBoard: board,
    queuePrefix,
    goal: { kind: \'perfect-clear\', maxPieces: 120 },
    timeline,
    shopPolicy: \'none\',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: \'revealed\',
  });
}'''

# Normalize file to LF for matching
t = text.replace('\r\n', '\n')
# Unescape the strings we built with \'
curtain_old = curtain_old.replace("\\'", "'")
curtain_new = curtain_new.replace("\\'", "'")
ultimate_old = ultimate_old.replace("\\'", "'")
ultimate_new = ultimate_new.replace("\\'", "'")

ok = True
if curtain_old not in t:
    print("CURTAIN OLD NOT FOUND")
    ok = False
else:
    t = t.replace(curtain_old, curtain_new)
    print("curtain replaced")

if ultimate_old not in t:
    print("ULTIMATE OLD NOT FOUND")
    ok = False
else:
    t = t.replace(ultimate_old, ultimate_new)
    print("ultimate replaced")

if ok:
    path.write_text(t, encoding="utf-8", newline="\n")
    print("authoredLevels written")
else:
    # show nearby markers
    for marker in ["buildCurtainDropLevel", "buildImportJstrisUltimate29ComboLevel"]:
        i = t.find(marker)
        print(marker, "at", i)
