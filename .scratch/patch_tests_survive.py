from pathlib import Path

# Update curtain-drop timeline test
p = Path("server/puzzle/puzzleTimeline.test.ts")
t = p.read_text(encoding="utf-8").replace("\r\n", "\n")
old = '''  it('authored curtain-drop waits for curtain end then 200 idle ticks', () => {
    const level = buildCurtainDropLevel();
    const events = materializeTimeline(level.timeline, 180 + CURTAIN_LOOP_STRIDE * 2);
    assert.deepEqual(
      events.filter((e) => e.kind === 'curtain').map((e) => e.tick),
      [180, 180 + CURTAIN_LOOP_STRIDE, 180 + CURTAIN_LOOP_STRIDE * 2],
    );
    assert.deepEqual(
      events.filter((e) => e.kind === 'retrim').map((e) => e.tick),
      [60],
    );
  });'''
new = '''  it('authored curtain-drop keeps sparse one-shot curtains (no dense loop)', () => {
    const level = buildCurtainDropLevel();
    assert.equal(level.goal.kind, 'survive-clear');
    if (level.goal.kind === 'survive-clear') {
      assert.equal(level.goal.ticks, 2250);
      assert.equal(level.goal.lines, 12);
    }
    const events = materializeTimeline(level.timeline, level.goal.kind === 'survive-clear' ? level.goal.ticks : 2250);
    assert.deepEqual(
      events.map((e) => ({ tick: e.tick, kind: e.kind })),
      [
        { tick: 60, kind: 'retrim' },
        { tick: 480, kind: 'curtain' },
        { tick: 1200, kind: 'curtain' },
        { tick: 1800, kind: 'magnet' },
      ],
    );
  });'''
if old not in t:
    print("timeline test old not found")
else:
    t = t.replace(old, new)
    p.write_text(t, encoding="utf-8", newline="\n")
    print("timeline test updated")

# Add survive-clear test to puzzle.test.ts
p = Path("server/puzzle/puzzle.test.ts")
t = p.read_text(encoding="utf-8").replace("\r\n", "\n")
marker = "describe('puzzleGenerator'"
# Append a new describe at end if not present
if "survive-clear" not in t:
    addition = '''

describe('survive-clear goal', () => {
  it('wins only when both tick horizon and line count are met', () => {
    const level = generatePuzzleLevel({
      id: 'sc-1',
      name: 'sc-1',
      seed: 99,
      garbageRows: 2,
      goal: { kind: 'survive-clear', ticks: 120, lines: 1 },
    });
    // Empty timeline; bot should clear quickly then must still wait out the horizon.
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 600,
    });
    let report = session.advance(60);
    // Midway: even if lines already cleared, should not be solved before horizon.
    if (report.linesCleared >= 1 && report.ticksUsed < 120) {
      assert.equal(report.solved, false);
    }
    report = session.advance(200);
    assert.equal(report.solved, true);
    assert.ok(report.ticksUsed >= 120);
    assert.ok(report.linesCleared >= 1);
  });

  it('fails on top-out before the compound goal is met', () => {
    const level = generatePuzzleLevel({
      id: 'sc-top',
      name: 'sc-top',
      seed: 3,
      garbageRows: 8,
      messyGarbage: true,
      maxHolesPerRow: 3,
      goal: { kind: 'survive-clear', ticks: 60 * 60, lines: 40 },
      timeline: [
        { tick: 30, kind: 'garbage', params: { lines: 4 } },
        { tick: 60, kind: 'garbage', params: { lines: 4 } },
        { tick: 90, kind: 'garbage', params: { lines: 4 } },
      ],
    });
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 600,
    });
    const report = session.advance(600);
    // Either tops out or fails to meet both conditions; must not falsely solve early.
    if (report.topOut) {
      assert.equal(report.solved, false);
    }
  });
});
'''
    t = t.rstrip() + addition + "\n"
    p.write_text(t, encoding="utf-8", newline="\n")
    print("survive-clear tests added")
else:
    print("survive-clear tests already present")
