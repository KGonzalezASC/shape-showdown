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
    assert.equal(pieceCellKeys.length, targetKeys.size);
    assert.equal(new Set(pieceCellKeys).size, pieceCellKeys.length);
    assert.deepEqual(new Set(pieceCellKeys), targetKeys);
    assert.equal(first.pieces.length, first.targetCells.length / 4);
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
  });
});
