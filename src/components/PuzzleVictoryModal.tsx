import React, { useEffect, useState, useRef } from 'react';
import type { PuzzleStarEvaluation } from '../puzzle/puzzleStarRating';
import { isPalmOrEdgeContact } from '../input/touchSafety';

interface PuzzleVictoryModalProps {
  evaluation: PuzzleStarEvaluation;
  levelName: string;
  piecesUsed: number;
  score?: number;
  linesCleared: number;
  hasNextLevel: boolean;
  onNextLevel: () => void;
  onRetry: () => void;
  onExit: () => void;
}

type SlotState = 'empty' | 'earned' | 'missed';

/** Plays authentic Angry Birds-style falling whoosh + heavy percussive slam + bright resonant bell chime */
function playStarSlam(starNumber: number) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // 1. Falling whoosh
    const whoosh = ctx.createOscillator();
    const whooshGain = ctx.createGain();
    whoosh.type = 'sine';
    whoosh.frequency.setValueAtTime(440, now);
    whoosh.frequency.exponentialRampToValueAtTime(140, now + 0.12);
    whooshGain.gain.setValueAtTime(0.06, now);
    whooshGain.gain.linearRampToValueAtTime(0, now + 0.12);
    whoosh.connect(whooshGain);
    whooshGain.connect(ctx.destination);
    whoosh.start(now);
    whoosh.stop(now + 0.13);

    // 2. Heavy impact slam at landing (T + 0.12s)
    const slamTime = now + 0.12;
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(130, slamTime);
    thud.frequency.exponentialRampToValueAtTime(35, slamTime + 0.15);
    thudGain.gain.setValueAtTime(0.25, slamTime);
    thudGain.gain.exponentialRampToValueAtTime(0.001, slamTime + 0.16);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(slamTime);
    thud.stop(slamTime + 0.17);

    // 3. Bright resonant bell chime chords
    const chimePitches =
      starNumber === 1
        ? [523.25, 1046.5, 1567.98] // C5 + C6 + G6
        : starNumber === 2
          ? [659.25, 1318.5, 1975.5] // E5 + E6 + B6
          : [783.99, 1046.5, 1567.98, 2093.0]; // G5 + C6 + G6 + C7

    chimePitches.forEach((freq, idx) => {
      const chime = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chime.type = 'triangle';
      chime.frequency.setValueAtTime(freq, slamTime + idx * 0.04);

      chimeGain.gain.setValueAtTime(0, slamTime + idx * 0.04);
      chimeGain.gain.linearRampToValueAtTime(0.2, slamTime + idx * 0.04 + 0.015);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, slamTime + idx * 0.04 + 0.55);

      chime.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chime.start(slamTime + idx * 0.04);
      chime.stop(slamTime + idx * 0.04 + 0.6);
    });
  } catch {
    // Ignore silently if audio context is blocked
  }
}

function playDudThud() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.16);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // Ignore silently
  }
}

/** Animated integer counter hook for rolling numbers */
function useAnimatedCounter(targetValue: number, start: boolean, durationMs = 600): number {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!start) {
      setDisplayValue(0);
      return;
    }
    let startTime: number | null = null;
    let animId: number;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(eased * targetValue));

      if (progress < 1) {
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [targetValue, start, durationMs]);

  return displayValue;
}

interface StarGlyphProps {
  state: SlotState;
  isCenter?: boolean;
}

const StarGlyph: React.FC<StarGlyphProps> = ({ state, isCenter }) => {
  const sizeClass = isCenter ? 'w-12 h-12' : 'w-9 h-9';

  if (state === 'empty') {
    return (
      <svg
        viewBox="0 0 24 24"
        className={`${sizeClass} text-zinc-700/30 transition-opacity duration-300`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  }

  if (state === 'missed') {
    return (
      <svg
        viewBox="0 0 24 24"
        className={`${sizeClass} anim-dud-star text-zinc-700/50`}
        fill="currentColor"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  }

  return (
    <div className="relative flex items-center justify-center">
      {/* Golden Ray Halo blooming directly behind the star */}
      <div className="anim-star-halo pointer-events-none absolute -inset-4 rounded-full bg-amber-400/30 blur-md" />

      {/* Radial Star-Dust Sparks bursting from impact */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="anim-spark-n pointer-events-none absolute text-[10px] text-yellow-100">✦</span>
        <span className="anim-spark-ne pointer-events-none absolute text-xs text-amber-200">✧</span>
        <span className="anim-spark-e pointer-events-none absolute text-[10px] text-yellow-200">✦</span>
        <span className="anim-spark-se pointer-events-none absolute text-xs text-amber-300">✦</span>
        <span className="anim-spark-s pointer-events-none absolute text-[9px] text-yellow-100">✧</span>
        <span className="anim-spark-sw pointer-events-none absolute text-xs text-amber-200">✦</span>
        <span className="anim-spark-w pointer-events-none absolute text-[10px] text-yellow-200">✦</span>
        <span className="anim-spark-nw pointer-events-none absolute text-xs text-amber-300">✧</span>
      </div>

      {/* The Animated Star Itself (Drop from sky + squash & stretch impact) */}
      <svg
        viewBox="0 0 24 24"
        className={`${sizeClass} anim-star-slam drop-shadow-[0_4px_16px_rgba(245,158,11,0.9)]`}
      >
        <defs>
          <linearGradient id={`starGoldGrad-${isCenter ? 'c' : 's'}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="22%" stopColor="#FDE047" />
            <stop offset="65%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>
          <linearGradient id={`starFacetGrad-${isCenter ? 'c' : 's'}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Main Star Body */}
        <polygon
          points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
          fill={`url(#starGoldGrad-${isCenter ? 'c' : 's'})`}
          stroke="#D97706"
          strokeWidth="0.8"
        />

        {/* Glossy Top-Left Specular Facet */}
        <polygon
          points="12 2 15.09 8.26 17 14.14 12 11.5"
          fill={`url(#starFacetGrad-${isCenter ? 'c' : 's'})`}
        />
      </svg>
    </div>
  );
};

export const PuzzleVictoryModal: React.FC<PuzzleVictoryModalProps> = ({
  evaluation,
  levelName,
  piecesUsed,
  score,
  linesCleared,
  hasNextLevel,
  onNextLevel,
  onRetry,
  onExit,
}) => {
  const { stars, achievedTwo, achievedThree, labelTwo, labelThree } = evaluation;

  const [slotStates, setSlotStates] = useState<[SlotState, SlotState, SlotState]>([
    'empty',
    'empty',
    'empty',
  ]);
  const [revealedStars, setRevealedStars] = useState(0);
  const [cardThumping, setCardThumping] = useState(false);
  const [glintActive, setGlintActive] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);

  // Animated rolling statistics
  const displayPieces = useAnimatedCounter(piecesUsed, showStats, 500);
  const displayScore = useAnimatedCounter(score ?? 0, showStats, 650);
  const displayLines = useAnimatedCounter(linesCleared, showStats, 450);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);
  const retryPointerAllowedRef = useRef(false);

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const triggerCardThump = () => {
    setCardThumping(true);
    setTimeout(() => setCardThumping(false), 160);
  };

  const skipAnimation = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setSlotStates([
      'earned',
      achievedTwo ? 'earned' : 'missed',
      achievedThree ? 'earned' : 'missed',
    ]);
    setRevealedStars(stars);
    setCardThumping(false);
    setGlintActive(true);
    setShowStats(true);
    setShowButtons(true);
    setAnimationDone(true);
  };

  useEffect(() => {
    // Star 1 Slam: 350ms
    const t1 = setTimeout(() => {
      setSlotStates((prev) => ['earned', prev[1], prev[2]]);
      setRevealedStars(1);
      triggerCardThump();
      playStarSlam(1);
    }, 350);

    // Star 2 Slam: 1050ms
    const t2 = setTimeout(() => {
      if (achievedTwo) {
        setSlotStates((prev) => [prev[0], 'earned', prev[2]]);
        setRevealedStars(2);
        triggerCardThump();
        playStarSlam(2);
      } else {
        setSlotStates((prev) => [prev[0], 'missed', prev[2]]);
        playDudThud();
      }
    }, 1050);

    // Star 3 Slam: 1750ms
    const t3 = setTimeout(() => {
      if (achievedThree) {
        setSlotStates((prev) => [prev[0], prev[1], 'earned']);
        setRevealedStars(3);
        triggerCardThump();
        playStarSlam(3);
      } else {
        setSlotStates((prev) => [prev[0], prev[1], 'missed']);
        playDudThud();
      }
    }, 1750);

    // Glint sheen sweep across stars: 2300ms
    const t4 = setTimeout(() => {
      setGlintActive(true);
    }, 2300);

    // Rolling stats & action buttons reveal: 2500ms
    const t5 = setTimeout(() => {
      setShowStats(true);
      setShowButtons(true);
      setAnimationDone(true);
    }, 2500);

    timersRef.current = [t1, t2, t3, t4, t5];

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [achievedTwo, achievedThree]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!animationDone) {
          skipAnimation();
        } else if (hasNextLevel) {
          onNextLevel();
        } else {
          onExit();
        }
      } else if (e.key === ' ') {
        if (!animationDone) {
          e.preventDefault();
          skipAnimation();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [animationDone, hasNextLevel, onNextLevel, onExit]);

  const victoryTitle =
    !animationDone && revealedStars === 0
      ? 'Level Cleared!'
      : revealedStars === 3
        ? '★★★ Mastery Solve! ★★★'
        : revealedStars === 2
          ? '★★ Great Run! ★★'
          : '★ Goal Cleared! ★';

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      onClick={!animationDone ? skipAnimation : undefined}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="puzzle-victory-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-200 cursor-default select-none"
    >
      <style>{`
        /* Authentic Angry Birds Drop & Squash-and-Stretch Slam */
        @keyframes angryStarSlam {
          0% {
            transform: translateY(-160px) scale(0.2) rotate(-35deg);
            opacity: 0;
          }
          50% {
            transform: translateY(0px) scale(1.5, 0.65) rotate(10deg);
            opacity: 1;
          }
          70% {
            transform: translateY(-12px) scale(0.88, 1.22) rotate(-4deg);
          }
          86% {
            transform: translateY(0px) scale(1.08, 0.94) rotate(1deg);
          }
          100% {
            transform: translateY(0px) scale(1.0, 1.0) rotate(0deg);
            opacity: 1;
          }
        }

        /* Screen/Card Physical Thump on Star Impact */
        @keyframes cardImpactThump {
          0% { transform: translateY(0); }
          30% { transform: translateY(3.5px); }
          100% { transform: translateY(0); }
        }

        /* Dud Star Subtle Shake */
        @keyframes dudStarShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-3px) rotate(-4deg); }
          40%, 80% { transform: translateX(3px) rotate(4deg); }
        }

        /* Halo Flash on Impact */
        @keyframes starHaloBloom {
          0% { transform: scale(0.3); opacity: 0; }
          45% { transform: scale(1.6); opacity: 0.9; }
          100% { transform: scale(1.1); opacity: 0.4; }
        }

        /* Radial Dust Sparks Spreading from Base */
        @keyframes sparkN  { 0% { transform: scale(0) translate(0,0); opacity: 1; } 100% { transform: scale(1.2) translate(0, -18px); opacity: 0; } }
        @keyframes sparkNE { 0% { transform: scale(0) translate(0,0); opacity: 1; } 100% { transform: scale(1.2) translate(14px, -14px); opacity: 0; } }
        @keyframes sparkE  { 0% { transform: scale(0) translate(0,0); opacity: 1; } 100% { transform: scale(1.2) translate(18px, 0); opacity: 0; } }
        @keyframes sparkSE { 0% { transform: scale(0) translate(0,0); opacity: 1; } 100% { transform: scale(1.2) translate(14px, 14px); opacity: 0; } }
        @keyframes sparkS  { 0% { transform: scale(0) translate(0,0); opacity: 1; } 100% { transform: scale(1.2) translate(0, 18px); opacity: 0; } }
        @keyframes sparkSW { 0% { transform: scale(0) translate(0,0); opacity: 1; } 100% { transform: scale(1.2) translate(-14px, 14px); opacity: 0; } }
        @keyframes sparkW  { 0% { transform: scale(0) translate(0,0); opacity: 1; } 100% { transform: scale(1.2) translate(-18px, 0); opacity: 0; } }
        @keyframes sparkNW { 0% { transform: scale(0) translate(0,0); opacity: 1; } 100% { transform: scale(1.2) translate(-14px, -14px); opacity: 0; } }

        /* Specular Glint Sheen Sweep across all 3 stars */
        @keyframes glintSheenSweep {
          0% { transform: translateX(-150%) rotate(25deg); }
          100% { transform: translateX(250%) rotate(25deg); }
        }

        .anim-star-slam {
          animation: angryStarSlam 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.25) forwards;
        }
        .anim-card-thump {
          animation: cardImpactThump 0.16s ease-out;
        }
        .anim-dud-star {
          animation: dudStarShake 0.4s ease-in-out forwards;
        }
        .anim-star-halo {
          animation: starHaloBloom 0.55s ease-out forwards;
        }
        .anim-spark-n  { animation: sparkN  0.55s ease-out forwards; }
        .anim-spark-ne { animation: sparkNE 0.55s ease-out forwards; }
        .anim-spark-e  { animation: sparkE  0.55s ease-out forwards; }
        .anim-spark-se { animation: sparkSE 0.55s ease-out forwards; }
        .anim-spark-s  { animation: sparkS  0.55s ease-out forwards; }
        .anim-spark-sw { animation: sparkSW 0.55s ease-out forwards; }
        .anim-spark-w  { animation: sparkW  0.55s ease-out forwards; }
        .anim-spark-nw { animation: sparkNW 0.55s ease-out forwards; }
        .anim-glint {
          animation: glintSheenSweep 0.85s ease-in-out forwards;
        }
      `}</style>

      {/* Main Modal Card with physical impact thump */}
      <div
        onClick={(e) => {
          if (!animationDone) {
            e.stopPropagation();
            skipAnimation();
          }
        }}
        className={`relative w-full max-w-sm sm:max-w-md overflow-hidden rounded-3xl border-2 border-amber-500/40 bg-[#0a0d14] p-4 sm:p-6 text-center shadow-[0_0_60px_rgba(245,158,11,0.25)] ${
          cardThumping ? 'anim-card-thump' : ''
        }`}
      >
        {/* Ambient top glow */}
        <div
          className={`pointer-events-none absolute -top-24 left-1/2 h-56 w-84 -translate-x-1/2 rounded-full blur-3xl transition-all duration-700 ${
            revealedStars === 3
              ? 'bg-amber-400/40'
              : revealedStars === 2
                ? 'bg-amber-500/25'
                : 'bg-amber-600/15'
          }`}
        />

        {/* Level Name Plaque */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-950/40 px-3.5 py-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
            {levelName}
          </span>
        </div>

        {/* Dynamic Victory Banner */}
        <h2
          id="puzzle-victory-title"
          className={`mt-2 text-xl sm:text-2xl font-black uppercase tracking-wider transition-all duration-300 ${
            revealedStars === 3
              ? 'bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent drop-shadow-[0_2px_14px_rgba(251,191,36,0.7)] scale-105'
              : 'text-white'
          }`}
        >
          {victoryTitle}
        </h2>

        {/* 3 Stars Area: Stable stone/slate sockets with specular glint sheen */}
        <div className="relative my-5 sm:my-7 flex items-end justify-center gap-2.5 sm:gap-4 overflow-hidden py-1">
          {/* Glint Light Beam Sheen across all stars */}
          {glintActive && (
            <div className="anim-glint pointer-events-none absolute inset-y-0 -left-12 w-20 bg-gradient-to-r from-transparent via-white/40 to-transparent blur-sm" />
          )}

          {/* STAR 1 (Left, Goal Cleared) */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border-2 transition-colors duration-500 ${
                slotStates[0] === 'earned'
                  ? 'border-amber-400/70 bg-amber-950/40 shadow-[0_0_24px_rgba(245,158,11,0.3)]'
                  : 'border-white/10 bg-[#05070b] shadow-[inset_0_3px_8px_rgba(0,0,0,0.8)]'
              }`}
            >
              <StarGlyph state={slotStates[0]} />
            </div>
            <span
              className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-opacity duration-300 ${
                slotStates[0] === 'earned' ? 'text-amber-300 opacity-100' : 'opacity-0'
              }`}
            >
              Goal Cleared
            </span>
          </div>

          {/* STAR 2 (Center, Proficient - Elevated Pedestal) */}
          <div className="flex flex-col items-center gap-1.5 pb-1.5 sm:pb-2">
            <div
              className={`flex h-18 w-18 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border-2 transition-colors duration-500 ${
                slotStates[1] === 'earned'
                  ? 'border-amber-300/80 bg-amber-950/55 shadow-[0_0_36px_rgba(245,158,11,0.45)]'
                  : 'border-white/10 bg-[#05070b] shadow-[inset_0_4px_10px_rgba(0,0,0,0.8)]'
              }`}
            >
              <StarGlyph state={slotStates[1]} isCenter />
            </div>
            <span
              className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                slotStates[1] === 'earned'
                  ? 'text-amber-300 opacity-100 font-black'
                  : slotStates[1] === 'missed'
                    ? 'text-zinc-500 opacity-100'
                    : 'opacity-0'
              }`}
            >
              {labelTwo}
            </span>
          </div>

          {/* STAR 3 (Right, Mastery) */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border-2 transition-colors duration-500 ${
                slotStates[2] === 'earned'
                  ? 'border-amber-400/70 bg-amber-950/40 shadow-[0_0_24px_rgba(245,158,11,0.3)]'
                  : 'border-white/10 bg-[#05070b] shadow-[inset_0_3px_8px_rgba(0,0,0,0.8)]'
              }`}
            >
              <StarGlyph state={slotStates[2]} />
            </div>
            <span
              className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                slotStates[2] === 'earned'
                  ? 'text-amber-300 opacity-100 font-black'
                  : slotStates[2] === 'missed'
                    ? 'text-zinc-500 opacity-100'
                    : 'opacity-0'
              }`}
            >
              {labelThree}
            </span>
          </div>
        </div>

        {/* Run Summary Stats: Rolling Animated Counters */}
        <div
          className={`grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-center transition-all duration-500 ${
            showStats
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Pieces</p>
            <p className="font-mono text-base font-black text-white">{displayPieces}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Score</p>
            <p className="font-mono text-base font-black text-emerald-400">
              {score !== undefined ? displayScore.toLocaleString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lines</p>
            <p className="font-mono text-base font-black text-white">{displayLines}</p>
          </div>
        </div>

        {/* Skip Prompt during animation */}
        {!animationDone && (
          <p className="mt-3 text-[10px] uppercase tracking-widest text-zinc-600 animate-pulse">
            Press Space / Enter to Skip
          </p>
        )}

        {/* Action Buttons */}
        <div
          className={`mt-5 flex flex-col gap-2 transition-all duration-500 ${
            showButtons
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-3 pointer-events-none'
          }`}
        >
          {hasNextLevel && (
            <button
              type="button"
              onClick={onNextLevel}
              className="group flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 px-5 py-3 text-sm font-black uppercase tracking-wider text-black shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
            >
              <span>Next Puzzle</span>
              <kbd className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-black">Enter</kbd>
            </button>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onPointerDown={(event) => {
                retryPointerAllowedRef.current = !isPalmOrEdgeContact(event);
              }}
              onPointerCancel={() => {
                retryPointerAllowedRef.current = false;
              }}
              onClick={(event) => {
                if (event.detail > 0) {
                  const allowed = retryPointerAllowedRef.current;
                  retryPointerAllowedRef.current = false;
                  if (!allowed) return;
                }
                onRetry();
              }}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-200 transition-all hover:bg-white/10 active:scale-95"
            >
              <span>Retry</span>
            </button>

            <button
              type="button"
              onClick={onExit}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-400 transition-all hover:bg-white/10 hover:text-zinc-200 active:scale-95"
            >
              <span>Level Select</span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-zinc-400">Esc</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
