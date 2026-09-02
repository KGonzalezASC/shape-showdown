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

/** Solo deferred-wildcard telegraph (no expiry until apply clears it). */
export const WILDCARD_INCOMING_LABEL = 'Wildcard incoming';

export function ensureWildcardIncomingEffect(player: PlayerState, tick: number): void {
  if (!player.activeEffects) player.activeEffects = [];
  const already = player.activeEffects.some(
    (e) => e.kind === 'wildcard-four' && e.label === WILDCARD_INCOMING_LABEL,
  );
  if (already) return;
  pushFieldEffect(player, 'wildcard-four', tick, WILDCARD_INCOMING_LABEL, '🧩');
}

export function clearWildcardIncomingEffect(player: PlayerState): void {
  if (!player.activeEffects?.length) return;
  player.activeEffects = player.activeEffects.filter(
    (e) => !(e.kind === 'wildcard-four' && e.label === WILDCARD_INCOMING_LABEL),
  );
}

