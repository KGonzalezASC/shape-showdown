import { BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';
import type { CellValue, PlayerState, TetrisPiece } from '../../src/types.js';
import { createEmptyBoard, makePlayer } from '../tetris/engine.js';
import { type RngChannels } from '../../src/rng.js';

export type PlayerFixture = (player: PlayerState) => void;

/** Validate board dimensions (must be BOARD_ROWS × BOARD_COLS). */
export function validateBoard(board: CellValue[][]): void {
  if (!Array.isArray(board) || board.length !== BOARD_ROWS) {
    throw new Error(`Invalid board height: expected ${BOARD_ROWS}, got ${board?.length}`);
  }
  for (let y = 0; y < BOARD_ROWS; y++) {
    if (!Array.isArray(board[y]) || board[y].length !== BOARD_COLS) {
      throw new Error(`Invalid board width at row ${y}: expected ${BOARD_COLS}, got ${board[y]?.length}`);
    }
  }
}

/** Deep clone board array after validation. */
export function cloneBoard(board: CellValue[][]): CellValue[][] {
  validateBoard(board);
  return board.map((row) => [...row]);
}

/** Base constructor helper for creating a player with isolated RNG channels. */
export function emptyPlayer(id: string, channels: RngChannels): PlayerState {
  return makePlayer(id, channels);
}

/** Helper fixture: set up board filled near top-out (top spawn rows filled to trigger spawn top-out). */
export function nearTopOutPlayer(topRowsCount = 20): PlayerFixture {
  return (player: PlayerState) => {
    const board = createEmptyBoard();
    const startRow = Math.max(0, BOARD_ROWS - topRowsCount);
    for (let y = startRow; y < BOARD_ROWS; y++) {
      for (let x = 0; x < BOARD_COLS; x++) {
        board[y][x] = 'I';
      }
    }
    validateBoard(board);
    player.board = board;
    player.activePiece = null;
  };
}

/** Helper fixture: append a pending garbage packet. */
export function withPendingGarbage(lines: number, arrivalTick: number): PlayerFixture {
  return (player: PlayerState) => {
    if (lines <= 0) throw new Error(`Garbage lines must be > 0, got ${lines}`);
    player.pendingGarbage.push({ lines, arrivalTick });
  };
}

/** Helper fixture: set active piece shape & position. */
export function withActivePiece(piece: TetrisPiece | null): PlayerFixture {
  return (player: PlayerState) => {
    player.activePiece = piece ? JSON.parse(JSON.stringify(piece)) : null;
  };
}

/** Helper fixture: fill the bottom row of the board except optional holes. */
export function withCompletedBottomRow(holesCount = 0): PlayerFixture {
  return (player: PlayerState) => {
    const bottomY = BOARD_ROWS - 1;
    for (let x = 0; x < BOARD_COLS; x++) {
      if (x < BOARD_COLS - holesCount) {
        player.board[bottomY][x] = 'I';
      } else {
        player.board[bottomY][x] = null;
      }
    }
    validateBoard(player.board);
  };
}

/** Helper fixture: open player shop with specific item as top offer. */
export function shopReadyWithOffer(itemId: string, score = 500): PlayerFixture {
  return (player: PlayerState) => {
    player.score = Math.max(player.score, score);
    player.shop.phase = 'ready';
    player.shop.cycleIndex = 0;
    if (!player.shop.offerIds.includes(itemId)) {
      player.shop.offerIds[0] = itemId;
    } else {
      const idx = player.shop.offerIds.indexOf(itemId);
      if (idx > 0) {
        [player.shop.offerIds[0], player.shop.offerIds[idx]] = [player.shop.offerIds[idx], player.shop.offerIds[0]];
      }
    }
  };
}

/** Combine multiple player fixtures sequentially. */
export function combineFixtures(...fixtures: PlayerFixture[]): PlayerFixture {
  return (player: PlayerState) => {
    for (const fixture of fixtures) {
      fixture(player);
    }
  };
}
