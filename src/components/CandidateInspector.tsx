import React, { useState } from 'react';
import type { BotDecisionTrace, CandidateEvaluationTrace, CandidateSubScores, MisstepTag } from '../types';
import { AlertTriangle, ChevronDown, ChevronUp, Layers, Target } from 'lucide-react';
import { styleForFieldEffect } from '../shop/effectStyles';
import type { PublicPlayerState } from '../state/publicSnapshots';

interface CandidateInspectorProps {
  trace: BotDecisionTrace | null;
  player: PublicPlayerState | null;
  playerLabel: string;
  frameTick?: number;
}

const MISSTEP_BADGE_STYLES: Record<MisstepTag, { label: string; bg: string; text: string; border: string }> = {
  BuriedCavity: {
    label: 'Cavity burial risk',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
  },
  MisjudgedGarbageUrgency: {
    label: 'Garbage urgency',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  HighFrontierRisk: {
    label: 'Frontier risk',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
  },
  MissedGarbageCancel: {
    label: 'Missed garbage cancel',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
  },
};

interface Contribution {
  label: string;
  value: number;
  tone: 'positive' | 'negative' | 'neutral';
}

function formatScore(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

function contributionsFor(sub: CandidateSubScores): Contribution[] {
  return [
    { label: 'Line clears / attack', value: sub.lineClearScore, tone: 'positive' },
    { label: 'Existing holes', value: sub.holeCountScore, tone: 'negative' },
    { label: 'Hole-count change', value: sub.holeCountDeltaScore, tone: 'negative' },
    { label: 'Cavity-depth change', value: sub.cavityScore, tone: 'neutral' },
    { label: 'Stack height', value: sub.heightScore, tone: 'negative' },
    { label: 'Surface bumpiness', value: sub.bumpinessScore, tone: 'negative' },
    { label: 'Spires', value: sub.spiresScore, tone: 'negative' },
    { label: 'Wells', value: sub.wellsScore, tone: 'negative' },
    { label: 'Poison cells', value: sub.poisonScore, tone: 'negative' },
    { label: 'Drop-depth bonus', value: sub.dropDepthBonus, tone: 'positive' },
    { label: 'Visibility / frontier risk', value: -sub.visibilityRiskPenalty, tone: 'negative' },
    { label: 'Safety / terminal adjustment', value: sub.finalAdjustmentScore ?? 0, tone: 'negative' },
  ];
}

function candidateSubScores(candidate: CandidateEvaluationTrace): CandidateSubScores {
  return candidate.subScores ?? {
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
    finalAdjustmentScore: 0,
    totalScore: candidate.score,
  };
}

function ScorePosition({ score, min, max }: { score: number; min: number; max: number }) {
  const range = Math.max(1, max - min);
  const position = ((score - min) / range) * 100;
  return (
    <div className="relative h-2 overflow-hidden rounded-full border border-white/10 bg-zinc-950">
      <div className="absolute inset-y-0 left-0 bg-emerald-500/25" style={{ width: `${position}%` }} />
      <div
        className="absolute top-[-2px] h-3 w-1 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]"
        style={{ left: `calc(${position}% - 2px)` }}
      />
    </div>
  );
}

function ScoreContributionTable({ candidate }: { candidate: CandidateEvaluationTrace }) {
  const sub = candidateSubScores(candidate);
  const contributions = contributionsFor(sub);
  const sum = contributions.reduce((total, contribution) => total + contribution.value, 0);

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Why this score?</div>
          <div className="text-[9px] text-zinc-500">Every signed term below contributes to the net heuristic score.</div>
        </div>
        <span className="font-mono text-sm font-bold text-emerald-300">{formatScore(candidate.score)}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[10px] font-mono">
        {contributions.map((contribution) => (
          <React.Fragment key={contribution.label}>
            <span className="truncate text-zinc-400">{contribution.label}</span>
            <span
              className={
                contribution.value > 0
                  ? 'text-emerald-300'
                  : contribution.value < 0
                    ? 'text-rose-300'
                    : 'text-zinc-600'
              }
            >
              {formatScore(contribution.value)}
            </span>
          </React.Fragment>
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-[10px] font-mono">
        <span className="text-zinc-500">Sum of terms</span>
        <span className="font-bold text-white">{formatScore(sum)} = {formatScore(candidate.score)}</span>
      </div>
    </div>
  );
}

export const CandidateInspector: React.FC<CandidateInspectorProps> = ({
  trace,
  player,
  playerLabel,
  frameTick,
}) => {
  const [expanded, setExpanded] = useState(true);

  if (!trace) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#111116] p-5 text-xs text-zinc-400">
        <div className="flex items-center gap-2 font-bold text-emerald-400">
          <Layers size={16} /> CANDIDATE INSPECTOR
        </div>
        <p className="leading-relaxed">
          No solver decision is recorded for <span className="font-semibold text-white">{playerLabel}</span> at this frame.
          Scrub to a piece-lock decision or select another player.
        </p>
      </div>
    );
  }

  const selected = trace.selectedCandidate;
  const candidates: CandidateEvaluationTrace[] = [selected, ...(trace.runnerUpCandidates || [])].filter(Boolean);
  const scores = candidates.map((candidate) => candidate.score);
  const scoreMin = Math.min(0, ...scores);
  const scoreMax = Math.max(0, ...scores);
  const runnerUp = candidates.find((candidate) => !candidate.selected);
  const scoreMargin = runnerUp ? selected.score - runnerUp.score : null;
  const alternativeCount = Math.max(0, candidates.length - 1);
  const decisionTick = trace.tick;

  const effects = trace.activeEffects ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#111116] p-4 text-white text-xs">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-emerald-400">
            <Target size={15} /> SOLVER DECISION INSPECTOR
          </div>
          <p className="mt-1 text-[10px] text-zinc-400">
            <span className="font-semibold text-white">{playerLabel}</span> · decision tick{' '}
            <span className="font-mono text-white">{decisionTick}</span>
            {frameTick !== undefined && frameTick !== decisionTick && (
              <span className="text-zinc-600"> · shown in frame {frameTick}</span>
            )}
            {' · '}piece <span className="font-mono font-bold text-white">{trace.pieceType}</span>
            {trace.isBomber && <span className="ml-1.5 font-bold text-rose-400">· Bomber</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex shrink-0 items-center gap-1 rounded bg-white/5 px-2 py-1.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Hide term details' : 'Show term details'}
        </button>
      </div>

      <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-3">
        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">Two different scores</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9px] uppercase text-zinc-500">Player score / wallet</div>
            <div className="mt-0.5 font-mono text-lg font-bold text-white">{player?.score ?? '—'}</div>
            <div className="text-[9px] text-zinc-500">Match points and shop currency for {playerLabel}.</div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-zinc-500">Selected net heuristic</div>
            <div className="mt-0.5 font-mono text-lg font-bold text-emerald-300">{formatScore(selected.score)}</div>
            <div className="text-[9px] text-zinc-500">Placement estimate; higher wins among this piece's candidates.</div>
          </div>
        </div>
      </div>

      {trace.misstepTags && trace.misstepTags.length > 0 && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-950/20 p-2.5">
          <div className="flex items-center gap-1 text-[11px] font-bold text-rose-400">
            <AlertTriangle size={13} /> RETROSPECTIVE HEURISTIC FLAGS
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-zinc-400">
            These flags identify suspicious patterns in recorded alternatives and later board state; they are not proof that the move lost the match.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {trace.misstepTags.map((tag) => {
              const style = MISSTEP_BADGE_STYLES[tag];
              return (
                <span
                  key={tag}
                  className={`rounded border px-2 py-0.5 text-[10px] font-bold ${style.bg} ${style.text} ${style.border}`}
                >
                  {style.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border border-white/5 bg-black/40 p-2">
          <div className="font-mono text-[9px] uppercase text-zinc-500">Max height</div>
          <div className="font-mono text-sm font-bold text-zinc-200">{trace.maxHeight} / 20</div>
        </div>
        <div className="rounded border border-white/5 bg-black/40 p-2">
          <div className="font-mono text-[9px] uppercase text-zinc-500">Cavity depth</div>
          <div className="font-mono text-sm font-bold text-amber-400">{trace.totalCavityDepth}</div>
        </div>
        <div className="rounded border border-white/5 bg-black/40 p-2">
          <div className="font-mono text-[9px] uppercase text-zinc-500">Pending garbage</div>
          <div className="font-mono text-sm font-bold text-zinc-200">{trace.pendingGarbageLines} lines</div>
        </div>
        <div className="rounded border border-white/5 bg-black/40 p-2">
          <div className="font-mono text-[9px] uppercase text-zinc-500">Arriving soon</div>
          <div className="font-mono text-sm font-bold text-rose-400">{trace.imminentGarbageLines} lines</div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">Active effects at this decision</div>
            <div className="mt-0.5 text-[9px] text-zinc-500">Captured on {playerLabel}'s board before the placement was chosen.</div>
          </div>
          {player?.linesCleared !== undefined && (
            <span className="font-mono text-[10px] text-zinc-500">{player.linesCleared} clears</span>
          )}
        </div>
        {effects.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {effects.map((effect) => {
              const style = styleForFieldEffect(effect);
              const remaining = effect.expiresAtTick === undefined
                ? null
                : Math.max(0, effect.expiresAtTick - decisionTick);
              return (
                <span
                  key={effect.id}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${style.bgClass} ${style.borderClass} ${style.textClass}`}
                >
                  {effect.icon && <span>{effect.icon}</span>}
                  {effect.label}
                  <span className="opacity-75">{remaining === null ? 'active' : `${remaining}t left`}</span>
                </span>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 text-[10px] italic text-zinc-600">No active field effects were recorded.</div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">Placements considered by the bot</div>
              <div className="mt-0.5 text-[9px] text-zinc-500">
                1 executed choice + {alternativeCount} retained alternative{alternativeCount === 1 ? '' : 's'} · net heuristic score, not player score.
              </div>
            </div>
            <span className="shrink-0 text-[9px] text-zinc-600">higher is better</span>
          </div>
          <div className="mt-2 rounded-lg border border-sky-500/20 bg-sky-950/15 p-2.5 text-[10px] leading-relaxed text-zinc-400">
            <span className="font-bold text-sky-300">What are these rows?</span>
            <span className="block mt-0.5">
              Each row is a legal rotation/column placement for this same <span className="font-mono text-zinc-300">{trace.pieceType}</span> piece.
              <span className="text-emerald-300"> BOT CHOICE</span> is the only placement the bot actually played.
              <span className="text-zinc-300"> ALTERNATIVE</span> rows are counterfactual options it considered but did not play — not extra pieces or future moves.
            </span>
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-zinc-600">
            <span>worst {formatScore(scoreMin)}</span>
            <span>0 baseline</span>
            <span>best {formatScore(scoreMax)}</span>
          </div>
        </div>

        {candidates.slice(0, expanded ? 8 : 3).map((candidate, idx) => {
          const isSelected = candidate.selected;
          const scoreDifference = candidate.score - selected.score;
          return (
            <div
              key={`${candidate.rotation}_${candidate.x}_${idx}`}
              className={`rounded-lg border p-2.5 transition-all ${
                isSelected
                  ? 'border-emerald-500/40 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                  : 'border-white/5 bg-black/20 opacity-85 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      isSelected
                        ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {isSelected ? 'BOT CHOICE · #1' : `ALTERNATIVE · #${idx + 1}`}
                  </span>
                  <span className="truncate font-mono text-xs text-zinc-300">rotation {candidate.rotation} · column {candidate.x}</span>
                </div>
                <div className="shrink-0 text-right font-mono">
                  <div className={`text-sm font-bold ${isSelected ? 'text-emerald-300' : 'text-zinc-300'}`}>
                    {formatScore(candidate.score)}
                  </div>
                  {!isSelected && (
                    <div className="text-[9px] text-zinc-600">
                      {Math.abs(scoreDifference) < 0.05 ? 'ties bot choice' : `Δ ${formatScore(scoreDifference)} vs bot choice`}
                    </div>
                  )}
                  {isSelected && scoreMargin !== null && <div className="text-[9px] text-emerald-500/70">lead over best alternative {formatScore(scoreMargin)}</div>}
                </div>
              </div>
              <div className="mt-2">
                <ScorePosition score={candidate.score} min={scoreMin} max={scoreMax} />
              </div>
              {expanded && isSelected && (
                <div className="mt-2">
                  <ScoreContributionTable candidate={candidate} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
