// Search for (stack + piece) presets: no overlap, then engine-style lock+line clear + T-spin
const T = [
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [1, 1], [2, 1], [1, 2]],
  [[0, 1], [1, 1], [2, 1], [1, 2]],
  [[1, 0], [0, 1], [1, 1], [1, 2]],
];
const FRONT = [[0, 1], [1, 3], [2, 3], [0, 2]];
const W = 10;
const H = 10;

function toGrid(set) {
  const g = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
  for (const k of set) {
    const [x, y] = k.split(',').map(Number);
    g[y][x] = 'X';
  }
  return g;
}

function getCells(x, y, rot) {
  return T[rot].map(([dx, dy]) => [x + dx, y + dy]);
}

function lockAndResult(set, x, y, rot) {
  const cells = getCells(x, y, rot);
  for (const [cx, cy] of cells) {
    if (cy >= 0 && cy < H && cx >= 0 && cx < W && set.has(`${cx},${cy}`)) return null;
  }
  const board = toGrid(set);
  for (const [cx, cy] of cells) {
    if (cy >= 0 && cy < H && cx >= 0 && cx < W) board[cy][cx] = 'T';
  }
  const linesToClear = [];
  for (let yy = 0; yy < H; yy++) {
    if (board[yy].every((c) => c !== null)) linesToClear.push(yy);
  }
  for (const yy of linesToClear) {
    board.splice(yy, 1);
    board.unshift(Array.from({ length: W }, () => null));
  }
  const after = new Set();
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      if (board[yy][xx] !== null) after.add(`${xx},${yy}`);
    }
  }
  return { lines: linesToClear.length, after };
}

function tspin(after, x, y, rot) {
  const cx = x + 1;
  const cy = y + 1;
  const cr = [
    [cx - 1, cy - 1],
    [cx + 1, cy - 1],
    [cx - 1, cy + 1],
    [cx + 1, cy + 1],
  ];
  const occ = cr.map(([xx, yy]) => xx < 0 || xx >= W || yy >= H || yy < 0 || after.has(`${xx},${yy}`));
  const n = occ.filter(Boolean).length;
  if (n < 3) return { kind: 'none', n, occ };
  const [f1, f2] = FRONT[rot];
  const full = occ[f1] && occ[f2];
  return { kind: full ? 'full' : 'mini', n, occ };
}

function setFromRows(rows) {
  const s = new Set();
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === '#') s.add(`${c},${r}`);
    }
  }
  return s;
}

// Grid templates (10 rows) — we search (x,y,r) on these
const templates = {
  tsd1: setFromRows([
    '..........', '..........', '..........', '..........', '..........', '..........',
    '###.......', '##........', '##.#######', '###.######',
  ]),
  tss1: setFromRows([
    '..........', '..........', '..........', '..........', '..........', '..........',
    '..........', '###.......', '##.#######', '##.#.#####',
  ]),
  tst1: setFromRows([
    '..........', '..........', '..........', '..........', '..........', '..........',
    '..#.......', '.##.######', '..#.######', '.##.######',
  ]),
  mini1: setFromRows([
    '..........', '..........', '..........', '..........', '..........', '..........',
    '.#........', '#...######', '.#.#######', '.#.#######',
  ]),
};

function hunt(name, stack) {
  console.log(`\n=== ${name} ===`);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let r = 0; r < 4; r++) {
        const cells = getCells(x, y, r);
        if (cells.some(([cx, cy]) => cy < 0 || cy >= H || cx < 0 || cx >= W)) continue;
        const L = lockAndResult(stack, x, y, r);
        if (!L) continue;
        const d = tspin(L.after, x, y, r);
        if (L.lines > 0 && d.kind === 'full') {
          console.log('FULL', { x, y, r, lines: L.lines, n: d.n });
        }
        if (L.lines > 0 && d.kind === 'mini') {
          console.log('MINI', { x, y, r, lines: L.lines, n: d.n });
        }
        if (L.lines === 2 && d.kind === 'full') {
          console.log('*** TSD candidate', { x, y, r, occ: d.occ });
        }
        if (L.lines === 1 && d.kind === 'full') {
          console.log('*** TSS candidate', { x, y, r, lines: 1, occ: d.occ });
        }
        if (L.lines === 3 && d.kind === 'full') {
          console.log('*** TST candidate', { x, y, r, occ: d.occ });
        }
      }
    }
  }
}

Object.entries(templates).forEach(([n, s]) => hunt(n, s));

// Print rows from a set for copy-paste
function printSetRows(set) {
  for (let y = 0; y < H; y++) {
    let l = '';
    for (let x = 0; x < W; x++) l += set.has(`${x},${y}`) ? '#' : '.';
    console.log("'" + l + "',", '//', y);
  }
}
