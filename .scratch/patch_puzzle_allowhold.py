# -*- coding: utf-8 -*-
from pathlib import Path

ps = Path("src/components/PuzzleScreen.tsx")
text = ps.read_text(encoding="utf-8")
orig = text

old = """              <GameField
                ref={myFieldRef}
                player={player}
                isMe
                title="Puzzle"
            showFunds={false}
            showPlayerName={false}
            hatchingEnabled={false}
                status={finished ? 'ended' : 'playing'}
              />"""

new = """              <GameField
                ref={myFieldRef}
                player={player}
                isMe
                title="Puzzle"
                showFunds={false}
                showPlayerName={false}
                hatchingEnabled={false}
                allowHold={started?.allowHold !== false}
                status={finished ? 'ended' : 'playing'}
              />"""

if old not in text:
    # try normalized indentation variants
    idx = text.find("<GameField")
    print("NEAR GameField:")
    print(repr(text[idx:idx+350]))
    raise SystemExit("FAIL: GameField JSX")

text = text.replace(old, new, 1)
ps.write_text(text, encoding="utf-8", newline="\n")
print("PuzzleScreen.tsx patched OK")
