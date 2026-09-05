import type { ActionType, InputState } from '../types';
import type { PublicPlayerState } from '../state/publicSnapshots';
import { BOARD_HIDDEN_ROWS } from '../types';
import { SHAPES } from '../puzzleEngine/shapes';

export type HeldMovementAction = keyof InputState;

export type UtilityControl =
  | { kind: 'shop'; enabled: boolean; disabledReason?: string; onActivate: () => void }
  | { kind: 'none' };

export interface GameplayControlAvailability {
  hardDrop: { enabled: boolean; disabledReason?: string };
  hold: { enabled: boolean; disabledReason?: string };
  rotateCW: { enabled: boolean; disabledReason?: string };
  rotateCCW: { enabled: boolean; disabledReason?: string };
  utility: UtilityControl;
}

export interface GameplayControlAvailabilityOptions {
  active: boolean;
  player: PublicPlayerState | null;
  currentTick: number;
  allowHold?: boolean;
  utility: UtilityControl;
}

function actionState(enabled: boolean, disabledReason: string): { enabled: boolean; disabledReason?: string } {
  return enabled ? { enabled: true } : { enabled: false, disabledReason };
}

function maxActiveVisibleRow(player: PublicPlayerState): number | null {
  const piece = player.activePiece;
  if (!piece) return null;
  const offsets = piece.customOffsets ?? SHAPES[piece.type][piece.rotation];
  return Math.max(...offsets.map(([, y]) => piece.y + y - BOARD_HIDDEN_ROWS));
}

function holdDisabledReason(
  player: PublicPlayerState,
  currentTick: number,
  allowHold: boolean,
): string | null {
  if (!allowHold) return 'Storage disabled';
  if (!player.activePiece) return 'No active piece';
  if (player.activeEffects?.some((effect) => effect.kind === 'freeze')) {
    return 'Frozen - no store or swap';
  }
  if (player.holdFrozenUntilTick !== undefined && currentTick < player.holdFrozenUntilTick) {
    return 'Frozen - no store or swap';
  }
  if (player.activePiece.poisoned) return 'Poisoned - no hold';
  if (player.activePiece.customOffsets) return 'Wildcard - no hold';
  if (!player.canHold) return 'Used this piece';
  const maxRow = maxActiveVisibleRow(player);
  if (maxRow !== null && maxRow >= player.swapCutoffRow) return 'Past swap line';
  return null;
}

export function deriveGameplayControlAvailability({
  active,
  player,
  currentTick,
  allowHold = true,
  utility,
}: GameplayControlAvailabilityOptions): GameplayControlAvailability {
  if (!active) {
    return {
      hardDrop: actionState(false, 'Gameplay is not active'),
      hold: actionState(false, 'Gameplay is not active'),
      rotateCW: actionState(false, 'Gameplay is not active'),
      rotateCCW: actionState(false, 'Gameplay is not active'),
      utility,
    };
  }

  if (!player?.activePiece) {
    return {
      hardDrop: actionState(false, 'No active piece'),
      hold: actionState(false, allowHold ? 'No active piece' : 'Storage disabled'),
      rotateCW: actionState(false, 'No active piece'),
      rotateCCW: actionState(false, 'No active piece'),
      utility,
    };
  }

  const hardDropReason = player.snagHardDropBlocked ? 'Snagged - no hard drop' : null;
  const holdReason = holdDisabledReason(player, currentTick, allowHold);
  return {
    hardDrop: actionState(hardDropReason === null, hardDropReason ?? ''),
    hold: actionState(holdReason === null, holdReason ?? ''),
    rotateCW: actionState(true, ''),
    rotateCCW: actionState(true, ''),
    utility,
  };
}

function actionGateEqual(
  a: { enabled: boolean; disabledReason?: string },
  b: { enabled: boolean; disabledReason?: string },
): boolean {
  return a.enabled === b.enabled && a.disabledReason === b.disabledReason;
}

/** Soft-drop Y churn should not allocate a new availability object for MobileControls. */
export function gameplayControlAvailabilityEqual(
  a: GameplayControlAvailability,
  b: GameplayControlAvailability,
): boolean {
  if (!actionGateEqual(a.hardDrop, b.hardDrop)) return false;
  if (!actionGateEqual(a.hold, b.hold)) return false;
  if (!actionGateEqual(a.rotateCW, b.rotateCW)) return false;
  if (!actionGateEqual(a.rotateCCW, b.rotateCCW)) return false;
  if (a.utility.kind !== b.utility.kind) return false;
  if (a.utility.kind === 'none' || b.utility.kind === 'none') {
    return a.utility.kind === b.utility.kind;
  }
  return (
    a.utility.enabled === b.utility.enabled
    && a.utility.disabledReason === b.utility.disabledReason
    && a.utility.onActivate === b.utility.onActivate
  );
}

export function actionAvailabilityFor(
  availability: GameplayControlAvailability,
  action: ActionType,
): { enabled: boolean; disabledReason?: string } {
  switch (action) {
    case 'hardDrop':
      return availability.hardDrop;
    case 'hold':
      return availability.hold;
    case 'rotateCW':
      return availability.rotateCW;
    case 'rotateCCW':
      return availability.rotateCCW;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
