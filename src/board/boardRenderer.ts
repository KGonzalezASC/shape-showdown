import { BOARD_COLS, BOARD_VISIBLE_ROWS } from '../types';

interface CanvasBackingTarget {
  width: number;
  height: number;
}

export function canvasBackingSize(cellSize: number, requestedDpr: number) {
  const dpr = Math.max(1, Math.min(requestedDpr, 3));
  const cssWidth = BOARD_COLS * cellSize;
  const cssHeight = BOARD_VISIBLE_ROWS * cellSize;
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.round(cssWidth * dpr),
    pixelHeight: Math.round(cssHeight * dpr),
    dpr,
  };
}

export function syncCanvasBackingStore(
  canvas: CanvasBackingTarget,
  cellSize: number,
  requestedDpr: number,
) {
  const size = canvasBackingSize(cellSize, requestedDpr);
  if (canvas.width !== size.pixelWidth) canvas.width = size.pixelWidth;
  if (canvas.height !== size.pixelHeight) canvas.height = size.pixelHeight;
  return size;
}

export function isCanvasLayoutVisible(
  canvas: Pick<HTMLElement, 'offsetParent'>,
): boolean {
  return canvas.offsetParent !== null;
}
