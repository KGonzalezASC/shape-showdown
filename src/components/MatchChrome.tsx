import React from 'react';
import { useMatchChromeSnapshot } from '../state/GameStateProvider';

export const MatchChrome: React.FC = () => {
  const chrome = useMatchChromeSnapshot();

  const statusText = chrome.status === 'waiting' && chrome.playerCount < 2
    ? 'Waiting for another player to join…'
    : chrome.status === 'countdown'
      ? 'Match starting…'
      : chrome.status === 'playing'
        ? 'Match live'
        : 'Match complete';

  return (
    <div className="flex min-h-7 shrink-0 items-center justify-center border-b border-[#303535] px-3 py-1 text-center font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
      {statusText}
    </div>
  );
};
