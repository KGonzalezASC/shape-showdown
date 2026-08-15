import React from 'react';
import { ssStatusPillClasses } from '../ui/shapeShowdownTheme';

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
    className={`incoming-garbage-readout ${compact
      ? 'mt-0.5 flex items-center justify-between gap-1 border-t-2 border-[var(--ss-downwell-white)] pt-1'
      : 'mt-1 flex items-center justify-between gap-2 border-t-2 border-[var(--ss-downwell-white)] pt-1.5'}`}
    aria-label={`${fieldTitle} incoming garbage`}
  >
    <div className="flex items-center gap-2">
      <span className={`${ssStatusPillClasses.red} incoming-garbage-pill gap-1.5`}>
        <span aria-hidden>↓</span>
        <strong className="incoming-garbage-pill-value text-[8px]">{lines} IN</strong>
      </span>
    </div>

    {magnetLevel > 0 && (
      <span
        className={`${ssStatusPillClasses.white} incoming-garbage-pill`}
        title={`Magnet Level ${magnetLevel} active`}
      >
        <span className="incoming-garbage-pill-icon text-[8px] leading-none" aria-hidden>🧲</span>
        <span>L{magnetLevel}</span>
      </span>
    )}
  </div>
);
