from pathlib import Path
path = Path(r"C:\Users\Keithythefrog\source\BubbleBlitzers\server\puzzle\puzzleTimeline.test.ts")
text = path.read_text(encoding="utf-8")
start = text.find("  it('PuzzleSession fires piece-triggered hazards at the correct lock count'")
end = text.find("  it('authored Ultimate 29-combo uses clear-lines")
if start < 0 or end < 0:
    raise SystemExit(f"markers not found start={start} end={end}")
new = '''  it('PuzzleSession fires piece-triggered hazards at the correct lock count', () => {
    const level = generatePuzzleLevel({
      id: 'piece-timeline-session',
      name: 'piece-timeline-session',
      seed: 11,
      garbageRows: 0,
      goal: { kind: 'survive', ticks: 3600 },
      timeline: [],
    });
    // Garbage leaves a clear pendingGarbage footprint at known lock counts.
    level.timeline = [
      { tick: 10, kind: 'retrim' },
      { afterPieces: 2, kind: 'garbage', params: { lines: 1, delayTicks: 9999 } },
      { afterPieces: 4, kind: 'garbage', params: { lines: 2, delayTicks: 9999 } },
    ];
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 3600,
    });

    let sawTickPath = false;
    let sawLines1At2 = false;
    let sawLines2At4 = false;
    let lastPieces = 0;

    for (let i = 0; i < 3600; i += 1) {
      session.advance(1);
      const player = session.getPlayerState();
      if (session.tick >= 10) sawTickPath = true;

      if (session.piecesPlaced >= 2 && lastPieces < 2) {
        sawLines1At2 = player.pendingGarbage.some((g) => g.lines === 1);
        assert.equal(sawLines1At2, true, 'garbage lines=1 after 2 locks');
      }
      if (session.piecesPlaced >= 4 && lastPieces < 4) {
        sawLines2At4 = player.pendingGarbage.some((g) => g.lines === 2);
        assert.equal(sawLines2At4, true, 'garbage lines=2 after 4 locks');
      }
      lastPieces = session.piecesPlaced;
      if (session.piecesPlaced >= 4) break;
      if (session.isEnded) break;
    }

    assert.equal(sawTickPath, true);
    assert.equal(sawLines1At2, true);
    assert.equal(sawLines2At4, true);
    assert.ok(session.piecesPlaced >= 4);
  });

'''
path.write_text(text[:start] + new + text[end:], encoding='utf-8')
print('rewrote session test')
