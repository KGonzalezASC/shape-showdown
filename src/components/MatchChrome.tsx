import React from 'react';
import { MatchEvent } from '../types';
import { MatchHeader } from './MatchHeader';
import { useMatchChromeSnapshot } from '../state/GameStateProvider';

function matchEventLabel(
  evt: MatchEvent | null,
  myId: string | null,
): { text: string; tone: string } {
  if (!evt) return { text: '', tone: '' };
  const mine = evt.playerId && myId ? evt.playerId === myId : false;
  if (evt.type === 'lineClear') {
    return { text: `${mine ? 'You' : 'Opp'} line clear (${evt.lines ?? 0})`, tone: 'text-cyan-300' };
  }
  if (evt.type === 'attackSent') {
    return {
      text: `${mine ? 'You sent' : 'Opp sent'} ${evt.lines ?? 0} garbage`,
      tone: mine ? 'text-emerald-300' : 'text-rose-300',
    };
  }
  if (evt.type === 'garbageApplied') {
    return {
      text: `${mine ? 'You received' : 'Opp received'} ${evt.lines ?? 0} garbage`,
      tone: mine ? 'text-rose-300' : 'text-emerald-300',
    };
  }
  if (evt.type === 'topOut') {
    return { text: `${mine ? 'You topped out' : 'Opponent topped out'}`, tone: 'text-amber-300' };
  }
  return { text: String((evt as { type: string }).type), tone: 'text-zinc-300' };
}

export const MatchChrome: React.FC = () => {
  const chrome = useMatchChromeSnapshot();
  const eventUi = matchEventLabel(chrome.lastMatchEvent, chrome.myId);

  return (
    <>
      <MatchHeader
        myScore={chrome.myScore}
        oppScore={chrome.oppScore}
        availableShopScore={chrome.availableShopScore}
        myPendingGarbage={chrome.myPendingGarbage}
        oppPendingGarbage={chrome.oppPendingGarbage}
        remainingTime={chrome.remainingTime}
        hasMyPlayer={chrome.myId !== null && chrome.playerCount > 0}
      />
      {chrome.lastMatchEvent && (
        <div
          className={`pointer-events-none fixed left-1/2 top-12 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-zinc-950/90 px-2.5 py-0.5 text-[10px] uppercase tracking-wider shadow-lg sm:top-24 sm:px-3 sm:py-1 sm:text-[11px] ${eventUi.tone}`}
        >
          {eventUi.text}
        </div>
      )}
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
