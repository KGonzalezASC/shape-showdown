import React, { useState } from 'react';
import type { BotDecisionTrace, CandidateEvaluationTrace, MisstepTag } from '../types';
import { AlertTriangle, ChevronDown, ChevronUp, Layers, Target } from 'lucide-react';

interface CandidateInspectorProps {
  trace: BotDecisionTrace | null;
  onJumpToTick?: (tick: number) => void;
}

const MISSTEP_BADGE_STYLES: Record<MisstepTag, { label: string; bg: string; text: string; border: string }> = {
  BuriedCavity: {
    label: 'Buried Cavity',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
  },
  MisjudgedGarbageUrgency: {
    label: 'Misjudged Urgency',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  HighFrontierRisk: {
    label: 'Frontier Risk',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
  },
  MissedGarbageCancel: {
    label: 'Missed Cancel',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
  },
};

export const CandidateInspector: React.FC<CandidateInspectorProps> = ({ trace }) => {
  const [expanded, setExpanded] = useState(false);

  if (!trace) {
    return (
      <div className="p-6 text-center text-zinc-500 text-xs border border-white/5 rounded-xl bg-[#111116]">
        <Layers className="mx-auto mb-2 text-zinc-600" size={24} />
        No solver decision trace recorded at this frame. Scrub to a piece drop tick to inspect candidate evaluations.
      </div>
    );
  }

  const selected = trace.selectedCandidate;
  const candidates: CandidateEvaluationTrace[] = [
    selected,
    ...(trace.runnerUpCandidates || []),
  ].filter(Boolean);

  const maxScore = Math.max(...candidates.map((c) => Math.max(1, Math.abs(c.score))));

  return (
    <div className="flex flex-col gap-4 bg-[#111116] border border-white/10 rounded-xl p-4 text-white text-xs">
      <div className="flex justify-between items-center pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 font-bold text-emerald-400">
            <Target size={15} /> SOLVER DECISION INSPECTOR
          </div>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Tick {trace.tick} • Piece <span className="font-mono text-white font-bold">{trace.pieceType}</span>
            {trace.isBomber && <span className="ml-1.5 text-rose-400 font-bold">💣 Bomber</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 bg-white/5 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Compact' : 'Expanded'}
        </button>
      </div>

      {/* Retrospective Misstep Badges */}
      {trace.misstepTags && trace.misstepTags.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2.5 bg-rose-950/20 border border-rose-500/20 rounded-lg">
          <div className="flex items-center gap-1 text-rose-400 font-bold text-[11px] w-full">
            <AlertTriangle size={13} /> RETROSPECTIVE MISSTEP DIAGNOSIS:
          </div>
          {trace.misstepTags.map((tag) => {
            const style = MISSTEP_BADGE_STYLES[tag];
            return (
              <span
                key={tag}
                className={`px-2 py-0.5 rounded border text-[10px] font-bold ${style.bg} ${style.text} ${style.border}`}
              >
                ⚠️ {style.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Active State Context Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 bg-black/40 border border-white/5 rounded">
          <div className="text-[9px] text-zinc-500 uppercase font-mono">Max Height</div>
          <div className="text-sm font-bold font-mono text-zinc-200">{trace.maxHeight} / 20</div>
        </div>
        <div className="p-2 bg-black/40 border border-white/5 rounded">
          <div className="text-[9px] text-zinc-500 uppercase font-mono">Cavity Depth</div>
          <div className="text-sm font-bold font-mono text-amber-400">{trace.totalCavityDepth}</div>
        </div>
        <div className="p-2 bg-black/40 border border-white/5 rounded">
          <div className="text-[9px] text-zinc-500 uppercase font-mono">Imminent Garbage</div>
          <div className="text-sm font-bold font-mono text-rose-400">{trace.imminentGarbageLines} lines</div>
        </div>
      </div>

      {/* Candidate Sub-Score Stacked Bars */}
      <div className="flex flex-col gap-3 mt-1">
        <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex justify-between">
          <span>Candidate Placements (Sub-Score Decompositions)</span>
          <span>Total Score</span>
        </div>

        {candidates.slice(0, expanded ? 8 : 3).map((candidate, idx) => {
          const isSelected = candidate.selected;
          const sub = candidate.subScores || {
            lineClearScore: 0,
            holeCountScore: 0,
            holeCountDeltaScore: 0,
            cavityScore: 0,
            heightScore: 0,
            bumpinessScore: 0,
            spiresScore: 0,
            wellsScore: 0,
            poisonScore: 0,
            dropDepthBonus: 0,
            visibilityRiskPenalty: 0,
            totalScore: candidate.score,
          };

          return (
            <div
              key={`${candidate.rotation}_${candidate.x}_${idx}`}
              className={`p-2.5 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                  : 'bg-black/20 border-white/5 opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      isSelected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {isSelected ? 'SELECTED' : `#${idx + 1}`}
                  </span>
                  <span className="font-mono text-xs text-zinc-300">
                    rot: {candidate.rotation} • col: {candidate.x}
                  </span>
                </div>
                <span className={`font-mono font-bold text-xs ${isSelected ? 'text-emerald-400' : 'text-zinc-400'}`}>
                  {candidate.score > 0 ? `+${candidate.score}` : candidate.score}
                </span>
              </div>

              {/* Segmented Stacked Bar Visualization */}
              <div className="h-3 bg-black/60 rounded overflow-hidden flex w-full border border-white/5">
                {sub.lineClearScore > 0 && (
                  <div
                    title={`Line Clear: +${sub.lineClearScore}`}
                    style={{ width: `${Math.min(100, (sub.lineClearScore / maxScore) * 100)}%` }}
                    className="bg-emerald-500 h-full border-r border-black/40"
                  />
                )}
                {Math.abs(sub.cavityScore) > 0 && (
                  <div
                    title={`Cavity Depth Delta: ${sub.cavityScore}`}
                    style={{ width: `${Math.min(100, (Math.abs(sub.cavityScore) / maxScore) * 100)}%` }}
                    className="bg-cyan-500 h-full border-r border-black/40"
                  />
                )}
                {Math.abs(sub.holeCountScore + sub.holeCountDeltaScore) > 0 && (
                  <div
                    title={`Holes Penalty: ${sub.holeCountScore + sub.holeCountDeltaScore}`}
                    style={{ width: `${Math.min(100, (Math.abs(sub.holeCountScore + sub.holeCountDeltaScore) / maxScore) * 100)}%` }}
                    className="bg-amber-500 h-full border-r border-black/40"
                  />
                )}
                {Math.abs(sub.heightScore) > 0 && (
                  <div
                    title={`Height Penalty: ${sub.heightScore}`}
                    style={{ width: `${Math.min(100, (Math.abs(sub.heightScore) / maxScore) * 100)}%` }}
                    className="bg-rose-500 h-full border-r border-black/40"
                  />
                )}
                {sub.visibilityRiskPenalty > 0 && (
                  <div
                    title={`Frontier Risk Penalty: -${sub.visibilityRiskPenalty}`}
                    style={{ width: `${Math.min(100, (sub.visibilityRiskPenalty / maxScore) * 100)}%` }}
                    className="bg-purple-500 h-full border-r border-black/40"
                  />
                )}
              </div>

              {/* Segmented Legend Chips (Shown in Expanded View) */}
              {expanded && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[10px] font-mono text-zinc-400 pt-1.5 border-t border-white/5">
                  <div>Line Clear: <span className="text-emerald-400 font-bold">+{sub.lineClearScore}</span></div>
                  <div>Cavity Delta: <span className="text-cyan-400 font-bold">{sub.cavityScore}</span></div>
                  <div>Holes Penalty: <span className="text-amber-400 font-bold">{sub.holeCountScore + sub.holeCountDeltaScore}</span></div>
                  <div>Height Penalty: <span className="text-rose-400 font-bold">{sub.heightScore}</span></div>
                  <div>Frontier Risk: <span className="text-purple-400 font-bold">-{sub.visibilityRiskPenalty}</span></div>
                  <div>Drop Bonus: <span className="text-zinc-300 font-bold">+{sub.dropDepthBonus}</span></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
