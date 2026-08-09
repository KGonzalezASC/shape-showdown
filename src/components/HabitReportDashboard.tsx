import React, { useMemo, useState } from 'react';
import type { MisstepTag, ReplayDataV2 } from '../types';
import { createEmptyMisstepCounts, MISSTEP_CATEGORIES, type ReplayDiagnosticReport } from '../replayDiagnostics';
import { Activity, AlertTriangle, BarChart3, ChevronRight, Gauge, Users } from 'lucide-react';

interface HabitReportDashboardProps {
  replay: ReplayDataV2;
  report: ReplayDiagnosticReport;
  onJumpToTick: (tick: number) => void;
  onJumpToDecision: (playerId: string, tick: number) => void;
  selectedTick?: number;
  selectedPlayerId?: string | null;
  onSelectPlayer?: (playerId: string) => void;
  playerLabel?: (playerId: string) => string;
}

const MISSTEP_LABELS: Record<MisstepTag, string> = {
  BuriedCavity: 'Cavity burial risk',
  MisjudgedGarbageUrgency: 'Garbage urgency',
  HighFrontierRisk: 'Frontier risk',
  MissedGarbageCancel: 'Missed garbage cancel',
};

const MISSTEP_COLORS: Record<MisstepTag, string> = {
  BuriedCavity: 'bg-rose-500',
  MisjudgedGarbageUrgency: 'bg-amber-500',
  HighFrontierRisk: 'bg-purple-500',
  MissedGarbageCancel: 'bg-cyan-500',
};

const MISSTEP_TEXT_COLORS: Record<MisstepTag, string> = {
  BuriedCavity: 'text-rose-300',
  MisjudgedGarbageUrgency: 'text-amber-300',
  HighFrontierRisk: 'text-purple-300',
  MissedGarbageCancel: 'text-cyan-300',
};

const TIME_MARKS = [0, 0.25, 0.5, 0.75, 1];

interface TimelineBin {
  tickStart: number;
  tickEnd: number;
  counts: Record<MisstepTag, number>;
  totalMissteps: number;
  maxHeight: number;
  cavityDepth: number;
  garbageLines: number;
}

function formatTime(tick: number): string {
  return `${(tick / 60).toFixed(1)}s`;
}

function formatScore(score: number | undefined): string {
  return score === undefined ? '—' : score.toLocaleString();
}

function positionForTick(tick: number, totalTicks: number): number {
  if (totalTicks <= 0) return 0;
  return Math.min(100, Math.max(0, (tick / totalTicks) * 100));
}

export const HabitReportDashboard: React.FC<HabitReportDashboardProps> = ({
  replay,
  report,
  onJumpToTick,
  onJumpToDecision,
  selectedTick,
  selectedPlayerId,
  onSelectPlayer,
  playerLabel = (playerId) => playerId,
}) => {
  const [activeCategory, setActiveCategory] = useState<MisstepTag | 'all'>('all');
  const [playerScope, setPlayerScope] = useState<'selected' | 'all'>(selectedPlayerId ? 'selected' : 'all');
  const activePlayer = playerScope === 'all' ? 'all' : selectedPlayerId ?? 'all';
  const latestFrame = replay.keyframes[replay.keyframes.length - 1];
  const finalPlayers = latestFrame?.players ?? {};
  const finalPlayerIds = useMemo(() => {
    const ids = [...report.playerSummaries.map((summary) => summary.playerId), ...Object.keys(finalPlayers)];
    return [...new Set(ids)];
  }, [finalPlayers, report.playerSummaries]);
  const playerScopedDecisions = useMemo(
    () => report.annotatedDecisions.filter((decision) => activePlayer === 'all' || decision.playerId === activePlayer),
    [activePlayer, report.annotatedDecisions],
  );
  const displayedTimeBins = useMemo<TimelineBin[]>(() => {
    const bins = report.hotspotBins.map((bin) => ({
      ...bin,
      counts: createEmptyMisstepCounts(),
      totalMissteps: 0,
      maxHeight: 0,
      cavityDepth: 0,
      garbageLines: 0,
    }));
    const binSize = report.hotspotBins[0]?.tickEnd - (report.hotspotBins[0]?.tickStart ?? 0) || 1;
    for (const decision of playerScopedDecisions) {
      const index = Math.min(bins.length - 1, Math.max(0, Math.floor(decision.tick / binSize)));
      const bin = bins[index];
      if (!bin) continue;
      bin.maxHeight = Math.max(bin.maxHeight, decision.trace.maxHeight ?? 0);
      bin.cavityDepth = Math.max(bin.cavityDepth, decision.trace.totalCavityDepth ?? 0);
      bin.garbageLines = Math.max(
        bin.garbageLines,
        (decision.trace.pendingGarbageLines ?? 0) + (decision.trace.imminentGarbageLines ?? 0),
      );
      for (const tag of decision.misstepTags) {
        bin.counts[tag] += 1;
        bin.totalMissteps += 1;
      }
    }
    return bins;
  }, [playerScopedDecisions, report.hotspotBins]);
  const displayedCounts = useMemo(() => {
    const counts = createEmptyMisstepCounts();
    for (const decision of playerScopedDecisions) {
      for (const tag of decision.misstepTags) counts[tag] += 1;
    }
    return counts;
  }, [playerScopedDecisions]);
  const categoryDecisionCounts = useMemo(() => {
    const counts = createEmptyMisstepCounts();
    for (const decision of playerScopedDecisions) {
      for (const tag of decision.misstepTags) counts[tag] += 1;
    }
    return counts;
  }, [playerScopedDecisions]);
  const displayedDecisionCount = playerScopedDecisions.length;
  const displayedFlaggedDecisionCount = playerScopedDecisions.filter((decision) => decision.misstepTags.length > 0).length;
  const displayedTotalFlags = (Object.values(displayedCounts) as number[]).reduce((sum, count) => sum + count, 0);
  const filteredDecisions = useMemo(
    () => playerScopedDecisions.filter((decision) => {
      const categoryMatches = activeCategory === 'all' || decision.misstepTags.includes(activeCategory);
      return categoryMatches && decision.misstepTags.length > 0;
    }),
    [activeCategory, playerScopedDecisions],
  );
  const maxBinCount = Math.max(
    1,
    ...displayedTimeBins.map((bin) => Math.max(...(Object.values(bin.counts) as number[]))),
  );
  const pressureScales = useMemo(() => ({
    height: Math.max(1, ...displayedTimeBins.map((bin) => bin.maxHeight)),
    cavity: Math.max(1, ...displayedTimeBins.map((bin) => bin.cavityDepth)),
    garbage: Math.max(1, ...displayedTimeBins.map((bin) => bin.garbageLines)),
  }), [displayedTimeBins]);
  const selectedPosition = positionForTick(selectedTick ?? 0, report.totalTicks);
  const finalPlayerSummary = (playerId: string) => report.playerSummaries.find((summary) => summary.playerId === playerId);

  const toggleCategory = (category: MisstepTag) => {
    setActiveCategory((current) => (current === category ? 'all' : category));
  };

  const selectPlayer = (playerId: string) => {
    setPlayerScope('selected');
    onSelectPlayer?.(playerId);
  };

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-white/10 bg-[#111116] p-4 text-white text-xs">
      <div className="border-b border-white/10 pb-3">
        <div className="flex items-center gap-2 font-bold text-emerald-400">
          <BarChart3 size={15} /> REPLAY MISSTEP TIMELINE
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
          One seeded replay, not a multi-seed benchmark. These are retrospective heuristic flags for{' '}
          <span className="font-semibold text-white">{activePlayer === 'all' ? 'both players' : playerLabel(activePlayer)}</span> across{' '}
          <span className="font-mono text-white">{displayedDecisionCount}</span> recorded decisions. A decision can have more than one flag; flags are investigation leads, not match outcomes.
        </p>
      </div>

      <section className="rounded-lg border border-white/5 bg-black/30 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">Run context</div>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300">single replay</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9px] uppercase text-zinc-600">Seed</div>
            <div className="font-mono text-sm text-zinc-200">{replay.seed}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-zinc-600">Duration</div>
            <div className="font-mono text-sm text-zinc-200">{formatTime(report.totalTicks)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-zinc-600">Board frames</div>
            <div className="font-mono text-sm text-zinc-200">{report.totalKeyframes}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-zinc-600">Flag rate</div>
            <div className="font-mono text-sm text-amber-300">
              {displayedDecisionCount > 0 ? `${Math.round((displayedFlaggedDecisionCount / displayedDecisionCount) * 100)}%` : '—'}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-white/5 pt-2">
          {finalPlayerIds.map((playerId) => {
            const player = finalPlayers[playerId];
            const summary = finalPlayerSummary(playerId);
            return (
              <div key={playerId} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="min-w-0 truncate text-zinc-300">{playerLabel(playerId)}</span>
                <span className="shrink-0 font-mono text-zinc-500">
                  score {formatScore(player?.score)} · {player?.topOut ? 'top-out' : 'survived'} · {summary?.totalMissteps ?? 0} flags
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded border border-white/5 bg-black/40 p-2.5">
          <div className="font-mono text-[9px] uppercase text-zinc-500">Decision traces</div>
          <div className="mt-1 font-mono text-lg font-bold text-white">{displayedDecisionCount}</div>
        </div>
        <div className="rounded border border-white/5 bg-black/40 p-2.5">
          <div className="font-mono text-[9px] uppercase text-zinc-500">Flagged decisions</div>
          <div className="mt-1 font-mono text-lg font-bold text-amber-300">{displayedFlaggedDecisionCount}</div>
        </div>
        <div className="rounded border border-white/5 bg-black/40 p-2.5">
          <div className="font-mono text-[9px] uppercase text-zinc-500">Total flags</div>
          <div className="mt-1 font-mono text-lg font-bold text-rose-300">{displayedTotalFlags}</div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-zinc-300">
            <Users size={13} className="text-emerald-400" /> Player scope
          </div>
          <button
            type="button"
            onClick={() => setPlayerScope('all')}
            className={`text-[9px] ${activePlayer === 'all' ? 'text-emerald-300' : 'text-zinc-600 hover:text-zinc-300'}`}
          >
            show both players
          </button>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-white/5 bg-black/30 p-1">
          {finalPlayerIds.map((playerId) => {
            const summary = finalPlayerSummary(playerId);
            const isActive = activePlayer === playerId;
            return (
              <button
                type="button"
                key={playerId}
                onClick={() => selectPlayer(playerId)}
                className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left ${isActive ? 'bg-emerald-950/30' : 'hover:bg-white/5'}`}
              >
                <span className="min-w-0 truncate font-mono text-[10px] text-zinc-300">{playerLabel(playerId)}</span>
                <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                  {summary?.totalMissteps ?? 0} flags / {summary?.totalDecisionTraces ?? 0} decisions
                </span>
              </button>
            );
          })}
          {finalPlayerIds.length === 0 && <div className="p-3 text-[10px] italic text-zinc-600">No player data recorded.</div>}
        </div>
        <div className="text-[9px] text-zinc-600">Selecting a player also changes the candidate inspector owner.</div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-zinc-300">
            <Activity size={13} className="text-amber-400" /> Flag categories
          </div>
          <span className="text-[9px] text-zinc-600">click to filter timeline</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MISSTEP_CATEGORIES.map((category) => {
            const count = displayedCounts[category] || 0;
            const decisionCount = categoryDecisionCounts[category] || 0;
            const rate = displayedDecisionCount > 0 ? Math.round((decisionCount / displayedDecisionCount) * 100) : 0;
            const isActive = activeCategory === category;
            return (
              <button
                type="button"
                key={category}
                onClick={() => toggleCategory(category)}
                className={`rounded-lg border p-2.5 text-left transition-colors ${isActive ? 'border-emerald-500/40 bg-emerald-950/25' : 'border-white/5 bg-black/40 hover:border-white/15'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`text-[10px] font-medium ${MISSTEP_TEXT_COLORS[category]}`}>{MISSTEP_LABELS[category]}</div>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${MISSTEP_COLORS[category]} ${count === 0 ? 'opacity-20' : ''}`} />
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-white">{count} flags</div>
                <div className="text-[9px] text-zinc-600">{decisionCount} decisions · {rate}% of traces</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
          <span className="flex items-center gap-1.5 font-bold text-zinc-300">Board pressure context</span>
          <span className="font-mono text-zinc-600">max observed per time window</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/5 bg-black/50 p-3">
          <div className="min-w-[370px]">
            <div className="mb-2 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[9px] font-mono text-zinc-600">
              <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-purple-400" />H stack</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-400" />C cavity</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />G garbage</span>
            </div>
            {[
              { label: 'H', title: 'Max stack height', color: 'bg-purple-400', scale: pressureScales.height, getValue: (bin: TimelineBin) => bin.maxHeight },
              { label: 'C', title: 'Cavity depth', color: 'bg-rose-400', scale: pressureScales.cavity, getValue: (bin: TimelineBin) => bin.cavityDepth },
              { label: 'G', title: 'Pending + imminent garbage', color: 'bg-amber-400', scale: pressureScales.garbage, getValue: (bin: TimelineBin) => bin.garbageLines },
            ].map((row) => (
              <div key={row.label} className="mb-1 flex items-center gap-3 last:mb-0">
                <span className="w-5 shrink-0 text-center font-mono text-[9px] font-bold text-zinc-500">{row.label}</span>
                <div className="relative flex h-4 min-w-0 flex-1 gap-px">
                  {displayedTimeBins.map((bin, index) => {
                    const value = row.getValue(bin);
                    const intensity = value > 0 ? 0.2 + (value / row.scale) * 0.8 : 0.08;
                    return (
                      <button
                        type="button"
                        key={`${row.label}-${bin.tickStart}`}
                        onClick={() => onJumpToTick(bin.tickStart)}
                        title={`${row.title} · ${formatTime(bin.tickStart)}–${formatTime(bin.tickEnd)} · ${value}`}
                        className={`relative min-w-1 flex-1 rounded-sm ${row.color} hover:ring-1 hover:ring-white`}
                        style={{ opacity: intensity }}
                      />
                    );
                  })}
                  {selectedTick !== undefined && <span className="pointer-events-none absolute inset-y-[-2px] z-10 w-px bg-white shadow-[0_0_5px_rgba(255,255,255,0.9)]" style={{ left: `${selectedPosition}%` }} />}
                </div>
              </div>
            ))}
            <div className="relative ml-8 mt-2 h-4 border-t border-white/10">
              {TIME_MARKS.map((mark) => (
                <span
                  key={mark}
                  className="absolute top-1 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] text-zinc-600 first:-translate-x-0 last:-translate-x-full"
                  style={{ left: `${mark * 100}%` }}
                >
                  {formatTime(report.totalTicks * mark)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
          <span className="flex items-center gap-1.5 font-bold text-zinc-300"><Gauge size={13} className="text-rose-400" /> Missteps across this replay</span>
          <span className="font-mono text-zinc-600">0.0s → {formatTime(report.totalTicks)}</span>
        </div>
        <p className="text-[9px] leading-relaxed text-zinc-600">Each dot is an exact retrospective flag. The shaded cells show how many flags landed in each time window.</p>
        <div className="overflow-x-auto rounded-lg border border-white/5 bg-black/50 p-3">
          <div className="min-w-[370px]">
            <div className="relative ml-36 h-5 border-b border-white/10">
              {TIME_MARKS.map((mark) => (
                <span
                  key={mark}
                  className="absolute top-1 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] text-zinc-600 first:-translate-x-0 last:-translate-x-full"
                  style={{ left: `${mark * 100}%` }}
                >
                  {formatTime(report.totalTicks * mark)}
                </span>
              ))}
            </div>
            {MISSTEP_CATEGORIES.map((category) => {
              const isActive = activeCategory === 'all' || activeCategory === category;
              const markers = playerScopedDecisions.flatMap((decision, decisionIndex) =>
                decision.misstepTags
                  .filter((tag) => tag === category)
                  .map((tag) => ({ decision, tag, decisionIndex })),
              );
              return (
                <div key={category} className={`flex items-center gap-3 py-1.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-35'}`}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={`w-32 shrink-0 truncate text-left text-[10px] font-mono ${MISSTEP_TEXT_COLORS[category]} hover:text-white`}
                  >
                    {MISSTEP_LABELS[category]}
                  </button>
                  <div className="relative h-6 min-w-0 flex-1 overflow-visible rounded bg-white/[0.03]" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '25% 100%' }}>
                    {displayedTimeBins.map((bin, index) => {
                      const count = bin.counts[category] || 0;
                      const intensity = count > 0 ? 0.2 + (count / maxBinCount) * 0.8 : 0.05;
                      return (
                        <button
                          type="button"
                          key={`${category}-${bin.tickStart}`}
                          onClick={() => onJumpToTick(bin.tickStart)}
                          title={`${MISSTEP_LABELS[category]} · ${formatTime(bin.tickStart)}–${formatTime(bin.tickEnd)} · ${count} flag(s)`}
                          className={`absolute inset-y-0 rounded-sm ${MISSTEP_COLORS[category]} hover:ring-1 hover:ring-white`}
                          style={{ left: `${(index / Math.max(1, displayedTimeBins.length)) * 100}%`, width: `${100 / Math.max(1, displayedTimeBins.length)}%`, opacity: intensity }}
                        />
                      );
                    })}
                    {markers.map(({ decision, tag, decisionIndex }) => (
                      <button
                        type="button"
                        key={`${category}-${decision.playerId}-${decision.tick}-${decision.trace.decisionId ?? decisionIndex}`}
                        onClick={() => onJumpToDecision(decision.playerId, decision.tick)}
                        title={`${MISSTEP_LABELS[tag]} · ${playerLabel(decision.playerId)} · tick ${decision.tick} (${formatTime(decision.tick)})`}
                        aria-label={`${MISSTEP_LABELS[tag]} for ${playerLabel(decision.playerId)} at ${formatTime(decision.tick)}`}
                        className={`absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#111116] ${MISSTEP_COLORS[tag]} shadow-[0_0_7px_rgba(255,255,255,0.2)] transition-transform hover:scale-125`}
                        style={{ left: `${positionForTick(decision.tick, report.totalTicks)}%` }}
                      />
                    ))}
                    {selectedTick !== undefined && <span className="pointer-events-none absolute inset-y-[-3px] z-30 w-px bg-white shadow-[0_0_5px_rgba(255,255,255,0.9)]" style={{ left: `${selectedPosition}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">Flagged decisions to inspect</div>
          <span className="font-mono text-[9px] text-zinc-600">{filteredDecisions.length} matches</span>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-white/5 bg-black/40 p-2 [scrollbar-color:#3f3f46_transparent]">
          <div className="flex flex-col gap-1.5">
            {filteredDecisions.map((decision) => (
              <button
                type="button"
                key={`${decision.playerId}-${decision.tick}-${decision.trace.decisionId ?? 'legacy'}`}
                onClick={() => onJumpToDecision(decision.playerId, decision.tick)}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors ${selectedTick === decision.tick ? 'border-emerald-500/40 bg-emerald-950/30' : 'border-white/5 bg-white/[0.02] hover:bg-white/10'}`}
              >
                <AlertTriangle size={11} className="shrink-0 text-amber-400" />
                <span className="w-12 shrink-0 font-mono text-[10px] text-zinc-300">t={formatTime(decision.tick)}</span>
                <span className="min-w-0 flex-1 truncate text-[9px] text-zinc-500">{playerLabel(decision.playerId)} · {decision.misstepTags.map((tag) => MISSTEP_LABELS[tag]).join(', ')}</span>
                <ChevronRight size={10} className="shrink-0 text-zinc-600" />
              </button>
            ))}
            {filteredDecisions.length === 0 && (
              <div className="p-3 text-center text-[10px] italic text-zinc-600">
                {displayedTotalFlags === 0 ? 'No retrospective flags detected for the current player scope.' : 'No flags match the current filters.'}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
