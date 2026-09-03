import React, { useLayoutEffect, useRef } from 'react';
import { Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, RotateCw, ShoppingBag } from 'lucide-react';

interface MobileControlsProps {
  onInput: (input: { left: boolean; right: boolean; softDrop: boolean }) => void;
  onAction: (action: 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold') => void;
  onShopPress?: () => void;
  onRetry?: () => void;
  onHeightChange?: (height: number) => void;
}

const MobileControls: React.FC<MobileControlsProps> = ({ onInput, onAction, onShopPress, onRetry, onHeightChange }) => {
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

  const stop = (e: React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
  };

  const holdInput = (input: { left: boolean; right: boolean; softDrop: boolean }) => (e: React.TouchEvent | React.PointerEvent) => {
    stop(e);
    onInput(input);
  };

  const releaseInput = (e: React.TouchEvent | React.PointerEvent) => {
    stop(e);
    onInput({ left: false, right: false, softDrop: false });
  };

  const isPalmOrEdgeContact = (e: React.PointerEvent | React.TouchEvent): boolean => {
    if ('width' in e && 'height' in e) {
      const pe = e as React.PointerEvent;
      const w = pe.width || 0;
      const h = pe.height || 0;
      // Large contact area (> 45px width/height or > 2000px² footprint) is palm or knuckle flat
      if (w > 45 || h > 45 || (w > 0 && h > 0 && w * h > 2000)) return true;
    }
    return false;
  };

  const isGlancingEdgeContact = (e: React.PointerEvent | React.TouchEvent, target: HTMLElement): boolean => {
    if (!('clientX' in e)) return false;
    const rect = target.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    // Inner 85% safe zone: rejects glancing brushes on outer 7.5% perimeter
    const padX = rect.width * 0.075;
    const padY = rect.height * 0.075;
    return x < rect.left + padX || x > rect.right - padX || y < rect.top + padY || y > rect.bottom - padY;
  };

  const tapHardDrop = (e: React.TouchEvent | React.PointerEvent) => {
    stop(e);
    if (isPalmOrEdgeContact(e)) return;
    if (e.currentTarget instanceof HTMLElement && isGlancingEdgeContact(e, e.currentTarget)) {
      return;
    }
    onAction('hardDrop');
  };

  const tapAction = (action: 'rotateCW' | 'rotateCCW' | 'hold') => (e: React.TouchEvent | React.PointerEvent) => {
    stop(e);
    if (isPalmOrEdgeContact(e)) return;
    onAction(action);
  };

  const tapShop = (e: React.TouchEvent | React.PointerEvent) => {
    stop(e);
    if (isPalmOrEdgeContact(e)) return;
    onShopPress?.();
  };

  const controlButtonBase =
    'mobile-touch-control-button inline-flex h-[56px] w-[56px] min-[380px]:h-[62px] min-[380px]:w-[62px] min-[661px]:h-[68px] min-[661px]:w-[68px] shrink-0 select-none touch-none items-center justify-center rounded-2xl border bg-[var(--ss-control-fill)] text-[var(--ss-control-text)] [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] active:scale-95 active:brightness-125 transition-transform duration-75 shadow-md active:bg-[var(--ss-control-fill-active)]';
  const controlIconClass = 'h-6 w-6 min-[661px]:h-7 min-[661px]:w-7 pointer-events-none';

  return (
    <div
      ref={rootRef}
      onContextMenu={(e) => e.preventDefault()}
      className="mobile-touch-controls relative z-10 mt-auto w-full shrink-0 select-none touch-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
    >
      <div className="mobile-touch-controls-inner mx-auto flex min-h-[120px] w-full max-w-[500px] items-end justify-between gap-3 px-2 sm:px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] min-[661px]:min-h-[164px] min-[661px]:max-w-[660px] min-[661px]:gap-6 min-[661px]:px-6 min-[661px]:pt-3.5">
        {/* Left Thumb Cluster: Movement (D-Pad style) */}
        <div className="mobile-touch-control-grid grid grid-cols-3 grid-rows-2 gap-2 min-[380px]:gap-2.5 min-[661px]:gap-3">
          <div />
          <button
            type="button"
            aria-label="Hard drop"
            className={`${controlButtonBase} border-[#748e86] text-emerald-300 active:border-emerald-400`}
            onPointerDown={tapHardDrop}
          >
            <ArrowUp className={controlIconClass} strokeWidth={2.75} />
          </button>
          <div />
          <button
            type="button"
            aria-label="Move left"
            className={`${controlButtonBase} border-[var(--ss-control-border)] active:border-zinc-300`}
            onPointerDown={holdInput({ left: true, right: false, softDrop: false })}
            onPointerUp={releaseInput}
            onPointerCancel={releaseInput}
            onPointerLeave={releaseInput}
          >
            <ArrowLeft className={controlIconClass} strokeWidth={2.75} />
          </button>
          <button
            type="button"
            aria-label="Soft drop"
            className={`${controlButtonBase} border-[#748e86] text-cyan-300 active:border-cyan-400`}
            onPointerDown={holdInput({ left: false, right: false, softDrop: true })}
            onPointerUp={releaseInput}
            onPointerCancel={releaseInput}
            onPointerLeave={releaseInput}
          >
            <ArrowDown className={controlIconClass} strokeWidth={2.75} />
          </button>
          <button
            type="button"
            aria-label="Move right"
            className={`${controlButtonBase} border-[var(--ss-control-border)] active:border-zinc-300`}
            onPointerDown={holdInput({ left: false, right: true, softDrop: false })}
            onPointerUp={releaseInput}
            onPointerCancel={releaseInput}
            onPointerLeave={releaseInput}
          >
            <ArrowRight className={controlIconClass} strokeWidth={2.75} />
          </button>
        </div>

        {/* Right Thumb Cluster: Actions & Rotations */}
        <div className="mobile-touch-control-grid grid grid-cols-2 gap-2 min-[380px]:gap-2.5 min-[661px]:gap-3">
          <button
            type="button"
            aria-label="Storage"
            className={`${controlButtonBase} border-[#745d7d] text-fuchsia-300 active:border-fuchsia-400`}
            onPointerDown={tapAction('hold')}
          >
            <Archive className={controlIconClass} strokeWidth={2.5} />
          </button>
          {onShopPress ? (
            <button
              type="button"
              aria-label="Shop"
              className={`${controlButtonBase} border-[#557984] text-sky-300 active:border-sky-400`}
              onPointerDown={tapShop}
            >
              <ShoppingBag className={controlIconClass} strokeWidth={2.5} />
            </button>
          ) : onRetry ? (
            <button
              type="button"
              aria-label="Retry"
              className={`${controlButtonBase} border-rose-500/40 text-rose-300 active:border-rose-400`}
              onPointerDown={(e) => {
                stop(e);
                onRetry();
              }}
            >
              <RotateCcw className={controlIconClass} strokeWidth={2.5} />
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            aria-label="Rotate counter-clockwise"
            className={`${controlButtonBase} border-[#907b59] text-amber-300 active:border-amber-400`}
            onPointerDown={tapAction('rotateCCW')}
          >
            <RotateCcw className={controlIconClass} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Rotate clockwise"
            className={`${controlButtonBase} border-[#907b59] text-amber-300 active:border-amber-400`}
            onPointerDown={tapAction('rotateCW')}
          >
            <RotateCw className={controlIconClass} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(MobileControls);
