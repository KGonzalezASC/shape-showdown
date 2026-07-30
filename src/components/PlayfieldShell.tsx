import React, { useContext, useMemo } from 'react';
import GameField, { GameFieldRef } from './GameField';
import OpponentMiniField from './OpponentMiniField';
import ShopRail from './ShopRail';
import { GameFieldsLayout } from './GameFieldsLayout';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from '../types';
import { resolveShopOffers, SHOP_ITEM_BY_ID } from '../shop/shopCatalog';
import { useMatchChromeSnapshot, usePlayfieldSnapshot } from '../state/GameStateProvider';
import { useShopConfirm } from '../hooks/useShopConfirm';

function WaitingForOpponentBoard() {
  const cell = useContext(PlayfieldCellSizeContext);
  return (
    <div className="relative shrink-0">
      <div className="mb-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-rose-400">Opponent Field</h2>
      </div>
      <div
        className="flex items-center justify-center rounded-xl border-2 border-rose-500/10 bg-[#141414]"
        style={{ width: BOARD_COLS * cell, height: BOARD_VISIBLE_ROWS * cell }}
      >
        <p className="animate-pulse px-4 text-center text-sm font-medium text-zinc-500">Waiting for opponent…</p>
      </div>
    </div>
  );
}

interface PlayfieldShellProps {
  mobilePlayfieldRef: React.RefObject<HTMLDivElement | null>;
  railRef: React.RefObject<HTMLDivElement | null>;
  mobileCellSize: number;
  myMobileFieldRef: React.RefObject<GameFieldRef | null>;
  myDesktopFieldRef: React.RefObject<GameFieldRef | null>;
  oppDesktopFieldRef: React.RefObject<GameFieldRef | null>;
  hatchingEnabled: boolean;
  onToggleHatching: () => void;
}

export const PlayfieldShell: React.FC<PlayfieldShellProps> = ({
  mobilePlayfieldRef,
  railRef,
  mobileCellSize,
  myMobileFieldRef,
  myDesktopFieldRef,
  oppDesktopFieldRef,
  hatchingEnabled,
  onToggleHatching,
}) => {
  const playfield = usePlayfieldSnapshot();
  const chrome = useMatchChromeSnapshot();
  const handleShopConfirm = useShopConfirm();

  const shopOffers = useMemo(() => resolveShopOffers(chrome.shopOfferIds), [chrome.shopOfferIds]);
  const purchasedItem = useMemo(() => {
    if (!chrome.shopLastPurchasedItemId) return null;
    return SHOP_ITEM_BY_ID.get(chrome.shopLastPurchasedItemId) ?? null;
  }, [chrome.shopLastPurchasedItemId]);

  const shopCanPurchase = chrome.shopPhase === 'cycling' || chrome.shopPhase === 'ready';
  const isPlaying = playfield.status === 'playing';
  const { myPlayer, opponentPlayer } = playfield;

  return (
    <>
      <div className="relative min-h-0 w-full flex-1 md:hidden">
        <div
          ref={mobilePlayfieldRef}
          className="flex h-full w-full items-stretch gap-2 overflow-hidden px-1 pb-3"
        >
          <div className="flex min-h-0 shrink-0 items-start justify-start">
            {myPlayer && (
              <GameField
                ref={myMobileFieldRef}
                player={myPlayer}
                isMe={true}
                title="👤 YOUR FIELD"
                borderColorClass="border-emerald-500/20"
                shadowColorClass="shadow-[0_0_30px_rgba(16,185,129,0.1)]"
                cellSize={mobileCellSize}
                status={playfield.status}
                hatchingEnabled={hatchingEnabled}
              />
            )}
          </div>
          <div
            ref={railRef}
            className="flex w-[5.75rem] shrink-0 flex-col gap-2 overflow-y-auto"
          >
            <OpponentMiniField
              player={opponentPlayer}
              pendingGarbage={chrome.oppPendingGarbage}
              hatchingEnabled={hatchingEnabled}
            />
            <ShopRail
              items={shopOffers}
              isPlaying={isPlaying}
              canPurchase={shopCanPurchase}
              cycleIndex={chrome.shopCycleIndex}
              shopPhase={chrome.shopPhase}
              purchasedItem={purchasedItem}
              onConfirm={handleShopConfirm}
              availableScore={chrome.availableShopScore}
              viewportMode="mobile"
              hatchingEnabled={hatchingEnabled}
              onToggleHatching={onToggleHatching}
            />
          </div>
        </div>
      </div>

      <div className="hidden min-h-0 w-full flex-1 md:flex md:flex-col">
        <GameFieldsLayout>
          {myPlayer && (
            <div className="flex shrink-0 items-start gap-3 sm:gap-4">
              <div className="shrink-0">
                <ShopRail
                  items={shopOffers}
                  isPlaying={isPlaying}
                  canPurchase={shopCanPurchase}
                  cycleIndex={chrome.shopCycleIndex}
                  shopPhase={chrome.shopPhase}
                  purchasedItem={purchasedItem}
                  onConfirm={handleShopConfirm}
                  availableScore={chrome.availableShopScore}
                  viewportMode="tabletDesktop"
                  hatchingEnabled={hatchingEnabled}
                  onToggleHatching={onToggleHatching}
                />
              </div>
              <GameField
                ref={myDesktopFieldRef}
                player={myPlayer}
                isMe={true}
                title="👤 YOUR FIELD"
                borderColorClass="border-emerald-500/20"
                shadowColorClass="shadow-[0_0_30px_rgba(16,185,129,0.1)]"
                status={playfield.status}
                hatchingEnabled={hatchingEnabled}
              />
            </div>
          )}

          <div className="relative shrink-0">
            {opponentPlayer ? (
              <GameField
                ref={oppDesktopFieldRef}
                player={opponentPlayer}
                isMe={false}
                title="Opponent Field"
                borderColorClass="border-rose-500/20"
                shadowColorClass="shadow-[0_0_30px_rgba(244,63,94,0.1)]"
                opacityClass="opacity-80"
                status={playfield.status}
                hatchingEnabled={hatchingEnabled}
              />
            ) : (
              <WaitingForOpponentBoard />
            )}
          </div>
        </GameFieldsLayout>
      </div>
    </>
  );
};
