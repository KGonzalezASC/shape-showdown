import { BOMBER_BLAST_RADIUS, BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';
import type { CellValue, TetrominoType } from '../../src/types.js';
import { PublicPlayerState } from '../../src/state/publicSnapshots.js';
import { SHAPES } from '../tetris/pieces.js';
import type { DriverObservation, InputDriver, PlayerCommand } from './inputDriver.js';
import type { ObservationMode } from './observationProjector.js';

export type { ObservationMode };

export interface RulesBotOptions {
  mode?: ObservationMode;
}

export interface PlacementPlan {
  rotation: number;
  x: number;
  score: number;
}

/** Evaluates board stack quality, poison cells, and holes for bot heuristics. */
export function evaluateBoard(
  board: CellValue[][],
  poisonBoard?: number[][],
): { aggregateHeight: number; holes: number; bumpiness: number; poisonCells: number } {
  const columnHeights = new Array<number>(BOARD_COLS).fill(0);
  let holes = 0;
  let poisonCells = 0;

  for (let x = 0; x < BOARD_COLS; x++) {
    let filledFound = false;
    for (let y = 0; y < BOARD_ROWS; y++) {
      if (board[y][x] !== null) {
        if (!filledFound) {
          columnHeights[x] = BOARD_ROWS - y;
          filledFound = true;
        }
        if (poisonBoard?.[y]?.[x] && poisonBoard[y][x] > 0) {
          poisonCells++;
        }
      } else if (filledFound) {
        holes++;
      }
    }
  }

  let bumpiness = 0;
  for (let x = 0; x < BOARD_COLS - 1; x++) {
    bumpiness += Math.abs(columnHeights[x] - columnHeights[x + 1]);
  }

  const aggregateHeight = columnHeights.reduce((sum, h) => sum + h, 0);

  return { aggregateHeight, holes, bumpiness, poisonCells };
}

/**
 * Pure simulation of Bomber blast matching engine.ts detonateBomberBlast:
 * Detonates a circular blast radius around EVERY locked cell of the piece.
 */
export function applyBomberBlastSimulation(
  board: CellValue[][],
  placedCells: Array<[number, number]>,
  radius = BOMBER_BLAST_RADIUS,
): CellValue[][] {
  const sim = board.map((r) => [...r]);
  const rSq = radius * radius;
  const toClear = new Set<string>();

  for (const [cx, cy] of placedCells) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > rSq) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= BOARD_COLS || y < 0 || y >= BOARD_ROWS) continue;
        if (sim[y][x] !== null) toClear.add(`${x},${y}`);
      }
    }
  }

  for (const key of toClear) {
    const [xs, ys] = key.split(',');
    sim[Number(ys)][Number(xs)] = null;
  }

  return sim;
}

export class RulesBot implements InputDriver {
  public readonly mode: ObservationMode;
  public readonly observationMode: ObservationMode;
  private currentPlan: PlacementPlan | null = null;
  private lastPieceKey = '';
  private lastRevision = '';

  constructor(options?: RulesBotOptions) {
    this.mode = options?.mode ?? 'omniscient';
    this.observationMode = this.mode;
  }

  public next(observation: DriverObservation): PlayerCommand {
    const obs = observation.player;
    const player = obs.player;
    const active = player.activePiece;

    // Revision-based plan invalidation (e.g. Curtain boundary change)
    if (obs.context?.revision && obs.context.revision !== this.lastRevision) {
      this.currentPlan = null;
      this.lastRevision = obs.context.revision;
    }

    if (!active) {
      this.currentPlan = null;
      this.lastPieceKey = '';
      return { inputState: { left: false, right: false, softDrop: false }, actions: [] };
    }

    const pieceKey = `${active.type}_${active.x}_${active.y}_${active.rotation}_${active.bomber ? 'b' : 'n'}`;
    if (!this.currentPlan || this.lastPieceKey !== pieceKey) {
      this.currentPlan = this.findBestPlacement(player, active.type, !!active.bomber);
      this.lastPieceKey = pieceKey;
    }

    if (!this.currentPlan) {
      return { actions: ['hardDrop'] };
    }

    // Step 1: Rotate to target orientation
    if (active.rotation !== this.currentPlan.rotation) {
      return { actions: ['rotateCW'] };
    }

    // Step 2: Move horizontally to target x
    if (active.x < this.currentPlan.x) {
      return { inputState: { left: false, right: true, softDrop: false } };
    }
    if (active.x > this.currentPlan.x) {
      return { inputState: { left: true, right: false, softDrop: false } };
    }

    // Step 3: At target x & rotation -> hard drop
    return { actions: ['hardDrop'] };
  }

  private findBestPlacement(
    player: PublicPlayerState,
    type: TetrominoType,
    isBomber: boolean,
  ): PlacementPlan | null {
    const shapeRotations = SHAPES[type];
    if (!shapeRotations || shapeRotations.length === 0) return null;

    let bestPlan: PlacementPlan | null = null;
    let bestScore = -Infinity;

    for (let rotation = 0; rotation < shapeRotations.length; rotation++) {
      const shape = shapeRotations[rotation];
      const minX = -Math.min(...shape.map(([x]) => x));
      const maxX = BOARD_COLS - 1 - Math.max(...shape.map(([x]) => x));

      for (let x = minX; x <= maxX; x++) {
        // Find drop y for this placement
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

        // Simulate stack after drop
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
        for (let y = 0; y < BOARD_ROWS; y++) {
          if (simBoard[y].every((cell) => cell !== null)) {
            linesCleared++;
          }
        }

        const { aggregateHeight, holes, bumpiness, poisonCells } = evaluateBoard(
          simBoard,
          player.poisonBoard,
        );

        // Heuristic scoring with poison penalty
        const score =
          linesCleared * 100 -
          aggregateHeight * 2 -
          holes * 50 -
          bumpiness * 5 -
          poisonCells * 15;

        if (score > bestScore) {
          bestScore = score;
          bestPlan = { rotation, x, score };
        }
      }
    }

    return bestPlan;
  }
}
