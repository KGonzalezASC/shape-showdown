import type { ActiveFieldEffect, FieldEffectKind } from '../types';

export interface FieldEffectStyle {
  bgClass: string;
  borderClass: string;
  textClass: string;
  glowClass?: string;
}

const EFFECT_STYLES: Record<FieldEffectKind, FieldEffectStyle> = {
  retrim: {
    bgClass: 'bg-rose-900/80',
    borderClass: 'border-rose-400',
    textClass: 'text-rose-100',
    glowClass: 'shadow-[0_0_10px_rgba(244,63,94,0.7)]',
  },
  'curtain-warn': {
    bgClass: 'bg-indigo-900/80',
    borderClass: 'border-indigo-400',
    textClass: 'text-indigo-100',
    glowClass: 'shadow-[0_0_10px_rgba(129,140,248,0.7)]',
  },
  curtain: {
    bgClass: 'bg-indigo-900/80',
    borderClass: 'border-indigo-400',
    textClass: 'text-indigo-100',
    glowClass: 'shadow-[0_0_10px_rgba(129,140,248,0.7)]',
  },
  poison: {
    bgClass: 'bg-fuchsia-900/80',
    borderClass: 'border-fuchsia-400',
    textClass: 'text-fuchsia-100',
    glowClass: 'shadow-[0_0_10px_rgba(217,70,239,0.7)]',
  },
  'storage-poison': {
    bgClass: 'bg-lime-900/80',
    borderClass: 'border-lime-400',
    textClass: 'text-lime-100',
    glowClass: 'shadow-[0_0_10px_rgba(163,230,53,0.7)]',
  },
  'purge-warn': {
    bgClass: 'bg-fuchsia-900/80',
    borderClass: 'border-fuchsia-400',
    textClass: 'text-fuchsia-100',
    glowClass: 'shadow-[0_0_10px_rgba(217,70,239,0.7)]',
  },
  purge: {
    bgClass: 'bg-fuchsia-900/80',
    borderClass: 'border-fuchsia-400',
    textClass: 'text-fuchsia-100',
    glowClass: 'shadow-[0_0_10px_rgba(217,70,239,0.7)]',
  },
  freeze: {
    bgClass: 'bg-sky-900/80',
    borderClass: 'border-sky-300',
    textClass: 'text-sky-100',
    glowClass: 'shadow-[0_0_10px_rgba(56,189,248,0.7)]',
  },
  magnet: {
    bgClass: 'bg-violet-900/80',
    borderClass: 'border-violet-400',
    textClass: 'text-violet-100',
    glowClass: 'shadow-[0_0_10px_rgba(167,139,250,0.7)]',
  },
  snag: {
    bgClass: 'bg-orange-900/80',
    borderClass: 'border-orange-400',
    textClass: 'text-orange-100',
    glowClass: 'shadow-[0_0_10px_rgba(251,146,60,0.7)]',
  },
  sticky: {
    bgClass: 'bg-teal-900/80',
    borderClass: 'border-teal-300',
    textClass: 'text-teal-100',
    glowClass: 'shadow-[0_0_10px_rgba(45,212,191,0.7)]',
  },
  satellite: {
    bgClass: 'bg-zinc-800/90',
    borderClass: 'border-zinc-300',
    textClass: 'text-zinc-100',
    glowClass: 'shadow-[0_0_10px_rgba(212,212,216,0.5)]',
  },
  bomber: {
    bgClass: 'bg-rose-900/80',
    borderClass: 'border-rose-400',
    textClass: 'text-rose-100',
    glowClass: 'shadow-[0_0_10px_rgba(251,113,133,0.7)]',
  },
  taxed: {
    bgClass: 'bg-rose-900/80',
    borderClass: 'border-rose-400',
    textClass: 'text-rose-100',
    glowClass: 'shadow-[0_0_10px_rgba(244,63,94,0.7)]',
  },
  'tax-siphon': {
    bgClass: 'bg-emerald-900/80',
    borderClass: 'border-emerald-400',
    textClass: 'text-emerald-100',
    glowClass: 'shadow-[0_0_10px_rgba(52,211,153,0.7)]',
  },
  'curtain-def': {
    bgClass: 'bg-indigo-900/80',
    borderClass: 'border-indigo-400',
    textClass: 'text-indigo-100',
    glowClass: 'shadow-[0_0_10px_rgba(129,140,248,0.7)]',
  },
  'wildcard-four': {
    bgClass: 'bg-fuchsia-950/80',
    borderClass: 'border-fuchsia-400',
    textClass: 'text-fuchsia-100',
    glowClass: 'shadow-[0_0_10px_rgba(217,70,239,0.7)]',
  },
  'tectonic-shift': {
    bgClass: 'bg-indigo-950/80',
    borderClass: 'border-indigo-400',
    textClass: 'text-indigo-100',
    glowClass: 'shadow-[0_0_10px_rgba(129,140,248,0.7)]',
  },
};

const DEFAULT_EFFECT_STYLE: FieldEffectStyle = {
  bgClass: 'bg-indigo-900/80',
  borderClass: 'border-indigo-400',
  textClass: 'text-indigo-100',
  glowClass: 'shadow-[0_0_10px_rgba(129,140,248,0.7)]',
};

export function styleForFieldEffect(effect: ActiveFieldEffect): FieldEffectStyle {
  return EFFECT_STYLES[effect.kind] ?? DEFAULT_EFFECT_STYLE;
}
