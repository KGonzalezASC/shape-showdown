from pathlib import Path
p = Path("server/puzzle/catalog/authoredLevels.ts")
s = p.read_text(encoding="utf-8")
old = "export function buildPulseGarbageLevel(): CuratedPuzzleLevel {"
new = '''/**
 * Pulse Garbage — shallow-to-mid cheese dig with a mid-run garbage timeline
 * beat. Hold allowed; upcoming hazards / queue stay hidden.
 */
export function buildPulseGarbageLevel(): CuratedPuzzleLevel {'''
if "Pulse Garbage —" not in s:
    s = s.replace(old, new)
    p.write_text(s, encoding="utf-8")
    print("pulse doc added")
else:
    print("pulse doc already present")
