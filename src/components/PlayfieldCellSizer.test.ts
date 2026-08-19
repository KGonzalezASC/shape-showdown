import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fitDualPlayfieldCellSize, fitMobilePlayfieldCellSize } from './PlayfieldCellSizer';

describe('PlayfieldCellSizer shrine gutter', () => {
  test('default pad matches the no-gutter fit', () => {
    const box = { width: 390, height: 520 };
    assert.equal(fitMobilePlayfieldCellSize(box), fitMobilePlayfieldCellSize(box, 0));
  });

  test('downwell pad shrinks the mobile cell', () => {
    const box = { width: 390, height: 520 };
    assert.ok(fitMobilePlayfieldCellSize(box, 30) < fitMobilePlayfieldCellSize(box, 0));
  });

  test('downwell pad shrinks the dual-field cell', () => {
    const box = { width: 1180, height: 820 };
    assert.ok(fitDualPlayfieldCellSize(box, 30) < fitDualPlayfieldCellSize(box, 0));
  });

  test('dual-field cells stay integer so grid hairlines remain continuous', () => {
    const box = { width: 1144, height: 756 };
    const cell = fitDualPlayfieldCellSize(box, 0);
    assert.equal(cell, Math.floor(cell));
    assert.ok(cell >= 22);
  });

  test('compact cells stay integer so grid hairlines remain continuous', () => {
    const cell = fitMobilePlayfieldCellSize({ width: 268, height: 482 }, 30);
    assert.equal(cell, Math.floor(cell));
    assert.ok(cell >= 8);
  });
});
