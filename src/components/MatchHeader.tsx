import React, { memo } from 'react';
import { Timer, Users, Zap } from 'lucide-react';

interface MatchHeaderProps {
  myScore: number;
  oppScore: number;
  availableShopScore: number;
  myPendingGarbage: number;
  oppPendingGarbage: number;
  remainingTime: number;
  hasMyPlayer: boolean;
}

export const MatchHeader: React.FC<MatchHeaderProps> = ({
  myScore,
  oppScore,
  availableShopScore,
  myPendingGarbage,
  oppPendingGarbage,
  remainingTime,
  hasMyPlayer,
}) => (
  <div className="mb-1 flex w-full max-w-5xl shrink-0 items-center justify-between gap-1 self-center overflow-visible rounded-lg border border-white/5 bg-[#1a1a1a] px-2 py-1.5 shadow-xl sm:mb-3 sm:gap-2 sm:rounded-2xl sm:p-3 md:p-4">
    <div className="flex flex-1 items-center gap-1.5 min-w-0 sm:gap-4">
      <div className="hidden shrink-0 rounded-lg bg-emerald-500/10 sm:block sm:p-2">
        <Zap className="h-4 w-4 text-emerald-400 sm:h-5 sm:w-5" />
      </div>
      <div className="flex flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:flex-col sm:items-start sm:gap-0 min-w-0">
        <p className="hidden text-[10px] font-semibold uppercase tracking-wider text-emerald-400/60 sm:block">
          Your Attack Score
        </p>
        <div className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-emerald-400 sm:hidden" />
          <p className="font-mono text-sm leading-none text-emerald-50 sm:text-2xl">{myScore}</p>
        </div>
        {hasMyPlayer && (
          <div className="flex items-center gap-1 sm:mt-0.5 sm:gap-1.5">
            <span className="hidden text-[9px] font-bold uppercase tracking-widest text-cyan-400/80 sm:inline">Funds</span>
            <span className="text-[9px] font-bold text-cyan-400/80 sm:hidden">F</span>
            <span className="font-mono text-xs text-cyan-200 sm:text-sm">{availableShopScore}</span>
          </div>
        )}
        <div className="flex items-center text-[10px] font-mono sm:hidden">
          <span className="mr-0.5 text-rose-400/80">In:</span>
          <span className="text-rose-200">{myPendingGarbage}</span>
        </div>
      </div>
    </div>

    <div className="flex shrink-0 flex-col items-center px-1 sm:px-2">
      <div className="hidden items-center gap-2 sm:mb-1 sm:flex">
        <Timer className="h-4 w-4 text-zinc-500" />
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Remaining</span>
      </div>
      <p className="font-mono text-base leading-none tracking-tighter text-zinc-300 sm:text-3xl">
        {Math.floor(remainingTime / 60)}:{Math.floor(remainingTime % 60).toString().padStart(2, '0')}
      </p>
    </div>

    <div className="flex flex-1 items-center justify-end gap-1.5 min-w-0 sm:gap-4">
      <div className="flex flex-row flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 sm:flex-col sm:items-end sm:gap-0 min-w-0">
        <div className="flex items-center text-[10px] font-mono sm:hidden">
          <span className="mr-0.5 text-rose-400/80">In:</span>
          <span className="text-rose-200">{oppPendingGarbage}</span>
        </div>
        <p className="hidden text-[10px] font-semibold uppercase leading-tight tracking-wider text-rose-400/60 sm:block">
          Opponent Attack Score
        </p>
        <div className="flex items-center gap-1">
          <p className="font-mono text-sm leading-none text-rose-50 sm:text-2xl">{oppScore}</p>
          <Users className="h-3 w-3 text-rose-400 sm:hidden" />
        </div>
      </div>
      <div className="hidden shrink-0 rounded-lg bg-rose-500/10 sm:block sm:p-2">
        <Users className="h-4 w-4 text-rose-400 sm:h-5 sm:w-5" />
      </div>
    </div>
  </div>
);

export default memo(MatchHeader);
