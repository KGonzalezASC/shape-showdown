import { BOARD_COLS, BOARD_VISIBLE_ROWS, CELL_SIZE } from '../types';

const MOBILE_CELL_MIN_PX = 8;
const MOBILE_CELL_MAX_PX = 48;

export interface PlayfieldBox {
  width: number;
  height: number;
}

function clampCellSize(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return Math.floor(clamped * 4) / 4;
}

export function fitMobilePlayfieldCellSize(
  box: PlayfieldBox,
): number {
  const fromWidth = box.width / BOARD_COLS;
  const fromHeight = box.height / BOARD_VISIBLE_ROWS;

  return clampCellSize(
    Math.min(fromWidth, fromHeight),
    MOBILE_CELL_MIN_PX,
    MOBILE_CELL_MAX_PX,
  );
}

export function fitDualPlayfieldCellSize(box: PlayfieldBox): number {
  const gap = box.width >= 640 ? 24 : 12;
  const shopRailReserve = box.width >= 768 ? 128 : 0;
  const horizontalPad = 16;
  const desktopTopOffset = box.width >= 768 ? 40 : 0;
  const verticalPad = 106 + desktopTopOffset;
  const fromWidth = (box.width - horizontalPad - gap - shopRailReserve) / (2 * BOARD_COLS);
  const fromHeight = (box.height - verticalPad) / BOARD_VISIBLE_ROWS;

  return clampCellSize(
    Math.min(fromWidth, fromHeight),
    22,
    CELL_SIZE + 20,
  );
}
