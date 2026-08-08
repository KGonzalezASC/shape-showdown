import React from 'react';
import type { MisstepTag } from '../types';
import type { ReplayDiagnosticReport } from '../replayDiagnostics';
import { Activity, AlertTriangle, BarChart3, ChevronRight, Zap } from 'lucide-react';

interface HabitReportDashboardProps {
  report: ReplayDiagnosticReport;
  onJumpToTick: (tick: number) => void;
  selectedTick?: number;
}

const MISSTEP_LABELS: Record<MisstepTag, string> = {
  BuriedCavity: 'Buried Cavity',
  MisjudgedGarbageUrgency: 'Misjudged Urgency',
  HighFrontierRisk: 'Frontier Risk',
  MissedGarbageCancel: 'Missed Cancel',
};

const MISSTEP_COLORS: Record<MisstepTag, string> = {
  BuriedCavity: 'bg-rose-500',
  MisjudgedGarbageUrgency: 'bg-amber-500',
  HighFrontierRisk: 'bg-purple-500',
  MissedGarbageCancel: 'bg-cyan-500',
};

export const HabitReportDashboard: React.FC<HabitReportDashboardProps> = ({
  report,
  onJumpToTick,
  selectedTick,
}) => {
  const categories: MisstepTag[] = [
    'BuriedCavity',
    'MisjudgedGarbageUrgency',
    'HighFrontierRisk',
    'MissedGarbageCancel',
  ];

  const maxBinCount = Math.max(
    1,
    ...report.hotspotBins.map((bin) => Math.max(...(Object.values(bin.counts) as number[]))),
  );

  return (
    <div className="flex flex-col gap-5 bg-[#111116] border border-white/10 rounded-xl p-4 text-white text-xs">
      <div className="flex justify-between items-center pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 font-bold text-emerald-400">
            <BarChart3 size={15} /> SOLVER HABIT REPORT & TREND DIAGNOSTICS
          </div>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Analyzed {report.totalDecisionTraces} decision traces • Total Missteps Detected: {' '}
            <span className="font-bold text-rose-400 font-mono">{report.totalMissteps}</span>
          </p>
        </div>
      </div>

      {/* Misstep Category Summary Badges */}
      <div className="grid grid-cols-2 gap-2">
        {categories.map((cat) => {
          const count = report.misstepCounts[cat] || 0;
          return (
            <div
              key={cat}
              className="p-2.5 bg-black/40 border border-white/5 rounded-lg flex justify-between items-center"
            >
              <div>
                <div className="text-[10px] text-zinc-400 font-medium">{MISSTEP_LABELS[cat]}</div>
                <div className="text-sm font-bold font-mono text-white mt-0.5">{count} occurrences</div>
              </div>
              <div
                className={`w-2.5 h-2.5 rounded-full ${MISSTEP_COLORS[cat]} ${
                  count > 0 ? 'animate-pulse' : 'opacity-20'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Emergent Hotspot Heatmap Section */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
            <Activity size={13} className="text-amber-400" /> Emergent Hotspot Heatmap (Time-Series)
          </span>
          <span>0s ➔ 60s (3600 Ticks)</span>
        </div>

        <div className="bg-black/50 border border-white/5 rounded-lg p-3 flex flex-col gap-2">
          {categories.map((cat) => (
            <div key={cat} className="flex items-center gap-3">
              <span className="w-28 text-[10px] font-mono text-zinc-400 truncate">{MISSTEP_LABELS[cat]}</span>
              <div className="flex-1 flex gap-1 h-5 items-center">
                {report.hotspotBins.map((bin, idx) => {
                  const count = bin.counts[cat] || 0;
                  const intensity = count > 0 ? Math.min(1, count / maxBinCount) : 0;
                  const isCurrentBin =
                    selectedTick !== undefined &&
                    selectedTick >= bin.tickStart &&
                    selectedTick < bin.tickEnd;

                  return (
                    <button
                      type="button"
                      key={bin.tickStart}
                      onClick={() => onJumpToTick(bin.tickStart)}
                      title={`Tick ${bin.tickStart}-${bin.tickEnd}: ${count} ${cat} misstep(s)`}
                      className={`flex-1 h-full rounded transition-all cursor-pointer ${
                        count === 0
                          ? 'bg-white/5 hover:bg-white/10'
                          : cat === 'BuriedCavity'
                          ? 'bg-rose-500'
                          : cat === 'MisjudgedGarbageUrgency'
                          ? 'bg-amber-500'
                          : cat === 'HighFrontierRisk'
                          ? 'bg-purple-500'
                          : 'bg-cyan-500'
                      } ${isCurrentBin ? 'ring-2 ring-white scale-105 z-10' : ''}`}
                      style={{ opacity: count === 0 ? 0.2 : 0.3 + intensity * 0.7 }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Direct Misstep Jump Scrubber */}
      <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
        <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
          Direct Misstep Jump Timeline
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-black/40 border border-white/5 rounded-lg">
          {report.annotatedKeyframes
            .filter((k) => k.misstepTags.length > 0)
            .map((k) => (
              <button
                type="button"
                key={k.tick}
                onClick={() => onJumpToTick(k.tick)}
                className={`px-2 py-1 bg-white/5 hover:bg-white/15 border rounded font-mono text-[10px] flex items-center gap-1.5 transition-colors ${
                  selectedTick === k.tick ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30' : 'border-white/10 text-zinc-300'
                }`}
              >
                <AlertTriangle size={11} className="text-amber-400" />
                <span>t={(k.tick / 60).toFixed(1)}s</span>
                <span className="text-[9px] text-zinc-500">({k.misstepTags.join(', ')})</span>
                <ChevronRight size={10} />
              </button>
            ))}
          {report.annotatedKeyframes.filter((k) => k.misstepTags.length > 0).length === 0 && (
            <div className="text-[10px] text-zinc-500 p-2 italic w-full text-center">
              🎉 No solver missteps detected in this replay run!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
