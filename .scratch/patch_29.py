from pathlib import Path
root = Path(r"C:\Users\Keithythefrog\source\BubbleBlitzers")
path = root / "server/puzzle/catalog/authoredLevels.ts"
text = path.read_text(encoding="utf-8")

old = '''/**
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
    'I', 'L', 'Z', 'S', 'J', 'O', 'I', 'T', 'L', 'Z', 'J', 'O', 'I', 'T', 'S',
    'L', 'O', 'T', 'I', 'S', 'J', 'Z', 'J', 'O', 'I', 'T', 'Z', 'S', 'L', 'Z', 'I',
  ];
  // Human window ≈ 4479 ticks. Early light freeze; mid curtain; late magnet/snag.
  const timeline: TimelineEvent[] = [
    { tick: 300, kind: 'freeze', params: { durationTicks: 480 } },
    { tick: 1600, kind: 'curtain' },
    { tick: 3000, kind: 'magnet' },
    { tick: 4000, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-ultimate-29-combo',
    name: 'Jstris: Ultimate 29-combo',
    seed: 255255,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'perfect-clear', maxPieces: 120 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}
'''

new = '''/**
 * Trial import — Jstris map 255 "Ultimate 29-combo"
 * Source: https://jstris.jezevec10.com/map/255 (API maps/api/255).
 * Board decoded from base64 `data` as 200 nibbles (20×10); non-zero → garbage.
 * Authentic bottom 2 combo rows (filled except the hole column) kept for spawn
 * headroom; full 19-row stack tops out the bot.
 * Exact API static queue as queuePrefix.
 * Goal: clear-lines (not full Jstris PC — too long/annoying for solo).
 * Timeline demos piece-scheduled beats (freeze@5, curtain@12, snag@20) mixed with
 * a couple early tick beats. Avoids poison/wildcard on this map.
 */
export function buildImportJstrisUltimate29ComboLevel(): CuratedPuzzleLevel {
  const board = emptyBoard();
  // Authentic jstris bottom 2 rows (r19 hole@9, r18 hole@6): walls filled, hole open.
  paintGarbageRow(board, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  paintGarbageRow(board, 1, [0, 1, 2, 3, 4, 5, 7, 8, 9]);

  // Exact API queue: ILZSJOITLZJOITSLOTISJZJOITZSLZI
  const queuePrefix: ShapeType[] = [
    'I', 'L', 'Z', 'S', 'J', 'O', 'I', 'T', 'L', 'Z', 'J', 'O', 'I', 'T', 'S',
    'L', 'O', 'T', 'I', 'S', 'J', 'Z', 'J', 'O', 'I', 'T', 'Z', 'S', 'L', 'Z', 'I',
  ];
  // Piece-scheduled pressure + light early tick beats (no multi-minute tick slog).
  const timeline: TimelineEntry[] = [
    { tick: 120, kind: 'retrim' },
    { tick: 480, kind: 'magnet' },
    { afterPieces: 5, kind: 'freeze', params: { durationTicks: 360 } },
    { afterPieces: 12, kind: 'curtain' },
    { afterPieces: 20, kind: 'snag' },
  ];

  return freezeLevel({
    id: 'import-jstris-ultimate-29-combo',
    name: 'Jstris: Ultimate 29-combo',
    seed: 255255,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 10 },
    timeline,
    shopPolicy: 'none',
    allowHold: true,
    benchmark: DEFAULT_PUZZLE_BENCHMARK,
    visibilityPolicy: 'revealed',
  });
}
'''

if old not in text:
    raise SystemExit('29-combo block not found')
path.write_text(text.replace(old, new), encoding='utf-8')
print('29-combo retuned')
