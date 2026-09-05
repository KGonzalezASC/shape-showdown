import { useCallback } from 'react';
import { SHOP_ITEM_BY_ID } from '../shop/shopCatalog';
import { getPricingView } from '../shop/shopPricing';
import { useGameActions, useMatchChromeSnapshot, usePlayfieldSnapshot } from '../state/GameStateProvider';
import { getChromeSnapshot } from '../state/gameStateStore';

export function useShopConfirm() {
  const chrome = useMatchChromeSnapshot();
  const playfield = usePlayfieldSnapshot();
  const { sendShopOpen, sendShopPurchase } = useGameActions();

  return useCallback(() => {
    // Read tick/funds imperatively so this hook does not re-subscribe at 60Hz.
    const live = getChromeSnapshot();
    if (live.shopPhase === 'waiting') return;

    if (live.shopPhase === 'ready' || live.shopPhase === 'expired') {
      sendShopOpen();
      return;
    }

    if (live.shopPhase === 'cycling') {
      const pickedId = live.shopOfferIds[live.shopCycleIndex];
      if (!pickedId) return;
      const picked = SHOP_ITEM_BY_ID.get(pickedId);
      if (!picked) return;
      const pricingView = getPricingView(pickedId, live.shopPricing[pickedId], live.tick);
      if (live.availableFunds < pricingView.currentPrice) return;
      const opponent = playfield.opponentPlayer;
      if (pickedId === 'storage-toxin' && !opponent?.opponentHasHold) return;
      if (pickedId === 'wildcard-four' && (!opponent?.opponentHasPoison || opponent.poisonSpread != null)) return;
      sendShopPurchase(pickedId);
    }
  }, [
    chrome.shopPhase,
    chrome.shopOfferIds,
    chrome.shopCycleIndex,
    chrome.shopPricing,
    chrome.availableFunds,
    playfield.opponentPlayer,
    sendShopOpen,
    sendShopPurchase,
  ]);
}
