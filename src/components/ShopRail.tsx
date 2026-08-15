import React, { memo } from 'react';
import { ItemPricingState, ShopItem } from '../types';
import { getPricingView } from '../shop/shopPricing';
import { DEV_TOOLS_ENABLED } from '../devTools';
import { ssShopClasses } from '../ui/shapeShowdownTheme';

interface ShopRailProps {
  items: ShopItem[];
  isPlaying: boolean;
  canPurchase: boolean;
  cycleIndex: number;
  shopPhase: 'waiting' | 'ready' | 'cycling' | 'expired';
  purchasedItem: ShopItem | null;
  availableFunds: number;
  pricing: Record<string, ItemPricingState>;
  currentTick: number;
  /** Extra per-item gates (e.g. Satellite needs queued garbage). */
  isItemDisabled?: (item: ShopItem) => boolean;
  onConfirm: () => void;
  hatchingEnabled: boolean;
  onToggleHatching?: () => void;
  viewportMode: 'phone' | 'tablet' | 'desktop';
}

const ShopRail: React.FC<ShopRailProps> = ({
  items,
  isPlaying,
  canPurchase,
  cycleIndex,
  shopPhase,
  purchasedItem,
  availableFunds,
  pricing,
  currentTick,
  isItemDisabled,
  onConfirm,
  hatchingEnabled,
  onToggleHatching,
  viewportMode,
}) => {
  const isExpanded = viewportMode !== 'phone';
  const railWidthClass = viewportMode === 'phone'
    ? 'w-[5.75rem] min-[661px]:w-full'
    : viewportMode === 'tablet'
      ? 'w-full'
      : 'w-[8.875rem]';
  const iconRowClass = isExpanded ? 'min-h-11 px-2 py-1.5' : 'min-h-9 px-1.5 py-1';
  const bodyTextClass = isExpanded ? 'text-[9px]' : 'text-[8px]';
  const metaTextClass = isExpanded ? 'text-[8px]' : 'text-[7px]';
  const iconClass = isExpanded ? 'text-base' : 'text-sm';
  const offerListClass = viewportMode === 'desktop'
    ? 'max-h-none overflow-visible'
    : `${isExpanded ? 'max-h-[18rem]' : 'max-h-[14rem]'} overflow-y-auto`;

  const isWaiting = !isPlaying || shopPhase === 'waiting';
  const isReady = isPlaying && shopPhase === 'ready';
  const isCycling = isPlaying && shopPhase === 'cycling';
  const isExpired = isPlaying && shopPhase === 'expired';
  const showConfirmAction = (isCycling || isReady) && canPurchase;

  return (
    <div className={`shop-rail shop-rail--${viewportMode} ${railWidthClass} select-none ${isWaiting ? 'shop-rail--waiting' : ''}`}>
      <div className={`shop-rail-panel ${showConfirmAction ? 'shop-rail-panel--actionable' : ''} ${ssShopClasses.panel} shadow-xl ${isExpanded ? 'p-2' : 'p-1.5'}`}>
        <div className="shop-rail-header mb-2 flex items-center justify-between border-b border-[var(--ss-shop-border)] pb-1.5">
          <p className={`shop-rail-title ${bodyTextClass} ${ssShopClasses.headerTitle}`}>Shop · {items.length}</p>
          {isExpired && isPlaying ? (
            <span className={`${bodyTextClass} ${ssShopClasses.waitBadge} px-1 py-0.5`}>Wait</span>
          ) : (
            <span className="shop-rail-balance flex items-center gap-1.5">
              {purchasedItem && (
                <span className={iconClass} title={`Last purchase: ${purchasedItem.name}`}>
                  {purchasedItem.icon}
                </span>
              )}
              <span
                className={`${bodyTextClass} ${ssShopClasses.headerFunds}`}
                title="Available funds"
              >
                {availableFunds.toLocaleString()}
              </span>
            </span>
          )}
        </div>

        <div className="shop-offers-region relative">
          <div className={`shop-offer-list ${offerListClass} grid gap-1`}>
            {items.map((item, idx) => {
              const pricingView = getPricingView(item.id, pricing[item.id], currentTick);
              const canAfford = availableFunds >= pricingView.currentPrice;
              const blocked = isItemDisabled?.(item) ?? false;
              const isHighlighted = isCycling && idx === cycleIndex;
              const disabled = isWaiting || !canAfford || blocked;
              return (
                <div
                  key={item.id}
                  className={`shop-offer-row relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 transition-colors duration-150 ${iconRowClass} ${
                    isHighlighted
                      ? canAfford
                        ? `${ssShopClasses.rowHighlighted} text-[var(--ss-text-primary)]`
                        : ssShopClasses.rowUnaffordable
                      : `${ssShopClasses.row} ${disabled ? 'shop-offer-row--disabled' : ''}`
                  }`}
                >
                  <span
                    className={`shop-offer-icon ${iconClass} ${isHighlighted ? ssShopClasses.rowIcon : ssShopClasses.rowIconMuted}`}
                    title={item.name}
                  >
                    {item.icon}
                  </span>
                  {isExpanded && (
                    <span className={`shop-offer-name ${bodyTextClass} ${ssShopClasses.rowName}`}>{item.name}</span>
                  )}
                  <span
                    className={`shop-offer-price col-start-3 ${ssShopClasses.rowPrice} ${bodyTextClass} ${
                      disabled ? 'text-[var(--ss-shop-disabled-text)]' : ''
                    }`}
                  >
                    {pricingView.currentPrice}
                  </span>
                  {isExpanded && (
                    <span className={`shop-offer-meta col-start-2 col-end-4 ${metaTextClass} ${ssShopClasses.rowMeta}`}>
                      L{pricingView.level} · {pricingView.purchasesRemaining} left ·{' '}
                      {blocked ? 'gated' : pricingView.windowActive ? `${pricingView.secondsRemaining}s` : pricingView.windowClosedBy ?? 'fresh'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {isWaiting && (
            <div className="shop-wait-overlay pointer-events-none absolute inset-0 flex items-center justify-center border border-[var(--ss-stroke-secondary)] bg-transparent">
              <span className={`px-1.5 py-0.5 ${ssShopClasses.waitBadge} ${bodyTextClass}`}>
                {isPlaying ? 'Wait Line Clear' : 'Locked'}
              </span>
            </div>
          )}
        </div>

        {showConfirmAction && (
          <button
            type="button"
            onClick={onConfirm}
            className={`shop-confirm-button mt-2 min-h-9 w-full px-2 py-1.5 text-center ${bodyTextClass} ${ssShopClasses.confirmButton}`}
          >
            {isReady ? 'Start' : 'Confirm'}
          </button>
        )}
      </div>
      {DEV_TOOLS_ENABLED && onToggleHatching && (
        <button
          type="button"
          aria-pressed={hatchingEnabled}
          onClick={onToggleHatching}
          className={`shop-hatch-button mt-1 w-full border px-2 py-1 text-center ss-mono text-[9px] uppercase tracking-wider transition ${
            hatchingEnabled
              ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
              : 'border-[var(--ss-stroke-primary)] bg-[var(--ss-fill-primary)] text-[var(--ss-text-tertiary)] hover:text-[var(--ss-text-secondary)]'
          }`}
        >
          Hatch: {hatchingEnabled ? 'On' : 'Off'}
        </button>
      )}
    </div>
  );
};

export default memo(ShopRail);
