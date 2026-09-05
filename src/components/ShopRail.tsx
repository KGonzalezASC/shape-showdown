import React, { memo, useEffect, useId, useRef } from 'react';
import type { ItemPricingState, ShopItem } from '../types';
import { getPricingView } from '../shop/shopPricing';
import { DEV_TOOLS_ENABLED } from '../devTools';
import './ShopRail.css';

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
  isItemDisabled?: (item: ShopItem) => boolean;
  getItemDisabledReason?: (item: ShopItem) => string | null;
  onConfirm: () => void;
  hatchingEnabled: boolean;
  onToggleHatching?: () => void;
  viewportMode: 'phone' | 'tablet' | 'desktop';
}

function blockedItemReason(item: ShopItem): string {
  if (item.id === 'storage-toxin') return 'Opponent needs a stored piece.';
  if (item.id === 'wildcard-four') return 'Needs settled poison on the opponent’s board.';
  return 'Unavailable right now.';
}

const ShopRail: React.FC<ShopRailProps> = ({
  items, isPlaying, canPurchase, cycleIndex, shopPhase, purchasedItem,
  availableFunds, pricing, currentTick, isItemDisabled, getItemDisabledReason,
  onConfirm, hatchingEnabled, onToggleHatching, viewportMode,
}) => {
  const instructionId = useId();
  const reasonId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const activeOfferRef = useRef<HTMLDetailsElement>(null);
  const isCycling = isPlaying && shopPhase === 'cycling';
  const canStart = isPlaying && (shopPhase === 'ready' || shopPhase === 'expired') && items.length > 0;
  const highlighted = isCycling ? items[cycleIndex] : undefined;
  const highlightedPrice = highlighted ? getPricingView(highlighted.id, pricing[highlighted.id], currentTick).currentPrice : 0;
  const itemReason = (item: ShopItem) => getItemDisabledReason?.(item)
    ?? (isItemDisabled?.(item) ? blockedItemReason(item) : null);
  const purchaseReason = highlighted
    ? itemReason(highlighted) ?? (availableFunds < highlightedPrice ? `Need ${(highlightedPrice - availableFunds).toLocaleString()} more credits.` : null)
    : null;
  const disabled = !canStart && (!isCycling || !canPurchase || !highlighted || purchaseReason !== null);
  const status = !isPlaying ? 'Opens during play' : shopPhase === 'waiting' ? 'Clear a line to unlock'
    : shopPhase === 'ready' ? 'Offers ready' : shopPhase === 'expired' ? 'Cycle finished' : 'Offers cycling';
  const instruction = canStart ? 'Start, then buy the highlighted item.'
    : isCycling ? 'Buy when your item lights up.' : null;
  const actionNote = purchaseReason ?? (!isCycling && purchasedItem ? `Purchased ${purchasedItem.name}.` : null);
  const actionLabel = canStart ? (shopPhase === 'expired' ? 'Restart cycle' : 'Start cycle')
    : highlighted ? `Buy ${highlighted.name} · ${highlightedPrice.toLocaleString()}`
      : isPlaying ? 'Clear a line to unlock' : 'Waiting for match';

  useEffect(() => {
    const list = listRef.current;
    const active = activeOfferRef.current;
    if (!list || !active || !isCycling) return;
    const listBox = list.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    if (activeBox.top < listBox.top) list.scrollTop += activeBox.top - listBox.top;
    else if (activeBox.bottom > listBox.bottom) list.scrollTop += activeBox.bottom - listBox.bottom;
  }, [cycleIndex, isCycling]);

  return (
    <section className={`arsenal arsenal--${viewportMode}`} aria-label="Power-up shop">
      <header className="arsenal-header">
        <div className="arsenal-heading"><h2>Power-up shop</h2><span className="arsenal-wallet"><span>Your credits</span><strong>{availableFunds.toLocaleString()}</strong></span></div>
        <p className="arsenal-status" role="status">{status}</p>
        {instruction && <p id={instructionId} className="arsenal-instructions">{instruction}</p>}
      </header>

      <div ref={listRef} className="arsenal-offers" tabIndex={0} aria-label="Offers and effect details">
        {items.map((item, idx) => {
          const price = getPricingView(item.id, pricing[item.id], currentTick);
          const blocked = itemReason(item);
          const shortfall = price.currentPrice - availableFunds;
          const active = isCycling && idx === cycleIndex;
          return (
            <details key={item.id} ref={active ? activeOfferRef : undefined} className={`arsenal-offer${active ? ' arsenal-offer--active' : ''}`}>
              <summary aria-label={`${item.name}, ${price.currentPrice} credits, ${item.target === 'self' ? 'helps you' : 'affects opponent'}. Effect details`}>
                <span className="arsenal-icon" aria-hidden="true">{item.icon}</span>
                <span className="arsenal-offer-copy"><strong>{item.name}</strong><span>{active ? 'BUY NOW · ' : ''}{item.target === 'self' ? 'Helps you' : 'Affects opponent'}</span></span>
                <span className="arsenal-price">{price.currentPrice.toLocaleString()}<span className="arsenal-detail-cue" aria-hidden="true">Details ▾</span></span>
              </summary>
              <div className="arsenal-description">
                <p>{item.description}</p>
                {(blocked || shortfall > 0) && <p className="arsenal-gate">{blocked ?? `Need ${shortfall.toLocaleString()} more credits.`}</p>}
                <p className="arsenal-pricing-note">{price.currentPrice === 0 ? 'Your next purchase is free.' : price.windowActive
                  ? `Price rises to ${price.nextPrice} after ${price.purchasesRemaining} more purchases or ${price.secondsRemaining}s.`
                  : `Current price: ${price.currentPrice} credits.`}</p>
              </div>
            </details>
          );
        })}
        {items.length === 0 && <p className="arsenal-empty">Your offers appear here when the match starts.</p>}
      </div>

      <footer className="arsenal-footer">
        {actionNote && <p id={reasonId} className={`arsenal-action-note${purchaseReason ? ' arsenal-action-note--blocked' : ''}`} role="status">{actionNote}</p>}
        <button type="button" className="arsenal-confirm" disabled={disabled} onClick={onConfirm} aria-describedby={[instruction && instructionId, actionNote && reasonId].filter(Boolean).join(' ') || undefined}>
          {actionLabel}
        </button>
      </footer>
      {DEV_TOOLS_ENABLED && onToggleHatching && <button type="button" className="arsenal-dev" aria-pressed={hatchingEnabled} onClick={onToggleHatching}>Hatching {hatchingEnabled ? 'on' : 'off'}</button>}
    </section>
  );
};

export default memo(ShopRail);
