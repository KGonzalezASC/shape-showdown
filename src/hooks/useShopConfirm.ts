import { useCallback } from 'react';
import { SHOP_ITEM_BY_ID } from '../shop/shopCatalog';
import { useGameActions, useMatchChromeSnapshot } from '../state/GameStateProvider';

export function useShopConfirm() {
  const chrome = useMatchChromeSnapshot();
  const { sendShopOpen, sendShopPurchase } = useGameActions();

  return useCallback(() => {
    if (chrome.shopPhase === 'waiting') return;

    if (chrome.shopPhase === 'ready' || chrome.shopPhase === 'expired') {
      sendShopOpen();
      return;
    }

    if (chrome.shopPhase === 'cycling') {
      const pickedId = chrome.shopOfferIds[chrome.shopCycleIndex];
      if (!pickedId) return;
      const picked = SHOP_ITEM_BY_ID.get(pickedId);
      if (!picked || chrome.availableShopScore < picked.cost) return;
      sendShopPurchase(pickedId);
    }
  }, [chrome, sendShopOpen, sendShopPurchase]);
}
