import React, { useLayoutEffect, useRef } from 'react';
import { Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, RotateCw, ShoppingBag } from 'lucide-react';

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

  const controlButtonClass =
    'mobile-touch-control-button inline-flex h-[52px] w-[52px] shrink-0 select-none touch-none items-center justify-center rounded-full border border-[var(--ss-control-border)] bg-[var(--ss-control-fill)] text-[var(--ss-control-text)] [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] active:bg-[var(--ss-control-fill-active)] min-[661px]:h-[58px] min-[661px]:w-[58px]';
  const controlIconClass = 'h-5 w-5 min-[661px]:h-6 min-[661px]:w-6';

  return (
    <div
      ref={rootRef}
      onContextMenu={(e) => e.preventDefault()}
      className="mobile-touch-controls relative z-10 mt-auto shrink-0 select-none touch-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
    >
      <div className="mobile-touch-controls-inner mx-auto flex min-h-[108px] w-full max-w-[460px] items-end justify-between gap-3 px-1.5 pt-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] min-[661px]:min-h-[164px] min-[661px]:max-w-[660px] min-[661px]:gap-5 min-[661px]:px-6 min-[661px]:pt-3.5">
        <div className="mobile-touch-control-grid grid grid-cols-3 grid-rows-2 gap-[6px] min-[661px]:gap-[10px]">
          <div />
          <button
            type="button"
            aria-label="Hard drop"
            className={`${controlButtonClass} border-[#748e86] text-emerald-100`}
            onTouchStart={tapAction('hardDrop')}
          >
            <ArrowUp className={controlIconClass} strokeWidth={2.5} />
          </button>
          <div />
          <button
            type="button"
            aria-label="Move left"
            className={controlButtonClass}
            onTouchStart={holdInput({ left: true, right: false, softDrop: false })}
            onTouchEnd={releaseInput}
            onTouchCancel={releaseInput}
          >
            <ArrowLeft className={controlIconClass} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Soft drop"
            className={`${controlButtonClass} border-[#748e86] text-cyan-100`}
            onTouchStart={holdInput({ left: false, right: false, softDrop: true })}
            onTouchEnd={releaseInput}
            onTouchCancel={releaseInput}
          >
            <ArrowDown className={controlIconClass} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Move right"
            className={controlButtonClass}
            onTouchStart={holdInput({ left: false, right: true, softDrop: false })}
            onTouchEnd={releaseInput}
            onTouchCancel={releaseInput}
          >
            <ArrowRight className={controlIconClass} strokeWidth={2.5} />
          </button>
        </div>
        <div className="mobile-touch-control-grid grid grid-cols-2 gap-[6px] min-[661px]:gap-[10px]">
          <button
            type="button"
            aria-label="Storage"
            className={`${controlButtonClass} border-[#745d7d] text-fuchsia-100`}
            onTouchStart={tapAction('hold')}
          >
            <Archive className={controlIconClass} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            aria-label="Shop"
            className={`${controlButtonClass} border-[#557984] text-sky-100`}
            onTouchStart={tapShop}
          >
            <ShoppingBag className={controlIconClass} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            aria-label="Rotate counter-clockwise"
            className={`${controlButtonClass} border-[#907b59] text-amber-100`}
            onTouchStart={tapAction('rotateCCW')}
          >
            <RotateCcw className={controlIconClass} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            aria-label="Rotate clockwise"
            className={`${controlButtonClass} border-[#907b59] text-amber-100`}
            onTouchStart={tapAction('rotateCW')}
          >
            <RotateCw className={controlIconClass} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(MobileControls);
