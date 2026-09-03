import {
  ARR_TICKS,
  BOMBER_BLAST_RADIUS,
  BOARD_COLS,
  BOARD_ROWS,
  BOARD_HIDDEN_ROWS,
  CURTAIN_FROST_ROWS,
  DAS_TICKS,
  GRAVITY_TICKS_PER_CELL,
  HORIZONTAL_SPEED_THRESHOLDS,
  MAGNET_GRAVITY_TICK_REDUCTION,
  MAGNET_MIN_GRAVITY_TICKS,
  MAGNET_PERMANENT_GRAVITY_STEP,
  MAGNET_PIECE_GRAVITY_STEP,
  POISON_LINE_CLEAR_PENALTY_MAX_RATIO,
} from '../../src/constants.js';
import type { ActionType, CellValue, PendingGarbagePacket, RotationState, ShapeType, GamePiece, CandidateSubScores, CandidateEvaluationTrace, BotDecisionTrace } from '../../src/types.js';
import { PublicPlayerState } from '../../src/state/publicSnapshots.js';
import { SHAPES } from '../../src/puzzle/runtime/pieces.js';
import { detectPlusAttackFor, previewAttackFromClear } from '../../src/puzzle/runtime/engine.js';
import type { DriverObservation, InputDriver, PlayerCommand } from './inputDriver.js';
import type { ObservationMode, PlayerObservation } from './observationProjector.js';

export type { ObservationMode };

export type RulesBotTopologyMode = 'none' | 'surface';

export interface RulesBotOptions {
  mode?: ObservationMode;
  topology?: RulesBotTopologyMode;
  /** Match rule known to both players; used to select Curtain recovery policy. */
  garbageEnabled?: boolean;
  /**
   * Versioned candidate identity. When set, observation/topology/garbage come from
   * the profile (not the loose option fields).
   */
  profile?: RulesBotCandidateProfile;
}

/**
 * Versioned RulesBot candidate used for curated-puzzle baseline batches.
 * Identity must be rich enough to reproduce the run exactly later.
 */
export interface RulesBotCandidateProfile {
  /** Stable profile id recorded in validation artifacts. */
  id: string;
  /** Schema/policy version for this profile shape. */
  policyVersion: number;
  observationMode: ObservationMode;
  topology: RulesBotTopologyMode;
  garbageEnabled: boolean;
  /**
   * Deterministic variation identity. Same puzzle + profile + seed must reproduce.
   * Unused by heuristics until a profile deliberately varies behavior.
   */
  variationSeed?: number;
}

/** Matches historical `new RulesBot()` defaults. */
export const DEFAULT_RULES_BOT_PROFILE: RulesBotCandidateProfile = {
  id: 'default',
  policyVersion: 1,
  observationMode: 'omniscient',
  topology: 'none',
  garbageEnabled: false,
  variationSeed: 0,
};

export function rulesBotOptionsFromProfile(
  profile: RulesBotCandidateProfile,
): RulesBotOptions {
  return {
    mode: profile.observationMode,
    topology: profile.topology,
    garbageEnabled: profile.garbageEnabled,
    profile,
  };
}

export function createRulesBotFromProfile(
  profile: RulesBotCandidateProfile,
): RulesBot {
  return new RulesBot(rulesBotOptionsFromProfile(profile));
}

/** Compact reproducible identity for validation artifacts. */
export function serializeRulesBotProfileIdentity(
  profile: RulesBotCandidateProfile,
): string {
  const seed = profile.variationSeed ?? 0;
  return [
    profile.id,
    `v${profile.policyVersion}`,
    profile.observationMode,
    `topology=${profile.topology}`,
    `garbage=${profile.garbageEnabled ? 1 : 0}`,
    `seed=${seed}`,
  ].join('|');
}

function resolveRulesBotProfile(
  options: RulesBotOptions | undefined,
  mode: ObservationMode,
  topology: RulesBotTopologyMode,
  garbageEnabled: boolean,
): RulesBotCandidateProfile {
  if (options?.profile) return options.profile;
  if (
    mode === DEFAULT_RULES_BOT_PROFILE.observationMode &&
    topology === DEFAULT_RULES_BOT_PROFILE.topology &&
    garbageEnabled === DEFAULT_RULES_BOT_PROFILE.garbageEnabled
  ) {
    return DEFAULT_RULES_BOT_PROFILE;
  }
  return {
    id: 'ephemeral',
    policyVersion: 1,
    observationMode: mode,
    topology,
    garbageEnabled,
    variationSeed: 0,
  };
}

export interface PlacementPlan {
  rotation: number;
  x: number;
  score: number;
  subScores?: CandidateSubScores;
  trace?: BotDecisionTrace;
  targetColumns?: number[];
  curtainContextKey?: string | null;
}

export interface BotPlanningOptions {
  /** Recent target-column counts maintained while a player-observation Curtain is active. */
  curtainColumnUsage?: number[];
  /** Restrict a recovery plan to orientations the current piece already has. */
  allowedRotations?: RotationState[];
  /** First row hidden by the player-limited Curtain observation. */
  unknownFromRow?: number | null;
  /** Stable identity used only for deterministic tie-breaking diagnostics. */
  playerId?: string;
  /** Player-remembered board used while Curtain masks the live board. */
  planningBoard?: CellValue[][];
  /** Curtain is active while visible incoming garbage requires immediate downstacking. */
  curtainGarbagePressure?: boolean;
  /** Proven low-assumption fallback once hidden garbage invalidates the belief board. */
  legacyCurtainRecovery?: boolean;
  /** Actual rotations for a Wildcard custom piece; ordinary pieces use SHAPES. */
  shapeRotations?: Array<Array<[number, number]>>;
  /** Piece-level poison carried by Elixir or Contagion. */
  piecePoisoned?: boolean;
  piecePoisonVariant?: number;
  pieceIsWildcard?: boolean;
  /** Visible Wild Purge warning colour, used to forecast the no-gravity hole pattern. */
  wildPurgeVariant?: number | null;
}

/** Visibility bounds for board metrics to avoid scanning hidden or masked rows. */
export interface BoardMetricVisibility {
  knownRowStart: number;
  knownRowEndExclusive: number;
}

export interface BoardEvaluationOptions {
  visibility?: BoardMetricVisibility;
}

/** Per-column cavity metrics measuring hole count and overburden depth. */
export interface ColumnCavityMetrics {
  holeCount: number;
  cavityDepth: number;
  deepestCavity: number;
}

/** Mode-safe extraction of relative ticks until arrival for a pending garbage packet. */
function getPacketTicksUntilArrival(
  packet: { lines: number; arrivalTick?: number; ticksUntilArrival?: number },
  currentTick?: number,
): number {
  if (packet.ticksUntilArrival !== undefined) {
    return packet.ticksUntilArrival;
  }
  if (packet.arrivalTick !== undefined && currentTick !== undefined) {
    return Math.max(0, packet.arrivalTick - currentTick);
  }
  return Infinity;
}

/** Evaluates board stack quality, poison cells, holes, and cavity depth for bot heuristics. */
export interface BoardEvaluation {
  aggregateHeight: number;
  maxHeight: number;
  holes: number;
  coveredHoles: number;
  bumpiness: number;
  poisonCells: number;
  wells: number;
  spires: number;
  columnCavities: readonly ColumnCavityMetrics[];
  totalCavityDepth: number;
  deepestCavity: number;
  oddHeightTransitions: number;
  isolatedOneHighSpikes: number;
}

const CAVITY_DEPTH_REDUCTION_WEIGHT = 60;
const DEEPEST_CAVITY_REDUCTION_WEIGHT = 25;
// Stronger increase penalties made the bot build around cavities until top-out;
// keep them below that avoidance threshold while still preferring shallower cover.
const CAVITY_DEPTH_INCREASE_PENALTY = 70;
const DEEPEST_CAVITY_INCREASE_PENALTY = 20;
// Keep topology below the cavity/height terms. It should break near-ties,
// not make the bot avoid otherwise useful placements.
const SURFACE_PARITY_REDUCTION_WEIGHT = 2;
const ISOLATED_SPIKE_REDUCTION_WEIGHT = 12;

export interface PlacementVisibilityRisk {
  unknownCellCount: number;
  deepestUnknownRowOffset: number;
  crossesUnknownFrontier: boolean;
  uncertainLineClearCount: number;
}

// Curtain masking makes bottom-row occupancy uncertain, but entering that
// region is still normal play. Keep these penalties below the initial
// frontier-risk calibration so the bot does not stack above the mask and top out.
const UNKNOWN_PLACED_CELL_PENALTY = 40;
const UNKNOWN_ROW_DEPTH_PENALTY = 20;
export const UNCERTAIN_LINE_CLEAR_PENALTY = 150;

export const CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS = 90;
const CURTAIN_REFERENCE_GAP_WEIGHT = 60;
const CURTAIN_REFERENCE_ROUGHNESS_WEIGHT = 20;
const CURTAIN_REFERENCE_HOLE_WEIGHT = 240;

/**
 * Score the known three-row Curtain frontier separately from the older visible
 * stack. Empty frontier space is safer than a jagged or internally hollow
 * surface because the board below it is deliberately unobservable.
 */
export function scoreCurtainReference(board: CellValue[][], unknownFromRow: number, frostRows = CURTAIN_FROST_ROWS): number {
  const bandEnd = Math.min(BOARD_ROWS, Math.max(0, unknownFromRow));
  const bandStart = Math.max(0, bandEnd - frostRows);
  const bandRows = bandEnd - bandStart;
  if (bandRows <= 0) return 0;

  const gaps: number[] = [];
  let internalHoles = 0;
  for (let x = 0; x < BOARD_COLS; x++) {
    const occupiedRows: number[] = [];
    for (let y = bandStart; y < bandEnd; y++) {
      if (board[y][x] !== null) occupiedRows.push(y);
    }
    if (occupiedRows.length === 0) {
      gaps.push(bandRows);
      continue;
    }

    const firstFilled = Math.min(...occupiedRows);
    const lastFilled = Math.max(...occupiedRows);
    gaps.push(bandEnd - 1 - lastFilled);
    for (let y = firstFilled; y <= lastFilled; y++) {
      if (board[y][x] === null) internalHoles++;
    }
  }

  const frontierGap = gaps.reduce((sum, gap) => sum + gap, 0);
  const frontierRoughness = gaps.slice(1).reduce(
    (sum, gap, index) => sum + Math.abs(gap - gaps[index]),
    0,
  );
  return -(
    frontierGap * CURTAIN_REFERENCE_GAP_WEIGHT +
    frontierRoughness * CURTAIN_REFERENCE_ROUGHNESS_WEIGHT +
    internalHoles * CURTAIN_REFERENCE_HOLE_WEIGHT
  );
}

// Visible Magnet state reduces the time available to reach a placement. Keep
// reachable placements unchanged, but make a plan that misses its control
// window decisively unattractive.
const MAGNET_CONTROL_OVERRUN_WEIGHT = 1000;

type MagnetControlPiece = Pick<GamePiece, 'x' | 'y' | 'rotation'>;

export function scoreMagnetControl(
  player: Pick<PublicPlayerState, 'activePiece' | 'score' | 'magnetPermanentStacks' | 'magnetPieceBoost'>,
  targetX: number,
  targetRotation: number,
  landingY: number,
  pieceOverride?: MagnetControlPiece | null,
  magnetPieceBoostOverride?: number,
): number {
  const magnetLevel =
    (player.magnetPermanentStacks ?? 0) * MAGNET_PERMANENT_GRAVITY_STEP +
    (magnetPieceBoostOverride ?? player.magnetPieceBoost ?? 0) * MAGNET_PIECE_GRAVITY_STEP;
  const piece = pieceOverride ?? player.activePiece;
  if (magnetLevel <= 0 || !piece) return 0;

  const gravityTicks = Math.max(
    MAGNET_MIN_GRAVITY_TICKS,
    GRAVITY_TICKS_PER_CELL - magnetLevel * MAGNET_GRAVITY_TICK_REDUCTION,
  );
  const speedTier = [...HORIZONTAL_SPEED_THRESHOLDS]
    .reverse()
    .find((tier) => player.score >= tier.minScore);
  const dasTicks = speedTier?.dasTicks ?? DAS_TICKS;
  const arrTicks = speedTier?.arrTicks ?? ARR_TICKS;
  const horizontalDistance = Math.abs(targetX - piece.x);
  const horizontalTicks = horizontalDistance === 0
    ? 0
    : horizontalDistance === 1
      ? 1
      : 1 + dasTicks + Math.max(0, horizontalDistance - 2) * arrTicks;
  const rotationTicks = (targetRotation - piece.rotation + 4) % 4;
  // Rotation and horizontal input are processed in the same engine tick, so
  // their control windows overlap rather than adding sequentially.
  const controlTicks = Math.max(horizontalTicks, rotationTicks);
  const fallingRows = Math.max(0, landingY - piece.y);
  // The bot hard-drops as soon as it reaches the target. Lock delay is not a
  // reliable visible budget: it may already be partly spent, and it is not
  // needed for a reachable plan. Only count the falling window itself.
  const availableTicks = fallingRows * gravityTicks;
  const overrunTicks = Math.max(0, controlTicks - availableTicks);

  return -overrunTicks * MAGNET_CONTROL_OVERRUN_WEIGHT;
}

export function evaluatePlacementVisibilityRisk(
  placedCells: Array<[number, number]>,
  clearedRowIndices: number[],
  visibility: BoardMetricVisibility,
): PlacementVisibilityRisk {
  const { knownRowStart, knownRowEndExclusive } = visibility;
  let unknownCellCount = 0;
  let deepestUnknownRowOffset = 0;

  for (const [, y] of placedCells) {
    if (y < knownRowStart) {
      unknownCellCount++;
      const offset = knownRowStart - y;
      if (offset > deepestUnknownRowOffset) {
        deepestUnknownRowOffset = offset;
      }
    } else if (y >= knownRowEndExclusive) {
      unknownCellCount++;
      const offset = y - knownRowEndExclusive + 1;
      if (offset > deepestUnknownRowOffset) {
        deepestUnknownRowOffset = offset;
      }
    }
  }

  let uncertainLineClearCount = 0;
  for (const rowIndex of clearedRowIndices) {
    if (rowIndex < knownRowStart || rowIndex >= knownRowEndExclusive) {
      uncertainLineClearCount++;
    }
  }

  return {
    unknownCellCount,
    deepestUnknownRowOffset,
    crossesUnknownFrontier: unknownCellCount > 0,
    uncertainLineClearCount,
  };
}

export function calculatePlacementVisibilityRiskScore(
  risk: PlacementVisibilityRisk,
): number {
  return (
    risk.unknownCellCount * UNKNOWN_PLACED_CELL_PENALTY +
    risk.deepestUnknownRowOffset * UNKNOWN_ROW_DEPTH_PENALTY +
    risk.uncertainLineClearCount * UNCERTAIN_LINE_CLEAR_PENALTY
  );
}

export function deriveVisibilityFromObservation(
  obs: PlayerObservation,
): BoardMetricVisibility {
  const mode = obs.context?.mode ?? 'omniscient';
  if (mode === 'omniscient') {
    return { knownRowStart: 0, knownRowEndExclusive: BOARD_ROWS };
  }
  const knownRowStart = BOARD_HIDDEN_ROWS;
  let knownRowEndExclusive = BOARD_ROWS;

  const boardVis = obs.context?.boardVisibility;
  if (boardVis && boardVis.maskedRowsStart !== undefined) {
    knownRowEndExclusive = Math.min(BOARD_ROWS, boardVis.maskedRowsStart);
  }

  return { knownRowStart, knownRowEndExclusive };
}

export function scoreCavityDepthDelta(
  origEval: BoardEvaluation,
  simEval: BoardEvaluation,
): number {
  let score = 0;
  for (let x = 0; x < BOARD_COLS; x++) {
    const origCol = origEval.columnCavities[x];
    const simCol = simEval.columnCavities[x];

    const depthReduction = Math.max(0, origCol.cavityDepth - simCol.cavityDepth);
    const depthIncrease = Math.max(0, simCol.cavityDepth - origCol.cavityDepth);
    const deepestReduction = Math.max(0, origCol.deepestCavity - simCol.deepestCavity);
    const deepestIncrease = Math.max(0, simCol.deepestCavity - origCol.deepestCavity);

    score += depthReduction * CAVITY_DEPTH_REDUCTION_WEIGHT;
    score += deepestReduction * DEEPEST_CAVITY_REDUCTION_WEIGHT;
    score -= depthIncrease * CAVITY_DEPTH_INCREASE_PENALTY;
    score -= deepestIncrease * DEEPEST_CAVITY_INCREASE_PENALTY;
  }
  return score;
}

/** Scores reductions in odd surface transitions and isolated one-cell peaks. */
export function scoreSurfaceTopologyDelta(
  origEval: BoardEvaluation,
  simEval: BoardEvaluation,
): number {
  return (
    (origEval.oddHeightTransitions - simEval.oddHeightTransitions) * SURFACE_PARITY_REDUCTION_WEIGHT +
    (origEval.isolatedOneHighSpikes - simEval.isolatedOneHighSpikes) * ISOLATED_SPIKE_REDUCTION_WEIGHT
  );
}

/** Evaluates board stack quality, poison cells, holes, and per-column cavity depth for bot heuristics. */
export function evaluateBoard(
  board: CellValue[][],
  poisonBoard?: number[][],
  options?: BoardEvaluationOptions,
): BoardEvaluation {
  const knownStart = options?.visibility?.knownRowStart ?? 0;
  const knownEnd = options?.visibility?.knownRowEndExclusive ?? BOARD_ROWS;

  const columnHeights = new Array<number>(BOARD_COLS).fill(0);
  let holes = 0;
  let coveredHoles = 0;
  let poisonCells = 0;
  let totalCavityDepth = 0;
  let deepestCavity = 0;

  const columnCavities: ColumnCavityMetrics[] = [];

  for (let x = 0; x < BOARD_COLS; x++) {
    let filledFound = false;
    let filledAboveHoleInCol = 0;
    let colHoleCount = 0;
    let colCavityDepth = 0;
    let colDeepestCavity = 0;

    for (let y = knownStart; y < knownEnd; y++) {
      if (board[y][x] !== null) {
        if (!filledFound) {
          columnHeights[x] = BOARD_ROWS - y;
          filledFound = true;
        }
        filledAboveHoleInCol++;
        if (poisonBoard?.[y]?.[x] && poisonBoard[y][x] > 0) {
          poisonCells++;
        }
      } else if (filledFound) {
        colHoleCount++;
        holes++;
        coveredHoles += filledAboveHoleInCol;
        colCavityDepth += filledAboveHoleInCol;
        colDeepestCavity = Math.max(colDeepestCavity, filledAboveHoleInCol);
      }
    }

    columnCavities.push({
      holeCount: colHoleCount,
      cavityDepth: colCavityDepth,
      deepestCavity: colDeepestCavity,
    });

    totalCavityDepth += colCavityDepth;
    deepestCavity = Math.max(deepestCavity, colDeepestCavity);
  }

  let bumpiness = 0;
  let spires = 0;
  let oddHeightTransitions = 0;
  for (let x = 0; x < BOARD_COLS - 1; x++) {
    const diff = Math.abs(columnHeights[x] - columnHeights[x + 1]);
    bumpiness += diff;
    if (diff % 2 === 1) {
      oddHeightTransitions++;
    }
    if (diff > 2) {
      spires += diff - 2;
    }
  }

  let isolatedOneHighSpikes = 0;
  for (let x = 1; x < BOARD_COLS - 1; x++) {
    const height = columnHeights[x];
    if (height === columnHeights[x - 1] + 1 && height === columnHeights[x + 1] + 1) {
      isolatedOneHighSpikes++;
    }
  }

  let wells = 0;
  for (let x = 0; x < BOARD_COLS; x++) {
    const left = x > 0 ? columnHeights[x - 1] : columnHeights[x] + 2;
    const right = x < BOARD_COLS - 1 ? columnHeights[x + 1] : columnHeights[x] + 2;
    const depth = Math.min(left, right) - columnHeights[x];
    if (depth > 2) {
      wells += depth - 2;
    }
  }

  const aggregateHeight = columnHeights.reduce((sum, h) => sum + h, 0);
  const maxHeight = Math.max(...columnHeights);

  return {
    aggregateHeight,
    maxHeight,
    holes,
    coveredHoles,
    bumpiness,
    poisonCells,
    wells,
    spires,
    columnCavities,
    totalCavityDepth,
    deepestCavity,
    oddHeightTransitions,
    isolatedOneHighSpikes,
  };
}

export function applyBomberBlastSimulation(
  board: CellValue[][],
  placedCells: Array<[number, number]>,
  radius = BOMBER_BLAST_RADIUS,
): CellValue[][] {
  const simBoard = board.map((r) => [...r]);
  const blastCells = new Set<string>();

  for (const [px, py] of placedCells) {
    const rInt = Math.floor(radius);
    for (let dy = -rInt; dy <= rInt; dy++) {
      for (let dx = -rInt; dx <= rInt; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const bx = px + dx;
          const by = py + dy;
          if (bx >= 0 && bx < BOARD_COLS && by >= 0 && by < BOARD_ROWS) {
            blastCells.add(`${bx},${by}`);
          }
        }
      }
    }
  }

  for (const key of blastCells) {
    const [bx, by] = key.split(',').map(Number);
    simBoard[by][bx] = null;
  }

  return simBoard;
}

type RotationAction = Extract<ActionType, 'rotateCW' | 'rotateCCW'>;

interface PendingRotationAttempt {
  pieceToken: string;
  from: RotationState;
  expectedRotation: RotationState;
  action: RotationAction;
}

interface RotationFailureState {
  pieceToken: string;
  blockedByRotation: Map<RotationState, Set<RotationAction>>;
  visitedRotations: Set<RotationState>;
}

function rotationCommand(
  from: RotationState,
  to: RotationState,
  blockedActions: ReadonlySet<RotationAction> = new Set(),
  visitedRotations: ReadonlySet<RotationState> = new Set(),
  clockwiseOnly = false,
): { action: RotationAction; nextRotation: RotationState } | null {
  const clockwiseSteps = (to - from + 4) % 4;
  const counterClockwiseSteps = (from - to + 4) % 4;
  if (clockwiseSteps === 0) return null;

  const candidates = [
    {
      action: 'rotateCW' as const,
      steps: clockwiseSteps,
      nextRotation: ((from + 1) % 4) as RotationState,
    },
    {
      action: 'rotateCCW' as const,
      steps: counterClockwiseSteps,
      nextRotation: (((from - 1) % 4 + 4) % 4) as RotationState,
    },
  ]
    .filter((candidate) => !clockwiseOnly || candidate.action === 'rotateCW')
    .filter((candidate) =>
      candidate.steps > 0 &&
      !blockedActions.has(candidate.action) &&
      (candidate.nextRotation === to || !visitedRotations.has(candidate.nextRotation)),
    )
    .sort((left, right) => left.steps - right.steps);

  return candidates[0] ?? null;
}

function pieceIdentityToken(player: Pick<PublicPlayerState, 'activePiece' | 'canHold' | 'holdPiece'>): string {
  const piece = player.activePiece;
  if (!piece) return 'none';
  // customOffsets rotate with the piece. Including them here made every
  // successful Wildcard rotation look like a new piece, discarding the plan
  // and preventing the rotation acknowledgement path from running.
  return JSON.stringify([
    piece.type,
    !!piece.poisoned,
    piece.poisonVariant ?? null,
    !!piece.bomber,
    !!piece.isWildcard,
    player.canHold,
    player.holdPiece?.type ?? null,
  ]);
}

function curtainPhaseForObservation(obs: PlayerObservation): {
  phase: 'clear' | 'warning' | 'active';
  contextKey: string | null;
} {
  const effects = obs.context?.effects ?? obs.player.activeEffects ?? [];
  const curtain = effects.find((effect) => effect.kind === 'curtain');
  if (curtain) return { phase: 'active', contextKey: `active:${curtain.id}` };
  if (effects.some((effect) => effect.kind === 'curtain-warn')) {
    return { phase: 'warning', contextKey: null };
  }
  return { phase: 'clear', contextKey: null };
}

type PieceShape = Array<[number, number]>;
type PieceShapeRotations = PieceShape[];

const WILD_PURGE_VARIANTS = new Map<string, number>([
  ['Magenta', 1],
  ['Lime', 2],
  ['Indigo', 3],
  ['Teal', 4],
]);

function rotateCustomShape(offsets: PieceShape, dir: 1 | -1): PieceShape {
  const maxX = Math.max(...offsets.map(([x]) => x));
  const maxY = Math.max(...offsets.map(([, y]) => y));
  const width = maxX + 1;
  const height = maxY + 1;
  const rotated = offsets.map(([x, y]) => dir === 1
    ? [height - 1 - y, x] as [number, number]
    : [y, width - 1 - x] as [number, number]);
  const minX = Math.min(...rotated.map(([x]) => x));
  const minY = Math.min(...rotated.map(([, y]) => y));
  return rotated
    .map(([x, y]) => [x - minX, y - minY] as [number, number])
    .sort((left, right) => left[1] - right[1] || left[0] - right[0]);
}

function customShapeRotations(offsets: PieceShape, currentRotation: RotationState): PieceShapeRotations {
  const rotations = new Array<PieceShape>(4);
  rotations[currentRotation] = offsets.map(([x, y]) => [x, y] as [number, number]);
  for (let step = 1; step < 4; step++) {
    const previousRotation = ((currentRotation + step - 1) % 4) as RotationState;
    const nextRotation = ((currentRotation + step) % 4) as RotationState;
    rotations[nextRotation] = rotateCustomShape(rotations[previousRotation], 1);
  }
  return rotations;
}

function normalizedShapeFromSourceCells(sourceCells?: [number, number][]): PieceShape | undefined {
  if (!sourceCells?.length) return undefined;
  const minX = Math.min(...sourceCells.map(([x]) => x));
  const minY = Math.min(...sourceCells.map(([, y]) => y));
  return sourceCells
    .map(([x, y]) => [x - minX, y - minY] as [number, number])
    .sort((left, right) => left[1] - right[1] || left[0] - right[0]);
}

function visibleWildPurgeVariant(obs: PlayerObservation): number | null {
  const effects = obs.context?.effects ?? obs.player.activeEffects ?? [];
  const warning = effects.find((effect) => effect.kind === 'purge-warn');
  const match = warning?.label.match(/^Wild (Magenta|Lime|Indigo|Teal)$/);
  return match ? WILD_PURGE_VARIANTS.get(match[1]) ?? null : null;
}

function clonePoisonBoard(poisonBoard?: number[][]): number[][] {
  return Array.from({ length: BOARD_ROWS }, (_, y) =>
    Array.from({ length: BOARD_COLS }, (_, x) => poisonBoard?.[y]?.[x] ?? 0));
}

function projectWildPurge(
  board: CellValue[][],
  poisonBoard: number[][],
  variant: number,
): { board: CellValue[][]; poisonBoard: number[][] } {
  const projectedBoard = board.map((row) => [...row]);
  const projectedPoison = clonePoisonBoard(poisonBoard);
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (projectedPoison[y][x] !== variant) continue;
      projectedBoard[y][x] = null;
      projectedPoison[y][x] = 0;
    }
  }
  return { board: projectedBoard, poisonBoard: projectedPoison };
}

function applyPlacementToRememberedBoard(
  board: CellValue[][],
  type: ShapeType,
  plan: PlacementPlan,
  shapeRotations?: PieceShapeRotations,
): CellValue[][] {
  const shape = (shapeRotations ?? SHAPES[type])?.[plan.rotation];
  if (!shape) return board.map((row) => [...row]);

  let dropY = 0;
  let canDescend = true;
  while (canDescend) {
    for (const [px, py] of shape) {
      const bx = plan.x + px;
      const by = dropY + 1 + py;
      if (bx < 0 || bx >= BOARD_COLS || by >= BOARD_ROWS || (by >= 0 && board[by][bx] !== null)) {
        canDescend = false;
        break;
      }
    }
    if (canDescend) dropY++;
  }

  const next = board.map((row) => [...row]);
  for (const [px, py] of shape) {
    const bx = plan.x + px;
    const by = dropY + py;
    if (bx >= 0 && bx < BOARD_COLS && by >= 0 && by < BOARD_ROWS) next[by][bx] = type;
  }

  const remaining = next.filter((row) => row.some((cell) => cell === null));
  while (remaining.length < BOARD_ROWS) remaining.unshift(new Array<CellValue>(BOARD_COLS).fill(null));
  return remaining;
}

export class RulesBot implements InputDriver {
  public readonly mode: ObservationMode;
  public readonly observationMode: ObservationMode;
  public readonly topology: RulesBotTopologyMode;
  /** Candidate profile identity for baseline validation / reproducibility. */
  public readonly profile: RulesBotCandidateProfile;
  public lastDecisionTrace: BotDecisionTrace | null = null;

  private currentPlan: PlacementPlan | null = null;
  private lastPieceKey = '';
  private lastRevision = '';
  private lastImminentState = false;
  private decisionSequence = 0;
  private readonly lastCurtainHardDropAttemptTicks = new Map<string, number>();
  private readonly curtainWarningRecoveries = new Set<string>();
  private readonly lastSeenPieceTokens = new Map<string, string>();
  private readonly curtainColumnUsage = new Map<string, { contextKey: string; counts: number[] }>();
  private readonly pendingLockGaps = new Set<string>();
  private readonly pendingRotationAttempts = new Map<string, PendingRotationAttempt>();
  private readonly rotationFailures = new Map<string, RotationFailureState>();
  private readonly lastVisibleBoards = new Map<string, CellValue[][]>();
  private readonly curtainBeliefs = new Map<string, { contextKey: string; board: CellValue[][] }>();
  private readonly lastActivePieceTypes = new Map<string, ShapeType>();
  private readonly lastActivePieceShapeRotations = new Map<string, PieceShapeRotations>();
  private readonly garbageEnabled: boolean;

  constructor(options?: RulesBotOptions) {
    const profile = options?.profile;
    this.mode = profile?.observationMode ?? options?.mode ?? 'omniscient';
    this.observationMode = this.mode;
    this.topology = profile?.topology ?? options?.topology ?? 'none';
    this.garbageEnabled = profile?.garbageEnabled ?? options?.garbageEnabled ?? false;
    this.profile = resolveRulesBotProfile(
      options,
      this.mode,
      this.topology,
      this.garbageEnabled,
    );
  }

  public next(observation: DriverObservation): PlayerCommand {
    const obs = observation.player;
    const player = obs.player;
    const active = player.activePiece;
    const playerId = player.id;
    const curtain = curtainPhaseForObservation(obs);
    const currentTick = this.mode === 'omniscient' ? observation.tick : undefined;
    const replayTick = observation.replayTick ?? currentTick ?? 0;
    const legacyCurtainRecovery = curtain.contextKey !== null && this.garbageEnabled;

    if (this.mode === 'player-limited' && curtain.phase !== 'active') {
      this.lastVisibleBoards.set(playerId, player.board.map((row) => [...row]));
    }
    if (this.mode === 'player-limited' && curtain.contextKey) {
      const existingBelief = this.curtainBeliefs.get(playerId);
      if (!existingBelief || existingBelief.contextKey !== curtain.contextKey) {
        const remembered = this.lastVisibleBoards.get(playerId);
        if (remembered) {
          this.curtainBeliefs.set(playerId, {
            contextKey: curtain.contextKey,
            board: remembered.map((row) => [...row]),
          });
        } else {
          this.curtainBeliefs.delete(playerId);
        }
      }
      const belief = this.curtainBeliefs.get(playerId);
      const knownEnd = obs.context.boardVisibility?.maskedRowsStart ?? BOARD_ROWS;
      if (belief) {
        for (let y = BOARD_HIDDEN_ROWS; y < knownEnd; y++) belief.board[y] = [...player.board[y]];
      }
    }

    // Revision-based plan invalidation (e.g. Curtain boundary change or new effect instance)
    if (obs.context?.revision && obs.context.revision !== this.lastRevision) {
      this.currentPlan = null;
      this.lastRevision = obs.context.revision;
    }

    // A warning is only a telegraph before the first Curtain. Once the player
    // has actually been curtained, carry the safer cadence through a warning
    // that overlaps the end of that active effect.
    if (curtain.phase === 'active') {
      this.curtainWarningRecoveries.add(playerId);
    } else if (curtain.phase !== 'warning') {
      this.curtainWarningRecoveries.delete(playerId);
    }
    const recoveringThroughCurtainWarning =
      curtain.phase === 'warning' && this.curtainWarningRecoveries.has(playerId);

    const isImminentNow = (player.pendingGarbage || []).some(
      (p) => getPacketTicksUntilArrival(p, currentTick) <= 18,
    );
    if (this.lastImminentState !== isImminentNow) {
      this.currentPlan = null;
      this.lastImminentState = isImminentNow;
    }

    if (!active) {
      // The authoritative engine exposes a one-tick null activePiece between
      // locks. Preserve a Curtain plan through that gap so its target columns
      // can be credited to the piece that just locked.
      if (this.currentPlan?.curtainContextKey) {
        const belief = this.curtainBeliefs.get(playerId);
        const lastType = this.lastActivePieceTypes.get(playerId);
        if (belief && lastType) {
          belief.board = applyPlacementToRememberedBoard(
            belief.board,
            lastType,
            this.currentPlan,
            this.lastActivePieceShapeRotations.get(playerId),
          );
        }
        this.pendingLockGaps.add(playerId);
      } else {
        this.currentPlan = null;
      }
      this.lastPieceKey = '';
      this.pendingRotationAttempts.delete(playerId);
      this.rotationFailures.delete(playerId);
      this.lastDecisionTrace = null;
      return { inputState: { left: false, right: false, softDrop: false }, actions: [] };
    }

    this.lastActivePieceTypes.set(playerId, active.type);
    const activeShapeRotations = active.customOffsets
      ? customShapeRotations(active.customOffsets, active.rotation)
      : undefined;
    if (activeShapeRotations) this.lastActivePieceShapeRotations.set(playerId, activeShapeRotations);
    else this.lastActivePieceShapeRotations.delete(playerId);

    const visibility = deriveVisibilityFromObservation(obs);
    const identityToken = pieceIdentityToken(player);
    const previousIdentityToken = this.lastSeenPieceTokens.get(playerId);
    const previousPlan = this.currentPlan;
    if (
      (this.pendingLockGaps.has(playerId) || (
        previousIdentityToken !== undefined && previousIdentityToken !== identityToken
      )) &&
      previousPlan?.curtainContextKey
    ) {
      const usage = this.curtainColumnUsage.get(playerId);
      const nextUsage = usage?.contextKey === previousPlan.curtainContextKey
        ? usage
        : { contextKey: previousPlan.curtainContextKey, counts: Array(BOARD_COLS).fill(0) };
      for (const column of previousPlan.targetColumns ?? []) {
        nextUsage.counts[column] = Math.min(4, (nextUsage.counts[column] ?? 0) + 1);
      }
      this.curtainColumnUsage.set(playerId, nextUsage);
    }
    this.pendingLockGaps.delete(playerId);
    this.lastSeenPieceTokens.set(playerId, identityToken);
    const activeUsage = this.curtainColumnUsage.get(playerId);
    if (activeUsage && activeUsage.contextKey !== curtain.contextKey) {
      this.curtainColumnUsage.delete(playerId);
    }

    const pieceKey = `${identityToken}_${player.magnetPermanentStacks ?? 0}_${player.magnetPieceBoost ?? 0}`;
    const unknownFromRow = visibility.knownRowEndExclusive < BOARD_ROWS
      ? visibility.knownRowEndExclusive
      : null;
    const planningOptions: BotPlanningOptions = {
      curtainColumnUsage: curtain.contextKey
        ? this.curtainColumnUsage.get(playerId)?.counts
        : undefined,
      unknownFromRow,
      playerId,
      curtainGarbagePressure: curtain.contextKey !== null && (player.pendingGarbage ?? []).length > 0,
      legacyCurtainRecovery,
      wildPurgeVariant: visibleWildPurgeVariant(obs),
    };

    if (legacyCurtainRecovery) {
      this.currentPlan = null;
      this.lastPieceKey = '';
    }

    const buildPlan = (allowedRotations?: RotationState[]): PlacementPlan | null => {
      const planningBoard = curtain.contextKey && !legacyCurtainRecovery
        ? this.curtainBeliefs.get(playerId)?.board
        : undefined;
      const plan = this.findBestPlacement(
        player,
        active.type,
        !!active.bomber,
        currentTick,
        visibility,
        replayTick,
        undefined,
        undefined,
        {
          ...planningOptions,
          allowedRotations,
          planningBoard,
          shapeRotations: activeShapeRotations,
          piecePoisoned: !!active.poisoned,
          piecePoisonVariant: active.poisonVariant,
          pieceIsWildcard: !!active.isWildcard || !!active.customOffsets,
        },
      );
      if (plan) {
        plan.curtainContextKey = curtain.contextKey;
      }
      return plan;
    };

    const ensureRotationState = (): RotationFailureState => {
      const current = this.rotationFailures.get(playerId);
      if (current?.pieceToken === identityToken) return current;
      const next: RotationFailureState = {
        pieceToken: identityToken,
        blockedByRotation: new Map(),
        visitedRotations: new Set([active.rotation]),
      };
      this.rotationFailures.set(playerId, next);
      return next;
    };

    const pendingRotation = this.pendingRotationAttempts.get(playerId);
    let planInvalidatedByRotation = false;
    if (pendingRotation?.pieceToken === identityToken) {
      const rotationState = ensureRotationState();
      if (active.rotation !== pendingRotation.expectedRotation) {
        const blocked = rotationState.blockedByRotation.get(pendingRotation.from) ?? new Set<RotationAction>();
        blocked.add(pendingRotation.action);
        rotationState.blockedByRotation.set(pendingRotation.from, blocked);
        this.currentPlan = null;
        this.lastPieceKey = '';
        planInvalidatedByRotation = true;
      } else {
        rotationState.visitedRotations.add(pendingRotation.expectedRotation);
      }
      this.pendingRotationAttempts.delete(playerId);
    }
    if (this.rotationFailures.get(playerId)?.pieceToken !== identityToken) {
      this.rotationFailures.delete(playerId);
    }

    if (!this.currentPlan || this.lastPieceKey !== pieceKey) {
      const activePlan = buildPlan();

      let holdPlan: PlacementPlan | null = null;
      const activeCanBeHeld = player.canHold && !active.poisoned && !active.customOffsets && !active.isWildcard;
      if (activeCanBeHeld) {
        const holdType = player.holdPiece ? player.holdPiece.type : player.nextQueue?.[0] ?? null;
        const visibleWildcardSourceCells = player.customNextPieceSourceCells?.every(([, y]) =>
          y >= visibility.knownRowStart && y < visibility.knownRowEndExclusive)
          ? player.customNextPieceSourceCells
          : undefined;
        const queuedWildcardShape = player.holdPiece
          ? undefined
          : normalizedShapeFromSourceCells(visibleWildcardSourceCells);
        const queuedWildcardShapeIsHidden =
          !player.holdPiece &&
          !!player.customNextPieceSourceCells?.length &&
          !queuedWildcardShape;
        const heldPieceHasDifferentBehavior =
          !!queuedWildcardShape ||
          !!player.holdPiece?.poisoned ||
          !!player.holdPiece?.bomber;
        if (
          holdType &&
          !queuedWildcardShapeIsHidden &&
          (holdType !== active.type || heldPieceHasDifferentBehavior)
        ) {
          const holdIsBomber = !!player.holdPiece?.bomber;
          const holdShapeRotations = queuedWildcardShape
            ? customShapeRotations(queuedWildcardShape, 0)
            : undefined;
          const heldSpawnX = queuedWildcardShape
            ? Math.floor((BOARD_COLS - (Math.max(...queuedWildcardShape.map(([x]) => x)) + 1)) / 2)
            : 3;
          const heldEvaluationPiece: MagnetControlPiece = {
            x: heldSpawnX,
            y: BOARD_HIDDEN_ROWS - 2,
            rotation: 0,
          };
          holdPlan = this.findBestPlacement(
            player,
            holdType,
            holdIsBomber,
            currentTick,
            visibility,
            replayTick,
            heldEvaluationPiece,
            0,
            {
              ...(legacyCurtainRecovery ? planningOptions : {}),
              shapeRotations: holdShapeRotations,
              piecePoisoned: !!player.holdPiece?.poisoned,
              piecePoisonVariant: player.holdPiece?.poisonVariant,
              pieceIsWildcard: !!holdShapeRotations,
              wildPurgeVariant: planningOptions.wildPurgeVariant,
            },
          );
        }
      }

      const pendingLines = (player.pendingGarbage || []).reduce((sum, p) => sum + p.lines, 0);
      const holdMargin = pendingLines > 0 || (activePlan && activePlan.score < 0) ? 5 : 20;

      if (holdPlan && activePlan && holdPlan.score > activePlan.score + holdMargin) {
        this.currentPlan = null;
        this.lastPieceKey = '';
        this.lastDecisionTrace = null;
        return { actions: ['hold'] };
      }

      this.currentPlan = activePlan;
      this.lastPieceKey = pieceKey;
      this.lastDecisionTrace = activePlan?.trace
        ? {
            ...activePlan.trace,
            decisionId: ++this.decisionSequence,
            decisionSource: 'active',
            committed: true,
          }
        : null;
    }

    if (!this.currentPlan) {
      return curtain.contextKey || recoveringThroughCurtainWarning
        ? { inputState: { left: false, right: false, softDrop: false }, actions: [] }
        : { actions: ['hardDrop'] };
    }

    let targetRot = this.currentPlan.rotation;
    let targetX = this.currentPlan.x;
    const rotationState = ensureRotationState();
    let rotation = rotationCommand(
      active.rotation,
      targetRot as RotationState,
      rotationState.blockedByRotation.get(active.rotation),
      rotationState.visitedRotations,
      legacyCurtainRecovery,
    );

    if (!rotation && active.rotation !== targetRot) {
      // Neither wallkick direction is reachable from this authoritative state.
      // Replan in the current orientation instead of retrying the same
      // blocked turn until the piece locks.
      this.currentPlan = buildPlan([active.rotation]);
      this.lastPieceKey = pieceKey;
      planInvalidatedByRotation = true;
      targetRot = this.currentPlan?.rotation ?? active.rotation;
      targetX = this.currentPlan?.x ?? active.x;
      rotation = this.currentPlan
        ? rotationCommand(
            active.rotation,
            this.currentPlan.rotation as RotationState,
            new Set(),
            new Set(),
            legacyCurtainRecovery,
          )
        : null;
    }

    if (rotation) {
      this.pendingRotationAttempts.set(playerId, {
        pieceToken: identityToken,
        from: active.rotation,
        expectedRotation: rotation.nextRotation,
        action: rotation.action,
      });
      return { inputState: { left: false, right: false, softDrop: false }, actions: [rotation.action] };
    }

    const actions: ActionType[] = [];
    const inputState = { left: false, right: false, softDrop: false };

    if (active.x < targetX) {
      inputState.right = true;
    } else if (active.x > targetX) {
      inputState.left = true;
    }

    if (active.x === targetX && active.rotation === targetRot) {
      const cadenceActive = curtain.contextKey !== null || recoveringThroughCurtainWarning;
      if (cadenceActive && !legacyCurtainRecovery && !planningOptions.curtainGarbagePressure) {
        const lastHardDropTick = player.lastHardDropTick === undefined
          ? -1
          : this.mode === 'omniscient'
            ? player.lastHardDropTick
            : replayTick - player.lastHardDropTick;
        const lastAttemptTick = this.lastCurtainHardDropAttemptTicks.get(playerId) ?? -1;
        const lastDropOrAttemptTick = Math.max(lastHardDropTick, lastAttemptTick);
        if (replayTick - lastDropOrAttemptTick < CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS) {
          return { inputState, actions: [] };
        }
        this.lastCurtainHardDropAttemptTicks.set(playerId, replayTick);
      } else {
        this.lastCurtainHardDropAttemptTicks.delete(playerId);
      }
      return { actions: ['hardDrop'] };
    }

    // Keep this assignment explicit so a failed rotation cannot accidentally
    // look like a clean cached decision to a diagnostics caller.
    if (planInvalidatedByRotation) this.lastDecisionTrace = this.currentPlan?.trace ?? null;
    return { inputState, actions };
  }

  private simulateGarbageCancellation(
    packets: readonly PendingGarbagePacket[],
    attackLines: number,
    currentTick?: number,
  ): { cancelledTotal: number; cancelledImminent: number } {
    let remaining = attackLines;
    let cancelledTotal = 0;
    let cancelledImminent = 0;

    for (const p of packets) {
      if (remaining <= 0) break;
      const ticksRemaining = getPacketTicksUntilArrival(p, currentTick);
      const isImminent = ticksRemaining <= 18;

      const amount = Math.min(remaining, p.lines);
      remaining -= amount;
      cancelledTotal += amount;
      if (isImminent) {
        cancelledImminent += amount;
      }
    }
    return { cancelledTotal, cancelledImminent };
  }

  private findBestPlacement(
    player: PublicPlayerState,
    type: ShapeType,
    isBomber: boolean,
    currentTick?: number,
    visibility?: BoardMetricVisibility,
    replayTick?: number,
    evaluationPiece?: MagnetControlPiece | null,
    evaluationMagnetPieceBoost?: number,
    planningOptions: BotPlanningOptions = {},
  ): PlacementPlan | null {
    const shapeRotations = planningOptions.shapeRotations ?? SHAPES[type];
    if (!shapeRotations || shapeRotations.length === 0) return null;
    const isCustomPiece = !!planningOptions.shapeRotations || !!planningOptions.pieceIsWildcard;

    const planningBoard = planningOptions.planningBoard ?? player.board;
    const evaluationVisibility = planningOptions.planningBoard
      ? { knownRowStart: BOARD_HIDDEN_ROWS, knownRowEndExclusive: BOARD_ROWS }
      : visibility;
    const origEval = evaluateBoard(planningBoard, player.poisonBoard, { visibility: evaluationVisibility });
    // Poison spread changes cell metadata, not board occupancy. Forecasting all
    // remaining waves here made the bot sacrifice stack quality to reduce
    // non-occupancy metadata. Only a visible Purge warning justifies a projected
    // board transformation; the exact poisoned line-clear cost is scored below.
    let strategicOrigBoard = planningBoard.map((row) => [...row]);
    let strategicOrigPoison = clonePoisonBoard(player.poisonBoard);
    if (planningOptions.wildPurgeVariant !== null && planningOptions.wildPurgeVariant !== undefined) {
      const purgeProjection = projectWildPurge(
        strategicOrigBoard,
        strategicOrigPoison,
        planningOptions.wildPurgeVariant,
      );
      strategicOrigBoard = purgeProjection.board;
      strategicOrigPoison = purgeProjection.poisonBoard;
    }
    const strategicOrigEval = evaluateBoard(strategicOrigBoard, strategicOrigPoison, {
      visibility: evaluationVisibility,
    });
    const pendingGarbagePackets = player.pendingGarbage || [];
    const totalPendingGarbage = pendingGarbagePackets.reduce((sum, p) => sum + p.lines, 0);
    const imminentGarbageLines = pendingGarbagePackets
      .filter((p) => getPacketTicksUntilArrival(p, currentTick) <= 18)
      .reduce((sum, p) => sum + p.lines, 0);

    const isGarbageImminent = imminentGarbageLines > 0;
    const isGarbageDefense = totalPendingGarbage > 0;
    const isCriticalPanic =
      origEval.maxHeight >= 11 || (isGarbageImminent && origEval.maxHeight + imminentGarbageLines >= 14);
    const isDownstack = origEval.holes > 0;
    const isCleanStack = !isCriticalPanic && !isGarbageDefense && !isDownstack;

    const allCandidates: CandidateEvaluationTrace[] = [];
    let bestPlan: PlacementPlan | null = null;
    let bestScore = -Infinity;
    let bestClearPlan: PlacementPlan | null = null;
    let bestClearScore = -Infinity;

    const unknownFromRow = planningOptions.unknownFromRow ?? (
      visibility && visibility.knownRowEndExclusive < BOARD_ROWS
        ? visibility.knownRowEndExclusive
        : null
    );
    const frostRows = CURTAIN_FROST_ROWS + (player.curtainDefenseLevel ?? 0);
    const curtainReferenceStart = unknownFromRow === null
      ? null
      : Math.max(0, unknownFromRow - frostRows);
    const hasElevatedCurtainStack = curtainReferenceStart !== null && planningBoard
      .slice(0, curtainReferenceStart)
      .some((row) => row.some((cell) => cell !== null));
    const knownCurtainSupportColumns = new Set<number>();
    if (unknownFromRow !== null) {
      const knownStart = visibility?.knownRowStart ?? 0;
      for (let x = 0; x < BOARD_COLS; x++) {
        if (planningBoard.slice(knownStart, unknownFromRow).some((row) => row[x] !== null)) {
          knownCurtainSupportColumns.add(x);
        }
      }
    }
    const preferClearCurtainColumns =
      knownCurtainSupportColumns.size > 0 &&
      knownCurtainSupportColumns.size * 2 < BOARD_COLS;

    const rotations = (planningOptions.allowedRotations ??
      Array.from({ length: shapeRotations.length }, (_, index) => index as RotationState))
      .filter((rotation) => rotation >= 0 && rotation < shapeRotations.length);

    for (const rotation of rotations) {
      const shape = shapeRotations[rotation];
      const minX = -Math.min(...shape.map(([x]) => x));
      const maxX = BOARD_COLS - 1 - Math.max(...shape.map(([x]) => x));

      for (let x = minX; x <= maxX; x++) {
        let dropY = 0;
        let valid = true;
        while (valid) {
          for (const [px, py] of shape) {
            const bx = x + px;
            const by = dropY + 1 + py;
            if (by >= BOARD_ROWS || (by >= 0 && planningBoard[by][bx] !== null)) {
              valid = false;
              break;
            }
          }
          if (valid) dropY++;
        }

        let simBoard = planningBoard.map((r) => [...r]);
        let simPoisonBoard = clonePoisonBoard(player.poisonBoard);
        const placedCells: Array<[number, number]> = [];

        for (const [px, py] of shape) {
          const bx = x + px;
          const by = dropY + py;
          if (by >= 0 && by < BOARD_ROWS && bx >= 0 && bx < BOARD_COLS) {
            simBoard[by][bx] = type;
            if (planningOptions.piecePoisoned && !isCustomPiece) {
              simPoisonBoard[by][bx] = planningOptions.piecePoisonVariant ?? 1;
            }
            placedCells.push([bx, by]);
          }
        }

        if (isBomber) {
          simBoard = applyBomberBlastSimulation(simBoard, placedCells);
          for (let y = 0; y < BOARD_ROWS; y++) {
            for (let x = 0; x < BOARD_COLS; x++) {
              if (simBoard[y][x] === null) simPoisonBoard[y][x] = 0;
            }
          }
        }

        let linesCleared = 0;
        const clearedRowIndices: number[] = [];
        for (let y = 0; y < BOARD_ROWS; y++) {
          if (simBoard[y].every((cell) => cell !== null)) {
            linesCleared++;
            clearedRowIndices.push(y);
          }
        }
        const poisonedCellsInClearedRows = clearedRowIndices.reduce(
          (total, y) => total + simPoisonBoard[y].filter((variant) => variant !== 0).length,
          0,
        );
        const poisonedLineRatio = linesCleared > 0
          ? poisonedCellsInClearedRows / (linesCleared * BOARD_COLS)
          : 0;

        const visibilityRisk = evaluatePlacementVisibilityRisk(placedCells, clearedRowIndices, visibility ?? { knownRowStart: 0, knownRowEndExclusive: BOARD_ROWS });
        const visibilityRiskPenalty = calculatePlacementVisibilityRiskScore(visibilityRisk);
        const targetColumns = new Set(
          shape
            .map(([px]) => x + px)
            .filter((column) => column >= 0 && column < BOARD_COLS),
        );
        // Spread placements across the visible frontier while it is sparse.
        // Once a real elevated skyline exists, normal stack quality takes
        // priority over historical column reuse.
        const columnReusePenalty = planningOptions.curtainColumnUsage &&
          !planningOptions.legacyCurtainRecovery &&
          !planningOptions.curtainGarbagePressure &&
          !hasElevatedCurtainStack
          ? [...targetColumns].reduce(
              (sum, column) => sum + Math.min(planningOptions.curtainColumnUsage?.[column] ?? 0, 4),
              0,
            ) * 160
          : 0;
        const magnetControlScore = scoreMagnetControl(
          player,
          x,
          rotation,
          dropY,
          evaluationPiece,
          evaluationMagnetPieceBoost,
        );

        // Apply line clear removal to simBoard to evaluate post-clear stack state
        if (linesCleared > 0) {
          const clearedRows = new Set<number>(clearedRowIndices);
          const remainingRows = simBoard.filter((_, y) => !clearedRows.has(y));
          while (remainingRows.length < BOARD_ROWS) {
            remainingRows.unshift(new Array<CellValue>(BOARD_COLS).fill(null));
          }
          simBoard = remainingRows;

          const remainingPoisonRows = simPoisonBoard.filter((_, y) => !clearedRows.has(y));
          while (remainingPoisonRows.length < BOARD_ROWS) {
            remainingPoisonRows.unshift(new Array<number>(BOARD_COLS).fill(0));
          }
          simPoisonBoard = remainingPoisonRows;
        }

        const curtainReferenceScore = unknownFromRow === null ||
          planningOptions.legacyCurtainRecovery ||
          planningOptions.curtainGarbagePressure
          ? 0
          : scoreCurtainReference(simBoard, unknownFromRow, frostRows);

        let strategicBoard = simBoard;
        let strategicPoisonBoard = simPoisonBoard;
        if (planningOptions.wildPurgeVariant !== null && planningOptions.wildPurgeVariant !== undefined) {
          const purgeProjection = projectWildPurge(
            strategicBoard,
            strategicPoisonBoard,
            planningOptions.wildPurgeVariant,
          );
          strategicBoard = purgeProjection.board;
          strategicPoisonBoard = purgeProjection.poisonBoard;
        }
        const simEval = evaluateBoard(strategicBoard, strategicPoisonBoard, {
          visibility: evaluationVisibility,
        });

        const causesTopOut = simBoard[0].some((c) => c !== null) || simBoard[1].some((c) => c !== null);

        const holesDelta = simEval.holes - strategicOrigEval.holes;

        const candidatePiece = { type, rotation: rotation as RotationState, x, y: dropY, bomber: isBomber };
        const activeType = player.activePiece?.type;
        const activeRot = player.activePiece?.rotation ?? 0;
        const lastActionWasRotate = !isCustomPiece && activeType === 'T' && type === 'T' && rotation !== activeRot;
        const plusAttack = detectPlusAttackFor(simBoard, candidatePiece, lastActionWasRotate);
        const perfectClear = simBoard.every((row) => row.every((cell) => cell === null));
        const attackGenerated = previewAttackFromClear({
          lines: linesCleared,
          plusAttack,
          perfectClear,
          combo: player.combo,
          backToBack: player.backToBack,
        });

        const { cancelledTotal, cancelledImminent } = this.simulateGarbageCancellation(
          pendingGarbagePackets,
          attackGenerated,
          currentTick,
        );

        let lineClearScore = 0;
        if (isGarbageImminent) {
          lineClearScore = linesCleared * 180 + cancelledImminent * 450 + cancelledTotal * 200;
        } else if (isGarbageDefense) {
          if (attackGenerated >= 4) {
            lineClearScore = attackGenerated * 250 + cancelledTotal * 150;
          } else if (linesCleared > 0) {
            const penalty = origEval.maxHeight < 8 ? (4 - linesCleared) * 60 : 0;
            lineClearScore = linesCleared * 80 + cancelledTotal * 100 - penalty;
          }
        } else if (isDownstack) {
          lineClearScore = linesCleared * 150;
        } else if (isCleanStack) {
          if (linesCleared === 4) lineClearScore = 450;
          else if (linesCleared > 0) lineClearScore = linesCleared * 50;
        }

        if (attackGenerated > 0 && !isGarbageImminent) {
          lineClearScore += attackGenerated * 40;
        }

        if (isCriticalPanic) {
          lineClearScore += linesCleared * 350;
        }

        const holeCountScore = -simEval.holes * 180;
        const holeCountDeltaScore = holesDelta > 0 ? -holesDelta * 350 : 0;
        const cavityScore = scoreCavityDepthDelta(strategicOrigEval, simEval);
        const surfaceTopologyScore = this.topology === 'surface'
          ? scoreSurfaceTopologyDelta(strategicOrigEval, simEval)
          : 0;
        const holesScore = holeCountScore + holeCountDeltaScore + cavityScore;

        let heightScore = -simEval.aggregateHeight * 2;
        if (simEval.maxHeight >= 8) {
          heightScore -= Math.pow(simEval.maxHeight - 7, 2.3) * 22;
        }
        if (simEval.maxHeight >= 13) {
          heightScore -= (simEval.maxHeight - 12) * 450;
        }

        const bumpinessScore = -simEval.bumpiness * 8;
        const spiresScore = -simEval.spires * 25;
        const wellsScore = -simEval.wells * 25;
        const poisonLineClearPenalty = Math.round(
          (linesCleared * 100 + attackGenerated * 10) *
          poisonedLineRatio *
          POISON_LINE_CLEAR_PENALTY_MAX_RATIO,
        );
        const poisonScore = -simEval.poisonCells * 20 - poisonLineClearPenalty;
        const dropDepthBonus = dropY * 4;

        let finalAdjustmentScore = 0;
        if (visibilityRisk.uncertainLineClearCount > 0 && perfectClear) {
          finalAdjustmentScore -= 500;
        }

        if (causesTopOut) {
          finalAdjustmentScore -= 100000;
        }

        const score =
          lineClearScore +
          holesScore +
          heightScore +
          bumpinessScore +
          spiresScore +
          wellsScore +
          poisonScore +
          dropDepthBonus +
          magnetControlScore +
          surfaceTopologyScore -
          visibilityRiskPenalty +
          curtainReferenceScore -
          columnReusePenalty +
          finalAdjustmentScore;

        const subScores = {
          lineClearScore,
          holeCountScore,
          holeCountDeltaScore,
          cavityScore,
          heightScore,
          bumpinessScore,
          spiresScore,
          wellsScore,
          poisonScore,
          magnetControlScore,
          surfaceTopologyScore,
          dropDepthBonus,
          visibilityRiskPenalty,
          finalAdjustmentScore,
          totalScore: score,
        };

        allCandidates.push({
          rotation,
          x,
          score,
          subScores,
          selected: false,
        });

        if (score > bestScore) {
          bestScore = score;
          bestPlan = { rotation, x, score, subScores, targetColumns: [...targetColumns] };
        }

        const clearFrontierCandidate = unknownFromRow !== null &&
          !planningOptions.legacyCurtainRecovery &&
          !planningOptions.curtainGarbagePressure &&
          preferClearCurtainColumns &&
          [...targetColumns].every((column) => !knownCurtainSupportColumns.has(column));
        if (clearFrontierCandidate && score > bestClearScore) {
          bestClearScore = score;
          bestClearPlan = { rotation, x, score, subScores, targetColumns: [...targetColumns] };
        }
      }
    }

    const selectedPlan = bestClearPlan ?? bestPlan;
    if (selectedPlan && allCandidates.length > 0) {
      allCandidates.sort((a, b) => b.score - a.score);
      const topCandidate = allCandidates.find(
        (c) => c.rotation === selectedPlan.rotation && c.x === selectedPlan.x,
      ) || allCandidates[0];
      topCandidate.selected = true;

      const runnerUps = allCandidates.filter((c) => !c.selected).slice(0, 4);

      const trace: BotDecisionTrace = {
        tick: currentTick ?? 0,
        replayTick: replayTick ?? currentTick ?? 0,
        playerId: player.id,
        pieceType: type,
        decisionBoard: planningBoard.map((row) => [...row]),
        evaluatedCandidateCount: allCandidates.length,
        decisionScore: player.score,
        observationMode: this.mode,
        unknownCellCount: visibility
          ? (BOARD_ROWS - (visibility.knownRowEndExclusive - visibility.knownRowStart)) * BOARD_COLS
          : 0,
        isBomber,
        selectedCandidate: topCandidate,
        runnerUpCandidates: runnerUps,
        activeEffects: player.activeEffects || [],
        pendingGarbageLines: totalPendingGarbage,
        imminentGarbageLines,
        maxHeight: origEval.maxHeight,
        totalCavityDepth: origEval.totalCavityDepth,
      };
      selectedPlan.trace = trace;
    }

    return selectedPlan;
  }
}
