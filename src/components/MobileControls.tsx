import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, RotateCw, ShoppingBag } from 'lucide-react';
import type { ActionType, InputState } from '../types';
import type {
  GameplayControlAvailability,
  HeldMovementAction,
} from '../input/gameplayControls';
import { isPalmOrEdgeContact } from '../input/touchSafety';

export interface MobileControlsRef {
  clearInput: () => void;
}

interface MobileControlsProps {
  onInput: (input: InputState) => void;
  onAction: (action: ActionType) => void;
  availability: GameplayControlAvailability;
}

const NEUTRAL_INPUT: InputState = { left: false, right: false, softDrop: false };

type DiscreteAction = ActionType;

const MobileControls = React.forwardRef<MobileControlsRef, MobileControlsProps>(({ onInput, onAction, availability }, ref) => {
  const pointerInputsRef = useRef<Map<number, HeldMovementAction>>(new Map());
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const [pressedActions, setPressedActions] = useState<ReadonlySet<HeldMovementAction>>(new Set());

  const clearPointerInputs = useCallback(() => {
    pointerInputsRef.current.clear();
    setPressedActions(new Set());
    onInputRef.current(NEUTRAL_INPUT);
  }, []);

  useImperativeHandle(ref, () => ({ clearInput: clearPointerInputs }), [clearPointerInputs]);

  useEffect(() => {
    window.addEventListener('blur', clearPointerInputs);
    return () => {
      window.removeEventListener('blur', clearPointerInputs);
      clearPointerInputs();
    };
  }, [clearPointerInputs]);

  const emitPointerInput = () => {
    const next: InputState = { ...NEUTRAL_INPUT };
    pointerInputsRef.current.forEach((action) => {
      next[action] = true;
    });
    onInputRef.current(next);
    setPressedActions(new Set(pointerInputsRef.current.values()));
  };

  const stop = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const holdInput = (action: HeldMovementAction) => (event: React.PointerEvent<HTMLButtonElement>) => {
    stop(event);
    pointerInputsRef.current.set(event.pointerId, action);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser has already cancelled the contact.
    }
    emitPointerInput();
  };

  const releaseInput = (event: React.PointerEvent<HTMLButtonElement>) => {
    stop(event);
    if (!pointerInputsRef.current.delete(event.pointerId)) return;
    emitPointerInput();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };


  const activatePointerAction = (action: DiscreteAction) => (event: React.PointerEvent<HTMLButtonElement>) => {
    stop(event);
    if (isPalmOrEdgeContact(event)) return;
    onAction(action);
  };

  const activateClickAction = (action: DiscreteAction) => (event: React.MouseEvent<HTMLButtonElement>) => {
    // Pointer activation happens on pointerdown so a drop cannot be delayed by
    // browser click synthesis. Keyboard activation still arrives as detail 0.
    if (event.detail > 0) return;
    onAction(action);
  };

  const activateShop = (event: React.PointerEvent<HTMLButtonElement>) => {
    stop(event);
    if (isPalmOrEdgeContact(event)) return;
    if (availability.utility.kind === 'shop') availability.utility.onActivate();
  };

  const activateShopClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) return;
    if (availability.utility.kind === 'shop') availability.utility.onActivate();
  };

  const controlButtonBase =
    'mobile-touch-control-button inline-flex h-14 w-14 min-h-[44px] min-w-[44px] shrink-0 select-none touch-none items-center justify-center rounded-2xl border bg-[var(--ss-control-fill)] text-[var(--ss-control-text)] [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] active:scale-95 active:brightness-125 transition-transform duration-75 shadow-md active:bg-[var(--ss-control-fill-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100';
  const controlIconClass = 'h-6 w-6 pointer-events-none';

  const disabledDescription = (id: string, reason: string | undefined) => (
    reason ? <span id={id} className="sr-only">{reason}</span> : null
  );
  const actionButtonProps = (action: DiscreteAction) => {
    const state = action === 'hardDrop'
      ? availability.hardDrop
      : action === 'hold'
        ? availability.hold
        : action === 'rotateCW'
          ? availability.rotateCW
          : availability.rotateCCW;
    const descriptionId = `mobile-control-${action}-reason`;
    return {
      disabled: !state.enabled,
      title: state.disabledReason,
      'aria-describedby': state.disabledReason ? descriptionId : undefined,
      description: disabledDescription(descriptionId, state.disabledReason),
    };
  };

  const hardDrop = actionButtonProps('hardDrop');
  const hold = actionButtonProps('hold');
  const rotateCCW = actionButtonProps('rotateCCW');
  const rotateCW = actionButtonProps('rotateCW');
  const shopState = availability.utility.kind === 'shop' ? availability.utility : null;
  const shopDescriptionId = 'mobile-control-shop-reason';

  return (
    <div
      onContextMenu={(event) => event.preventDefault()}
      className="mobile-touch-controls relative z-10 mt-auto w-full shrink-0 select-none touch-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]"
    >
      <div className="mobile-touch-controls-inner mx-auto flex min-h-[120px] w-full max-w-[500px] items-end justify-between gap-3 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mobile-touch-control-grid mobile-touch-control-grid--movement grid grid-cols-3 grid-rows-2 gap-2">
          <div className="mobile-touch-control-spacer" aria-hidden />
          <button
            type="button"
            aria-label="Hard drop"
            className={`${controlButtonBase} mobile-touch-control--hard-drop border-[#748e86] text-emerald-300 active:border-emerald-400`}
            onPointerDown={activatePointerAction('hardDrop')}
            onClick={activateClickAction('hardDrop')}
            disabled={hardDrop.disabled}
            title={hardDrop.title}
            aria-describedby={hardDrop['aria-describedby']}
          >
            <ArrowUp className={controlIconClass} strokeWidth={2.75} />
          </button>
          {hardDrop.description}
          <div className="mobile-touch-control-spacer" aria-hidden />
          <button
            type="button"
            aria-label="Move left"
            aria-pressed={pressedActions.has('left')}
            data-pressed={pressedActions.has('left')}
            className={`${controlButtonBase} mobile-touch-control--left border-[var(--ss-control-border)] active:border-zinc-300 data-[pressed=true]:border-white data-[pressed=true]:bg-[var(--ss-control-fill-active)]`}
            onPointerDown={holdInput('left')}
            onPointerUp={releaseInput}
            onPointerCancel={releaseInput}
            onLostPointerCapture={releaseInput}
          >
            <ArrowLeft className={controlIconClass} strokeWidth={2.75} />
          </button>
          <button
            type="button"
            aria-label="Soft drop"
            aria-pressed={pressedActions.has('softDrop')}
            data-pressed={pressedActions.has('softDrop')}
            className={`${controlButtonBase} mobile-touch-control--soft-drop border-[#748e86] text-cyan-300 active:border-cyan-400 data-[pressed=true]:border-white data-[pressed=true]:bg-[var(--ss-control-fill-active)]`}
            onPointerDown={holdInput('softDrop')}
            onPointerUp={releaseInput}
            onPointerCancel={releaseInput}
            onLostPointerCapture={releaseInput}
          >
            <ArrowDown className={controlIconClass} strokeWidth={2.75} />
          </button>
          <button
            type="button"
            aria-label="Move right"
            aria-pressed={pressedActions.has('right')}
            data-pressed={pressedActions.has('right')}
            className={`${controlButtonBase} mobile-touch-control--right border-[var(--ss-control-border)] active:border-zinc-300 data-[pressed=true]:border-white data-[pressed=true]:bg-[var(--ss-control-fill-active)]`}
            onPointerDown={holdInput('right')}
            onPointerUp={releaseInput}
            onPointerCancel={releaseInput}
            onLostPointerCapture={releaseInput}
          >
            <ArrowRight className={controlIconClass} strokeWidth={2.75} />
          </button>
        </div>

        <div className="mobile-touch-control-grid mobile-touch-control-grid--actions grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-label="Storage"
            className={`${controlButtonBase} mobile-touch-control--hold border-[#745d7d] text-fuchsia-300 active:border-fuchsia-400`}
            onPointerDown={activatePointerAction('hold')}
            onClick={activateClickAction('hold')}
            disabled={hold.disabled}
            title={hold.title}
            aria-describedby={hold['aria-describedby']}
          >
            <Archive className={controlIconClass} strokeWidth={2.5} />
          </button>
          {hold.description}
          {shopState ? (
            <>
              <button
                type="button"
                aria-label="Shop"
                className={`${controlButtonBase} mobile-touch-control--shop border-[#557984] text-sky-300 active:border-sky-400`}
                onPointerDown={activateShop}
                onClick={activateShopClick}
                disabled={!shopState.enabled}
                title={shopState.disabledReason}
                aria-describedby={shopState.disabledReason ? shopDescriptionId : undefined}
              >
                <ShoppingBag className={controlIconClass} strokeWidth={2.5} />
              </button>
              {disabledDescription(shopDescriptionId, shopState.disabledReason)}
            </>
          ) : (
            <div className="mobile-touch-control-spacer" aria-hidden />
          )}
          <button
            type="button"
            aria-label="Rotate counter-clockwise"
            className={`${controlButtonBase} mobile-touch-control--rotate-ccw border-[#907b59] text-amber-300 active:border-amber-400`}
            onPointerDown={activatePointerAction('rotateCCW')}
            onClick={activateClickAction('rotateCCW')}
            disabled={rotateCCW.disabled}
            title={rotateCCW.title}
            aria-describedby={rotateCCW['aria-describedby']}
          >
            <RotateCcw className={controlIconClass} strokeWidth={2.5} />
          </button>
          {rotateCCW.description}
          <button
            type="button"
            aria-label="Rotate clockwise"
            className={`${controlButtonBase} mobile-touch-control--rotate-cw border-[#907b59] text-amber-300 active:border-amber-400`}
            onPointerDown={activatePointerAction('rotateCW')}
            onClick={activateClickAction('rotateCW')}
            disabled={rotateCW.disabled}
            title={rotateCW.title}
            aria-describedby={rotateCW['aria-describedby']}
          >
            <RotateCw className={controlIconClass} strokeWidth={2.5} />
          </button>
          {rotateCW.description}
        </div>
      </div>
    </div>
  );
});

export default React.memo(MobileControls);
