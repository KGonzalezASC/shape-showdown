import React from 'react';
import type { ReplayDataV2 } from '../types';

interface TimelinePowerupBandsProps {
  replay: ReplayDataV2;
  totalTicks: number;
}

const EFFECT_COLORS: Record<string, string> = {
  curtain: 'bg-cyan-500/40 border-cyan-400/60',
  'curtain-warn': 'bg-cyan-500/20 border-cyan-400/40',
  poison: 'bg-purple-500/40 border-purple-400/60',
  magnet: 'bg-amber-500/40 border-amber-400/60',
  satellite: 'bg-indigo-500/40 border-indigo-400/60',
  sticky: 'bg-emerald-500/40 border-emerald-400/60',
  snag: 'bg-rose-500/40 border-rose-400/60',
  retrim: 'bg-blue-500/40 border-blue-400/60',
};

export const TimelinePowerupBands: React.FC<TimelinePowerupBandsProps> = ({
  replay,
  totalTicks,
}) => {
  if (!replay || !replay.keyframes || totalTicks <= 0) return null;

  // Extract active effect duration spans from keyframes
  const effectSpans: Array<{
    kind: string;
    label: string;
    startTick: number;
    endTick: number;
  }> = [];

  let currentSpan: { kind: string; label: string; startTick: number; endTick: number } | null = null;

  for (const frame of replay.keyframes) {
    const p1 = frame.players?.p1;
    const activeEffect = p1?.activeEffects?.[0];

    if (activeEffect) {
      if (!currentSpan || currentSpan.kind !== activeEffect.kind) {
        if (currentSpan) effectSpans.push(currentSpan);
        currentSpan = {
          kind: activeEffect.kind,
          label: activeEffect.label,
          startTick: frame.tick,
          endTick: frame.tick + 60,
        };
      } else {
        currentSpan.endTick = frame.tick;
      }
    } else if (currentSpan) {
      effectSpans.push(currentSpan);
      currentSpan = null;
    }
  }
  if (currentSpan) effectSpans.push(currentSpan);

  return (
    <div className="relative w-full h-3 bg-black/40 rounded border border-white/10 overflow-hidden my-1">
      {effectSpans.map((span, idx) => {
        const leftPercent = (span.startTick / totalTicks) * 100;
        const widthPercent = Math.max(0.5, ((span.endTick - span.startTick) / totalTicks) * 100);
        const styleClass = EFFECT_COLORS[span.kind] || 'bg-white/30 border-white/50';

        return (
          <div
            key={`${span.kind}_${span.startTick}_${idx}`}
            title={`Active ${span.label} (Ticks ${span.startTick}-${span.endTick})`}
            className={`absolute h-full rounded border-t border-b ${styleClass}`}
            style={{
              left: `${leftPercent}%`,
              width: `${widthPercent}%`,
            }}
          />
        );
      })}
    </div>
  );
};
