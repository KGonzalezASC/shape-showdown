import React from 'react';
import { useMatchChromeSnapshot } from '../state/GameStateProvider';

interface MatchChromeProps {
  actionSlot?: React.ReactNode;
}

export const MatchChrome: React.FC<MatchChromeProps> = ({ actionSlot }) => {
  const chrome = useMatchChromeSnapshot();

  const isWaitingForPlayer = chrome.status === 'waiting' && chrome.playerCount < 2;

  const statusText = isWaitingForPlayer
    ? 'Waiting for another player to join…'
    : chrome.status === 'ended' && chrome.endReason === 'server-void'
      ? 'Match voided — no winner'
      : chrome.pausePlayerId !== null
        ? 'Match paused — reclaiming seat'
    : chrome.status === 'countdown'
      ? 'Match starting…'
      : chrome.status === 'playing'
        ? 'Match live'
        : 'Match complete';

  return (
    <div
      className={`ss-match-chrome relative flex min-h-7 shrink-0 items-center justify-center border-b border-[var(--ss-chrome-rule)] px-3 py-1 text-center text-[8px] font-bold uppercase tracking-[0.12em] ${
        isWaitingForPlayer
          ? 'ss-match-chrome-status--waiting'
          : 'text-[var(--ss-text-tertiary)]'
      }`}
    >
      {statusText}
      {actionSlot && (
        <div className="absolute inset-y-0 right-1 flex items-center">
          {actionSlot}
        </div>
      )}
    </div>
  );
};
