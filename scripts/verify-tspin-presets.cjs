// One-off: verify canvas T-spin presets match engine (lock + line clear, then detectTSpin on board after)

const T = [
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [1, 1], [2, 1], [1, 2]],
  [[0, 1], [1, 1], [2, 1], [1, 2]],
  [[1, 0], [0, 1], [1, 1], [1, 2]],
];
const FRONT = [[0, 1], [1, 3], [2, 3], [0, 2]];
const W = 10;
const H = 10;

function setFromRows(rows, y0 = 0) {
  const s = new Set();
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === '#') s.add(`${c},${r + y0}`);
    }
  }
  return s;
}

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

function lockAndCountLines(set, x, y, rot) {
  const cells = getCells(x, y, rot);
  for (const [cx, cy] of cells) {
    if (cy >= 0 && cy < H && cx >= 0 && cx < W) {
      if (set.has(`${cx},${cy}`)) return { err: 'overlap' };
    }
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
  return { lines: linesToClear.length, after, err: null };
}

function detectTSpinAfterClear(after, x, y, rot, lastWasRotate) {
  if (!lastWasRotate) return { t: false, n: 0, corners: null };
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
  if (n < 3) return { t: false, n, corners: occ };
  const [f1, f2] = FRONT[rot];
  const full = occ[f1] && occ[f2];
  return { t: full ? 'full' : 'mini', n, corners: occ };
}

const PRESETS = [
  {
    name: 'T-Spin Double',
    rows: [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '###.......',
      '##........',
      '##.#######',
      '###.######',
    ],
    x: 1, y: 6, r: 2,
  },
  {
    name: 'T-Spin Single',
    rows: [
      '..........', '..........', '..........', '..........', '..........', '..........',
      '..........', '###.......', '##.#######', '##.#.#####',
    ],
    x: 1, y: 7, r: 2,
  },
  {
    name: 'T-Spin Triple',
    rows: [
      '..........', '..........', '..........', '..........', '..........', '..........',
      '..#.......', '.##.######', '..#.######', '.##.######',
    ],
    x: 1, y: 7, r: 2,
  },
  {
    name: 'Mini T-Spin',
    rows: [
      '..........', '..........', '..........', '..........', '..........', '..........',
      '.#........', '#...######', '.#.#######', '.#.#######',
    ],
    x: 1, y: 6, r: 0,
  },
  {
    name: 'Not a T-Spin',
    rows: [
      '..........', '..........', '..........', '..........', '..........', '..........',
      '..........', '..........', '..........', '###....###',
    ],
    x: 3, y: 7, r: 0,
  },
];

for (const p of PRESETS) {
  const set = setFromRows(p.rows, 0);
  const l = lockAndCountLines(set, p.x, p.y, p.r);
  if (l.err) {
    console.log(p.name, 'ERROR', l.err);
    continue;
  }
  const d = detectTSpinAfterClear(l.after, p.x, p.y, p.r, true);
  console.log('---', p.name, '---');
  console.log('  lines', l.lines, 'tSpin', d.t, 'corners', d.n, d.corners?.map((o, i) => ['TL','TR','BL','BR'][i] + (o ? '1' : '0')).join(' '));
}
