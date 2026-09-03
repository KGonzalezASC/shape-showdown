from pathlib import Path
p = Path("server/puzzle/catalog/authoredLevels.ts")
s = p.read_text(encoding="utf8")
old = """  const timeline: TimelineEvent[] = [
    // ~1.5s: poison active piece (variant 2).
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    // Soon after lock (~114): wildcard only applies once poison is on the stack
    // (matches multiplayer canPurchase gate). Keep before typical bot clear (~139).
    { tick: 130, kind: 'wildcard', params: { variant: 2 } },
  ];

  return freezeLevel({
    id: 'authored-poison-beat',
    name: 'Poison Beat',
    seed: 10661,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 2 },
    timeline,
"""
neu = """  const timeline: TimelineEvent[] = [
    // ~1.5s: poison active piece (variant 2).
    { tick: 90, kind: 'poison', params: { variant: 2 } },
    // After lock (~114): wildcard only applies once poison is on the stack
    // (matches multiplayer canPurchase gate). Goal is 3 lines so baselines
    // still run past the wildcard beat.
    { tick: 150, kind: 'wildcard', params: { variant: 2 } },
  ];

  return freezeLevel({
    id: 'authored-poison-beat',
    name: 'Poison Beat',
    seed: 10661,
    initialBoard: board,
    queuePrefix,
    goal: { kind: 'clear-lines', lines: 3 },
    timeline,
"""
if old not in s:
    raise SystemExit('block missing')
p.write_text(s.replace(old, neu), encoding='utf8')
print('retuned to lines3 wc@150')
