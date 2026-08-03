import { makeRng, rngInt, type MutableRng } from '../rng';
import { PIECE_SEQUENCE, SHAPES, type ShapeOffset } from '../tetris/shapes';
import type { RotationState, TetrominoType } from '../types';
import {
  NAME_DROP_COLUMNS,
  NAME_DROP_EDGE_RELAXATION_CELLS,
  NAME_DROP_EDGE_RELAXATION_ENABLED,
  NAME_DROP_FALL_MS,
  NAME_DROP_PIECE_GAP_MS,
  NAME_DROP_ROWS,
  normalizeName,
  type NameDropCell,
  type NameDropPiece,
  type NameDropPlan,
} from './nameDropShared';
import { cellKey, cellsKey, layoutName, nameLines } from './nameDropLayout';

export { nameLines, nameTargetCells } from './nameDropLayout';

/**
 * Landing-only adapter: use the engine's canonical shapes and seeded RNG while
 * keeping this decorative page independent of Socket.IO and the match loop.
 */
export * from './nameDropShared';

interface TilingCandidate {
  type: TetrominoType;
  rotation: RotationState;
  x: number;
  y: number;
  cells: NameDropCell[];
  coveredTargetCells: NameDropCell[];
  candidatePriority: number;
}

function pieceCells(
  type: TetrominoType,
  rotation: RotationState,
  x: number,
  y: number,
): NameDropCell[] {
  return SHAPES[type][rotation].map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

function isEdgeCell(
  cell: NameDropCell,
  target: Set<string>,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  if (target.has(cellKey(cell))) return true;
  const outsideBounds =
    cell.x < bounds.minX || cell.x > bounds.maxX ||
    cell.y < bounds.minY || cell.y > bounds.maxY;
  if (!outsideBounds) return false;
  return [
    { x: cell.x - 1, y: cell.y },
    { x: cell.x + 1, y: cell.y },
    { x: cell.x, y: cell.y - 1 },
    { x: cell.x, y: cell.y + 1 },
  ].some((neighbor) => target.has(cellKey(neighbor)));
}

function piecePriority(type: TetrominoType, rng: MutableRng): number {
  const varietyBias: Record<TetrominoType, number> = {
    I: 350_000,
    J: 90_000,
    L: 90_000,
    O: 500_000,
    S: 0,
    T: 0,
    Z: 0,
  };
  return varietyBias[type] + rngInt(rng, 1_000_000);
}

function generateCandidates(targetCells: NameDropCell[], rng: MutableRng): TilingCandidate[] {
  const target = new Set(targetCells.map(cellKey));
  const minX = Math.min(...targetCells.map(({ x }) => x));
  const maxX = Math.max(...targetCells.map(({ x }) => x));
  const minY = Math.min(...targetCells.map(({ y }) => y));
  const maxY = Math.max(...targetCells.map(({ y }) => y));
  const candidates = new Map<string, TilingCandidate>();
  const relaxation = NAME_DROP_EDGE_RELAXATION_ENABLED ? NAME_DROP_EDGE_RELAXATION_CELLS : 0;

  for (const type of PIECE_SEQUENCE) {
    for (const rotation of [0, 1, 2, 3] as const) {
      const offsets: ShapeOffset[] = SHAPES[type][rotation];
      const minDx = Math.min(...offsets.map(([dx]) => dx));
      const maxDx = Math.max(...offsets.map(([dx]) => dx));
      const minDy = Math.min(...offsets.map(([, dy]) => dy));
      const maxDy = Math.max(...offsets.map(([, dy]) => dy));

      for (let y = minY - maxDy - relaxation; y <= maxY - minDy + relaxation; y += 1) {
        for (let x = minX - maxDx - relaxation; x <= maxX - minDx + relaxation; x += 1) {
          const cells = pieceCells(type, rotation, x, y);
          if (!cells.every((cell) => (
            cell.x >= 0 && cell.x < NAME_DROP_COLUMNS &&
            cell.y >= 0 && cell.y < NAME_DROP_ROWS &&
            isEdgeCell(cell, target, { minX, maxX, minY, maxY })
          ))) continue;
          const coveredTargetCells = cells.filter((cell) => target.has(cellKey(cell)));
          if (coveredTargetCells.length < (relaxation > 0 ? 3 : 4)) continue;
          const occupied = cellsKey(cells);
          const existing = candidates.get(occupied);
          const candidatePriority = piecePriority(type, rng);
          if (!existing || candidatePriority < existing.candidatePriority) {
            candidates.set(occupied, {
              type,
              rotation,
              x,
              y,
              cells,
              coveredTargetCells,
              candidatePriority,
            });
          }
        }
      }
    }
  }

  return [...candidates.values()];
}

function tileGlyph(
  targetCells: NameDropCell[],
  rng: MutableRng,
  occupiedBeforeGlyph: Set<string>,
): TilingCandidate[] {
  const candidates = generateCandidates(targetCells, rng);
  const candidatesByCell = new Map<string, TilingCandidate[]>();

  for (const candidate of candidates) {
    for (const cell of candidate.cells) {
      const id = cellKey(cell);
      const list = candidatesByCell.get(id);
      if (list) list.push(candidate);
      else candidatesByCell.set(id, [candidate]);
    }
  }
  for (const list of candidatesByCell.values()) {
    list.sort((a, b) => a.candidatePriority - b.candidatePriority);
  }

  const remaining = new Set(targetCells.map(cellKey));
  const occupied = new Set(occupiedBeforeGlyph);
  const solution: TilingCandidate[] = [];

  const search = (): boolean => {
    if (remaining.size === 0) return true;

    let options: TilingCandidate[] | null = null;
    for (const id of remaining) {
      const valid = (candidatesByCell.get(id) ?? []).filter((candidate) =>
        candidate.coveredTargetCells.every((cell) => remaining.has(cellKey(cell))) &&
        candidate.cells.every((cell) => !occupied.has(cellKey(cell))),
      );
      if (valid.length === 0) return false;
      if (!options || valid.length < options.length) {
        options = valid;
        if (valid.length === 1) break;
      }
    }

    for (const candidate of options ?? []) {
      const removed = candidate.coveredTargetCells.map(cellKey);
      const added = candidate.cells.map(cellKey);
      removed.forEach((id) => remaining.delete(id));
      added.forEach((id) => occupied.add(id));
      solution.push(candidate);
      if (search()) return true;
      solution.pop();
      removed.forEach((id) => remaining.add(id));
      added.forEach((id) => occupied.delete(id));
    }
    return false;
  };

  if (!search()) {
    throw new Error(`Unable to tile glyph target containing ${targetCells.length} cells`);
  }
  return solution;
}

/** Create a deterministic exact-cover plan made exclusively from playable tetrominoes. */
export function createNameDropPlan(
  value = 'SHAPE SHOWDOWN',
  seed = 0x53485045,
): NameDropPlan {
  const lines = nameLines(value);
  const layout = layoutName(lines);
  const rng = makeRng(seed);
  const occupied = new Set<string>();
  const tiled = layout.glyphs.flatMap((glyph) => {
    const pieces = tileGlyph(glyph.cells, rng, occupied);
    for (const piece of pieces) {
      for (const cell of piece.cells) {
        occupied.add(cellKey(cell));
      }
    }
    return pieces;
  });
  const ordered = tiled
    .map((piece) => ({ piece, tieBreak: rngInt(rng, 1_000_000) }))
    .sort((a, b) => {
      const aBottom = Math.max(...a.piece.cells.map(({ y }) => y));
      const bBottom = Math.max(...b.piece.cells.map(({ y }) => y));
      return bBottom - aBottom || a.piece.x - b.piece.x || a.tieBreak - b.tieBreak;
    });

  const pieces: NameDropPiece[] = ordered.map(({ piece }, index) => ({
    type: piece.type,
    rotation: piece.rotation,
    x: piece.x,
    y: piece.y,
    cells: piece.cells,
    delayMs: index * NAME_DROP_PIECE_GAP_MS,
    durationMs: NAME_DROP_FALL_MS + rngInt(rng, 180),
  }));
  const lastPiece = pieces[pieces.length - 1];

  return {
    name: normalizeName(value),
    lines,
    targetCells: layout.targetCells,
    pieces,
    totalDurationMs:
      (lastPiece?.delayMs ?? 0) + (lastPiece?.durationMs ?? 0) + 1_800,
  };
}
