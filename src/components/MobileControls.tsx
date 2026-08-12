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

  const movementButtonClass = 'h-[46px] w-[46px] select-none touch-none rounded-full border bg-[#1b1e1e] text-lg font-black text-zinc-200 [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] active:bg-[#2a2f2f] min-[661px]:h-[56px] min-[661px]:w-[56px] min-[661px]:text-2xl';
  const actionButtonClass = 'h-[52px] w-[52px] select-none touch-none rounded-full border bg-[#1b1e1e] text-[8px] font-extrabold tracking-wide text-zinc-200 [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] active:bg-[#2a2f2f] min-[661px]:h-[62px] min-[661px]:w-[62px] min-[661px]:text-[10px]';

  return (
    <div
      ref={rootRef}
      onContextMenu={(e) => e.preventDefault()}
      className="relative z-10 mt-auto shrink-0 select-none touch-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] min-[901px]:hidden"
    >
      <div className="mx-auto flex min-h-[108px] w-full max-w-[460px] items-end justify-between gap-3 px-1.5 pt-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] min-[661px]:min-h-[164px] min-[661px]:max-w-[660px] min-[661px]:gap-5 min-[661px]:px-6 min-[661px]:pt-3.5">
        <div className="grid grid-cols-3 grid-rows-2 gap-[5px] min-[661px]:gap-[10px]">
          <div />
          <button
            type="button"
            className={`${movementButtonClass} border-[#748e86] text-emerald-100`}
            onTouchStart={tapAction('hardDrop')}
          >
            ↑
          </button>
          <div />
          <button
            type="button"
            className={`${movementButtonClass} border-[#6b7061]`}
            onTouchStart={holdInput({ left: true, right: false, softDrop: false })}
            onTouchEnd={releaseInput}
            onTouchCancel={releaseInput}
          >
            ←
          </button>
          <button
            type="button"
            className={`${movementButtonClass} border-[#748e86] text-cyan-100`}
            onTouchStart={holdInput({ left: false, right: false, softDrop: true })}
            onTouchEnd={releaseInput}
            onTouchCancel={releaseInput}
          >
            ↓
          </button>
          <button
            type="button"
            className={`${movementButtonClass} border-[#6b7061]`}
            onTouchStart={holdInput({ left: false, right: true, softDrop: false })}
            onTouchEnd={releaseInput}
            onTouchCancel={releaseInput}
          >
            →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-[5px] min-[661px]:gap-x-4 min-[661px]:gap-y-3">
          <button
            type="button"
            className={`${actionButtonClass} border-[#745d7d]`}
            onTouchStart={tapAction('hold')}
          >
            STORAGE
          </button>
          <button
            type="button"
            className={`${actionButtonClass} border-[#557984]`}
            onTouchStart={tapShop}
          >
            SHOP
          </button>
          <button
            type="button"
            className={`${actionButtonClass} border-[#907b59]`}
            onTouchStart={tapAction('rotateCCW')}
          >
            CCW
          </button>
          <button
            type="button"
            className={`${actionButtonClass} border-[#907b59]`}
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
