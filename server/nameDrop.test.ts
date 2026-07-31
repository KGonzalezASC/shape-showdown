import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createNameDropPlan,
  NAME_DROP_COLUMNS,
  NAME_DROP_ROWS,
  nameLines,
  nameTargetCells,
  normalizeName,
} from '../src/nameDrop/nameDrop';
import { SHAPES } from '../src/tetris/shapes';
import { getPrebakedNameDropPlan } from '../src/nameDrop/nameDropPrebaked';
import {
  collectNewlySettledPieceIndices,
  pieceMotion,
  pieceSettledAt,
} from '../src/nameDrop/nameDropRenderCore';
import { syncNameDropPlaybackClock } from '../src/nameDrop/nameDropPlayback';

describe('name drop planner', () => {
  it('normalizes names and provides a useful fallback', () => {
    assert.equal(normalizeName('  shape---showdown  '), 'SHAPE SHOWDOWN');
    assert.equal(normalizeName('   '), 'SHAPE SHOWDOWN');
  });

  it('wraps the showcase name into the available board footprint', () => {
    assert.deepEqual(nameLines('SHAPE SHOWDOWN'), ['SHAPE', 'SHOWDOWN']);
    assert.deepEqual(nameLines('ABC'), ['ABC']);
    assert.equal(nameLines('ABCDEFGHIJKLMNOPQRSTUVWXYZ').length, 2);
    assert.match(nameLines('ABCDEFGHIJKLMNOPQRSTUVWXYZ')[1], /\.\.\.$/);
  });

  it('keeps target cells within the fixed aspect-ratio grid', () => {
    const cells = nameTargetCells(nameLines('SHAPE SHOWDOWN'));
    assert.ok(cells.length > 0);
    assert.equal(cells.every(({ x, y }) => x >= 0 && x < NAME_DROP_COLUMNS && y >= 0 && y < NAME_DROP_ROWS), true);
  });

  it('creates a deterministic exact cover from canonical tetrominoes', () => {
    const first = createNameDropPlan('SHAPE SHOWDOWN', 12345);
    const second = createNameDropPlan('SHAPE SHOWDOWN', 12345);
    assert.deepEqual(second, first);

    const targetKeys = new Set(first.targetCells.map(({ x, y }) => `${x},${y}`));
    const pieceCellKeys = first.pieces.flatMap((piece) =>
      piece.cells.map(({ x, y }) => `${x},${y}`),
    );
    assert.equal(new Set(pieceCellKeys).size, pieceCellKeys.length);
    assert.equal(first.targetCells.every((cell) => {
      const key = `${cell.x},${cell.y}`;
      return pieceCellKeys.filter((pieceCellKey) => pieceCellKey === key).length === 1;
    }), true);
    assert.equal(pieceCellKeys.length >= targetKeys.size, true);
    assert.equal(first.pieces.every((piece) => piece.cells.length === 4), true);
    assert.equal(first.pieces.every((piece) => piece.cells.every(({ x, y }) =>
      x >= 0 && x < NAME_DROP_COLUMNS && y >= 0 && y < NAME_DROP_ROWS,
    )), true);
    assert.equal(first.pieces.every((piece) => {
      const canonicalCells = SHAPES[piece.type][piece.rotation]
        .map(([x, y]) => `${piece.x + x},${piece.y + y}`)
        .sort();
      const renderedCells = piece.cells.map(({ x, y }) => `${x},${y}`).sort();
      return canonicalCells.join('|') === renderedCells.join('|');
    }), true);
    assert.equal(new Set(first.pieces.map((piece) => piece.type)).size >= 5, true);

    const custom = createNameDropPlan('VARIETY TEST', 12345);
    const customPieceCellKeys = custom.pieces.flatMap((piece) =>
      piece.cells.map(({ x, y }) => `${x},${y}`),
    );
    assert.equal(new Set(customPieceCellKeys).size, customPieceCellKeys.length);
    assert.equal(custom.targetCells.every((cell) => {
      const key = `${cell.x},${cell.y}`;
      return customPieceCellKeys.filter((pieceCellKey) => pieceCellKey === key).length === 1;
    }), true);
  });

  it('keeps the prebaked brand plan identical to the generated default plan', () => {
    const generated = createNameDropPlan('SHAPE SHOWDOWN');
    const prebaked = getPrebakedNameDropPlan('SHAPE SHOWDOWN');

    assert.ok(prebaked);
    assert.equal(prebaked.name, generated.name);
    assert.deepEqual(prebaked.lines, generated.lines);
    assert.deepEqual(prebaked.targetCells, generated.targetCells);
    assert.deepEqual(prebaked.pieces, generated.pieces);
    assert.equal(prebaked.totalDurationMs, generated.totalDurationMs);
  });

  it('settles pieces independently when varied durations finish out of order', () => {
    const plan = createNameDropPlan('SHAPE SHOWDOWN');
    const laterIndex = plan.pieces.findIndex((piece, index) =>
      index > 0 && pieceSettledAt(piece) < pieceSettledAt(plan.pieces[index - 1]));

    assert.notEqual(laterIndex, -1);
    const elapsedMs = pieceSettledAt(plan.pieces[laterIndex]);
    const newlySettled = collectNewlySettledPieceIndices(plan.pieces, elapsedMs, new Set());

    assert.equal(newlySettled.includes(laterIndex), true);
    assert.equal(newlySettled.includes(laterIndex - 1), false);
  });

  it('keeps a falling piece moving until its actual settlement time', () => {
    const [piece] = createNameDropPlan('SHAPE SHOWDOWN').pieces;
    const nearSettlement = pieceMotion(piece, 10, piece.delayMs + piece.durationMs * 0.9);
    const settled = pieceMotion(piece, 10, piece.delayMs + piece.durationMs);

    assert.equal(nearSettlement.settled, false);
    assert.ok(nearSettlement.translateY < 0);
    assert.equal(settled.settled, true);
    assert.equal(Math.abs(settled.translateY), 0);
  });

  it('preserves playback time across redraws and resets it only for a new cycle', () => {
    const plan = createNameDropPlan('SHAPE SHOWDOWN');
    const initial = { plan, cycle: 0, startedAt: 100 };

    assert.deepEqual(syncNameDropPlaybackClock(initial, plan, 0, 500), initial);
    assert.deepEqual(syncNameDropPlaybackClock(initial, plan, 1, 500), {
      plan,
      cycle: 1,
      startedAt: 500,
    });
  });
});
