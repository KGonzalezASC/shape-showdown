from pathlib import Path
root = Path(r"C:\Users\Keithythefrog\source\BubbleBlitzers")

# --- puzzleHost.ts ---
host = (root / "server/puzzle/puzzleHost.ts").read_text(encoding="utf-8")
host = host.replace(
"import { materializeTimeline } from './puzzleTimeline.js';\n",
"import { extractPieceTimeline, materializeTimeline } from './puzzleTimeline.js';\n",
)
old_tl = '''      timeline: materializeTimeline(this.level.timeline, MAX_TICKS).map((event) => ({ tick: event.tick, kind: event.kind })),
'''
new_tl = '''      timeline: [
        ...materializeTimeline(this.level.timeline, MAX_TICKS).map((event) => ({
          tick: event.tick,
          kind: event.kind,
        })),
        ...extractPieceTimeline(this.level.timeline).map((event) => ({
          afterPieces: event.afterPieces,
          kind: event.kind,
        })),
      ],
'''
if old_tl not in host:
    raise SystemExit('host timeline not found')
(root / "server/puzzle/puzzleHost.ts").write_text(host.replace(old_tl, new_tl), encoding='utf-8')
print('puzzleHost ok')

# --- puzzleValidationArtifact.ts ---
art = (root / "server/puzzle/puzzleValidationArtifact.ts").read_text(encoding="utf-8")
art = art.replace(
"import { materializeTimeline } from './puzzleTimeline.js';\n",
"import { extractPieceTimeline, materializeTimeline } from './puzzleTimeline.js';\n",
)
art = art.replace(
"  scriptedEvents: Array<{ tick: number; kind: string }>;\n",
"  scriptedEvents: Array<{ tick?: number; afterPieces?: number; kind: string }>;\n",
)
old_se = '''    scriptedEvents: materializeTimeline(level.timeline, 60 * 60).map((event) => ({
      tick: event.tick,
      kind: event.kind,
    })),
'''
new_se = '''    scriptedEvents: [
      ...materializeTimeline(level.timeline, 60 * 60).map((event) => ({
        tick: event.tick,
        kind: event.kind,
      })),
      ...extractPieceTimeline(level.timeline).map((event) => ({
        afterPieces: event.afterPieces,
        kind: event.kind,
      })),
    ],
'''
if old_se not in art:
    raise SystemExit('scriptedEvents not found')
(root / "server/puzzle/puzzleValidationArtifact.ts").write_text(art.replace(old_se, new_se), encoding='utf-8')
print('validation artifact ok')
