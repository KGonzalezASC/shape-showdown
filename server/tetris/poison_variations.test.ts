import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runPoisonSpread,
  poisonKey,
  enumerateVariations,
  buildSampleBoard,
} from './poison_demo.js';
import {
  makePlayer,
  makeRng,
  stepPlayer,
} from './engine.js';
import {
  BOARD_COLS,
  BOARD_ROWS,
  POISON_GENERATIONS,
} from '../../src/constants.js';
import type { CellValue, TetrominoType, RotationState } from '../../src/types.js';

function createEmptyBoard(): CellValue[][] {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => null),
  );
}

function createEmptyPoisonBoard(): number[][] {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => 0),
  );
}

describe('poison spread variations', () => {
  it('determinism: same piece placement yields identical poison set', () => {
    const board = buildSampleBoard();
    const bottom = BOARD_ROWS - 1;

    // Place a T-piece at rotation 0, x=3, directly above the stack.
    // Manually lock it onto the board and check poison twice.
    function simulate() {
      const b = board.map((r) => [...r]);
      const p = createEmptyPoisonBoard();
      // T-piece rotation 0 offsets: [[1,0],[0,1],[1,1],[2,1]]
      const cells = [
        { x: 3 + 1, y: bottom - 4 },     // (4, bottom-4)
        { x: 3 + 0, y: bottom - 4 + 1 }, // (3, bottom-3)
        { x: 3 + 1, y: bottom - 4 + 1 }, // (4, bottom-3)
        { x: 3 + 2, y: bottom - 4 + 1 }, // (5, bottom-3)
      ];
      for (const c of cells) {
        b[c.y][c.x] = 'T';
        p[c.y][c.x] = 1;
      }
      runPoisonSpread(b, p, 1);
      return poisonKey(p);
    }

    const key1 = simulate();
    const key2 = simulate();
    assert.equal(key1, key2, 'Identical placements must produce identical poison keys');
    assert.ok(key1.length > 0, 'Poison key should not be empty');
  });

  it('poison does not spread to empty cells', () => {
    const board = createEmptyBoard();
    const bottom = BOARD_ROWS - 1;
    // Place a single block at the very bottom-left and poison it.
    board[bottom][0] = 'T';
    const poison = createEmptyPoisonBoard();
    poison[bottom][0] = 1;

    runPoisonSpread(board, poison, 1);

    // Only the seed cell should be poisoned — no neighbours are filled.
    const total = poison.flat().filter((v) => v !== 0).length;
    assert.equal(total, 1, 'Poison must not spread to empty cells');
  });

  it('poison does not spread off the grid edges', () => {
    const board = createEmptyBoard();
    const bottom = BOARD_ROWS - 1;
    // Fill just the bottom-left corner cell.
    board[bottom][0] = 'I';
    const poison = createEmptyPoisonBoard();
    poison[bottom][0] = 1;

    runPoisonSpread(board, poison, 1);

    // No out-of-bounds access and only 1 cell poisoned.
    const total = poison.flat().filter((v) => v !== 0).length;
    assert.equal(total, 1, 'Poison must not spread off the grid');
  });

  it('poison spread is bounded by POISON_GENERATIONS waves', () => {
    const board = createEmptyBoard();
    const bottom = BOARD_ROWS - 1;
    // Fill a long horizontal line at the bottom (10 cells).
    for (let x = 0; x < BOARD_COLS; x++) {
      board[bottom][x] = 'I';
    }
    const poison = createEmptyPoisonBoard();
    // Seed only cell (bottom, 0).
    poison[bottom][0] = 1;

    runPoisonSpread(board, poison, 1);

    // POISON_GENERATIONS = 4; wave 0 is the seed, so 3 more spread waves.
    // Each wave spreads 1 cell to the right along the row.
    // Final poisoned cells: columns 0, 1, 2, 3 → 4 total (seed + 3 waves).
    const total = poison.flat().filter((v) => v !== 0).length;
    assert.equal(total, POISON_GENERATIONS, `Expected ${POISON_GENERATIONS} poisoned cells (seed + ${POISON_GENERATIONS - 1} waves)`);
  });

  it('variations count is finite and non-zero for every piece type on the sample board', () => {
    const baseBoard = buildSampleBoard();
    const TYPES: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

    for (const type of TYPES) {
      const seen = enumerateVariations(baseBoard, type);
      assert.ok(seen.size > 0, `${type}-piece should have at least 1 poison variation`);
      assert.ok(seen.size < 200, `${type}-piece variations (${seen.size}) should be bounded (< 200)`);
    }
  });

  it('different placements on the same board can produce different poison groups', () => {
    const baseBoard = buildSampleBoard();
    // T-piece is a good candidate — should have multiple unique variations.
    const seen = enumerateVariations(baseBoard, 'T');
    assert.ok(seen.size > 1, `T-piece should have more than 1 unique variation, got ${seen.size}`);
  });

  it('poison spread follows orthogonal adjacency, not diagonals', () => {
    const board = createEmptyBoard();
    const bottom = BOARD_ROWS - 1;
    // Place blocks in an L shape: seed at (bottom, 0), diagonal at (bottom-1, 1).
    board[bottom][0] = 'T';
    board[bottom - 1][1] = 'T';
    const poison = createEmptyPoisonBoard();
    poison[bottom][0] = 1;

    runPoisonSpread(board, poison, 1);

    // The diagonal block should NOT be poisoned.
    assert.equal(poison[bottom - 1][1], 0, 'Diagonal cell must not be poisoned');
    const total = poison.flat().filter((v) => v !== 0).length;
    assert.equal(total, 1, 'Only the seed cell should be poisoned');
  });

  it('poisoned line clears reduce score proportionately', () => {
    const rng = makeRng(1);
    const p1 = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: p1, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    // Construct a stack where bottom row is full except col 0.
    const bottom = BOARD_ROWS - 1;
    for (let x = 1; x < BOARD_COLS; x++) {
      p1.board[bottom][x] = 'I';
    }
    
    // Position the active piece (e.g. horizontal I-piece aligned at x=-1, y=bottom-1)
    // cells: [[0,1],[1,1],[2,1],[3,1]] -> offset [1,1] falls at (0, bottom), clearing the line.
    p1.activePiece = {
      type: 'I',
      rotation: 0,
      x: -1,
      y: bottom - 1,
      poisoned: false,
    };
    p1.lockDelayRemainingTicks = 1; // lock immediately
    p1.score = 0;

    // Step the player to lock it. This should clear the bottom row.
    // Base score = 1 * 100 + 1 * 10 (Single clear = 1 attack) + 10 * 10 (Perfect Clear = 10 attack) = 210.
    stepPlayer(game, p1, opponent, rng, []);
    const cleanScore = p1.score;
    assert.equal(cleanScore, 210, 'Clean single line clear with perfect clear should award 210 points');

    // 2. Now try a line clear with poisoned cells.
    const p2 = makePlayer('a', rng);
    p2.board = createEmptyBoard();
    p2.poisonBoard = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => 0));
    
    // Fill bottom row: 5 clean cells, 4 poisoned cells, col 0 empty.
    for (let x = 1; x < BOARD_COLS; x++) {
      p2.board[bottom][x] = 'I';
      if (x % 2 === 0) {
        p2.poisonBoard[bottom][x] = 1; // 4 cells poisoned: cols 2, 4, 6, 8
      }
    }
    
    p2.activePiece = {
      type: 'I',
      rotation: 0,
      x: -1,
      y: bottom - 1,
      poisoned: false,
    };
    p2.lockDelayRemainingTicks = 1;
    p2.score = 0;

    // Step the player to lock it.
    // Cleared line has 10 cells total, 4 are poisoned.
    // poisonedRatio = 4 / 10 = 0.40.
    // POISON_LINE_CLEAR_PENALTY_MAX_RATIO = 0.50.
    // penalty multiplier = 0.40 * 0.50 = 0.20 (20% reduction).
    // base score = 210.
    // penalty = Math.round(210 * 0.20) = 42.
    // expected score = 210 - 42 = 168.
    stepPlayer(game, p2, opponent, rng, []);
    assert.equal(p2.score, 168, 'Poisoned single line clear (40% poisoned) should award 168 points (20% reduction)');
  });
});
