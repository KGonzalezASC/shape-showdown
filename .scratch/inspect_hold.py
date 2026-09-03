from pathlib import Path

gf = Path("src/components/GameField.tsx")
text = gf.read_text(encoding="utf-8")
idx = text.find("text: 'Frozen")
chunk = text[idx:idx+35]
print([hex(ord(c)) for c in chunk])
print(repr(chunk))
