import React, { useContext, useEffect, useMemo, useState } from 'react';
import GameField, { GameFieldRef } from './GameField';
import OpponentMiniField from './OpponentMiniField';
import ShopRail from './ShopRail';
import { PlayfieldLayout } from './PlayfieldLayout';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from '../types';
import { resolveShopOffers, SHOP_ITEM_BY_ID } from '../shop/shopCatalog';
import { useMatchChromeSnapshot, usePlayfieldSnapshot } from '../state/GameStateProvider';
import { useShopConfirm } from '../hooks/useShopConfirm';
import { BoardProfiler } from '../performance/BoardProfiler';
import { IncomingGarbageReadout } from './IncomingGarbageReadout';
import DesktopKeyboardLegend from './DesktopKeyboardLegend';
import { fieldFrameClass, fieldTitleClass } from '../ui/shapeShowdownTheme';

function WaitingForOpponentBoard() {
  const cell = useContext(PlayfieldCellSizeContext);
  return (
    <div className="relative shrink-0">
      <div className="mb-2">
        <h2 className={`text-[11px] font-bold uppercase tracking-[0.08em] ${fieldTitleClass('opponent')}`}>Opponent Field</h2>
        <IncomingGarbageReadout fieldTitle="Opponent Field" lines={0} />
      </div>
      <div
        className="mx-auto flex items-center justify-center rounded-xl border-2 border-[var(--ss-opponent-border)] bg-[var(--ss-panel-well)]"
        style={{ width: BOARD_COLS * cell, height: BOARD_VISIBLE_ROWS * cell }}
      >
          <p className="ss-opponent-waiting-text animate-pulse px-4 text-center text-[8px] font-bold">Waiting for opponent…</p>
      </div>
    </div>
  );
}

interface PlayfieldShellProps {
  mobilePlayfieldRef: React.RefObject<HTMLDivElement | null>;
  mobileBoardFitRef: React.RefObject<HTMLDivElement | null>;
  railRef: React.RefObject<HTMLDivElement | null>;
  mobileCellSize: number;
  myMobileFieldRef: React.RefObject<GameFieldRef | null>;
  myDesktopFieldRef: React.RefObject<GameFieldRef | null>;
  oppDesktopFieldRef: React.RefObject<GameFieldRef | null>;
  hatchingEnabled: boolean;
  decorationSeed: number;
  faceGrowthStartedAtMs: number | null;
  isDesktopLayout: boolean;
  onToggleHatching?: () => void;
}

export const PlayfieldShell: React.FC<PlayfieldShellProps> = ({
  mobilePlayfieldRef,
  mobileBoardFitRef,
  railRef,
  mobileCellSize,
  myMobileFieldRef,
  myDesktopFieldRef,
  oppDesktopFieldRef,
  hatchingEnabled,
  decorationSeed,
  faceGrowthStartedAtMs,
  isDesktopLayout,
  onToggleHatching,
}) => {
  const [isTabletLayout, setIsTabletLayout] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 661px)').matches
  ));
  const playfield = usePlayfieldSnapshot();
  const chrome = useMatchChromeSnapshot();
  const handleShopConfirm = useShopConfirm();
  const { myPlayer, opponentPlayer } = playfield;

  const shopOffers = useMemo(() => resolveShopOffers(chrome.shopOfferIds), [chrome.shopOfferIds]);
  const purchasedItem = useMemo(() => {
    if (!chrome.shopLastPurchasedItemId) return null;
    return SHOP_ITEM_BY_ID.get(chrome.shopLastPurchasedItemId) ?? null;
  }, [chrome.shopLastPurchasedItemId]);

  const isItemDisabled = useMemo(() => (item: (typeof shopOffers)[number]) => {
    if (item.id === 'storage-toxin') return !opponentPlayer?.holdPiece;
    if (item.id === 'bounty-tax') return chrome.oppFunds <= chrome.myFunds;
    if (item.id === 'wildcard-four') {
      return !opponentPlayer?.poisonBoard?.some((row) => row.some((cell) => cell > 0));
    }
    return false;
  }, [chrome.myFunds, chrome.oppFunds, opponentPlayer]);

  const shopCanPurchase = chrome.shopPhase === 'cycling' || chrome.shopPhase === 'ready';
  const isPlaying = playfield.status === 'playing';

  useEffect(() => {
    const query = window.matchMedia('(min-width: 661px)');
    const update = () => setIsTabletLayout(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const compactViewportMode = isTabletLayout ? 'tablet' : 'phone';

  return (
    <>
      {!isDesktopLayout && (
      <div className="relative min-h-0 w-full flex-1">
        <div
          ref={mobilePlayfieldRef}
          className="mx-auto grid h-full w-full max-w-[430px] grid-cols-[minmax(0,1fr)_6rem] items-stretch gap-1.5 overflow-visible pb-2 min-[661px]:max-w-[820px] min-[661px]:grid-cols-[minmax(0,1fr)_13.125rem] min-[661px]:gap-3"
        >
          <div className={`h-full min-h-0 min-w-0 overflow-visible border ${fieldFrameClass('self')} p-1.5 min-[661px]:p-2`}>
            {myPlayer && (
              <BoardProfiler id="mobile-player-field" renderer="board-canvas">
                <GameField
                  ref={myMobileFieldRef}
                  player={myPlayer}
                  isMe={true}
                  title="Your Field"
                  fieldRole="self"
                  cellSize={mobileCellSize}
                  boardFitRef={mobileBoardFitRef}
                  status={playfield.status}
                  hatchingEnabled={hatchingEnabled}
                  decorationSeed={decorationSeed}
                  faceGrowthStartedAtMs={faceGrowthStartedAtMs}
                  performanceId="mobile-player-field"
                />
              </BoardProfiler>
            )}
          </div>
          <div
            ref={railRef}
            className="shop-utility-rail flex max-h-full min-h-0 min-w-0 flex-col gap-2 overflow-y-auto"
          >
            <OpponentMiniField
              player={opponentPlayer}
              hatchingEnabled={hatchingEnabled}
              viewportMode={compactViewportMode}
            />
            <ShopRail
              items={shopOffers}
              isPlaying={isPlaying}
              canPurchase={shopCanPurchase}
              cycleIndex={chrome.shopCycleIndex}
              shopPhase={chrome.shopPhase}
              purchasedItem={purchasedItem}
              onConfirm={handleShopConfirm}
              availableFunds={chrome.availableFunds}
              pricing={chrome.shopPricing}
              currentTick={chrome.tick}
              isItemDisabled={isItemDisabled}
              viewportMode={compactViewportMode}
              hatchingEnabled={hatchingEnabled}
              onToggleHatching={onToggleHatching}
            />
          </div>
        </div>
      </div>
      )}

      {isDesktopLayout && (
      <div className="min-h-0 w-full flex-1">
        <PlayfieldLayout>
          <div className="flex min-h-0 shrink-0 flex-col gap-2">
            <ShopRail
                  items={shopOffers}
                  isPlaying={isPlaying}
                  canPurchase={shopCanPurchase}
                  cycleIndex={chrome.shopCycleIndex}
                  shopPhase={chrome.shopPhase}
                  purchasedItem={purchasedItem}
                  onConfirm={handleShopConfirm}
                  availableFunds={chrome.availableFunds}
                  pricing={chrome.shopPricing}
                  currentTick={chrome.tick}
                  isItemDisabled={isItemDisabled}
                  viewportMode="desktop"
                  hatchingEnabled={hatchingEnabled}
                  onToggleHatching={onToggleHatching}
            />
            <DesktopKeyboardLegend />
          </div>
          {myPlayer && (
            <div className={`min-w-0 overflow-visible border ${fieldFrameClass('self')} p-2`}>
              <BoardProfiler id="desktop-player-field" renderer="board-canvas">
                <GameField
                  ref={myDesktopFieldRef}
                  player={myPlayer}
                  isMe={true}
                  title="Your Field"
                  fieldRole="self"
                  status={playfield.status}
                  hatchingEnabled={hatchingEnabled}
                  decorationSeed={decorationSeed}
                  faceGrowthStartedAtMs={faceGrowthStartedAtMs}
                  performanceId="desktop-player-field"
                />
              </BoardProfiler>
            </div>
          )}

          <div className={`relative min-w-0 overflow-visible border ${fieldFrameClass('opponent')} p-2`}>
            {opponentPlayer ? (
              <BoardProfiler id="desktop-opponent-field" renderer="board-canvas">
                <GameField
                  ref={oppDesktopFieldRef}
                  player={opponentPlayer}
                  isMe={false}
                  title="Opponent Field"
                  fieldRole="opponent"
                  status={playfield.status}
                  hatchingEnabled={hatchingEnabled}
                  decorationSeed={decorationSeed}
                  faceGrowthStartedAtMs={faceGrowthStartedAtMs}
                  performanceId="desktop-opponent-field"
                />
              </BoardProfiler>
            ) : (
              <WaitingForOpponentBoard />
            )}
          </div>
        </PlayfieldLayout>
      </div>
      )}
    </>
  );
};
