import React, { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GameField, { GameFieldRef } from './GameField';
import OpponentMiniField from './OpponentMiniField';
import ShopRail from './ShopRail';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';
import { fitMobilePlayfieldCellSize } from './PlayfieldCellSizer';
import { BOARD_COLS, BOARD_VISIBLE_ROWS, CELL_SIZE } from '../types';
import { resolveShopOffers, SHOP_ITEM_BY_ID } from '../shop/shopCatalog';
import { useMatchChromeSnapshot, usePlayfieldSnapshot } from '../state/GameStateProvider';
import { useShopConfirm } from '../hooks/useShopConfirm';
import { BoardProfiler } from '../performance/BoardProfiler';
import { IncomingGarbageReadout } from './IncomingGarbageReadout';
import DesktopKeyboardLegend from './DesktopKeyboardLegend';
import { fieldFrameClass, fieldTitleClass } from '../ui/shapeShowdownTheme';
import { useThemePackage } from '../presentation/ThemeProvider';
import { SHRINE_PAD_PX } from '../board/shrineLayout';
import {
  playfieldGridClass,
  type PlayfieldLayoutMode,
} from '../responsive/playfieldLayoutMode';

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
  railRef: React.RefObject<HTMLDivElement | null>;
  myFieldRef: React.RefObject<GameFieldRef | null>;
  oppDesktopFieldRef: React.RefObject<GameFieldRef | null>;
  hatchingEnabled: boolean;
  decorationSeed: number;
  faceGrowthStartedAtMs: number | null;
  matchVisualKey: string;
  layoutMode: PlayfieldLayoutMode;
  onToggleHatching?: () => void;
}

export const PlayfieldShell: React.FC<PlayfieldShellProps> = ({
  railRef,
  myFieldRef,
  oppDesktopFieldRef,
  hatchingEnabled,
  decorationSeed,
  faceGrowthStartedAtMs,
  matchVisualKey,
  layoutMode,
  onToggleHatching,
}) => {
  const playfieldRef = useRef<HTMLDivElement>(null);
  const boardFitRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(CELL_SIZE);
  const theme = useThemePackage();
  const shrinePadPx = theme.shrine === 'watching-amalgam' ? SHRINE_PAD_PX : 0;
  const playfield = usePlayfieldSnapshot();
  const chrome = useMatchChromeSnapshot();
  const handleShopConfirm = useShopConfirm();
  const { myPlayer, opponentPlayer } = playfield;
  const isDesktop = layoutMode === 'desktop';
  const hasLocalPlayer = myPlayer !== null;

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

  useLayoutEffect(() => {
    const playfieldLayout = playfieldRef.current;
    const slot = boardFitRef.current;
    if (!playfieldLayout || !slot) return;

    const measure = () => {
      const box = slot.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) return;
      const next = fitMobilePlayfieldCellSize(
        { width: box.width, height: box.height },
        shrinePadPx,
      );
      setCellSize((previous) => (previous === next ? previous : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(playfieldLayout);
    return () => observer.disconnect();
  }, [hasLocalPlayer, layoutMode, shrinePadPx]);

  const boardFramePadding = layoutMode === 'phone' ? 'p-1.5' : 'p-2';

  return (
    <PlayfieldCellSizeContext.Provider value={cellSize}>
      <div className="relative min-h-0 w-full flex-1">
        <div
          ref={playfieldRef}
          data-playfield-layout={layoutMode}
          className={playfieldGridClass(layoutMode)}
        >
          <div
            className={`min-h-0 min-w-0 overflow-visible border ${fieldFrameClass('self')} ${boardFramePadding} [grid-area:board]`}
          >
            {myPlayer && (
              <BoardProfiler id="local-player-field" renderer="board-canvas">
                <GameField
                  key={matchVisualKey}
                  ref={myFieldRef}
                  player={myPlayer}
                  isMe={true}
                  title="Your Field"
                  fieldRole="self"
                  cellSize={cellSize}
                  boardFitRef={boardFitRef}
                  status={playfield.status}
                  hatchingEnabled={hatchingEnabled}
                  decorationSeed={decorationSeed}
                  faceGrowthStartedAtMs={faceGrowthStartedAtMs}
                  performanceId="local-player-field"
                />
              </BoardProfiler>
            )}
          </div>

          <div
            className={`min-h-0 min-w-0 overflow-visible [grid-area:opponent] ${
              isDesktop ? `border ${fieldFrameClass('opponent')} p-2` : ''
            }`}
          >
            {isDesktop ? (
              opponentPlayer ? (
                <BoardProfiler id="desktop-opponent-field" renderer="board-canvas">
                  <GameField
                    key={matchVisualKey}
                    ref={oppDesktopFieldRef}
                    player={opponentPlayer}
                    isMe={false}
                    title="Opponent Field"
                    fieldRole="opponent"
                    cellSize={cellSize}
                    status={playfield.status}
                    hatchingEnabled={hatchingEnabled}
                    decorationSeed={decorationSeed}
                    faceGrowthStartedAtMs={faceGrowthStartedAtMs}
                    performanceId="desktop-opponent-field"
                  />
                </BoardProfiler>
              ) : (
                <WaitingForOpponentBoard />
              )
            ) : (
              <OpponentMiniField
                key={matchVisualKey}
                player={opponentPlayer}
                hatchingEnabled={hatchingEnabled}
                viewportMode={layoutMode === 'tablet' ? 'tablet' : 'phone'}
              />
            )}
          </div>

          <div
            ref={railRef}
            className={`flex min-h-0 min-w-0 flex-col gap-2 [grid-area:shop] ${
              isDesktop ? '' : 'shop-utility-rail overflow-y-auto'
            }`}
          >
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
              viewportMode={layoutMode}
              hatchingEnabled={hatchingEnabled}
              onToggleHatching={onToggleHatching}
            />
            {isDesktop && <DesktopKeyboardLegend />}
          </div>
        </div>
      </div>
    </PlayfieldCellSizeContext.Provider>
  );
};
