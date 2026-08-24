import React from 'react';
import type { SearchScope } from '../matchmaking/searchScope';
import { isDiscordDMLaunch } from '../discordContext';

type MatchScopePickerProps = {
  value: SearchScope;
  onChange: (scope: SearchScope) => void;
  isDm?: boolean;
};

/**
 * Segmented control for the matchmaking pool. Only meaningful inside a
 * Discord Activity; the server coerces guests to global regardless of what
 * gets picked here.
 */
export const MatchScopePicker: React.FC<MatchScopePickerProps> = ({
  value,
  onChange,
  isDm,
}) => {
  const isDmContext = isDm ?? isDiscordDMLaunch();
  const scopeOptions: Array<{ value: SearchScope; label: string; description: string }> = [
    {
      value: 'guild',
      label: isDmContext ? 'This DM' : 'This Server',
      description: isDmContext
        ? 'Match with players in this direct message'
        : 'Match with players in this Discord server',
    },
    { value: 'discord_only', label: 'All Discord', description: 'Match with Discord players across all servers' },
    { value: 'global', label: 'Worldwide', description: 'Match with anyone on Web or Discord' },
  ];

  const activeOption = scopeOptions.find((opt) => opt.value === value) ?? scopeOptions[0];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        role="radiogroup"
        aria-label="Opponent search scope"
        className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1"
      >
        {scopeOptions.map((option) => {
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
                  ? 'bg-emerald-400/90 text-[#07110d] font-extrabold shadow-sm'
                  : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200')
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-center font-mono text-[9px] font-medium tracking-wide text-zinc-400">
        {activeOption.description}
      </p>
    </div>
  );
};
