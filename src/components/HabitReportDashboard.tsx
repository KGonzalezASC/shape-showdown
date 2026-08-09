import React, { useMemo, useState } from 'react';
import type { MisstepTag } from '../types';
import { createEmptyMisstepCounts, MISSTEP_CATEGORIES, type ReplayDiagnosticReport } from '../replayDiagnostics';
import { Activity, AlertTriangle, BarChart3, ChevronRight, Users } from 'lucide-react';

interface HabitReportDashboardProps {
  report: ReplayDiagnosticReport;
  onJumpToTick: (tick: number) => void;
  onJumpToDecision: (playerId: string, tick: number) => void;
  selectedTick?: number;
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

function formatTime(tick: number): string {
  return `${(tick / 60).toFixed(1)}s`;
}

export const HabitReportDashboard: React.FC<HabitReportDashboardProps> = ({
  report,
  onJumpToTick,
  onJumpToDecision,
  selectedTick,
  playerLabel = (playerId) => playerId,
}) => {
  const [activeCategory, setActiveCategory] = useState<MisstepTag | 'all'>('all');
  const [activePlayer, setActivePlayer] = useState<string | 'all'>('all');
  const playerScopedDecisions = useMemo(
    () => report.annotatedDecisions.filter((decision) => activePlayer === 'all' || decision.playerId === activePlayer),
    [activePlayer, report.annotatedDecisions],
  );
  const displayedCounts = useMemo(() => {
    const counts = createEmptyMisstepCounts();
    for (const decision of playerScopedDecisions) {
      for (const tag of decision.misstepTags) counts[tag] += 1;
    }
    return counts;
  }, [playerScopedDecisions]);
  const displayedHotspotBins = useMemo(() => {
    const bins = report.hotspotBins.map((bin) => ({
      ...bin,
      counts: createEmptyMisstepCounts(),
      totalMissteps: 0,
    }));
    const binSize = report.hotspotBins[0]?.tickEnd - (report.hotspotBins[0]?.tickStart ?? 0) || 1;
    for (const decision of playerScopedDecisions) {
      const index = Math.min(bins.length - 1, Math.max(0, Math.floor(decision.tick / binSize)));
      for (const tag of decision.misstepTags) {
        bins[index].counts[tag] += 1;
        bins[index].totalMissteps += 1;
      }
    }
    return bins;
  }, [playerScopedDecisions, report.hotspotBins]);
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
    ...displayedHotspotBins.map((bin) => Math.max(...(Object.values(bin.counts) as number[]))),
  );

  const toggleCategory = (category: MisstepTag) => {
    setActiveCategory((current) => (current === category ? 'all' : category));
  };

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-white/10 bg-[#111116] p-4 text-white text-xs">
      <div className="border-b border-white/10 pb-3">
        <div className="flex items-center gap-2 font-bold text-emerald-400">
          <BarChart3 size={15} /> SOLVER HABIT REPORT
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
          Retrospective heuristic flags for <span className="font-semibold text-white">{activePlayer === 'all' ? 'both players' : playerLabel(activePlayer)}</span> across{' '}
          <span className="font-mono text-white">{displayedDecisionCount}</span> recorded decisions and{' '}
          <span className="font-mono text-white">{report.totalKeyframes}</span> board frames. A decision can have more than one flag; flags are investigation leads, not match outcomes.
        </p>
      </div>

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
            <Users size={13} className="text-emerald-400" /> Per-player ownership
          </div>
          <button
            type="button"
            onClick={() => setActivePlayer('all')}
            className={`text-[9px] ${activePlayer === 'all' ? 'text-emerald-300' : 'text-zinc-600 hover:text-zinc-300'}`}
          >
            show both
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-white/5 bg-black/30">
          {report.playerSummaries.map((summary) => {
            const isActive = activePlayer === summary.playerId;
            return (
              <button
                type="button"
                key={summary.playerId}
                onClick={() => setActivePlayer((current) => (current === summary.playerId ? 'all' : summary.playerId))}
                className={`flex w-full items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-left last:border-b-0 ${isActive ? 'bg-emerald-950/25' : 'hover:bg-white/5'}`}
              >
                <span className="min-w-0 truncate font-mono text-[10px] text-zinc-300">{playerLabel(summary.playerId)}</span>
                <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                  {summary.totalMissteps} flags / {summary.totalDecisionTraces} decisions
                </span>
              </button>
            );
          })}
          {report.playerSummaries.length === 0 && <div className="p-3 text-[10px] italic text-zinc-600">No decision traces recorded.</div>}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-zinc-300">
            <Activity size={13} className="text-amber-400" /> Flag categories
          </div>
          <span className="text-[9px] text-zinc-600">click to filter jumps</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MISSTEP_CATEGORIES.map((category) => {
            const count = displayedCounts[category] || 0;
            const rate = displayedDecisionCount > 0 ? Math.round((count / displayedDecisionCount) * 100) : 0;
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
                <div className="mt-1 font-mono text-sm font-bold text-white">{count}</div>
                <div className="text-[9px] text-zinc-600">flags · {rate}% of decisions</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
          <span className="flex items-center gap-1.5 font-bold text-zinc-300">Time distribution</span>
          <span className="font-mono text-zinc-600">0.0s → {formatTime(report.totalTicks)}</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/5 bg-black/50 p-3">
          <div className="flex min-w-[520px] flex-col gap-2">
            {MISSTEP_CATEGORIES.map((category) => (
              <div key={category} className="flex items-center gap-3">
                <span className="w-32 truncate text-[10px] font-mono text-zinc-500">{MISSTEP_LABELS[category]}</span>
                <div className="flex h-5 min-w-0 flex-1 gap-1">
                  {displayedHotspotBins.map((bin) => {
                    const count = bin.counts[category] || 0;
                    const intensity = count > 0 ? Math.min(1, count / maxBinCount) : 0;
                    const isCurrentBin = selectedTick !== undefined && selectedTick >= bin.tickStart && selectedTick < bin.tickEnd;
                    return (
                      <button
                        type="button"
                        key={`${category}-${bin.tickStart}`}
                        onClick={() => onJumpToTick(bin.tickStart)}
                        title={`${MISSTEP_LABELS[category]} · ${formatTime(bin.tickStart)}–${formatTime(bin.tickEnd)} · ${count} flag(s)`}
                        className={`h-full min-w-1 flex-1 rounded transition-all ${count === 0 ? 'bg-white/5 hover:bg-white/10' : MISSTEP_COLORS[category]} ${isCurrentBin ? 'z-10 scale-105 ring-2 ring-white' : ''}`}
                        style={{ opacity: count === 0 ? 0.2 : 0.3 + intensity * 0.7 }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">Filtered decision jumps</div>
          <span className="font-mono text-[9px] text-zinc-600">{filteredDecisions.length} matches</span>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-white/5 bg-black/40 p-2 [scrollbar-color:#3f3f46_transparent]">
          <div className="flex flex-col gap-1.5">
            {filteredDecisions.map((decision) => (
              <button
                type="button"
                key={`${decision.playerId}-${decision.tick}`}
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
                {displayedTotalFlags === 0 ? 'No heuristic flags detected for the current player scope.' : 'No flags match the current filters.'}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
