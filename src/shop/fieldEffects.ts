import { ActiveFieldEffect, FieldEffectKind, PlayerState } from '../types';

/** Append a semantic active-effect pill (no presentation classes). */
export function pushFieldEffect(
  player: PlayerState,
  kind: FieldEffectKind,
  tick: number,
  label: string,
  icon: string,
  expiresAtTick?: number,
): void {
  if (!player.activeEffects) player.activeEffects = [];
  const effect: ActiveFieldEffect = {
    id: `${kind}-${tick}`,
    kind,
    label,
    icon,
  };
  if (expiresAtTick !== undefined) effect.expiresAtTick = expiresAtTick;
  player.activeEffects.push(effect);
}
