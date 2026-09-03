import { createPlayerRngChannels, rngNext } from '../../src/rng.js';
import {
  parsePublishedPuzzlePayloadV1,
  parsePublishedPuzzleValueV1,
  type NonEmptyReadonlyArray,
  type PublishedPuzzleBenchmarkPolicyV1,
  type PublishedPuzzleGoalV1,
  type PublishedPuzzleParamsV1,
  type PublishedPuzzlePayloadV1,
  type PublishedPuzzleTimelineEventV1,
} from '../../src/puzzle/publishedPuzzle.js';
import type { ShapeType } from '../../src/types.js';
import { makePlayer } from '../../src/puzzle/runtime/engine.js';
import {
  DEFAULT_PUZZLE_BENCHMARK,
  type LegacyPuzzleLevel,
  type PuzzleBenchmarkPolicy,
  type PuzzleGoal,
  type TimelineEvent,
  type TimelinePieceEvent,
} from './puzzleTypes.js';
import { assertSupportedPuzzleTimeline } from './puzzleHazards.js';
import { extractPieceTimeline, materializeTimeline } from './puzzleTimeline.js';

const DEFAULT_FINITE_PIECE_COUNT = 256;
const DEFAULT_TIMELINE_HORIZON_TICKS = 90 * 60;
const PIECE_SEQUENCE: readonly ShapeType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

export interface LegacyPuzzlePublicationOptions {
  /** Number of pieces to freeze when the legacy level has a short queue prefix. */
  pieceCount?: number;
  /** Horizon used to expand legacy tick loops into one-shot events. */
  timelineHorizonTicks?: number;
}

function shuffledPieceBag(rng: { seed: number }): ShapeType[] {
  const bag = [...PIECE_SEQUENCE];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rngNext(rng) * (index + 1));
    const current = bag[index];
    const swapped = bag[swapIndex];
    if (current === undefined || swapped === undefined) {
      throw new Error('piece bag became sparse during publication migration');
    }
    bag[index] = swapped;
    bag[swapIndex] = current;
  }
  return bag;
}

function freezeFinitePieceSequence(
  level: LegacyPuzzleLevel,
  requestedCount: number,
): NonEmptyReadonlyArray<ShapeType> {
  if (!Number.isSafeInteger(requestedCount) || requestedCount < 1) {
    throw new Error(`published puzzle pieceCount must be a positive safe integer, got ${requestedCount}`);
  }

  // PuzzleSession first creates the seeded active piece, then prepends the
  // authored queuePrefix to the queue that remains. Capture that exact order
  // before freezing the seeded continuation into the published sequence.
  const rngChannels = createPlayerRngChannels(level.seed, 'puzzle');
  const initialPlayer = makePlayer('puzzle', rngChannels);
  const initialPiece = initialPlayer.activePiece;
  if (!initialPiece) {
    throw new Error(`legacy puzzle "${level.id}" did not spawn an initial piece`);
  }

  const sequence = [initialPiece.type, ...level.queuePrefix, ...initialPlayer.nextQueue];
  while (sequence.length < requestedCount) {
    sequence.push(...shuffledPieceBag(rngChannels.pieces));
  }
  const [firstPiece, ...remainingPieces] = sequence;
  if (firstPiece === undefined) {
    throw new Error(`legacy puzzle "${level.id}" has no piece sequence`);
  }
  return [firstPiece, ...remainingPieces];
}

function migrateParams(
  params: Record<string, unknown> | undefined,
): PublishedPuzzleParamsV1 | undefined {
  if (params === undefined) return undefined;
  const output: Record<string, ReturnType<typeof parsePublishedPuzzleValueV1>> = {};
  for (const [key, value] of Object.entries(params)) {
    output[key] = parsePublishedPuzzleValueV1(value, `legacy puzzle params.${key}`);
  }
  return output;
}

function migrateTickEvent(event: TimelineEvent): PublishedPuzzleTimelineEventV1 {
  const params = migrateParams(event.params);
  return {
    kind: 'atTick',
    tick: event.tick,
    hazard: event.kind,
    ...(params === undefined ? {} : { params }),
  };
}

function migratePieceEvent(event: TimelinePieceEvent): PublishedPuzzleTimelineEventV1 {
  const params = migrateParams(event.params);
  return {
    kind: 'afterPieces',
    afterPieces: event.afterPieces,
    hazard: event.kind,
    ...(params === undefined ? {} : { params }),
  };
}

function migrateGoal(goal: PuzzleGoal): PublishedPuzzleGoalV1 {
  switch (goal.kind) {
    case 'garbage-clear':
      return goal.maxPieces === undefined
        ? { kind: goal.kind }
        : { kind: goal.kind, maxPieces: goal.maxPieces };
    case 'perfect-clear':
      return goal.maxPieces === undefined
        ? { kind: goal.kind }
        : { kind: goal.kind, maxPieces: goal.maxPieces };
    case 'survive':
      return { kind: goal.kind, ticks: goal.ticks };
    case 'clear-lines':
      return { kind: goal.kind, lines: goal.lines };
    case 'survive-clear':
      return { kind: goal.kind, ticks: goal.ticks, lines: goal.lines };
  }
}

function migrateBenchmark(
  benchmark: PuzzleBenchmarkPolicy | undefined,
): PublishedPuzzleBenchmarkPolicyV1 {
  const source = benchmark ?? DEFAULT_PUZZLE_BENCHMARK;
  return {
    metric: source.metric,
    direction: source.direction,
    ...(source.tieBreakers === undefined
      ? {}
      : { tieBreakers: source.tieBreakers.map((tieBreaker) => ({ ...tieBreaker })) }),
  };
}

/**
 * Convert the current server-authored level format into the player-safe V1
 * payload. The old seeded continuation and shop policy never cross this boundary.
 *
 * NOTE: freezeFinitePieceSequence synthesizes a finite sequence from the legacy
 * queuePrefix and level.seed as an interim migration bridge for Phases 1-2. Final
 * published content in Phase 3/7 will consume authored complete sequences directly.
 */
export function migratePuzzleLevelToPublishedPuzzlePayload(
  level: LegacyPuzzleLevel,
  options: LegacyPuzzlePublicationOptions = {},
): PublishedPuzzlePayloadV1 {
  assertSupportedPuzzleTimeline(level.timeline, `migratePuzzleLevel(${level.id})`);
  const pieceCount = options.pieceCount ?? DEFAULT_FINITE_PIECE_COUNT;
  const timelineHorizonTicks = options.timelineHorizonTicks ?? DEFAULT_TIMELINE_HORIZON_TICKS;
  if (!Number.isSafeInteger(timelineHorizonTicks) || timelineHorizonTicks < 0) {
    throw new Error(
      `published puzzle timelineHorizonTicks must be a non-negative safe integer, got ${timelineHorizonTicks}`,
    );
  }

  const tickEvents = materializeTimeline(level.timeline, timelineHorizonTicks).map(migrateTickEvent);
  const pieceEvents = extractPieceTimeline(level.timeline).map(migratePieceEvent);
  const payload = {
    id: level.id,
    name: level.name,
    ...(level.description === undefined ? {} : { description: level.description }),
    initialBoard: level.initialBoard.map((row) => [...row]),
    finitePieceSequence: freezeFinitePieceSequence(level, pieceCount),
    goal: migrateGoal(level.goal),
    allowedMechanics: {
      allowHold: level.allowHold ?? true,
    },
    timeline: [...tickEvents, ...pieceEvents],
    visibilityPolicy: level.visibilityPolicy ?? 'partial',
    benchmark: migrateBenchmark(level.benchmark),
  } satisfies PublishedPuzzlePayloadV1;

  return parsePublishedPuzzlePayloadV1(payload);
}
