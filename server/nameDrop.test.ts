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

  it('creates a deterministic plan that reveals every target cell', () => {
    const first = createNameDropPlan('SHAPE SHOWDOWN', 12345);
    const second = createNameDropPlan('SHAPE SHOWDOWN', 12345);
    assert.deepEqual(second, first);

    const targetKeys = new Set(first.targetCells.map(({ x, y }) => `${x},${y}`));
    const revealKeys = new Set(
      first.pieces.flatMap((piece) => piece.revealCells.map(({ x, y }) => `${x},${y}`)),
    );
    assert.deepEqual(revealKeys, targetKeys);
    assert.equal(first.pieces.every((piece) => piece.cells.length === 4), true);
    assert.equal(first.pieces.every((piece) => piece.cells.every(({ x, y }) =>
      x >= 0 && x < NAME_DROP_COLUMNS && y >= 0 && y < NAME_DROP_ROWS,
    )), true);
  });
});
