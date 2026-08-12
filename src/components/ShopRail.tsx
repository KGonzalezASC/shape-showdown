import React, { memo } from 'react';
import { BOARD_COLS, BOARD_VISIBLE_ROWS, ItemPricingState, ShopItem } from '../types';
import { getPricingView } from '../shop/shopPricing';
import { DEV_TOOLS_ENABLED } from '../devTools';

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
    ? 'w-[5.75rem]'
    : viewportMode === 'tablet'
      ? 'w-full'
      : 'w-[8.875rem]';
  const iconRowClass = isExpanded ? 'min-h-11 px-2 py-1.5' : 'min-h-8 px-1.5 py-1';
  const bodyTextClass = isExpanded ? 'text-[9px]' : 'text-[8px]';
  const iconClass = isExpanded ? 'text-lg' : 'text-base';

  const isWaiting = !isPlaying || shopPhase === 'waiting';
  const isReady = isPlaying && shopPhase === 'ready';
  const isCycling = isPlaying && shopPhase === 'cycling';
  const isExpired = isPlaying && shopPhase === 'expired';

  return (
    <div className={`${railWidthClass} select-none ${isWaiting ? 'opacity-70 saturate-50' : ''}`}>
      <div className={`border border-[#303535] bg-[#171919]/95 shadow-xl ${isExpanded ? 'p-2' : 'p-1'}`}>
        <div className="mb-2 flex items-center justify-between border-b border-[#303535] pb-1.5">
          <p className={`${bodyTextClass} font-black uppercase tracking-[0.16em] text-[#8db2ba]`}>Shop · {items.length}</p>
          {isExpired && isPlaying ? (
            <span className={`${bodyTextClass} border border-amber-500/30 bg-amber-950/30 px-1 py-0.5 font-mono text-amber-200`}>WAIT</span>
          ) : (
            <span className="flex items-center gap-1.5">
              {purchasedItem && <span className="text-sm" title={`Last purchase: ${purchasedItem.name}`}>{purchasedItem.icon}</span>}
              <span className={`${bodyTextClass} font-mono text-zinc-300`} title="Available funds">{availableFunds}</span>
            </span>
          )}
        </div>

        <div className="relative">
          <div className={`${isExpanded ? 'max-h-[18rem]' : 'max-h-[14rem]'} grid gap-1 overflow-y-auto`}>
            {items.map((item, idx) => {
              const pricingView = getPricingView(item.id, pricing[item.id], currentTick);
              const canAfford = availableFunds >= pricingView.currentPrice;
              const blocked = isItemDisabled?.(item) ?? false;
              const isHighlighted = isCycling && idx === cycleIndex;
              const disabled = isWaiting || !canAfford || blocked;
              return (
                <div
                  key={item.id}
                  className={`relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 border transition-colors duration-150 ${iconRowClass} ${
                    isHighlighted
                      ? canAfford
                        ? 'border-[#5c777c] bg-[#1a2020] text-zinc-100'
                        : 'border-rose-400/60 bg-rose-950/25 text-zinc-300'
                      : `border-[#292e2e] ${item.colorClass} ${disabled ? 'opacity-40 grayscale' : 'opacity-90'}`
                  }`}
                >
                  <span className={`${iconClass} leading-none text-zinc-200`} title={item.name}>{item.icon}</span>
                  {isExpanded && <span className={`${bodyTextClass} truncate font-extrabold text-zinc-200`}>{item.name}</span>}
                  <span className={`col-start-3 font-mono ${bodyTextClass} ${disabled ? 'text-zinc-400' : 'text-amber-200'}`}>
                    {pricingView.currentPrice}
                  </span>
                  {isExpanded && (
                    <span className={`col-start-2 col-end-4 font-mono text-[7px] leading-tight text-zinc-500`}>
                      L{pricingView.level} · {pricingView.purchasesRemaining} left · {blocked ? 'gated' : pricingView.windowActive ? `${pricingView.secondsRemaining}s` : pricingView.windowClosedBy ?? 'fresh'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {isWaiting && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center border border-white/10 bg-black/55">
              <span className={`border border-white/10 bg-zinc-900/90 px-1.5 py-0.5 font-mono ${bodyTextClass} uppercase tracking-wider text-zinc-300`}>
                {isPlaying ? 'Wait Line Clear' : 'Locked'}
              </span>
            </div>
          )}
        </div>

        {(isCycling || isReady) && canPurchase && (
          <button
            type="button"
            onClick={onConfirm}
            className="mt-2 min-h-9 w-full border border-[#4a5151] bg-[#343a3a] px-2 py-1.5 text-center font-mono text-[9px] font-black uppercase tracking-wider text-zinc-200 transition hover:bg-[#414848] active:bg-[#282d2d]"
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
          className={`mt-1 w-full border px-2 py-1 text-center font-mono text-[9px] uppercase tracking-wider transition ${
            hatchingEnabled
              ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
              : 'border-zinc-600/70 bg-zinc-900/70 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
          }`}
        >
          Hatch: {hatchingEnabled ? 'On' : 'Off'}
        </button>
      )}
    </div>
  );
};

export default memo(ShopRail);
