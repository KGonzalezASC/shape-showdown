from pathlib import Path

p = Path("server/puzzle/puzzleTypes.ts")
s = p.read_text(encoding="utf8")
old = """/**
 * Repeat `sequence` every `periodTicks` starting at `startTick` (first iteration included).
 * Materialized to TimelineEvent[] up to a session horizon before application.
 */
export interface TimelineLoop {
  startTick: number;
  periodTicks: number;
  sequence: TimelineLoopBeat[];
}
"""
neu = """/**
 * Repeat `sequence` starting at `startTick` (first iteration included).
 * Materialized to TimelineEvent[] up to a session horizon before application.
 *
 * `periodTicks` meaning:
 * - Instant hazards only: absolute start-to-start stride (legacy).
 * - Lasting hazards (e.g. curtain): idle clear gap *after* the prior iteration's
 *   effect ends (telegraph + active), then the sequence fires again.
 */
export interface TimelineLoop {
  startTick: number;
  /** Idle gap (lasting) or start-to-start period (instant-only). See interface doc. */
  periodTicks: number;
  sequence: TimelineLoopBeat[];
}
"""
if old not in s:
    raise SystemExit("puzzleTypes pattern missing")
p.write_text(s.replace(old, neu), encoding="utf8")
print("updated puzzleTypes")

p = Path("server/puzzle/catalog/authoredLevels.ts")
s = p.read_text(encoding="utf8")
reps = [
    (
        " * Curtain Drop — retrim once, then curtain that loops every 200 ticks after the first fire.",
        " * Curtain Drop — retrim once, then curtain that loops with 200 clear ticks after each curtain ends.",
    ),
    (
        "    // First curtain at 180, then every 200 ticks (200 without curtain, then curtain again).",
        "    // First curtain at 180; after curtain finishes, 200 idle ticks, then curtain again.",
    ),
]
for a, b in reps:
    if a not in s:
        raise SystemExit(f"authored pattern missing: {a!r}")
    s = s.replace(a, b)
p.write_text(s, encoding="utf8")
print("updated authoredLevels")
