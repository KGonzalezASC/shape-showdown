from pathlib import Path
path = Path("src/components/PuzzleScreen.tsx")
s = path.read_text(encoding="utf-8")
print("len", len(s))
print("has daily state", "const [daily, setDaily]" in s)
print("has PuzzleDailySummary", "PuzzleDailySummary" in s)
idx = s.find("socket.on('puzzle:catalog'")
print("catalog idx", idx)
print(repr(s[idx:idx+250]))
