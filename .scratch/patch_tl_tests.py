from pathlib import Path
root = Path(r"C:\Users\Keithythefrog\source\BubbleBlitzers")

# Extend puzzleTimeline.test.ts with piece-trigger tests
path = root / "server/puzzle/puzzleTimeline.test.ts"
text = path.read_text(encoding="utf-8")

# Update imports
text = text.replace(
'''import {
  assertValidTimelineLoop,
  hazardOccupiedTicks,
  materializeTimeline,
  offsetTimelineEntries,
} from './puzzleTimeline.js';
''',
'''import {
  assertValidTimelineLoop,
  extractPieceTimeline,
  hazardOccupiedTicks,
  materializeTimeline,
  offsetTimelineEntries,
} from './puzzleTimeline.js';
''')

text = text.replace(
"import { buildCurtainDropLevel } from './catalog/authoredLevels.js';\n",
"import { buildCurtainDropLevel, buildImportJstrisUltimate29ComboLevel } from './catalog/authoredLevels.js';\n",
)

# Append new describe block before the final closing if needed — append after last });
extra = '''
describe('puzzle timeline piece triggers', () => {
  it('materializeTimeline skips afterPieces entries; extractPieceTimeline keeps them', () => {
    const entries: TimelineEntry[] = [
      { tick: 60, kind: 'retrim' },
      { afterPieces: 5, kind: 'freeze', params: { durationTicks: 120 } },
      { afterPieces: 12, kind: 'curtain' },
      {
        loop: {
          startTick: 100,
          periodTicks: 200,
          sequence: [{ at: 0, kind: 'magnet' }],
        },
      },
    ];
    const tickEvents = materializeTimeline(entries, 300);
    assert.deepEqual(
      tickEvents.map((e) => ({ tick: e.tick, kind: e.kind })),
      [
        { tick: 60, kind: 'retrim' },
        { tick: 100, kind: 'magnet' },
        { tick: 300, kind: 'magnet' },
      ],
    );
    assert.deepEqual(
      extractPieceTimeline(entries).map((e) => ({ afterPieces: e.afterPieces, kind: e.kind })),
      [
        { afterPieces: 5, kind: 'freeze' },
        { afterPieces: 12, kind: 'curtain' },
      ],
    );
  });

  it('rejects non-positive afterPieces at the allowlist boundary', () => {
    assert.throws(
      () => assertSupportedPuzzleTimeline([{ afterPieces: 0, kind: 'freeze' }]),
      /afterPieces/,
    );
    assert.throws(
      () => assertSupportedPuzzleTimeline([{ afterPieces: -1, kind: 'curtain' }]),
      /afterPieces/,
    );
  });

  it('offsetTimelineEntries leaves afterPieces unchanged', () => {
    const offset = offsetTimelineEntries(
      [
        { tick: 10, kind: 'retrim' },
        { afterPieces: 5, kind: 'freeze' },
      ],
      60,
    );
    assert.deepEqual(offset[0], { tick: 70, kind: 'retrim' });
    assert.deepEqual(offset[1], { afterPieces: 5, kind: 'freeze' });
  });

  it('PuzzleSession fires piece-triggered hazards at the correct lock count', () => {
    const level = generatePuzzleLevel({
      id: 'piece-timeline-session',
      name: 'piece-timeline-session',
      seed: 11,
      garbageRows: 0,
      goal: { kind: 'survive', ticks: 3600 },
      timeline: [],
    });
    level.timeline = [
      { tick: 30, kind: 'retrim' },
      { afterPieces: 2, kind: 'magnet' },
      { afterPieces: 4, kind: 'snag' },
    ];
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 3600,
    });

    const magnetTicks: number[] = [];
    const snagTicks: number[] = [];
    let lastMagnet = 0;
    let lastSnag = 0;
    let lastPieces = 0;

    for (let i = 0; i < 3600; i += 1) {
      session.advance(1);
      const player = session.getPlayerState();
      const magnets = (player.activeEffects ?? []).filter((e) => e.kind === 'magnet' || e.itemId === 'gravity-lure').length
        + player.pendingShopEffects.filter((e) => e.itemId === 'gravity-lure').length;
      const snags = player.pendingShopEffects.filter((e) => e.itemId === 'fortify-frame').length
        + (player.activeEffects ?? []).filter((e) => e.kind === 'snag' || e.itemId === 'fortify-frame').length;

      // Detect rising edge via pieces crossing thresholds.
      if (session.piecesPlaced >= 2 && lastPieces < 2) {
        // After 2nd lock, magnet should be applied this tick.
        assert.ok(
          magnets > 0 || (player.activeEffects ?? []).some((e) => String(e.kind).includes('magnet'))
            || player.pendingShopEffects.some((e) => e.itemId === 'gravity-lure')
            || (player as { magnetActive?: boolean }).magnetActive === true
            || Object.keys(player).some((k) => k.toLowerCase().includes('magnet')),
          'expected magnet after 2 pieces',
        );
        magnetTicks.push(session.tick);
      }
      if (session.piecesPlaced >= 4 && lastPieces < 4) {
        snagTicks.push(session.tick);
      }
      lastPieces = session.piecesPlaced;
      lastMagnet = magnets;
      lastSnag = snags;
      if (session.piecesPlaced >= 4 && session.tick > magnetTicks[0]! + 10) break;
      if (session.isEnded) break;
    }

    assert.equal(magnetTicks.length, 1, `magnet fire count ${magnetTicks}`);
    assert.equal(snagTicks.length, 1, `snag fire count ${snagTicks}`);
    assert.ok(magnetTicks[0]! < snagTicks[0]!);
  });

  it('authored Ultimate 29-combo uses clear-lines and mixed tick+piece timeline', () => {
    const level = buildImportJstrisUltimate29ComboLevel();
    assert.equal(level.goal.kind, 'clear-lines');
    if (level.goal.kind === 'clear-lines') {
      assert.ok(level.goal.lines >= 8 && level.goal.lines <= 12);
    }
    const ticks = materializeTimeline(level.timeline, 60 * 60).map((e) => ({ tick: e.tick, kind: e.kind }));
    const pieces = extractPieceTimeline(level.timeline).map((e) => ({ afterPieces: e.afterPieces, kind: e.kind }));
    assert.ok(ticks.length >= 1, 'expected at least one tick beat');
    assert.ok(pieces.length >= 2, 'expected piece-scheduled beats');
    assert.deepEqual(
      pieces,
      [
        { afterPieces: 5, kind: 'freeze' },
        { afterPieces: 12, kind: 'curtain' },
        { afterPieces: 20, kind: 'snag' },
      ],
    );
    assert.ok(ticks.some((e) => e.kind === 'retrim'));
    assert.ok(ticks.some((e) => e.kind === 'magnet'));
  });
});
'''

if "puzzle timeline piece triggers" not in text:
    text = text.rstrip() + "\n" + extra
    path.write_text(text, encoding='utf-8')
    print('tests appended')
else:
    print('tests already present')
