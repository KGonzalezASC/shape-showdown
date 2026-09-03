const data = "iIAAAIiIgIiIiIiIiAiIiAiIiIgIiIiIiIgIiIiIiIiIiAiIiIiAiIiAiIiIgIiIiIiIiICIiIiIiAiIiICIiIiIiIgIiIiIiIgIiIiIgIiAiIiIiIiAiIiIiIiICIiIiIiIgA==";
const buf = Buffer.from(data, "base64");
console.log("bytes", buf.length);
// Try nibble decode: each byte = 2 cells
const cells: number[] = [];
for (const b of buf) {
  cells.push((b >> 4) & 0xf);
  cells.push(b & 0xf);
}
console.log("cells", cells.length);
// 20 rows x 10 cols, row-major from top?
function dump(offsetRows = 0, take = 20) {
  for (let r = offsetRows; r < offsetRows + take && r * 10 < cells.length; r++) {
    const row = cells.slice(r * 10, r * 10 + 10);
    const s = row.map((c) => (c === 0 ? "." : String(c))).join("");
    const holes = row.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
    console.log(`r${String(r).padStart(2, "0")}: ${s}  empty@${JSON.stringify(holes)}`);
  }
}
console.log("--- full as top-origin ---");
dump(0, 20);
// Also try if only 200 nibbles from start
console.log("nonzero count", cells.filter((c) => c !== 0).length);
