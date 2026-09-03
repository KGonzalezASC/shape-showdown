from pathlib import Path
root = Path(r"C:\Users\Keithythefrog\source\BubbleBlitzers")

# --- puzzleHazards.ts ---
haz = (root / "server/puzzle/puzzleHazards.ts").read_text(encoding="utf-8")
haz = haz.replace(
'''import {
  assertValidTimelineLoop,
  isTimelineLoopEntry,
  timelineEntryHazardKinds,
} from './puzzleTimeline.js';
''',
'''import {
  assertValidTimelineLoop,
  assertValidTimelinePieceEvent,
  isTimelineLoopEntry,
  isTimelinePieceEntry,
  timelineEntryHazardKinds,
} from './puzzleTimeline.js';
''')
old_assert = '''  for (const entry of timeline) {
    if (isTimelineLoopEntry(entry)) {
      assertValidTimelineLoop(entry.loop, context);
    } else if (!Number.isInteger(entry.tick) || entry.tick < 0) {
      throw new Error(`${context}: event.tick must be a non-negative integer`);
    }
  }
'''
new_assert = '''  for (const entry of timeline) {
    if (isTimelineLoopEntry(entry)) {
      assertValidTimelineLoop(entry.loop, context);
    } else if (isTimelinePieceEntry(entry)) {
      assertValidTimelinePieceEvent(entry, context);
    } else if (!Number.isInteger(entry.tick) || entry.tick < 0) {
      throw new Error(`${context}: event.tick must be a non-negative integer`);
    }
  }
'''
if old_assert not in haz:
    raise SystemExit('assert block not found')
(root / "server/puzzle/puzzleHazards.ts").write_text(haz.replace(old_assert, new_assert), encoding='utf-8')
print('puzzleHazards.ts ok')
