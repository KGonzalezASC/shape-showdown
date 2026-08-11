import React from 'react';

interface IncomingGarbageReadoutProps {
  fieldTitle: string;
  lines: number;
  compact?: boolean;
}

export const IncomingGarbageReadout: React.FC<IncomingGarbageReadoutProps> = ({
  fieldTitle,
  lines,
  compact = false,
}) => (
  <div
    className={compact
      ? 'mt-0.5 flex items-baseline gap-1 border-t border-rose-400/30 pt-0.5 text-[8px] font-semibold uppercase tracking-[0.08em]'
      : 'mt-1 flex items-baseline gap-2 border-t border-rose-400/25 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em]'}
    aria-label={`${fieldTitle} incoming garbage`}
  >
    <span className="text-rose-300/95">Incoming</span>
    <span className={compact
      ? 'font-mono text-[11px] font-bold tabular-nums tracking-normal text-rose-50'
      : 'font-mono text-sm font-bold tabular-nums tracking-normal text-rose-50'}>
      {lines}
    </span>
    {!compact && <span className="text-[9px] tracking-wider text-zinc-400">lines</span>}
  </div>
);

export default IncomingGarbageReadout;
