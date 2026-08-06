import { BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';
import type { CellValue, PlayerState } from '../../src/types.js';

export interface BoardPressureMetrics {
  aggregateHeight: number;
  maxHeight: number;
  holes: number;
  bumpiness: number;
  fillRatio: number;
  poisonCells: number;
  totalCavityDepth?: number;
  deepestCavity?: number;
}

export function computeBoardPressure(
  board: CellValue[][],
  poisonBoard?: number[][],
): BoardPressureMetrics {
  const columnHeights = new Array<number>(BOARD_COLS).fill(0);
  let holes = 0;
  let filledCells = 0;
  let poisonCells = 0;
  let totalCavityDepth = 0;
  let deepestCavity = 0;

  for (let x = 0; x < BOARD_COLS; x++) {
    let filledFound = false;
    let filledAboveInCol = 0;
    let colCavityDepth = 0;
    let colDeepestCavity = 0;

    for (let y = 0; y < BOARD_ROWS; y++) {
      if (board[y][x] !== null) {
        filledCells++;
        if (!filledFound) {
          columnHeights[x] = BOARD_ROWS - y;
          filledFound = true;
        }
        filledAboveInCol++;
        if (poisonBoard?.[y]?.[x] && poisonBoard[y][x] > 0) {
          poisonCells++;
        }
      } else if (filledFound) {
        holes++;
        colCavityDepth += filledAboveInCol;
        colDeepestCavity = Math.max(colDeepestCavity, filledAboveInCol);
      }
    }
    totalCavityDepth += colCavityDepth;
    deepestCavity = Math.max(deepestCavity, colDeepestCavity);
  }

  let bumpiness = 0;
  for (let x = 0; x < BOARD_COLS - 1; x++) {
    bumpiness += Math.abs(columnHeights[x] - columnHeights[x + 1]);
  }

  const aggregateHeight = columnHeights.reduce((sum, h) => sum + h, 0);
  const maxHeight = Math.max(...columnHeights, 0);
  const totalCells = BOARD_ROWS * BOARD_COLS;
  const fillRatio = totalCells > 0 ? filledCells / totalCells : 0;

  return {
    aggregateHeight,
    maxHeight,
    holes,
    bumpiness,
    fillRatio,
    poisonCells,
    totalCavityDepth,
    deepestCavity,
  };
}

export function computePlayerPressure(player: PlayerState): BoardPressureMetrics {
  return computeBoardPressure(player.board, player.poisonBoard);
}
