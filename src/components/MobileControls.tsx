import React, { useLayoutEffect, useRef } from 'react';

interface MobileControlsProps {
  onInput: (input: { left: boolean; right: boolean; softDrop: boolean }) => void;
  onAction: (action: 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold') => void;
  onShopPress?: () => void;
  onHeightChange?: (height: number) => void;
}

const MobileControls: React.FC<MobileControlsProps> = ({ onInput, onAction, onShopPress, onHeightChange }) => {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!onHeightChange || !rootRef.current) return;
    const node = rootRef.current;
    const report = () => onHeightChange(Math.ceil(node.getBoundingClientRect().height));
    report();
    const ro = new ResizeObserver(report);
    ro.observe(node);
    return () => ro.disconnect();
  }, [onHeightChange]);

  const stop = (e: React.TouchEvent) => {
    e.preventDefault();
  };

  const holdInput = (input: { left: boolean; right: boolean; softDrop: boolean }) => (e: React.TouchEvent) => {
    stop(e);
    onInput(input);
  };

  const releaseInput = (e: React.TouchEvent) => {
    stop(e);
    onInput({ left: false, right: false, softDrop: false });
  };

  const tapAction = (action: 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold') => (e: React.TouchEvent) => {
    stop(e);
    onAction(action);
  };

  const tapShop = (e: React.TouchEvent) => {
    stop(e);
    onShopPress?.();
  };

  return (
    <div ref={rootRef} className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="mx-auto flex w-full max-w-md items-end justify-between gap-3 px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 grid-rows-2 gap-2">
          <div />
          <button
            className="h-14 w-14 rounded-full border-2 border-emerald-300/70 bg-emerald-500/20 text-xl font-black text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95 active:bg-emerald-500/40"
            onTouchStart={tapAction('hardDrop')}
          >
            ↑
          </button>
          <div />
          <button
            className="h-14 w-14 rounded-full border-2 border-yellow-300/90 bg-yellow-400/25 text-2xl font-black text-yellow-100 shadow-[0_0_22px_rgba(250,204,21,0.35)] active:scale-95 active:bg-yellow-400/45"
            onTouchStart={holdInput({ left: true, right: false, softDrop: false })}
            onTouchEnd={releaseInput}
            onTouchCancel={releaseInput}
          >
            ←
          </button>
          <button
            className="h-14 w-14 rounded-full border-2 border-sky-300/70 bg-sky-500/20 text-xl font-black text-sky-100 shadow-[0_0_20px_rgba(56,189,248,0.35)] active:scale-95 active:bg-sky-500/40"
            onTouchStart={holdInput({ left: false, right: false, softDrop: true })}
            onTouchEnd={releaseInput}
            onTouchCancel={releaseInput}
          >
            ↓
          </button>
          <button
            className="h-14 w-14 rounded-full border-2 border-yellow-300/90 bg-yellow-400/25 text-2xl font-black text-yellow-100 shadow-[0_0_22px_rgba(250,204,21,0.35)] active:scale-95 active:bg-yellow-400/45"
            onTouchStart={holdInput({ left: false, right: true, softDrop: false })}
            onTouchEnd={releaseInput}
            onTouchCancel={releaseInput}
          >
            →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="h-14 w-14 rounded-full border-2 border-fuchsia-300/70 bg-fuchsia-500/20 text-[10px] font-extrabold tracking-wide text-fuchsia-100 shadow-[0_0_18px_rgba(217,70,239,0.35)] active:scale-95 active:bg-fuchsia-500/45"
            onTouchStart={tapAction('hold')}
          >
            STORAGE
          </button>
          <button
            className="h-14 w-14 rounded-full border-2 border-cyan-300/70 bg-cyan-500/20 text-[10px] font-extrabold tracking-wide text-cyan-100 shadow-[0_0_18px_rgba(56,189,248,0.35)] active:scale-95 active:bg-cyan-500/45"
            onTouchStart={tapShop}
          >
            SHOP
          </button>
          <button
            className="h-14 w-14 rounded-full border-2 border-amber-300/80 bg-amber-500/20 text-xs font-extrabold tracking-wide text-amber-100 shadow-[0_0_18px_rgba(245,158,11,0.35)] active:scale-95 active:bg-amber-500/45"
            onTouchStart={tapAction('rotateCCW')}
          >
            CCW
          </button>
          <button
            className="h-14 w-14 rounded-full border-2 border-amber-300/80 bg-amber-500/20 text-xs font-extrabold tracking-wide text-amber-100 shadow-[0_0_18px_rgba(245,158,11,0.35)] active:scale-95 active:bg-amber-500/45"
            onTouchStart={tapAction('rotateCW')}
          >
            CW
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(MobileControls);
