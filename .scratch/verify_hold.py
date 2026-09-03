from pathlib import Path
gf = Path("src/components/GameField.tsx").read_text(encoding="utf-8")
# Show key sections
for needle in ["allowHold?: boolean", "allowHold = true", "storageDisabled", "Storage disabled", "\\u2715", "\u2715", "prev.allowHold"]:
    print(f"{needle!r}: {needle in gf}")

idx = gf.find("const storageDisabled")
print("--- hold status ---")
print(gf[idx:idx+900])
idx2 = gf.find("storageDisabled ?")
# find empty slot
idx3 = gf.find("aria-label={storageDisabled")
print("--- empty slot ---")
print(gf[idx3-200:idx3+450])

ps = Path("src/components/PuzzleScreen.tsx").read_text(encoding="utf-8")
idx = ps.find("allowHold={started")
print("--- PuzzleScreen ---")
print(ps[idx-250:idx+120])
