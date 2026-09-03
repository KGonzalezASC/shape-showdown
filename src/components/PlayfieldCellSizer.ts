import { BOARD_COLS, BOARD_VISIBLE_ROWS, CELL_SIZE } from '../types';

const MOBILE_CELL_MIN_PX = 14;
const MOBILE_CELL_MAX_PX = 48;
const DESKTOP_INCOMING_GARBAGE_RESERVE_PX = 24;

export interface PlayfieldBox {
  width: number;
  height: number;
}

function clampCellSize(value: number, min: number, max: number): number {
  // Integer cells keep CSS grid hairlines continuous; fractional sizes drop vertical segments.
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function fitMobilePlayfieldCellSize(
  box: PlayfieldBox,
  shrinePadPx = 0,
): number {
  const fromWidth = Math.max(0, box.width - 2 * shrinePadPx) / BOARD_COLS;
  const fromHeight = Math.max(0, box.height - 2 * shrinePadPx) / BOARD_VISIBLE_ROWS;

  return clampCellSize(
    Math.min(fromWidth, fromHeight),
    MOBILE_CELL_MIN_PX,
    MOBILE_CELL_MAX_PX,
  );
}

export function fitDualPlayfieldCellSize(box: PlayfieldBox, shrinePadPx = 0): number {
  const gap = box.width >= 640 ? 24 : 12;
  const shopRailReserve = box.width >= 768 ? 128 : 0;
  const horizontalPad = 16;
  const desktopTopOffset = box.width >= 768 ? 40 : 0;
  const verticalPad = 106 + desktopTopOffset;
  const shrineReserveX = shrinePadPx * 4;
  const shrineReserveY = shrinePadPx * 2;
  const fromWidth = (box.width - horizontalPad - gap - shopRailReserve - shrineReserveX) / (2 * BOARD_COLS);
  const fromHeight = (
    box.height - verticalPad - shrineReserveY - DESKTOP_INCOMING_GARBAGE_RESERVE_PX
  ) / BOARD_VISIBLE_ROWS;

  return clampCellSize(
    Math.min(fromWidth, fromHeight),
    22,
    CELL_SIZE + 20,
  );
}
