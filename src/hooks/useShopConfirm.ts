import { useCallback } from 'react';
import { SHOP_ITEM_BY_ID } from '../shop/shopCatalog';
import { getPricingView } from '../shop/shopPricing';
import { useGameActions, useMatchChromeSnapshot, usePlayfieldSnapshot } from '../state/GameStateProvider';

export function useShopConfirm() {
  const chrome = useMatchChromeSnapshot();
  const playfield = usePlayfieldSnapshot();
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
      if (!picked) return;
      const pricingView = getPricingView(pickedId, chrome.shopPricing[pickedId], chrome.tick);
      if (chrome.availableFunds < pricingView.currentPrice) return;
      const opponent = playfield.opponentPlayer;
      if (pickedId === 'storage-toxin' && !opponent?.holdPiece) return;
      if (pickedId === 'bounty-tax' && chrome.oppFunds <= chrome.myFunds) return;
      if (
        pickedId === 'wildcard-four' &&
        !opponent?.poisonBoard?.some((row) => row.some((cell) => cell > 0))
      ) return;
      sendShopPurchase(pickedId);
    }
  }, [chrome, playfield.opponentPlayer, sendShopOpen, sendShopPurchase]);
}
