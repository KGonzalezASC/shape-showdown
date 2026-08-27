import React from 'react';
import type { SearchScope } from '../matchmaking/searchScope';
import { isDiscordActivityContext, isDiscordDMLaunch } from '../discordContext';

type MatchScopePickerProps = {
  value: SearchScope;
  onChange: (scope: SearchScope) => void;
  isDm?: boolean;
  isDiscord?: boolean;
};

/**
 * Segmented control for the matchmaking pool. Inside a Discord Activity,
 * provides options for server/DM, all Discord, and Worldwide. For direct
 * web clients, only Worldwide is available.
 */
export const MatchScopePicker: React.FC<MatchScopePickerProps> = ({
  value,
  onChange,
  isDm,
  isDiscord,
}) => {
  const inDiscord = isDiscord ?? isDiscordActivityContext();
  const isDmContext = isDm ?? isDiscordDMLaunch();
  const scopeOptions: Array<{ value: SearchScope; label: string; description: string }> = inDiscord
    ? [
        {
          value: 'guild',
          label: isDmContext ? 'This DM' : 'This Server',
          description: isDmContext
            ? 'Match with players in this direct message'
            : 'Match with players in this Discord server',
        },
        { value: 'discord_only', label: 'All Discord', description: 'Match with Discord players across all servers' },
        { value: 'global', label: 'Worldwide', description: 'Match with anyone on Web or Discord' },
      ]
    : [
        { value: 'global', label: 'Worldwide', description: 'Match with anyone on Web or Discord' },
      ];

  const activeOption = scopeOptions.find((opt) => opt.value === value) ?? scopeOptions[0];

  return (
    <div className="ss-match-scope flex flex-col items-center gap-1.5">
      <div
        role="radiogroup"
        aria-label="Opponent search scope"
        className="ss-match-scope-radiogroup flex items-center gap-1 rounded-xl p-1 backdrop-blur-sm"
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
                'ss-match-scope-btn rounded-lg px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-[0.12em] transition-colors sm:text-[9px] '
                + (isActive
                  ? 'ss-match-scope-btn--active'
                  : 'ss-match-scope-btn--inactive')
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="ss-match-scope-description text-center font-mono text-[9px] font-medium tracking-wide">
        {activeOption.description}
      </p>
    </div>
  );
};
