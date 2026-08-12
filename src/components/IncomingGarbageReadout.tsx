import React from 'react';

interface IncomingGarbageReadoutProps {
  fieldTitle: string;
  lines: number;
  compact?: boolean;
  magnetLevel?: number;
}

export const IncomingGarbageReadout: React.FC<IncomingGarbageReadoutProps> = ({
  fieldTitle,
  lines,
  compact = false,
  magnetLevel = 0,
}) => (
  <div
    className={compact
      ? 'mt-0.5 flex items-baseline justify-between gap-1 border-t border-rose-400/30 pt-0.5 text-[8px] font-semibold uppercase tracking-[0.08em]'
      : 'mt-1 flex items-baseline justify-between gap-2 border-t border-rose-400/25 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em]'}
    aria-label={`${fieldTitle} incoming garbage`}
  >
    <div className="flex items-baseline gap-1.5">
      <span className="text-rose-300/95">Incoming</span>
      <span className={compact
        ? 'font-mono text-[11px] font-bold tabular-nums tracking-normal text-rose-50'
        : 'font-mono text-sm font-bold tabular-nums tracking-normal text-rose-50'}>
        {lines}
      </span>
      {!compact && <span className="text-[9px] tracking-wider text-zinc-400">lines</span>}
    </div>

    {magnetLevel > 0 && (
      <span
        className={compact
          ? 'inline-flex shrink-0 items-center gap-0.5 border border-amber-500/50 bg-zinc-900 px-1 py-0.5 font-mono text-[8px] font-bold leading-none text-amber-300'
          : 'inline-flex shrink-0 items-center gap-0.5 border border-amber-500/50 bg-zinc-900 px-1 py-0.5 font-mono text-[9px] font-bold leading-none text-amber-300'}
        title={`Magnet Level ${magnetLevel} active`}
      >
        <span className="text-[10px] leading-none">🧲</span>
        <span>L{magnetLevel}</span>
      </span>
    )}
  </div>
);
