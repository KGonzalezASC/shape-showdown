import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isShopViewportUnplayable } from './shopViewportWarning';

describe('shop viewport warning', () => {
  for (const shopPhase of ['ready', 'cycling'] as const) {
    test(`does not block play while the line-clear shop is ${shopPhase}`, () => {
      assert.equal(isShopViewportUnplayable({
        viewportWidth: 640,
        shopPhase,
        offerCount: 5,
        offerListHeight: 0,
      }), false);
    });
  }

  test('warns when the stable waiting shop cannot show its offers', () => {
    assert.equal(isShopViewportUnplayable({
      viewportWidth: 512,
      shopPhase: 'waiting',
      offerCount: 5,
      offerListHeight: 9,
    }), true);
  });
});
