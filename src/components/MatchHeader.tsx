import React, { memo } from 'react';
import { Coins, Users } from 'lucide-react';

interface MatchHeaderProps {
  myScore: number;
  oppScore: number;
  myFunds: number;
  oppFunds: number;
  hasMyPlayer: boolean;
}

export const MatchHeader: React.FC<MatchHeaderProps> = ({
  myScore,
  oppScore,
  myFunds,
  oppFunds,
  hasMyPlayer,
}) => (
  <div className="mb-1 flex w-full max-w-[1180px] shrink-0 items-center justify-between gap-1 self-center overflow-visible rounded-lg border border-white/5 bg-[#1a1a1a] px-2 py-1.5 shadow-xl sm:mb-3 sm:gap-2 sm:rounded-2xl sm:p-3 min-[901px]:p-4">
    <div className="flex flex-1 items-center gap-1.5 min-w-0 sm:gap-4">
      <div className="hidden shrink-0 rounded-lg bg-cyan-500/10 sm:block sm:p-2">
        <Coins className="h-4 w-4 text-cyan-400 sm:h-5 sm:w-5" />
      </div>
      <div className="flex flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:flex-col sm:items-start sm:gap-0 min-w-0">
        <p className="hidden text-[10px] font-semibold uppercase tracking-wider text-cyan-400/70 sm:block">
          Your Funds
        </p>
        <div className="flex items-center gap-1">
          <Coins className="h-3 w-3 text-cyan-400 sm:hidden" />
          <p className="font-mono text-sm leading-none font-bold text-cyan-200 sm:text-2xl">{myFunds}</p>
        </div>
        {hasMyPlayer && (
          <div className="flex items-center gap-1 sm:mt-0.5 sm:gap-1.5">
            <span className="hidden text-[9px] font-semibold uppercase tracking-widest text-emerald-400/80 sm:inline">Score</span>
            <span className="text-[9px] font-semibold text-emerald-400/80 sm:hidden">Score</span>
            <span className="font-mono text-xs text-emerald-200/90 sm:text-sm">{myScore}</span>
          </div>
        )}
      </div>
    </div>

    <div className="flex flex-1 items-center justify-end gap-1.5 min-w-0 sm:gap-4">
      <div className="flex flex-row flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 sm:flex-col sm:items-end sm:gap-0 min-w-0">
        <p className="hidden text-[10px] font-semibold uppercase leading-tight tracking-wider text-rose-400/70 sm:block">
          Opponent Funds
        </p>
        <div className="flex items-center gap-1">
          <p className="font-mono text-sm leading-none font-bold text-rose-200 sm:text-2xl">{oppFunds}</p>
          <Users className="h-3 w-3 text-rose-400 sm:hidden" />
        </div>
        <div className="flex items-center gap-1 sm:mt-0.5 sm:gap-1.5">
          <span className="hidden text-[9px] font-semibold uppercase tracking-widest text-rose-400/80 sm:inline">Score</span>
          <span className="text-[9px] font-semibold text-rose-400/80 sm:hidden">Score</span>
          <span className="font-mono text-xs text-rose-200/90 sm:text-sm">{oppScore}</span>
        </div>
      </div>
      <div className="hidden shrink-0 rounded-lg bg-rose-500/10 sm:block sm:p-2">
        <Users className="h-4 w-4 text-rose-400 sm:h-5 sm:w-5" />
      </div>
    </div>
  </div>
);

export default memo(MatchHeader);
