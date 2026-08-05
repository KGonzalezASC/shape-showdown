import { BOARD_COLS, BOARD_HIDDEN_ROWS, BOARD_ROWS } from '../../src/constants.js';
import type { CellValue, PlayerState, TetrominoType } from '../../src/types.js';
import { SHAPES } from '../tetris/pieces.js';
import { clonePlayer, type DriverObservation, type InputDriver, type PlayerCommand } from './inputDriver.js';

export type ObservationMode = 'omniscient' | 'player-limited';

export interface RulesBotOptions {
  mode?: ObservationMode;
}

export interface PlacementPlan {
  rotation: number;
  x: number;
  score: number;
}

/** Evaluates board stack quality for bot heuristics. */
export function evaluateBoard(board: CellValue[][]): { aggregateHeight: number; holes: number; bumpiness: number } {
  const columnHeights = new Array<number>(BOARD_COLS).fill(0);
  let holes = 0;

  for (let x = 0; x < BOARD_COLS; x++) {
    let filledFound = false;
    for (let y = 0; y < BOARD_ROWS; y++) {
      if (board[y][x] !== null) {
        if (!filledFound) {
          columnHeights[x] = BOARD_ROWS - y;
          filledFound = true;
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

  return { aggregateHeight, holes, bumpiness };
}

export class RulesBot implements InputDriver {
  public readonly mode: ObservationMode;
  private currentPlan: PlacementPlan | null = null;
  private lastPieceKey = '';

  constructor(options?: RulesBotOptions) {
    this.mode = options?.mode ?? 'omniscient';
  }

  /** Project player observation based on mode (e.g. mask curtain for player-limited). */
  public projectObservation(observation: DriverObservation): PlayerState {
    const player = clonePlayer(observation.player.player) as PlayerState;
    if (this.mode === 'omniscient') {
      return player;
    }

    // Player-limited mode: mask Curtain rows if active
    const hasCurtain = player.activeEffects?.some((e) => e.kind === 'curtain');
    if (!hasCurtain) {
      return player;
    }

    const maskedBoard = player.board.map((row, y) => {
      // Curtain hides rows below the player's current visible swap line.
      const firstMaskedRow = BOARD_HIDDEN_ROWS + player.swapCutoffRow;
      if (y >= firstMaskedRow) {
        return new Array<CellValue>(BOARD_COLS).fill(null);
      }
      return [...row];
    });

    return {
      ...player,
      board: maskedBoard,
    };
  }

  public next(observation: DriverObservation): PlayerCommand {
    const player = this.projectObservation(observation);
    const active = player.activePiece;

    if (!active) {
      this.currentPlan = null;
      this.lastPieceKey = '';
      return { inputState: { left: false, right: false, softDrop: false }, actions: [] };
    }

    const pieceKey = `${active.type}_${active.x}_${active.y}_${active.rotation}`;
    if (!this.currentPlan || this.lastPieceKey !== pieceKey) {
      this.currentPlan = this.findBestPlacement(player, active.type);
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

  private findBestPlacement(player: PlayerState, type: TetrominoType): PlacementPlan | null {
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
        const simBoard = player.board.map((r) => [...r]);
        let linesCleared = 0;
        for (const [px, py] of shape) {
          const bx = x + px;
          const by = dropY + py;
          if (by >= 0 && by < BOARD_ROWS && bx >= 0 && bx < BOARD_COLS) {
            simBoard[by][bx] = type;
          }
        }

        for (let y = 0; y < BOARD_ROWS; y++) {
          if (simBoard[y].every((cell) => cell !== null)) {
            linesCleared++;
          }
        }

        const { aggregateHeight, holes, bumpiness } = evaluateBoard(simBoard);
        const score = linesCleared * 100 - aggregateHeight * 2 - holes * 50 - bumpiness * 5;

        if (score > bestScore) {
          bestScore = score;
          bestPlan = { rotation, x, score };
        }
      }
    }

    return bestPlan;
  }
}
