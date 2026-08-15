import type { ShopPhase } from '../types';

const MIN_VISIBLE_SHOP_ROW_HEIGHT_PX = 6;
const COMPACT_SHOP_ROW_GAP_PX = 2;

interface ShopViewportMeasurement {
  viewportWidth: number;
  shopPhase: ShopPhase;
  offerCount: number;
  offerListHeight: number;
}

export function isShopViewportUnplayable({
  viewportWidth,
  shopPhase,
  offerCount,
  offerListHeight,
}: ShopViewportMeasurement): boolean {
  if (
    viewportWidth >= 901
    || offerCount === 0
    || shopPhase === 'ready'
    || shopPhase === 'cycling'
  ) return false;
  const minimumListHeight =
    offerCount * MIN_VISIBLE_SHOP_ROW_HEIGHT_PX
    + Math.max(0, offerCount - 1) * COMPACT_SHOP_ROW_GAP_PX;
  return offerListHeight < minimumListHeight;
}
