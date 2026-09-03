from pathlib import Path

# types
p = Path("server/puzzle/puzzleTypes.ts")
t = p.read_text(encoding="utf-8")
old = """export type PuzzleGoal =
  | {
      kind: 'perfect-clear';
      /** Advisory piece budget for star ratings (v1: not enforced by the runner). */
      maxPieces?: number;
    }
  | { kind: 'survive'; /** Ticks the player must survive. */ ticks: number }
  | { kind: 'clear-lines'; /** Total line clears required. */ lines: number };"""
new = """export type PuzzleGoal =
  | {
      kind: 'perfect-clear';
      /** Advisory piece budget for star ratings (v1: not enforced by the runner). */
      maxPieces?: number;
    }
  | { kind: 'survive'; /** Ticks the player must survive. */ ticks: number }
  | { kind: 'clear-lines'; /** Total line clears required. */ lines: number }
  | {
      kind: 'survive-clear';
      /** Ticks the player must survive (and still be alive). */
      ticks: number;
      /** Lines that must also be cleared by the survive horizon. */
      lines: number;
    };"""
if "survive-clear" not in t:
    if old in t:
        t = t.replace(old, new)
        print("types: patched LF")
    elif old.replace("\n", "\r\n") in t:
        t = t.replace(old.replace("\n", "\r\n"), new.replace("\n", "\r\n"))
        print("types: patched CRLF")
    else:
        print("types: NOT FOUND")
        idx = t.find("export type PuzzleGoal")
        print(repr(t[idx:idx+400]))
    p.write_text(t, encoding="utf-8", newline="\n")
else:
    print("types: already done")

# session
p = Path("server/puzzle/puzzleSession.ts")
t = p.read_text(encoding="utf-8")
old = """    switch (goal.kind) {
      case 'perfect-clear':
        return player.board.every((row) => row.every((cell) => cell === null));
      case 'survive':
        return this.gameState.tick >= goal.ticks;
      case 'clear-lines':
        return player.linesCleared >= goal.lines;
    }"""
new = """    switch (goal.kind) {
      case 'perfect-clear':
        return player.board.every((row) => row.every((cell) => cell === null));
      case 'survive':
        return this.gameState.tick >= goal.ticks;
      case 'clear-lines':
        return player.linesCleared >= goal.lines;
      case 'survive-clear':
        return this.gameState.tick >= goal.ticks && player.linesCleared >= goal.lines;
    }"""
if "case 'survive-clear':" not in t:
    if old in t:
        t = t.replace(old, new)
        print("session: patched LF")
    elif old.replace("\n", "\r\n") in t:
        t = t.replace(old.replace("\n", "\r\n"), new.replace("\n", "\r\n"))
        print("session: patched CRLF")
    else:
        print("session: NOT FOUND")
        idx = t.find("switch (goal.kind)")
        print(repr(t[idx:idx+350]))
    p.write_text(t, encoding="utf-8", newline="\n")
else:
    print("session: already done")

# Fix PuzzleScreen mixed line endings around goalLabel if needed
p = Path("src/components/PuzzleScreen.tsx")
t = p.read_text(encoding="utf-8")
# normalize the goalLabel block
import re
pat = re.compile(r"const goalLabel = \(goal: PuzzleStarted\['goal'\]\): string => \{.*?\n\};", re.S)
m = pat.search(t)
if m:
    block = """const goalLabel = (goal: PuzzleStarted['goal']): string => {
  switch (goal.kind) {
    case 'perfect-clear':
      return 'Clear the whole board';
    case 'survive':
      return `Survive ${Math.ceil((goal.ticks ?? 0) / 60)}s`;
    case 'clear-lines':
      return `Clear ${goal.lines ?? 0} lines`;
    case 'survive-clear':
      return `Survive ${Math.ceil((goal.ticks ?? 0) / 60)}s · Clear ${goal.lines ?? 0} lines`;
    default:
      return goal.kind;
  }
};"""
    t = t[:m.start()] + block + t[m.end():]
    p.write_text(t, encoding="utf-8", newline="\n")
    print("PuzzleScreen goalLabel normalized")
else:
    print("PuzzleScreen goalLabel not found")

# Ensure all goal wire types include maxPieces
t = p.read_text(encoding="utf-8")
t2 = t.replace(
    "goal: { kind: string; lines?: number; ticks?: number };",
    "goal: { kind: string; lines?: number; ticks?: number; maxPieces?: number };",
)
if t2 != t:
    p.write_text(t2, encoding="utf-8", newline="\n")
    print("PuzzleScreen wire goals updated")
else:
    print("PuzzleScreen wire goals already ok or differently shaped")
    for i, line in enumerate(t.splitlines(), 1):
        if "goal: { kind: string" in line:
            print(i, line)
