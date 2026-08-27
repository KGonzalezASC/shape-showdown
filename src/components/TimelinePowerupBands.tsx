import React, { useMemo } from 'react';
import type { ReplayDataV2 } from '../types';
import { extractReplayEffectSpans } from '../../server/testHarness/replayDriver';

interface TimelinePowerupBandsProps {
  replay: ReplayDataV2;
  totalTicks: number;
  playerIds: string[];
  currentTick?: number;
  playerLabel?: (playerId: string) => string;
}

const EFFECT_COLORS: Record<string, string> = {
  curtain: 'bg-cyan-500/60 border-cyan-300',
  'curtain-warn': 'bg-cyan-500/30 border-cyan-300/70',
  poison: 'bg-purple-500/60 border-purple-300',
  'storage-poison': 'bg-fuchsia-500/60 border-fuchsia-300',
  magnet: 'bg-amber-500/60 border-amber-300',
  satellite: 'bg-indigo-500/60 border-indigo-300',
  sticky: 'bg-emerald-500/60 border-emerald-300',
  snag: 'bg-rose-500/60 border-rose-300',
  retrim: 'bg-blue-500/60 border-blue-300',
  bomber: 'bg-orange-500/60 border-orange-300',
  freeze: 'bg-sky-500/60 border-sky-300',
  purge: 'bg-violet-500/60 border-violet-300',
  'purge-warn': 'bg-violet-500/30 border-violet-300/70',
  'wildcard-four': 'bg-lime-500/60 border-lime-300',
  'tectonic-shift': 'bg-orange-500/60 border-orange-300',
  taxed: 'bg-red-500/60 border-red-300',
  'tax-siphon': 'bg-red-500/30 border-red-300/70',
};

function purchaseMarkers(replay: ReplayDataV2, playerId: string) {
  return replay.inputs
    .flatMap((input) => {
      if (input.kind !== 'shopPurchase' || input.playerId !== playerId || !input.accepted) return [];
      return [{ tick: input.tick, itemId: input.itemId }];
    });
}

export const TimelinePowerupBands: React.FC<TimelinePowerupBandsProps> = ({
  replay,
  totalTicks,
  playerIds,
  currentTick,
  playerLabel = (playerId) => playerId,
}) => {
  const allSpans = useMemo(() => {
    if (!replay || totalTicks <= 0) return {};
    return extractReplayEffectSpans(replay, totalTicks);
  }, [replay, totalTicks]);

  const rows = useMemo(
    () => playerIds.map((playerId) => ({
      playerId,
      spans: allSpans[playerId] ?? [],
      purchases: purchaseMarkers(replay, playerId),
    })),
    [allSpans, playerIds, replay],
  );

  if (!replay || !replay.keyframes || totalTicks <= 0 || rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5" aria-label="Power-up effects and purchase timeline">
      {rows.map((row) => (
        <div key={row.playerId} className="flex min-w-0 items-center gap-2">
          <span className="w-28 shrink-0 truncate font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            {playerLabel(row.playerId)}
          </span>
          <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded border border-white/10 bg-black/50">
            {row.spans.map((span) => {
              const leftPercent = (span.startTick / totalTicks) * 100;
              const widthPercent = Math.max(0.4, ((span.endTick - span.startTick) / totalTicks) * 100);
              const styleClass = EFFECT_COLORS[span.kind] || 'bg-white/40 border-white/70';
              return (
                <div
                  key={`${span.id}_${span.kind}_${span.startTick}`}
                  title={`${playerLabel(row.playerId)} · ${span.label} · ticks ${span.startTick}–${span.endTick}`}
                  className={`absolute inset-y-0 rounded border-y ${styleClass}`}
                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                />
              );
            })}
            {row.purchases.map((purchase) => (
              <div
                key={`${purchase.itemId}_${purchase.tick}`}
                title={`${playerLabel(row.playerId)} purchased ${purchase.itemId} at tick ${purchase.tick}`}
                className="absolute top-0.5 z-10 h-3 w-1 rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,0.9)]"
                style={{ left: `calc(${(purchase.tick / totalTicks) * 100}% - 2px)` }}
              />
            ))}
            {currentTick !== undefined && (
              <div
                className="pointer-events-none absolute inset-y-0 z-20 w-px bg-white"
                style={{ left: `${(currentTick / totalTicks) * 100}%` }}
              />
            )}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 pl-30 text-[9px] text-zinc-600">
        <span className="h-1.5 w-1.5 rounded-full bg-white" /> purchase tick
        <span className="ml-2">colored spans = active effect duration</span>
      </div>
    </div>
  );
};
