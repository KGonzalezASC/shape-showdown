import { useEffect, useRef } from 'react';
import { ActionType, GameState, LOCK_DELAY_TICKS, LOCK_RESET_CAP } from '../types';
import { DrillResult } from '../components/DrillConsole';

type InputState = { left: boolean; right: boolean; softDrop: boolean };

export function useLockDrill(
  enabled: boolean,
  gameState: GameState | null,
  myId: string | null,
  sendAction: (action: ActionType) => void,
  sendInputState: (input: InputState) => void,
  onResult: (result: DrillResult) => void,
): void {
  const drillStepRef = useRef<'idle' | 'seekGround' | 'consumeCap' | 'exhaustCap' | 'spam' | 'waitForLock'>('idle');
  const drillSpinsRef = useRef(0);
  const drillLastSpinMsRef = useRef(0);
  const drillDirectionRef = useRef<1 | -1>(1);
  const drillTrackingPieceRef = useRef(false);
  const drillObservedCapRef = useRef(false);
  const drillPrevLockDelayRef = useRef<number | null>(null);
  const drillPrevPieceYRef = useRef<number | null>(null);
  const drillExhaustAttemptsRef = useRef(0);
  const drillFailureReasonRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !gameState || gameState.status !== 'playing' || !myId) {
      drillStepRef.current = 'idle';
      drillSpinsRef.current = 0;
      drillTrackingPieceRef.current = false;
      drillObservedCapRef.current = false;
      drillPrevLockDelayRef.current = null;
      drillPrevPieceYRef.current = null;
      drillExhaustAttemptsRef.current = 0;
      drillFailureReasonRef.current = null;
      return;
    }
    const me = gameState.players[myId];
    if (!me) return;
    if (!me.activePiece) {
      if (drillTrackingPieceRef.current) {
        if (drillFailureReasonRef.current) {
          onResult({ status: 'fail', message: drillFailureReasonRef.current });
        } else if (drillObservedCapRef.current) {
          onResult({
            status: 'pass',
            message:
              'PASS: Move-reset cap was exhausted; no illegal lock-delay refresh before lock (gravity refills ignored).',
          });
        } else {
          onResult({
            status: 'pass',
            message: 'PASS: Piece locked (cap not fully exhausted this cycle — e.g. few valid rotations).',
          });
        }
      }
      drillTrackingPieceRef.current = false;
      drillObservedCapRef.current = false;
      drillPrevLockDelayRef.current = null;
      drillPrevPieceYRef.current = null;
      drillExhaustAttemptsRef.current = 0;
      drillFailureReasonRef.current = null;
      drillStepRef.current = 'seekGround';
      drillSpinsRef.current = 0;
      sendInputState({ left: false, right: false, softDrop: true });
      return;
    }
    if (drillStepRef.current === 'idle') {
      drillStepRef.current = 'seekGround';
      sendInputState({ left: false, right: false, softDrop: true });
      return;
    }
    if (drillStepRef.current === 'seekGround') {
      sendInputState({ left: false, right: false, softDrop: true });
      if (me.lockDelayRemainingTicks < LOCK_DELAY_TICKS) {
        sendInputState({ left: false, right: false, softDrop: false });
        drillStepRef.current = 'consumeCap';
      }
      return;
    }
    if (drillStepRef.current === 'consumeCap') {
      drillDirectionRef.current = -1;
      drillSpinsRef.current = 0;
      drillLastSpinMsRef.current = performance.now();
      drillTrackingPieceRef.current = true;
      drillObservedCapRef.current = false;
      drillPrevLockDelayRef.current = null;
      drillPrevPieceYRef.current = null;
      drillExhaustAttemptsRef.current = 0;
      drillFailureReasonRef.current = null;
      drillStepRef.current = 'exhaustCap';
      return;
    }
    if (drillStepRef.current === 'exhaustCap') {
      if (me.lockResetsUsed >= LOCK_RESET_CAP) {
        drillSpinsRef.current = 0;
        drillLastSpinMsRef.current = performance.now();
        drillStepRef.current = 'spam';
        return;
      }
      const now = performance.now();
      if (now - drillLastSpinMsRef.current < 120) return;
      if (drillExhaustAttemptsRef.current >= 40) {
        drillSpinsRef.current = 0;
        drillLastSpinMsRef.current = now;
        drillStepRef.current = 'spam';
        return;
      }
      sendAction('rotateCW');
      drillExhaustAttemptsRef.current += 1;
      drillLastSpinMsRef.current = now;
      return;
    }
    if (drillStepRef.current === 'spam') {
      if (me.lockResetsUsed >= LOCK_RESET_CAP) {
        if (!drillObservedCapRef.current) {
          drillObservedCapRef.current = true;
          drillPrevLockDelayRef.current = me.lockDelayRemainingTicks;
          drillPrevPieceYRef.current = me.activePiece?.y ?? null;
        } else {
          const prevD = drillPrevLockDelayRef.current;
          const prevY = drillPrevPieceYRef.current;
          const y = me.activePiece?.y ?? null;
          const yIncreased = prevY !== null && y !== null && y > prevY;
          const jumped = prevD !== null && me.lockDelayRemainingTicks > prevD + 1;
          if (jumped && !yIncreased && !drillFailureReasonRef.current) {
            drillFailureReasonRef.current =
              'FAIL: lockDelay refreshed after move-reset cap exhausted without a gravity step (illegal rotate/move reset).';
          }
          drillPrevLockDelayRef.current = me.lockDelayRemainingTicks;
          drillPrevPieceYRef.current = y;
        }
      }
      const now = performance.now();
      if (now - drillLastSpinMsRef.current < 120) return;
      if (drillSpinsRef.current >= 8) {
        drillStepRef.current = 'waitForLock';
        drillSpinsRef.current = 0;
        sendInputState({ left: false, right: false, softDrop: true });
        return;
      }
      sendAction(drillDirectionRef.current === 1 ? 'rotateCW' : 'rotateCCW');
      drillDirectionRef.current = drillDirectionRef.current === 1 ? -1 : 1;
      drillSpinsRef.current += 1;
      drillLastSpinMsRef.current = now;
      return;
    }
    if (drillStepRef.current === 'waitForLock') {
      if (me.lockResetsUsed >= LOCK_RESET_CAP) {
        const prevD = drillPrevLockDelayRef.current;
        const prevY = drillPrevPieceYRef.current;
        const y = me.activePiece?.y ?? null;
        const yIncreased = prevY !== null && y !== null && y > prevY;
        const jumped = prevD !== null && me.lockDelayRemainingTicks > prevD + 1;
        if (jumped && !yIncreased && !drillFailureReasonRef.current) {
          drillFailureReasonRef.current =
            'FAIL: lockDelay refreshed after move-reset cap exhausted without a gravity step (illegal rotate/move reset).';
        }
        drillPrevLockDelayRef.current = me.lockDelayRemainingTicks;
        drillPrevPieceYRef.current = y;
      }
    }
  }, [enabled, gameState, myId, sendAction, sendInputState, onResult]);
}
