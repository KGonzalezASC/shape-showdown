import React from 'react';
import { MatchHeader } from './MatchHeader';
import { useMatchChromeSnapshot } from '../state/GameStateProvider';

export const MatchChrome: React.FC = () => {
  const chrome = useMatchChromeSnapshot();

  return (
    <>
      <MatchHeader
        myScore={chrome.myScore}
        oppScore={chrome.oppScore}
        availableShopScore={chrome.availableShopScore}
        hasMyPlayer={chrome.myId !== null && chrome.playerCount > 0}
      />
      {chrome.status === 'waiting' && chrome.playerCount < 2 && (
        <div className="mb-1 hidden shrink-0 self-center rounded-full border border-white/5 bg-zinc-900/90 px-4 py-1.5 sm:block sm:py-2">
          <p className="text-center text-xs font-medium tracking-wide text-zinc-400">
            Waiting for another player to join…
          </p>
        </div>
      )}
    </>
  );
};
