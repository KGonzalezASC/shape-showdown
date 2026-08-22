import type { PublicPlayerState } from '../state/publicSnapshots';
import { SHAPES } from '../puzzleEngine/shapes';
import { CURTAIN_FROST_ROWS } from '../constants';
import {
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_VISIBLE_ROWS,
  type CellValue,
} from '../types';

export interface BoardVisualCell {
  x: number;
  y: number;
  value: CellValue;
  poisonVariant: number;
  bomber: boolean;
  magnetAura: boolean;
  hatched: boolean;
  activeOffsetIndex: number | null;
}

export interface ActiveVisualCell {
  offsetIndex: number;
  x: number;
  y: number;
}

export interface BoardCurtainVisual {
  cutoffRow: number;
  frostRows: number;
}

export interface BoardVisualModel {
  columns: number;
  rows: number;
  cells: BoardVisualCell[];
  activeCells: ActiveVisualCell[];
  activePieceKey: string | null;
  wildcardOutline: Array<[number, number, number, number]>;
  curtain: BoardCurtainVisual | null;
  cellAt(x: number, y: number): BoardVisualCell | undefined;
}

export interface BoardVisualModelOptions {
  hatchingEnabled: boolean;
  isMe: boolean;
}

function visibleCellIndex(x: number, y: number): number {
  return y * BOARD_COLS + x;
}

function isVisibleCell(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_VISIBLE_ROWS;
}

function buildWildcardOutline(
  sourceCells: PublicPlayerState['customNextPieceSourceCells'],
): Array<[number, number, number, number]> {
  if (!sourceCells?.length) return [];
  const visible = sourceCells
    .map(([x, y]) => ({ x, y: y - BOARD_HIDDEN_ROWS }))
    .filter(({ x, y }) => isVisibleCell(x, y));
  const occupied = new Set(visible.map(({ x, y }) => `${x},${y}`));
  const edges: Array<[number, number, number, number]> = [];

  for (const { x, y } of visible) {
    if (!occupied.has(`${x},${y - 1}`)) edges.push([x, y, x + 1, y]);
    if (!occupied.has(`${x + 1},${y}`)) edges.push([x + 1, y, x + 1, y + 1]);
    if (!occupied.has(`${x},${y + 1}`)) edges.push([x, y + 1, x + 1, y + 1]);
    if (!occupied.has(`${x - 1},${y}`)) edges.push([x, y, x, y + 1]);
  }
  return edges;
}

export function buildBoardVisualModel(
  player: PublicPlayerState,
  options: BoardVisualModelOptions,
): BoardVisualModel {
  const cells = Array.from(
    { length: BOARD_VISIBLE_ROWS * BOARD_COLS },
    (_, index): BoardVisualCell => {
      const x = index % BOARD_COLS;
      const y = Math.floor(index / BOARD_COLS);
      const value = player.board[BOARD_HIDDEN_ROWS + y]?.[x] ?? null;
      const poisonVariant = player.poisonBoard?.[BOARD_HIDDEN_ROWS + y]?.[x] ?? 0;
      return {
        x,
        y,
        value,
        poisonVariant,
        bomber: false,
        magnetAura: false,
        hatched: options.hatchingEnabled && value !== null && poisonVariant === 0,
        activeOffsetIndex: null,
      };
    },
  );

  const activePiece = player.activePiece;
  const activeCells: ActiveVisualCell[] = [];
  const activePieceKey = activePiece
    ? [
      activePiece.type,
      activePiece.rotation,
      activePiece.customOffsets?.map(([dx, dy]) => `${dx},${dy}`).join(';') ?? '',
      activePiece.isWildcard ? 'wildcard' : 'regular',
      activePiece.poisoned ? `poison-${activePiece.poisonVariant ?? 1}` : 'clean',
      activePiece.bomber ? 'bomber' : 'normal',
      player.pieceHasHardDropped ? 'hard-dropped' : 'falling',
    ].join('|')
    : null;
  if (activePiece) {
    const offsets =
      activePiece.customOffsets ?? SHAPES[activePiece.type][activePiece.rotation];
    const poisonVariant = activePiece.poisoned
      ? (activePiece.poisonVariant ?? 1)
      : 0;
    const magnetAura = (player.magnetPieceBoost ?? 0) > 0;

    offsets.forEach(([dx, dy], offsetIndex) => {
      const x = activePiece.x + dx;
      const y = activePiece.y + dy - BOARD_HIDDEN_ROWS;
      if (!isVisibleCell(x, y)) return;
      const cell = cells[visibleCellIndex(x, y)];
      cell.activeOffsetIndex = offsetIndex;
      cell.value = activePiece.isWildcard ? 'W' : activePiece.type;
      cell.poisonVariant = poisonVariant;
      cell.bomber = !!activePiece.bomber;
      cell.magnetAura = magnetAura;
      cell.hatched =
        options.hatchingEnabled &&
        poisonVariant === 0 &&
        !cell.bomber &&
        !cell.magnetAura;
      activeCells.push({ offsetIndex, x, y });
    });
  }

  const curtain =
    options.isMe && player.activeEffects?.some((effect) => effect.kind === 'curtain')
      ? {
          cutoffRow: player.swapCutoffRow,
          frostRows: CURTAIN_FROST_ROWS + (player.curtainDefenseLevel ?? 0),
        }
      : null;

  return {
    columns: BOARD_COLS,
    rows: BOARD_VISIBLE_ROWS,
    cells,
    activeCells,
    activePieceKey,
    wildcardOutline: buildWildcardOutline(player.customNextPieceSourceCells),
    curtain,
    cellAt(x, y) {
      return isVisibleCell(x, y) ? cells[visibleCellIndex(x, y)] : undefined;
    },
  };
}
