import React from 'react';
import { Gamepad2 } from 'lucide-react';
import {
  type OnScreenControlsPreference,
  useOnScreenControlsPolicy,
} from '../input/onScreenControlsPolicy';

interface OnScreenControlsPreferenceProps {
  onBeforeChange?: (next: OnScreenControlsPreference) => void;
}

const preferenceLabel: Record<OnScreenControlsPreference, string> = {
  auto: 'Touch: Auto',
  shown: 'Touch: On',
  hidden: 'Touch: Off',
};

const nextPreference: Record<OnScreenControlsPreference, OnScreenControlsPreference> = {
  auto: 'shown',
  shown: 'hidden',
  hidden: 'auto',
};

export const OnScreenControlsPreferenceButton: React.FC<OnScreenControlsPreferenceProps> = ({ onBeforeChange }) => {
  const policy = useOnScreenControlsPolicy();
  const label = preferenceLabel[policy.preference];

  return (
    <button
      type="button"
      onClick={(event) => {
        event.currentTarget.focus();
        const next = nextPreference[policy.preference];
        onBeforeChange?.(next);
        policy.setPreference(next);
      }}
      aria-label={label}
      title={`${label}. Activate to change.`}
      className={`on-screen-controls-preference inline-flex min-h-[44px] items-center gap-1 rounded-lg border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:px-2.5 sm:text-[9px] ${
        policy.preference === 'hidden'
          ? 'border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white'
          : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
      }`}
    >
      <Gamepad2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
};
