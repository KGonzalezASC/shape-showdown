import { BOMBER_BLAST_RADIUS, BOARD_COLS, BOARD_ROWS, BOARD_HIDDEN_ROWS } from '../../src/constants.js';
import type { CellValue, PendingGarbagePacket, RotationState, TetrominoType, CandidateSubScores, CandidateEvaluationTrace, BotDecisionTrace } from '../../src/types.js';
import { PublicPlayerState } from '../../src/state/publicSnapshots.js';
import { SHAPES } from '../tetris/pieces.js';
import { detectTSpinFor, previewAttackFromClear } from '../tetris/engine.js';
import type { DriverObservation, InputDriver, PlayerCommand } from './inputDriver.js';
import type { ObservationMode, PlayerObservation } from './observationProjector.js';

export type { ObservationMode };

export type RulesBotTopologyMode = 'none' | 'surface';

export interface RulesBotOptions {
  mode?: ObservationMode;
  topology?: RulesBotTopologyMode;
}

export interface PlacementPlan {
  rotation: number;
  x: number;
  score: number;
  subScores?: CandidateSubScores;
  trace?: BotDecisionTrace;
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
export function getPacketTicksUntilArrival(
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

export const CAVITY_DEPTH_REDUCTION_WEIGHT = 60;
export const DEEPEST_CAVITY_REDUCTION_WEIGHT = 25;
// Stronger increase penalties made the bot build around cavities until top-out;
// keep them below that avoidance threshold while still preferring shallower cover.
export const CAVITY_DEPTH_INCREASE_PENALTY = 70;
export const DEEPEST_CAVITY_INCREASE_PENALTY = 20;
// Keep topology below the cavity/height terms. It should break near-ties,
// not make the bot avoid otherwise useful placements.
export const SURFACE_PARITY_REDUCTION_WEIGHT = 2;
export const ISOLATED_SPIKE_REDUCTION_WEIGHT = 12;

export interface PlacementVisibilityRisk {
  unknownCellCount: number;
  deepestUnknownRowOffset: number;
  crossesUnknownFrontier: boolean;
  uncertainLineClearCount: number;
}

// Curtain masking makes bottom-row occupancy uncertain, but entering that
// region is still normal play. Keep these penalties below the initial
// frontier-risk calibration so the bot does not stack above the mask and top out.
export const UNKNOWN_PLACED_CELL_PENALTY = 40;
export const UNKNOWN_ROW_DEPTH_PENALTY = 20;
export const UNCERTAIN_LINE_CLEAR_PENALTY = 150;

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

export class RulesBot implements InputDriver {
  public readonly mode: ObservationMode;
  public readonly observationMode: ObservationMode;
  public readonly topology: RulesBotTopologyMode;
  public lastDecisionTrace: BotDecisionTrace | null = null;

  private currentPlan: PlacementPlan | null = null;
  private lastPieceKey = '';
  private lastRevision = '';
  private lastImminentState = false;
  private decisionSequence = 0;

  constructor(options?: RulesBotOptions) {
    this.mode = options?.mode ?? 'omniscient';
    this.observationMode = this.mode;
    this.topology = options?.topology ?? 'none';
  }

  public next(observation: DriverObservation): PlayerCommand {
    const obs = observation.player;
    const player = obs.player;
    const active = player.activePiece;

    // Revision-based plan invalidation (e.g. Curtain boundary change or new effect instance)
    if (obs.context?.revision && obs.context.revision !== this.lastRevision) {
      this.currentPlan = null;
      this.lastRevision = obs.context.revision;
    }

    const currentTick = this.mode === 'omniscient' ? observation.tick : undefined;
    const replayTick = observation.replayTick ?? currentTick ?? 0;
    const isImminentNow = (player.pendingGarbage || []).some(
      (p) => getPacketTicksUntilArrival(p, currentTick) <= 18,
    );
    if (this.lastImminentState !== isImminentNow) {
      this.currentPlan = null;
      this.lastImminentState = isImminentNow;
    }

    if (!active) {
      this.currentPlan = null;
      this.lastPieceKey = '';
      this.lastDecisionTrace = null;
      return { inputState: { left: false, right: false, softDrop: false }, actions: [] };
    }

    const visibility = deriveVisibilityFromObservation(obs);

    const pieceKey = `${active.type}_${active.x}_${active.y}_${active.rotation}_${active.bomber ? 'b' : 'n'}`;
    if (!this.currentPlan || this.lastPieceKey !== pieceKey) {
      const activePlan = this.findBestPlacement(player, active.type, !!active.bomber, currentTick, visibility, replayTick);

      let holdPlan: PlacementPlan | null = null;
      if (player.canHold) {
        const holdType = player.holdPiece ? player.holdPiece.type : player.nextQueue?.[0] ?? null;
        if (holdType && holdType !== active.type) {
          holdPlan = this.findBestPlacement(player, holdType, false, currentTick, visibility, replayTick);
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
      return { actions: ['hardDrop'] };
    }

    const targetRot = this.currentPlan.rotation;
    const targetX = this.currentPlan.x;
    const actions: ('rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold')[] = [];
    const inputState = { left: false, right: false, softDrop: false };

    if (active.rotation !== targetRot) {
      actions.push('rotateCW');
    }

    if (active.x < targetX) {
      inputState.right = true;
    } else if (active.x > targetX) {
      inputState.left = true;
    }

    if (active.x === targetX && active.rotation === targetRot) {
      return { actions: ['hardDrop'] };
    }

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
    type: TetrominoType,
    isBomber: boolean,
    currentTick?: number,
    visibility?: BoardMetricVisibility,
    replayTick?: number,
  ): PlacementPlan | null {
    const shapeRotations = SHAPES[type];
    if (!shapeRotations || shapeRotations.length === 0) return null;

    const origEval = evaluateBoard(player.board, player.poisonBoard, { visibility });
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

    for (let rotation = 0; rotation < shapeRotations.length; rotation++) {
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
            if (by >= BOARD_ROWS || (by >= 0 && player.board[by][bx] !== null)) {
              valid = false;
              break;
            }
          }
          if (valid) dropY++;
        }

        let simBoard = player.board.map((r) => [...r]);
        const placedCells: Array<[number, number]> = [];

        for (const [px, py] of shape) {
          const bx = x + px;
          const by = dropY + py;
          if (by >= 0 && by < BOARD_ROWS && bx >= 0 && bx < BOARD_COLS) {
            simBoard[by][bx] = type;
            placedCells.push([bx, by]);
          }
        }

        if (isBomber) {
          simBoard = applyBomberBlastSimulation(simBoard, placedCells);
        }

        let linesCleared = 0;
        const clearedRowIndices: number[] = [];
        for (let y = 0; y < BOARD_ROWS; y++) {
          if (simBoard[y].every((cell) => cell !== null)) {
            linesCleared++;
            clearedRowIndices.push(y);
          }
        }

        const visibilityRisk = evaluatePlacementVisibilityRisk(placedCells, clearedRowIndices, visibility ?? { knownRowStart: 0, knownRowEndExclusive: BOARD_ROWS });
        const visibilityRiskPenalty = calculatePlacementVisibilityRiskScore(visibilityRisk);

        // Apply line clear removal to simBoard to evaluate post-clear stack state
        if (linesCleared > 0) {
          const clearedRows = new Set<number>(clearedRowIndices);
          const remainingRows = simBoard.filter((_, y) => !clearedRows.has(y));
          while (remainingRows.length < BOARD_ROWS) {
            remainingRows.unshift(new Array<CellValue>(BOARD_COLS).fill(null));
          }
          simBoard = remainingRows;
        }

        const simEval = evaluateBoard(simBoard, player.poisonBoard, { visibility });

        const causesTopOut = simBoard[0].some((c) => c !== null) || simBoard[1].some((c) => c !== null);

        const holesDelta = simEval.holes - origEval.holes;

        const candidatePiece = { type, rotation: rotation as RotationState, x, y: dropY, bomber: isBomber };
        const activeType = player.activePiece?.type;
        const activeRot = player.activePiece?.rotation ?? 0;
        const lastActionWasRotate = activeType === 'T' && type === 'T' && rotation !== activeRot;
        const tSpin = detectTSpinFor(simBoard, candidatePiece, lastActionWasRotate);
        const perfectClear = simBoard.every((row) => row.every((cell) => cell === null));
        const attackGenerated = previewAttackFromClear({
          lines: linesCleared,
          tSpin,
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
        const cavityScore = scoreCavityDepthDelta(origEval, simEval);
        const surfaceTopologyScore = this.topology === 'surface'
          ? scoreSurfaceTopologyDelta(origEval, simEval)
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
        const poisonScore = -simEval.poisonCells * 20;
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
          surfaceTopologyScore -
          visibilityRiskPenalty +
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
          bestPlan = { rotation, x, score, subScores };
        }
      }
    }

    if (bestPlan && allCandidates.length > 0) {
      allCandidates.sort((a, b) => b.score - a.score);
      const topCandidate = allCandidates.find(
        (c) => c.rotation === bestPlan!.rotation && c.x === bestPlan!.x,
      ) || allCandidates[0];
      topCandidate.selected = true;

      const runnerUps = allCandidates.filter((c) => !c.selected).slice(0, 4);

      const trace: BotDecisionTrace = {
        tick: currentTick ?? 0,
        replayTick: replayTick ?? currentTick ?? 0,
        playerId: player.id,
        pieceType: type,
        decisionBoard: player.board.map((row) => [...row]),
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
      bestPlan.trace = trace;
    }

    return bestPlan;
  }
}
