import type { CellValue, ShapeType } from '../../src/types.js';

/**
 * Single-player puzzle mode types.
 *
 * A puzzle level is a deterministic, replay-friendly scenario: a fixed board,
 * a fixed piece stream (seeded bag), and a scripted hazard timeline standing in
 * for the missing opponent. The player must reach the level goal; the reference
 * solution is *derived* by letting the RulesBot play the level, never authored
 * by hand.
 */

/** One scripted event in the level timeline (the "opponent"). */
/** One absolute scripted fire in the level timeline (the "opponent"). */
export interface TimelineEvent {
  /** Absolute game tick at which the event fires. */
  tick: number;
  /** Free-form hazard descriptor resolved by the session runner. */
  kind: HazardKind;
  /** Hazard parameters (poison variant, curtain rows, magnet step, ...). */
  params?: Record<string, unknown>;
}

/** Relative beat inside a looped timeline segment. */
export interface TimelineLoopBeat {
  /** Offset from each iteration's startTick; must satisfy 0 <= at < periodTicks. */
  at: number;
  kind: HazardKind;
  params?: Record<string, unknown>;
}

/**
 * Repeat `sequence` every `periodTicks` starting at `startTick` (first iteration included).
 * Materialized to TimelineEvent[] up to a session horizon before application.
 */
export interface TimelineLoop {
  startTick: number;
  periodTicks: number;
  sequence: TimelineLoopBeat[];
}

/** Authored timeline entry: one-shot event or a looping sequence segment. */
export type TimelineEntry = TimelineEvent | { loop: TimelineLoop };

/** Scripted hazard kinds. Semantic only — presentation lives in the client adapter. */
export type HazardKind =
  | 'poison'
  | 'storage-poison'
  | 'retrim'
  | 'purge'
  | 'curtain'
  | 'freeze'
  | 'magnet'
  | 'snag'
  | 'sticky'
  | 'bomber'
  | 'wildcard'
  | 'tectonic'
  | 'garbage'
  | 'satellite';

/** Level completion condition checked by the session runner every tick. */
export type PuzzleGoal =
  | {
      kind: 'perfect-clear';
      /** Advisory piece budget for star ratings (v1: not enforced by the runner). */
      maxPieces?: number;
    }
  | { kind: 'survive'; /** Ticks the player must survive. */ ticks: number }
  | { kind: 'clear-lines'; /** Total line clears required. */ lines: number };

/** A single-player puzzle level: board + piece stream + scripted hazard timeline. */
export interface PuzzleLevel {
  id: string;
  name: string;
  seed: number;
  /** Fixed initial board (garbage rows / poison seeds / pre-placed cells). */
  initialBoard: CellValue[][];
  /** Fixed piece queue prefix; the seeded bag continues after it runs out. */
  queuePrefix: ShapeType[];
  goal: PuzzleGoal;
  /** Scripted hazard timeline standing in for the missing opponent (may include loops). */
  timeline: TimelineEntry[];
  /** Shop policy: 'none' = pure puzzle, 'standard' = normal line-clear rolls. */
  shopPolicy: 'none' | 'standard';
  /** Whether the player is permitted to use the hold chamber (default true). */
  allowHold?: boolean;
  /** Par values for star thresholds (optional in v1). */
  par?: { pieces?: number; ticks?: number };
  /**
   * How Reference Baseline selection compares qualifying solved runs.
   * Omit to use DEFAULT_PUZZLE_BENCHMARK (maximize engine score).
   * Curated catalog entries must set this explicitly.
   */
  benchmark?: PuzzleBenchmarkPolicy;
  /**
   * Per-puzzle presentation of future hazards / solution hints.
   * Not a security boundary. Curated catalog entries must set this explicitly.
   */
  visibilityPolicy?: PuzzleVisibilityPolicy;
}

/** Metric used when selecting a Reference Baseline from a candidate batch. */
export type PuzzleBenchmarkMetric = 'score' | 'ticks' | 'pieces';

/** Declared comparison policy for a puzzle's Reference Baseline. */
export interface PuzzleBenchmarkPolicy {
  metric: PuzzleBenchmarkMetric;
  direction: 'maximize' | 'minimize';
  tieBreakers?: Array<{ metric: PuzzleBenchmarkMetric; direction: 'maximize' | 'minimize' }>;
}

/** Default when a level omits `benchmark`: maximize final PlayerState.score. */
export const DEFAULT_PUZZLE_BENCHMARK: PuzzleBenchmarkPolicy = {
  metric: 'score',
  direction: 'maximize',
  tieBreakers: [
    { metric: 'ticks', direction: 'minimize' },
    { metric: 'pieces', direction: 'minimize' },
  ],
};

/** How much future puzzle information is revealed to the player. */
export type PuzzleVisibilityPolicy = 'hidden' | 'partial' | 'revealed';

/**
 * Curated catalog level: product content with required policy fields.
 * Generator-made ad-hoc levels may still omit these; catalog entries may not.
 */
export type CuratedPuzzleLevel = PuzzleLevel & {
  shopPolicy: 'none' | 'standard';
  allowHold: boolean;
  benchmark: PuzzleBenchmarkPolicy;
  visibilityPolicy: PuzzleVisibilityPolicy;
};

/** A derived reference solution: the RulesBot's play of the level. */
export interface PuzzleSolution {
  levelId: string;
  /** Bot command per tick, in playback order. */
  commands: Array<{ tick: number; command: unknown }>;
  /** Whether the bot reached the goal. */
  solved: boolean;
  /** Total ticks the bot needed (set when solved). */
  ticksUsed?: number;
  /** Piece locks the bot used (set when solved). */
  piecesUsed?: number;
  /** Final authoritative PlayerState.score from the engine (not heuristic). */
  score: number;
}

/** Outcome of one attempt at a puzzle level. */
export interface PuzzleAttempt {
  levelId: string;
  solved: boolean;
  /** Ticks the attempt lasted. */
  ticksUsed: number;
  /** Piece locks used. */
  piecesUsed: number;
  topOut: boolean;
  /** Lines cleared (for clear-lines goals). */
  linesCleared: number;
  /** Perfect clear reached (for perfect-clear goals). */
  perfectClear: boolean;
  /** Final authoritative PlayerState.score from the engine (not heuristic). */
  score: number;
}
