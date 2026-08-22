import type { CandidateEvaluationTrace, CellValue, ShapeType } from './types';
import {
  BOMBER_BLAST_RADIUS,
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  BOARD_VISIBLE_ROWS,
} from './types';
import { SHAPES } from './puzzleEngine/shapes';

export interface CandidatePlacementProjection {
  cells: Array<{ x: number; y: number }>;
  lineClearCount: number;
}

export interface ReplayCandidateOverlay {
  botChoice: CandidatePlacementProjection;
  alternative: CandidatePlacementProjection | null;
}

/**
 * Replays the solver's hard drop against the board captured at the decision.
 * The replay trace stores rotation and column, while this derives the landing row
 * needed by the board overlay without changing authoritative replay state.
 */
export function projectCandidatePlacement(
  board: CellValue[][],
  pieceType: ShapeType,
  candidate: Pick<CandidateEvaluationTrace, 'rotation' | 'x'>,
  isBomber = false,
): CandidatePlacementProjection {
  const shape = SHAPES[pieceType]?.[candidate.rotation];
  if (!shape) return { cells: [], lineClearCount: 0 };

  const collidesAt = (baseY: number): boolean => shape.some(([dx, dy]) => {
    const x = candidate.x + dx;
    const y = baseY + dy;
    return (
      x < 0 ||
      x >= BOARD_COLS ||
      y >= BOARD_ROWS ||
      (y >= 0 && board[y]?.[x] !== null)
    );
  });

  let landingY = 0;
  while (!collidesAt(landingY + 1)) landingY += 1;

  const simulatedBoard = board.map((row) => [...row]);
  for (const [dx, dy] of shape) {
    const x = candidate.x + dx;
    const y = landingY + dy;
    if (x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_ROWS && simulatedBoard[y]) {
      simulatedBoard[y][x] = pieceType;
    }
  }

  if (isBomber) {
    const blastCells = new Set<string>();
    const radius = Math.floor(BOMBER_BLAST_RADIUS);
    for (const [px, py] of shape.map(([dx, dy]) => [candidate.x + dx, landingY + dy] as const)) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > BOMBER_BLAST_RADIUS * BOMBER_BLAST_RADIUS) continue;
          const x = px + dx;
          const y = py + dy;
          if (x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_ROWS) {
            blastCells.add(`${x},${y}`);
          }
        }
      }
    }
    for (const key of blastCells) {
      const [x, y] = key.split(',').map(Number);
      simulatedBoard[y][x] = null;
    }
  }

  const lineClearCount = simulatedBoard.reduce(
    (count, row) => count + (row.length >= BOARD_COLS && row.slice(0, BOARD_COLS).every((cell) => cell !== null) ? 1 : 0),
    0,
  );

  const cells = shape
    .map(([dx, dy]) => ({
      x: candidate.x + dx,
      y: landingY + dy - BOARD_HIDDEN_ROWS,
    }))
    .filter(({ x, y }) => x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_VISIBLE_ROWS);

  return { cells, lineClearCount };
}
