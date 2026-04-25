import React from 'react';
import { ShopItem } from '../types';

interface ShopRailProps {
  items: ShopItem[];
  isPlaying: boolean;
  canPurchase: boolean;
  cycleIndex: number;
  shopPhase: 'waiting' | 'ready' | 'cycling' | 'expired';
  purchasedItem: ShopItem | null;
  availableScore: number;
  onConfirm: () => void;
  viewportMode: 'mobile' | 'tabletDesktop';
}

const ShopRail: React.FC<ShopRailProps> = ({
  items,
  isPlaying,
  canPurchase,
  cycleIndex,
  shopPhase,
  purchasedItem,
  availableScore,
  onConfirm,
  viewportMode,
}) => {
  const isTabletDesktop = viewportMode === 'tabletDesktop';
  const railWidthClass = isTabletDesktop ? 'w-[7rem]' : 'w-[5.75rem]';
  const iconRowClass = isTabletDesktop ? 'h-9 px-2' : 'h-8 px-1.5';
  const bodyTextClass = isTabletDesktop ? 'text-[9px]' : 'text-[8px]';
  const iconClass = isTabletDesktop ? 'text-lg' : 'text-base';

  const isWaiting = !isPlaying || shopPhase === 'waiting';
  const isReady = isPlaying && shopPhase === 'ready';
  const isCycling = isPlaying && shopPhase === 'cycling';
  const isExpired = isPlaying && shopPhase === 'expired';

  return (
    <div className={`${railWidthClass} select-none ${isWaiting ? 'opacity-70 saturate-50' : ''}`}>
      <div className={`rounded-lg border border-cyan-500/30 bg-[#10161b]/90 shadow-xl backdrop-blur ${isTabletDesktop ? 'p-2' : 'p-1.5'}`}>
        <div className="mb-1 flex items-center justify-between">
          <p className={`${bodyTextClass} font-bold uppercase tracking-[0.2em] text-cyan-300/85`}>Shop</p>
          {isExpired && isPlaying ? (
            <span className={`${bodyTextClass} rounded bg-amber-500/20 px-1 py-0.5 font-mono text-amber-200`}>WAIT</span>
          ) : (
            <span className={`${bodyTextClass} rounded bg-cyan-500/15 px-1 py-0.5 font-mono text-cyan-100`}>{items.length}</span>
          )}
        </div>
        <div className={`mb-1 flex h-8 items-center justify-center rounded border transition-all duration-300 ${
          purchasedItem
            ? 'bg-[linear-gradient(90deg,#ff0000,#ff7f00,#ffff00,#00ff00,#0000ff,#4b0082,#9400d3,#ff0000)] bg-[length:200%_auto] animate-[rainbow-bg_3s_linear_infinite] border-transparent shadow-[0_0_12px_rgba(255,255,255,0.3)]'
            : 'border-cyan-500/25 bg-cyan-950/30'
        }`}>
          {purchasedItem ? (
            <span className="text-xl drop-shadow-md" title={purchasedItem.name}>{purchasedItem.icon}</span>
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-600/50">Empty</span>
          )}
        </div>

        <div className="relative">
          <div className={`${isTabletDesktop ? 'max-h-[16rem]' : 'max-h-[13rem]'} space-y-1 overflow-y-auto pr-0.5`}>
            {items.map((item, idx) => {
              const canAfford = availableScore >= item.cost;
              const isHighlighted = isCycling && idx === cycleIndex;
              const disabled = isWaiting || !canAfford;
              return (
                <div
                  key={item.id}
                  className={`relative flex w-full items-center justify-between border-2 transition-all duration-200 ${iconRowClass} ${
                    isHighlighted && canAfford
                      ? '!text-amber-200 !border-amber-400 bg-gradient-to-r from-amber-950/90 to-black shadow-[3px_3px_0px_#d97706] scale-[1.06] -translate-y-0.5 z-10 font-bold'
                      : `${item.colorClass} ${item.borderColorClass} ${disabled ? 'opacity-40 grayscale' : 'opacity-95'}`
                  } ${isHighlighted && !canAfford ? 'ring-2 ring-rose-400/60 z-10 scale-[1.02]' : ''}`}
                >
                  <span className={`${iconClass} leading-none`}>{item.icon}</span>
                  <span className={`font-mono ${bodyTextClass} ${disabled ? 'text-zinc-400' : 'text-zinc-100'}`}>
                    {item.cost}
                  </span>
                </div>
              );
            })}
          </div>

          {isWaiting && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded border border-white/10 bg-black/55">
              <span className={`rounded bg-zinc-900/90 px-1.5 py-0.5 font-mono ${bodyTextClass} uppercase tracking-wider text-zinc-300`}>
                {isPlaying ? 'Wait Line Clear' : 'Locked'}
              </span>
            </div>
          )}
        </div>

        {(isCycling || isReady) && canPurchase && (
          <button
            type="button"
            onClick={onConfirm}
            className="mt-1 w-full rounded border border-cyan-400/50 bg-cyan-500/20 px-2 py-1 text-center font-mono text-[9px] uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-500/35 active:scale-95"
          >
            {isReady ? 'Start' : 'Confirm'}
          </button>
        )}
      </div>
    </div>
  );
};

export default ShopRail;
