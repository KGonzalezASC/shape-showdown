import {
  BOARD_COLS,
  BOARD_ROWS,
  POISON_GENERATIONS,
  POISON_SPREAD_INTERVAL_TICKS,
} from '../../src/constants.js';
import type { CellValue, ShapeType } from '../../src/types.js';
import { createEmptyBoard, createEmptyPoisonBoard } from '../puzzleEngine/engine.js';
import type { MutableRng } from '../../src/rng.js';
import { rngInt, rngNext } from '../../src/rng.js';
import { PIECE_SEQUENCE } from '../puzzleEngine/pieces.js';
import type { PuzzleLevel, TimelineEvent } from './puzzleTypes.js';

/** Engine-compatible shuffled 7-bag (same Fisher-Yates as engine.ts). */
function shuffledPieceBag(rng: MutableRng): ShapeType[] {
  const bag = [...PIECE_SEQUENCE];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rngNext(rng) * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/**
 * Seeded puzzle generator.
 *
 * Boards are generated *backwards* from a solvable state: the garbage rows are
 * derived from a simulated fill (so the stack is always physically reachable —
 * no floating cells), poison is seeded only on locked cells, and the hazard
 * timeline is appended after the first piece lands (so the player always gets
 * at least one clean piece before the first hazard).
 */

export interface GenerateOptions {
  id: string;
  name: string;
  seed: number;
  /** Number of garbage rows to stack (0 = clean board). */
  garbageRows?: number;
  /** Garbage rows carry random holes each when true (default: 1-2 holes per row). */
  messyGarbage?: boolean;
  /** Max holes per row when messyGarbage is enabled (default: 2, e.g. 3 for cheese). */
  maxHolesPerRow?: number;
  /** Keep a specific column (0-9) or 'random' completely open as a vertical well down to the floor. */
  openColumn?: number | 'random';
  /** Varying stack heights (jagged skyline) when true; flat rows otherwise. */
  variedHeights?: boolean;
  /** Seed this many poison cells on the initial stack (0 = clean). */
  poisonSeeds?: number;
  /** Hazard timeline appended after the first piece lands. */
  timeline?: TimelineEvent[];
  /** Shop policy for the level (default 'none' = pure puzzle). */
  shopPolicy?: 'none' | 'standard';
  /** Whether the player is permitted to use the hold chamber (default true). */
  allowHold?: boolean;
  goal: PuzzleLevel['goal'];
  /** Par values for star thresholds. */
  par?: PuzzleLevel['par'];
  /** Fixed piece queue prefix (default: seeded random first bag). */
  queuePrefix?: ShapeType[];
}

/** Simulate a lock fill and return the resulting board (no active piece). */
function simulateFillBoard(
  rows: number,
  messy: boolean,
  varied: boolean,
  openCol: number | undefined,
  maxHoles: number,
  rng: MutableRng,
): CellValue[][] {
  const board = createEmptyBoard();
  if (rows <= 0) return board;

  if (varied) {
    // Jagged skyline via a per-column heightmap.
    // To ensure NO row is completely full and NO cell is floating:
    // each column x has a solid stack of height h[x] (0 to rows) resting on the floor.
    const maxH = Math.min(rows, BOARD_ROWS - 2);
    const colHeights: number[] = Array.from({ length: BOARD_COLS }, () => rngInt(rng, maxH + 1));

    if (openCol !== undefined) {
      colHeights[openCol] = 0;
    } else {
      // Guarantee that at least 1 column has height 0 (so the bottom row has a hole)
      if (!colHeights.some((h) => h === 0)) {
        const zeroCol = rngInt(rng, BOARD_COLS);
        colHeights[zeroCol] = 0;
      }
    }

    // Ensure every row level from 0 to actualMax - 1 has at least 1 column with height <= level
    const actualMax = Math.max(...colHeights);
    for (let level = 0; level < actualMax; level++) {
      if (!colHeights.some((h) => h <= level)) {
        const col = rngInt(rng, BOARD_COLS);
        if (col !== openCol) colHeights[col] = level;
      }
    }

    // Fill each column bottom-up so every cell is supported beneath it
    for (let x = 0; x < BOARD_COLS; x++) {
      if (x === openCol) continue;
      for (let i = 0; i < colHeights[x]; i++) {
        board[BOARD_ROWS - 1 - i][x] = 'G';
      }
    }
    return board;
  }

  for (let i = 0; i < rows; i++) {
    const y = BOARD_ROWS - 1 - i;
    if (openCol !== undefined) {
      // Missing column well: designated open column is always null.
      const holeCols = new Set<number>([openCol]);
      if (messy) {
        const extraHoles = rngInt(rng, Math.max(1, maxHoles));
        while (holeCols.size < 1 + extraHoles) {
          holeCols.add(rngInt(rng, BOARD_COLS));
        }
      }
      for (let x = 0; x < BOARD_COLS; x++) {
        board[y][x] = holeCols.has(x) ? null : 'G';
      }
    } else if (messy) {
      // 1 to maxHoles distinct random holes per row.
      const numHoles = 1 + rngInt(rng, Math.max(1, maxHoles));
      const holeCols = new Set<number>();
      while (holeCols.size < numHoles) {
        holeCols.add(rngInt(rng, BOARD_COLS));
      }
      for (let x = 0; x < BOARD_COLS; x++) {
        board[y][x] = holeCols.has(x) ? null : 'G';
      }
    } else {
      // Solid garbage row with one random hole (standard competitive behaviour).
      const hole = rngInt(rng, BOARD_COLS);
      for (let x = 0; x < BOARD_COLS; x++) {
        board[y][x] = x === hole ? null : 'G';
      }
    }
  }

  return board;
}

/** Seed `count` poison cells on filled board cells (orthogonally non-adjacent where possible). */
function seedPoison(board: CellValue[][], poison: number[][], count: number, rng: MutableRng): void {
  const filled: Array<[number, number]> = [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (board[y][x] !== null) filled.push([y, x]);
    }
  }
  if (filled.length === 0) return;
  // Shuffle deterministically with the level rng, then take the first `count`
  // cells that are not orthogonally adjacent to an already-poisoned cell.
  for (let i = filled.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [filled[i], filled[j]] = [filled[j], filled[i]];
  }
  let seeded = 0;
  for (const [y, x] of filled) {
    if (seeded >= count) break;
    if (poison[y][x] !== 0) continue;
    const neighbourPoisoned =
      (y > 0 && poison[y - 1][x] !== 0) ||
      (y < BOARD_ROWS - 1 && poison[y + 1][x] !== 0) ||
      (x > 0 && poison[y][x - 1] !== 0) ||
      (x < BOARD_COLS - 1 && poison[y][x + 1] !== 0);
    if (neighbourPoisoned) continue;
    poison[y][x] = 1;
    seeded += 1;
  }
}

/** Offset the hazard timeline so the first event fires after the first piece lands. */
function offsetTimeline(events: TimelineEvent[], firstPieceTicks: number): TimelineEvent[] {
  const offset = Math.max(0, firstPieceTicks);
  return events.map((e) => ({ ...e, tick: e.tick + offset }));
}

/** First lock happens after GRAVITY_TICKS_PER_CELL * (board height) — approximate with a constant. */
const FIRST_PIECE_TICKS = 60;

export function generatePuzzleLevel(options: GenerateOptions): PuzzleLevel {
  // One shared rng channel for the whole generation (deterministic per seed).
  const rng: MutableRng = { seed: (options.seed ^ 0x50505) | 0 };

  const garbageRows = options.garbageRows ?? 0;
  const messy = options.messyGarbage ?? false;
  const varied = options.variedHeights ?? false;
  const poisonSeeds = options.poisonSeeds ?? 0;
  const shopPolicy = options.shopPolicy ?? 'none';
  const maxHoles = options.maxHolesPerRow ?? 2;
  const openCol = options.openColumn === 'random'
    ? rngInt(rng, BOARD_COLS)
    : options.openColumn;

  const board = simulateFillBoard(garbageRows, messy, varied, openCol, maxHoles, rng);
  const poison = createEmptyPoisonBoard();
  if (poisonSeeds > 0) seedPoison(board, poison, poisonSeeds, rng);

  // Seeded first bag (default queue prefix): mirrors the engine's shuffled
  // 7-bag so puzzle piece streams differ by seed unless overridden.
  const queuePrefix = options.queuePrefix ?? shuffledPieceBag(rng);

  const level: PuzzleLevel = {
    id: options.id,
    name: options.name,
    seed: options.seed,
    initialBoard: board,
    queuePrefix,
    goal: options.goal,
    timeline: offsetTimeline(options.timeline ?? [], FIRST_PIECE_TICKS),
    shopPolicy,
    allowHold: options.allowHold ?? true,
    par: options.par,
  };
  return level;
}

export type { PuzzleLevel, TimelineEvent, PuzzleGoal, HazardKind } from './puzzleTypes.js';
