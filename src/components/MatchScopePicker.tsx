import React from 'react';
import type { SearchScope } from '../matchmaking/searchScope';

const SCOPE_OPTIONS: Array<{ value: SearchScope; label: string }> = [
  { value: 'global', label: 'Global' },
  { value: 'guild', label: 'My Server' },
  { value: 'discord_only', label: 'Discord Only' },
];

type MatchScopePickerProps = {
  value: SearchScope;
  onChange: (scope: SearchScope) => void;
};

/**
 * Segmented control for the matchmaking pool. Only meaningful inside a
 * Discord Activity; the server coerces guests to global regardless of what
 * gets picked here.
 */
export const MatchScopePicker: React.FC<MatchScopePickerProps> = ({ value, onChange }) => (
  <div
    role="radiogroup"
    aria-label="Opponent search scope"
    className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1"
  >
    {SCOPE_OPTIONS.map((option) => {
      const isActive = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={isActive}
          onClick={() => onChange(option.value)}
          className={
            'rounded-lg px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-[0.12em] transition-colors sm:text-[9px] '
            + (isActive
              ? 'bg-emerald-400/90 text-[#07110d]'
              : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200')
          }
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
