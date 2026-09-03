from pathlib import Path
p = Path("server/puzzle/puzzleTimeline.test.ts")
s = p.read_text(encoding="utf8")
old = """      if (pending > lastCurtainPending) {
        const fireTick = session.tick - 1;
        fireTicks.push(fireTick);
        // Prior curtain (warn or blackout) must already be clear when the next fires.
        const curtainActive = (player.activeEffects ?? []).some(
          (e) => e.kind === 'curtain' || e.kind === 'curtain-warn',
        );
        // Fresh warn is pushed on fire; allow only the new warn for this fire.
        if (fireTicks.length > 1) {
          assert.equal(
            (player.activeEffects ?? []).filter((e) => e.kind === 'curtain').length,
            0,
            `curtain still active at next fire tick ${fireTick}`,
          );
        }
        void curtainActive;
      }"""
neu = """      if (pending > lastCurtainPending) {
        const fireTick = session.tick - 1;
        fireTicks.push(fireTick);
        // Fresh warn is pushed on this fire; prior blackout must already be gone.
        if (fireTicks.length > 1) {
          assert.equal(
            (player.activeEffects ?? []).filter((e) => e.kind === 'curtain').length,
            0,
            `curtain still active at next fire tick ${fireTick}`,
          );
          assert.equal(
            pending,
            1,
            `curtains stacked at fire tick ${fireTick}`,
          );
        }
      }"""
if old not in s:
    raise SystemExit("test block missing")
p.write_text(s.replace(old, neu), encoding="utf8")
print("patched session assert")
