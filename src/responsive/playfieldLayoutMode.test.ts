import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYFIELD_DESKTOP_MIN_WIDTH_PX,
  PLAYFIELD_TABLET_MIN_WIDTH_PX,
  playfieldGridClass,
  resolvePlayfieldLayoutMode,
} from './playfieldLayoutMode';

describe('playfield layout mode', () => {
  test('phone, tablet, and desktop split at the measured 661px and 901px boundaries', () => {
    assert.equal(resolvePlayfieldLayoutMode(PLAYFIELD_TABLET_MIN_WIDTH_PX - 1), 'phone');
    assert.equal(resolvePlayfieldLayoutMode(PLAYFIELD_TABLET_MIN_WIDTH_PX), 'tablet');
    assert.equal(resolvePlayfieldLayoutMode(PLAYFIELD_DESKTOP_MIN_WIDTH_PX - 1), 'tablet');
    assert.equal(resolvePlayfieldLayoutMode(PLAYFIELD_DESKTOP_MIN_WIDTH_PX), 'desktop');
  });

  test('grid composition classes come from the layout mode, not a second CSS breakpoint', () => {
    assert.match(playfieldGridClass('phone'), /6rem/);
    assert.match(playfieldGridClass('tablet'), /13\.125rem/);
    assert.match(playfieldGridClass('desktop'), /8\.875rem/);
    assert.doesNotMatch(playfieldGridClass('phone'), /min-\[661px\]|min-\[901px\]/);
    assert.doesNotMatch(playfieldGridClass('tablet'), /min-\[661px\]|min-\[901px\]/);
    assert.doesNotMatch(playfieldGridClass('desktop'), /min-\[661px\]|min-\[901px\]/);
  });
});
