import './BattleLayout.css';
import React, { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GameField, { GameFieldRef } from './GameField';
import ShopRail from './ShopRail';
import OpponentMiniField from './OpponentMiniField';
import { PlayfieldCellSizeContext } from './playfieldCellSizeContext';
import { fitMobilePlayfieldCellSize } from './PlayfieldCellSizer';
import { BOARD_COLS, BOARD_VISIBLE_ROWS, CELL_SIZE } from '../types';
import { resolveShopOffers, SHOP_ITEM_BY_ID } from '../shop/shopCatalog';
import {
  useMatchChromeSnapshot,
  usePlayfieldSnapshot,
  useShopPricingTick,
} from '../state/GameStateProvider';
import { useShopConfirm } from '../hooks/useShopConfirm';
import { BoardProfiler } from '../performance/BoardProfiler';
import { IncomingGarbageReadout } from './IncomingGarbageReadout';
import DesktopKeyboardLegend from './DesktopKeyboardLegend';
import { fieldFrameClass, fieldTitleClass } from '../ui/shapeShowdownTheme';
import {
  type PlayfieldLayoutMode,
} from '../responsive/playfieldLayoutMode';
import type { PublicPlayerState } from '../state/publicSnapshots';
import type { ShopItem } from '../types';

function WaitingForOpponentBoard({ cell }: { cell: number }) {
  return (
    <div className="relative shrink-0">
      <div className="mb-1">
        <h2 className={`text-sm font-bold uppercase tracking-widest ${fieldTitleClass('opponent')}`}>Opponent Field</h2>
        <div className="mb-1 flex items-center font-mono text-[10px] font-bold text-[var(--ss-text-tertiary)]">
          <span className="truncate tracking-wide">Searching for opponent…</span>
        </div>
        <div className="mb-1 flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ss-text-tertiary)]">
          <span>Score <strong className="text-[var(--ss-opponent-strong)]">0</strong></span>
        </div>
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

interface BattleShopRailProps {
  railRef: React.RefObject<HTMLDivElement | null>;
  layoutMode: PlayfieldLayoutMode;
  isPlaying: boolean;
  opponentPlayer: PublicPlayerState | null;
  hatchingEnabled: boolean;
  onToggleHatching?: () => void;
}

/** Isolated shop host — does not subscribe to playfield, so soft-drop Y churn skips arsenal DOM. */
const BattleShopRail = memo(function BattleShopRail({
  railRef,
  layoutMode,
  isPlaying,
  opponentPlayer,
  hatchingEnabled,
  onToggleHatching,
}: BattleShopRailProps) {
  const chrome = useMatchChromeSnapshot();
  const shopTick = useShopPricingTick();
  const handleShopConfirm = useShopConfirm();
  const isDesktop = layoutMode === 'desktop';

  const shopOffers = useMemo(() => resolveShopOffers(chrome.shopOfferIds), [chrome.shopOfferIds]);
  const purchasedItem = useMemo(() => {
    if (!chrome.shopLastPurchasedItemId) return null;
    return SHOP_ITEM_BY_ID.get(chrome.shopLastPurchasedItemId) ?? null;
  }, [chrome.shopLastPurchasedItemId]);

  const getItemDisabledReason = useMemo(() => (item: ShopItem) => {
    if (item.id === 'storage-toxin' && !opponentPlayer?.opponentHasHold) {
      return 'Opponent needs a stored piece';
    }
    if (item.id === 'wildcard-four') {
      if (!opponentPlayer?.opponentHasPoison) return 'Opponent needs poisoned cells';
      if (opponentPlayer.poisonSpread != null) return 'Wait for poison to finish spreading';
    }
    return null;
  }, [opponentPlayer]);
  const isItemDisabled = useMemo(() => (item: ShopItem) =>
    getItemDisabledReason(item) !== null, [getItemDisabledReason]);

  const shopCanPurchase = chrome.shopPhase !== 'waiting';

  return (
    <div
      ref={railRef}
      className="battle-shop flex min-h-0 min-w-0 flex-col gap-2 [grid-area:shop]"
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
        currentTick={shopTick}
        isItemDisabled={isItemDisabled}
        getItemDisabledReason={getItemDisabledReason}
        viewportMode={layoutMode}
        hatchingEnabled={hatchingEnabled}
        onToggleHatching={onToggleHatching}
      />
      {isDesktop && <DesktopKeyboardLegend />}
    </div>
  );
});

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
  const opponentBoardFitRef = useRef<HTMLDivElement>(null);
  const [opponentCellSize, setOpponentCellSize] = useState(CELL_SIZE);
  const playfield = usePlayfieldSnapshot();
  const { myPlayer, opponentPlayer } = playfield;
  const isDesktop = layoutMode === 'desktop';
  const hasLocalPlayer = myPlayer !== null;
  const hasOpponentPlayer = opponentPlayer !== null;
  const isPlaying = playfield.status === 'playing';

  useLayoutEffect(() => {
    const playfieldLayout = playfieldRef.current;
    const slot = boardFitRef.current;
    const opponentSlot = opponentBoardFitRef.current;
    if (!playfieldLayout || !slot) return;

    const measure = () => {
      const box = slot.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) return;
      const next = fitMobilePlayfieldCellSize({ width: box.width, height: box.height });
      setCellSize((previous) => (previous === next ? previous : next));
      if (opponentSlot) {
        const opponentBox = opponentSlot.getBoundingClientRect();
        if (opponentBox.width >= 8 && opponentBox.height >= 8) {
          const opponentNext = fitMobilePlayfieldCellSize(opponentBox);
          setOpponentCellSize((previous) => previous === opponentNext ? previous : opponentNext);
        }
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    // Observe the stable layout owner only — observing the fit slot can feedback
    // when cellSize changes resize the slot on phone.
    observer.observe(playfieldLayout);
    return () => observer.disconnect();
  }, [hasLocalPlayer, hasOpponentPlayer, layoutMode]);

  const boardFramePadding = layoutMode === 'phone' ? 'p-1.5' : 'p-2';

  return (
    <PlayfieldCellSizeContext.Provider value={cellSize}>
      <div className="battle-layout-owner">
        <div
          ref={playfieldRef}
          data-playfield-layout={layoutMode}
          className={`battle-layout battle-layout--${layoutMode}`}
        >
          <div
            className={`battle-board min-h-0 min-w-0 overflow-visible border ${fieldFrameClass('self')} ${boardFramePadding} [grid-area:board]`}
          >
            {myPlayer && (
              <BoardProfiler id="local-player-field" renderer="board-canvas">
                <GameField
                  key={matchVisualKey}
                  ref={myFieldRef}
                  player={myPlayer}
                  isMe={true}
                  showEffectReadout
                  compactEffectReadout={layoutMode === 'phone'}
                  showPlayerName={false}
                  showFunds={false}
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
                    showLineClears={false}
                    showFunds={false}
                    fieldRole="opponent"
                    cellSize={opponentCellSize}
                    boardFitRef={opponentBoardFitRef}
                    showEffectReadout
                    compactEffectReadout
                    status={playfield.status}
                    hatchingEnabled={hatchingEnabled}
                    decorationSeed={decorationSeed}
                    faceGrowthStartedAtMs={faceGrowthStartedAtMs}
                    performanceId="desktop-opponent-field"
                  />
                </BoardProfiler>
              ) : (
                <WaitingForOpponentBoard cell={opponentCellSize} />
              )
            ) : (
              <OpponentMiniField
                player={opponentPlayer}
                hatchingEnabled={hatchingEnabled}
                viewportMode={layoutMode === 'tablet' ? 'tablet' : 'phone'}
              />
            )}
          </div>

          <BattleShopRail
            railRef={railRef}
            layoutMode={layoutMode}
            isPlaying={isPlaying}
            opponentPlayer={opponentPlayer}
            hatchingEnabled={hatchingEnabled}
            onToggleHatching={onToggleHatching}
          />
        </div>
      </div>
    </PlayfieldCellSizeContext.Provider>
  );
};
