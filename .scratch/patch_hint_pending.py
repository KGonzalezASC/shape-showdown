from pathlib import Path

# puzzleHost.ts
host = Path("server/puzzle/puzzleHost.ts")
text = host.read_text(encoding="utf-8")
old_iface = """  curtainDefenseLevel?: number;
}"""
new_iface = """  curtainDefenseLevel?: number;
  /** Hazards authored but still deferred (e.g. wildcard waiting on poison spread). */
  pendingHazardKinds?: string[];
}"""
if old_iface not in text:
    raise SystemExit("iface end not found")
text = text.replace(old_iface, new_iface, 1)

old_emit = """      curtainDefenseLevel: p.curtainDefenseLevel ?? 0,
    };
    this.socket.emit('puzzle:state', snap);"""
new_emit = """      curtainDefenseLevel: p.curtainDefenseLevel ?? 0,
      pendingHazardKinds: this.session.getPendingHazardKinds(),
    };
    this.socket.emit('puzzle:state', snap);"""
if old_emit not in text:
    raise SystemExit("emit not found")
text = text.replace(old_emit, new_emit, 1)
host.write_text(text, encoding="utf-8")
print("updated puzzleHost.ts")

# puzzlePresentation.ts
pres = Path("src/puzzle/puzzlePresentation.ts")
text = pres.read_text(encoding="utf-8")
old_fn = '''export function presentTimelineHints(
  events: PuzzleTimelineHint[],
  policy: PuzzleVisibilityPolicy | 'unspecified' | undefined,
  currentTick: number,
): PuzzleTimelineHint[] {
  const upcoming = events.filter((event) => event.tick > currentTick);
  if (!policy || policy === 'unspecified' || policy === 'hidden') {
    return [];
  }
  if (policy === 'partial') {
    return upcoming.map((event) => ({ tick: -1, kind: event.kind }));
  }
  return upcoming;
}'''
new_fn = '''export function presentTimelineHints(
  events: PuzzleTimelineHint[],
  policy: PuzzleVisibilityPolicy | 'unspecified' | undefined,
  currentTick: number,
  pendingKinds: string[] = [],
): PuzzleTimelineHint[] {
  const upcoming = events.filter((event) => event.tick > currentTick);
  // Keep deferred hazards in the telegraph until they actually apply.
  const pendingHints: PuzzleTimelineHint[] = [];
  for (const kind of pendingKinds) {
    if (!upcoming.some((event) => event.kind === kind) && !pendingHints.some((h) => h.kind === kind)) {
      pendingHints.push({ tick: -1, kind });
    }
  }
  const combined = [...upcoming, ...pendingHints];
  if (!policy || policy === 'unspecified' || policy === 'hidden') {
    return [];
  }
  if (policy === 'partial') {
    return combined.map((event) => ({ tick: -1, kind: event.kind }));
  }
  return combined;
}'''
if old_fn not in text:
    raise SystemExit("presentTimelineHints not found")
text = text.replace(old_fn, new_fn, 1)
pres.write_text(text, encoding="utf-8")
print("updated puzzlePresentation.ts")

# PuzzleScreen.tsx
screen = Path("src/components/PuzzleScreen.tsx")
text = screen.read_text(encoding="utf-8")
old_wire = """  curtainDefenseLevel?: number;
}"""
new_wire = """  curtainDefenseLevel?: number;
  pendingHazardKinds?: string[];
}"""
if old_wire not in text:
    raise SystemExit("PuzzleWireState end not found")
text = text.replace(old_wire, new_wire, 1)

old_hints = """  const timelineHints = presentTimelineHints(
    started?.timeline ?? [],
    started?.visibilityPolicy,
    state?.tick ?? 0,
  );"""
new_hints = """  const timelineHints = presentTimelineHints(
    started?.timeline ?? [],
    started?.visibilityPolicy,
    state?.tick ?? 0,
    state?.pendingHazardKinds ?? [],
  );"""
if old_hints not in text:
    raise SystemExit("timelineHints call not found")
text = text.replace(old_hints, new_hints, 1)
screen.write_text(text, encoding="utf-8")
print("updated PuzzleScreen.tsx")
