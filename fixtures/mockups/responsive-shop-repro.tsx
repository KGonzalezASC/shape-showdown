import React from 'react';
import { createRoot } from 'react-dom/client';
import ShopRail from '../../src/components/ShopRail';
import { SHOP_ROLL_POOL } from '../../src/shop/shopCatalog';
import { createInitialPricingState } from '../../src/shop/shopPricing';
import '../../src/index.css';

const root = document.querySelector('#root');
if (!(root instanceof HTMLElement)) throw new Error('Missing repro root');

const search = new URLSearchParams(window.location.search);
const phaseQuery = search.get('phase');
const shopPhase = phaseQuery === 'cycling' || phaseQuery === 'waiting' ? phaseQuery : 'ready';
const viewportMode = search.get('mode') === 'phone' ? 'phone' : 'tablet';

root.className = 'shop-utility-rail flex min-h-0 flex-col gap-2 overflow-hidden';
root.style.width = viewportMode === 'phone' ? '92px' : '210px';
root.style.height = '102px';
createRoot(root).render(
  <ShopRail
    items={SHOP_ROLL_POOL.slice(0, 5)}
    isPlaying
    canPurchase
    cycleIndex={0}
    shopPhase={shopPhase}
    purchasedItem={null}
    availableFunds={232}
    pricing={createInitialPricingState()}
    currentTick={0}
    onConfirm={() => undefined}
    hatchingEnabled={false}
    onToggleHatching={() => undefined}
    viewportMode={viewportMode}
  />,
);
