import React from 'react';
import './IncomingGarbageReadout.css';

interface IncomingGarbageReadoutProps {
  fieldTitle: string;
  lines: number;
  compact?: boolean;
  magnetLevel?: number;
}

export const IncomingGarbageReadout: React.FC<IncomingGarbageReadoutProps> = ({
  fieldTitle, lines, compact = false, magnetLevel = 0,
}) => (
  <div
    className={`incoming-garbage-readout garbage-status ${compact ? 'garbage-status--compact' : ''}`}
    data-incoming={lines > 0}
    aria-label={`${fieldTitle}: ${lines} garbage lines queued`}
  >
    <span><strong>{lines > 0 ? `↓ ${lines}` : '0'}</strong> {compact ? 'queued' : `garbage ${lines === 1 ? 'line' : 'lines'} queued`}</span>
    {magnetLevel > 0 && <span className="garbage-pull">Magnet ×{magnetLevel}</span>}
  </div>
);
