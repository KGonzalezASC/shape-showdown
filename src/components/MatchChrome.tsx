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
        myPendingGarbage={chrome.myPendingGarbage}
        oppPendingGarbage={chrome.oppPendingGarbage}
        hasMyPlayer={chrome.myId !== null && chrome.playerCount > 0}
      />
      {chrome.playerCount > 0 && (
        <div className="mb-1.5 hidden w-full max-w-5xl grid-cols-2 gap-2 self-center sm:grid">
          <div className="rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-1.5 text-xs">
            <span className="text-rose-300/90">Incoming (you): </span>
            <span className="font-mono text-rose-200">{chrome.myPendingGarbage}</span>
          </div>
          <div className="rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-1.5 text-xs text-right">
            <span className="text-rose-300/90">Incoming (opp): </span>
            <span className="font-mono text-rose-200">{chrome.oppPendingGarbage}</span>
          </div>
        </div>
      )}
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
