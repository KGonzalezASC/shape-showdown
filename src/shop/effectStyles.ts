import type { ActiveFieldEffect, FieldEffectKind } from '../types';
import type { StatusPillVariant } from '../ui/shapeShowdownTheme';

export type { StatusPillVariant };

export interface FieldEffectStyle {
  variant: StatusPillVariant;
}

const EFFECT_VARIANTS: Record<FieldEffectKind, StatusPillVariant> = {
  retrim: 'red',
  'curtain-warn': 'white',
  curtain: 'white',
  poison: 'red',
  'storage-poison': 'red',
  'purge-warn': 'red',
  purge: 'red',
  freeze: 'white',
  magnet: 'white',
  snag: 'red',
  sticky: 'red',
  satellite: 'white',
  bomber: 'red',
  taxed: 'red',
  'tax-siphon': 'white',
  'curtain-def': 'white',
  'wildcard-four': 'red',
  'tectonic-shift': 'white',
};

const DEFAULT_EFFECT_VARIANT: StatusPillVariant = 'white';

export function styleForFieldEffect(effect: ActiveFieldEffect): FieldEffectStyle {
  return { variant: EFFECT_VARIANTS[effect.kind] ?? DEFAULT_EFFECT_VARIANT };
}
