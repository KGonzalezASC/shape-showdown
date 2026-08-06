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
  applyTectonicShift,
  startTectonicShift,
  advanceTectonicShift,
} from './engine.js';
import { applyShopPurchase } from '../shop.js';
import {
  BOARD_COLS,
  BOARD_ROWS,
  BOARD_HIDDEN_ROWS,
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
    // Base score = 1 * 100 + 1 * 10 (Single clear = 1 attack) + 7 * 10 (Perfect Clear = 7 attack) = 180.
    stepPlayer(game.tick, p1, rng, []);
    const cleanScore = p1.score;
    assert.equal(cleanScore, 180, 'Clean single line clear with perfect clear should award 180 points');

    // 2. Now try a line clear with poisoned cells.
    const p2 = makePlayer('a', rng);
    p2.board = createEmptyBoard();
    p2.poisonBoard = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => 0));
    
    // Fill the bottom row except col 0. Even columns are poisoned.
    for (let x = 1; x < BOARD_COLS; x++) {
      p2.board[bottom][x] = 'I';
      if (x % 2 === 0) {
        p2.poisonBoard[bottom][x] = 1;
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
    // poisonedRatio = 4 / 10 = 0.4.
    // POISON_LINE_CLEAR_PENALTY_MAX_RATIO = 0.50.
    // penalty multiplier = 0.4 * 0.50 = 0.20.
    // base score = 180.
    // penalty = Math.round(180 * 0.20) = 36.
    // expected score = 180 - 36 = 144.
    stepPlayer(game.tick, p2, rng, []);
    assert.equal(p2.score, 144, 'Four poisoned cells on a 10-cell clear should award 144 points');
  });

  it('Wildcard +4 item purchase, shape copying, centering, blocked rotation/hold, and locking/poison spreading', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;

    opponent.poisonBoard = createEmptyPoisonBoard();
    const purchaseResult1 = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult1, false, 'Should not purchase wildcard-four if opponent has no poisoned cells');

    const sourceRow = BOARD_ROWS - 5;
    opponent.poisonBoard[sourceRow][4] = 2;
    opponent.poisonBoard[sourceRow][5] = 2;
    opponent.board[sourceRow][4] = 'T';
    opponent.board[sourceRow][5] = 'T';

    const purchaseResult2 = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult2, true, 'Should successfully purchase wildcard-four if opponent has poisoned cells');
    assert.equal(buyer.score, 500 - 60, 'Cost of wildcard-four (60) should be deducted');

    assert.ok(opponent.customNextPieceOffsets, 'Opponent should have customNextPieceOffsets set');
    assert.deepEqual(
      opponent.customNextPieceSourceCells,
      [[4, sourceRow], [5, sourceRow]],
      'Source cells should be saved for the board outline',
    );
    assert.equal(opponent.customNextPieceVariant, 2, 'Should capture variant 2');
    
    opponent.activePiece = null;
    opponent.nextQueue = ['I'];
    
    stepPlayer(game.tick, opponent, rng, []);
    
    const active = opponent.activePiece;
    assert.ok(active, 'Should spawn a piece');
    assert.ok(active.customOffsets, 'Spawned piece should have customOffsets');
    assert.equal(active.customOffsets.length, 2, 'Custom shape should have 2 cells');
    assert.deepEqual(active.customOffsets, [[0, 0], [1, 0]], 'Offsets should be [0,0] and [1,0]');
    
    assert.equal(active.x, 4, 'Two-cell piece should be centered in the 10-column arena');
    assert.equal(active.y, BOARD_HIDDEN_ROWS - 2, 'Piece should spawn at standard height');
    assert.equal(active.poisoned, false, 'Piece should not be marked poisoned');
    assert.equal(active.isWildcard, true, 'Piece should be marked wildcard');
    assert.equal(active.poisonVariant, 2, 'Piece poison variant should match variant 2');

    opponent.actionQueue = ['rotateCW'];
    stepPlayer(game.tick, opponent, rng, []);
    assert.equal(opponent.activePiece.rotation, 1, 'Rotation should succeed and be 1');
    assert.deepEqual(opponent.activePiece.customOffsets, [[0, 0], [0, 1]], 'Offsets should rotate to vertical');

    opponent.canHold = true;
    opponent.holdPiece = null;
    opponent.actionQueue = ['hold'];
    stepPlayer(game.tick, opponent, rng, []);
    assert.ok(opponent.activePiece, 'Hold action should be ignored for custom piece');
    assert.equal(opponent.holdPiece, null, 'Hold piece should remain empty');

    opponent.activePiece.y = BOARD_ROWS - 2;
    opponent.activePiece.x = 0;
    opponent.lockDelayRemainingTicks = 1;
    
    stepPlayer(game.tick, opponent, rng, []);
    
    assert.equal(opponent.activePiece, null, 'Piece should lock and activePiece become null');
    assert.equal(opponent.board[BOARD_ROWS - 2][0], 'W', 'Landed piece cell 1 should lock as W');
    assert.equal(opponent.board[BOARD_ROWS - 1][0], 'W', 'Landed piece cell 2 should lock as W');
    assert.equal(opponent.poisonBoard[BOARD_ROWS - 2][0], 0, 'Landed cell 1 should NOT be poisoned on lock');
    assert.equal(opponent.poisonBoard[BOARD_ROWS - 1][0], 0, 'Landed cell 2 should NOT be poisoned on lock');
  });

  it('Wildcard +4 varies the starting seed and copied shape across successive purchases', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 1000;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;
    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;
    const blotch: Array<[number, number]> = [
      [1, bottom - 2], [2, bottom - 2],
      [0, bottom - 1], [1, bottom - 1], [2, bottom - 1],
      [0, bottom], [1, bottom], [2, bottom], [3, bottom],
    ];
    for (const [x, y] of blotch) {
      opponent.poisonBoard[y][x] = 2;
      opponent.board[y][x] = 'T';
    }

    assert.equal(applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1)), true);
    const firstShape = opponent.customNextPieceOffsets;
    const firstSeed = opponent.wildcardLastSeed;

    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;
    assert.equal(applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1)), true);

    assert.notDeepEqual(opponent.wildcardLastSeed, firstSeed, 'Successive purchases should try a new seed cell');
    assert.notDeepEqual(
      opponent.customNextPieceOffsets,
      firstShape,
      'Successive purchases should prefer a different normalized puzzle shape',
    );
  });

  it('Wildcard +4 line clear reduction', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;

    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;

    // Poison cell on row bottom-1 (row 38) and row bottom (row 39)
    opponent.poisonBoard[bottom - 1][4] = 2;
    opponent.poisonBoard[bottom][4] = 2;

    opponent.board[bottom - 1][4] = 'T';
    opponent.board[bottom][4] = 'T';

    // Fill columns 1-9 of the bottom row (row 39) with standard blocks.
    // Leaving column 0 empty.
    for (let x = 1; x < BOARD_COLS; x++) {
      opponent.board[bottom][x] = 'I';
    }

    // Set opponent active piece to horizontal I-piece aligned at x = -1, y = bottom - 1.
    // offsets: [[0,1],[1,1],[2,1],[3,1]] -> offset [1,1] falls at (0, bottom), filling the row.
    opponent.activePiece = {
      type: 'I',
      rotation: 0,
      x: -1,
      y: bottom - 1,
      poisoned: false,
    };
    opponent.lockDelayRemainingTicks = 1;

    stepPlayer(game.tick, opponent, rng, []);

    // Bottom row (row 39) was cleared; row 38 slid down to row 39.
    // The poisoned cell at (39, 4) was cleared.
    // The poisoned cell at (38, 4) slid down to (39, 4).
    const purchaseResult = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult, true, 'Purchase should succeed after partial clear');
    assert.ok(opponent.customNextPieceOffsets, 'Should have custom offsets');
    assert.equal(opponent.customNextPieceOffsets.length, 1, 'Only 1 cell should remain after partial clear');
    assert.deepEqual(opponent.customNextPieceOffsets, [[0, 0]], 'Remaining coordinate normalized to [0,0]');
  });

  it('Wildcard +4 full clear fizzles', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;

    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;

    // Poison cell only on bottom row (row 39)
    opponent.poisonBoard[bottom][4] = 2;
    opponent.board[bottom][4] = 'T';

    // Fill columns 1-9 of the bottom row (row 39) with standard blocks.
    // Leaving column 0 empty.
    for (let x = 1; x < BOARD_COLS; x++) {
      opponent.board[bottom][x] = 'I';
    }

    // Set opponent active piece to horizontal I-piece aligned at x = -1, y = bottom - 1.
    // offset [1,1] falls at (0, bottom), filling the row and clearing it.
    opponent.activePiece = {
      type: 'I',
      rotation: 0,
      x: -1,
      y: bottom - 1,
      poisoned: false,
    };
    opponent.lockDelayRemainingTicks = 1;

    stepPlayer(game.tick, opponent, rng, []);

    // The only poisoned cell is now cleared. Purchase should fizzle.
    const purchaseResult = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult, false, 'Purchase should fizzle since no poisoned cells remain');
    assert.equal(buyer.score, 500, 'Score should NOT be deducted');
  });

  it('Wildcard +4 mixed cells shape copy', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;

    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;

    // Set up variant 2 poison over mixed cell types:
    // (bottom-1, 4) -> 'T' (Standard)
    // (bottom-1, 5) -> 'W' (Wildcard)
    // (bottom, 4) -> 'G' (Garbage)
    opponent.poisonBoard[bottom - 1][4] = 2;
    opponent.board[bottom - 1][4] = 'T';

    opponent.poisonBoard[bottom - 1][5] = 2;
    opponent.board[bottom - 1][5] = 'W';

    opponent.poisonBoard[bottom][4] = 2;
    opponent.board[bottom][4] = 'G';

    const purchaseResult = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult, true, 'Purchase should succeed');
    assert.ok(opponent.customNextPieceOffsets, 'Should have custom offsets');
    assert.equal(opponent.customNextPieceOffsets.length, 3, 'Should capture all 3 mixed cells');

    // Coordinates: (38,4), (38,5), (39,4).
    // minX = 4, minY = 38.
    // Normalized offsets: (0,0), (1,0), (0,1).
    assert.deepEqual(opponent.customNextPieceOffsets, [[0, 0], [1, 0], [0, 1]]);
  });

  it('Wildcard +4 maximum cell truncation', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;

    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;

    // Fill 10 poisoned cells on bottom row (row 39)
    for (let x = 0; x < BOARD_COLS; x++) {
      opponent.poisonBoard[bottom][x] = 2;
      opponent.board[bottom][x] = 'T';
    }

    const purchaseResult = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult, true, 'Purchase should succeed');
    assert.ok(opponent.customNextPieceOffsets, 'Should have custom offsets');
    assert.equal(opponent.customNextPieceOffsets.length, 6, 'Custom shape should be capped at exactly 6 cells');
    assert.deepEqual(
      opponent.customNextPieceOffsets,
      [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]],
      'Connected BFS from leftmost keeps a contiguous 6-omino strip'
    );
  });

  it('Wildcard +4 picks largest 4-connected blotch, not row-major colour scan', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;

    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;

    // Small disconnected island of variant 2 higher on the board (would win old row-major scan).
    opponent.poisonBoard[bottom - 6][0] = 2;
    opponent.poisonBoard[bottom - 6][1] = 2;
    opponent.board[bottom - 6][0] = 'T';
    opponent.board[bottom - 6][1] = 'T';

    // Larger connected green-style blotch of variant 2 at the bottom-left.
    // Shape (absolute):
    //   ##
    //  ###
    // ####
    const blotch: Array<[number, number]> = [
      [1, bottom - 2],
      [2, bottom - 2],
      [0, bottom - 1],
      [1, bottom - 1],
      [2, bottom - 1],
      [0, bottom],
      [1, bottom],
      [2, bottom],
      [3, bottom],
    ];
    for (const [x, y] of blotch) {
      opponent.poisonBoard[y][x] = 2;
      opponent.board[y][x] = 'T';
    }

    const purchaseResult = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult, true, 'Purchase should succeed');
    assert.equal(opponent.customNextPieceVariant, 2, 'Should use the large blotch variant');
    assert.ok(opponent.customNextPieceOffsets, 'Should have custom offsets');
    // 9-cell blotch capped to 6 via connected BFS from topmost-leftmost (1, bottom-2).
    assert.equal(opponent.customNextPieceOffsets.length, 6, 'Should keep connected subset of 6');
    assert.deepEqual(
      opponent.customNextPieceOffsets,
      [
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
      ],
      'Copied shape must match connected BFS subset of the large blotch, not the tiny top island',
    );
  });

  it('Wildcard +4 chooses largest component across colours (tie → topmost/leftmost)', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;

    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;

    // Small variant-1 island on the left.
    opponent.poisonBoard[bottom][0] = 1;
    opponent.board[bottom][0] = 'T';

    // Larger variant-3 blotch on the right (3 connected cells).
    opponent.poisonBoard[bottom][7] = 3;
    opponent.poisonBoard[bottom][8] = 3;
    opponent.poisonBoard[bottom][9] = 3;
    opponent.board[bottom][7] = 'T';
    opponent.board[bottom][8] = 'T';
    opponent.board[bottom][9] = 'T';

    const purchaseResult = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult, true, 'Purchase should succeed');
    assert.equal(opponent.customNextPieceVariant, 3, 'Largest component wins regardless of colour');
    assert.deepEqual(opponent.customNextPieceOffsets, [[0, 0], [1, 0], [2, 0]]);
  });

  it('Wildcard +4 multi-variant equal size prefers leftmost', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;

    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;

    opponent.poisonBoard[bottom][0] = 1;
    opponent.board[bottom][0] = 'T';

    opponent.poisonBoard[bottom][9] = 3;
    opponent.board[bottom][9] = 'T';

    const purchaseResult = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult, true, 'Purchase should succeed');
    assert.ok(opponent.customNextPieceOffsets, 'Should have custom offsets');
    assert.equal(opponent.customNextPieceOffsets.length, 1, 'Extracted component should have exactly 1 cell');
    assert.deepEqual(opponent.customNextPieceOffsets, [[0, 0]], 'Offset is normalized to [0,0]');
    assert.equal(opponent.customNextPieceVariant, 1, 'Equal-size tie prefers leftmost component');
  });

  it('Wildcard +4 bounding-box rotation for non-domino shapes', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;

    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;
    // L tromino: (0,0)=(bottom-1,4), (1,0)=(bottom-1,5), (0,1)=(bottom,4)
    opponent.poisonBoard[bottom - 1][4] = 2;
    opponent.poisonBoard[bottom - 1][5] = 2;
    opponent.poisonBoard[bottom][4] = 2;
    opponent.board[bottom - 1][4] = 'T';
    opponent.board[bottom - 1][5] = 'T';
    opponent.board[bottom][4] = 'T';

    assert.equal(applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1)), true);
    assert.deepEqual(opponent.customNextPieceOffsets, [[0, 0], [1, 0], [0, 1]]);

    opponent.activePiece = null;
    opponent.nextQueue = ['I'];
    stepPlayer(game.tick, opponent, rng, []);
    assert.ok(opponent.activePiece?.customOffsets);

    opponent.actionQueue = ['rotateCW'];
    stepPlayer(game.tick, opponent, rng, []);
    // Bounding-box CW of L: [[0,0],[1,0],[0,1]] -> [[0,0],[1,0],[1,1]]
    assert.deepEqual(opponent.activePiece!.customOffsets, [[0, 0], [1, 0], [1, 1]]);
  });

  it('Wildcard +4 consumable synergy odds boost reset on purchase', () => {
    const rng = makeRng(1);
    const buyer = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = {
      players: { a: buyer, b: opponent },
      status: 'playing' as const,
      countdown: 0,
      remainingTime: 120,
      winnerId: null,
      tick: 1,
      seed: 1,
    };

    buyer.score = 500;
    buyer.shop.phase = 'cycling';
    buyer.shop.offerIds = ['wildcard-four'];
    buyer.shop.cycleIndex = 0;
    // Set initial active synergy seeds to contain elixir-pulse
    buyer.shop.activeSynergySeeds = ['elixir-pulse'];

    opponent.poisonBoard = createEmptyPoisonBoard();
    opponent.board = createEmptyBoard();

    const bottom = BOARD_ROWS - 1;
    opponent.poisonBoard[bottom][4] = 2;
    opponent.board[bottom][4] = 'T';

    // Purchase the synergy item wildcard-four
    const purchaseResult = applyShopPurchase(game, buyer, opponent, 'wildcard-four', makeRng(1));
    assert.equal(purchaseResult, true, 'Purchase should succeed');

    // Verify that elixir-pulse is consumed and removed from activeSynergySeeds
    assert.ok(!buyer.shop.activeSynergySeeds.includes('elixir-pulse'), 'Elixir synergy seed should be consumed on purchase');
    assert.equal(buyer.shop.activeSynergySeeds.length, 1, 'Only the newly bought wildcard-four should be in seeds');
    assert.deepEqual(buyer.shop.activeSynergySeeds, ['wildcard-four'], 'Purchased item should be added to seeds');
  });

  it('Tectonic Shift collapses holes and clears lines silently', () => {
    const rng = makeRng(1);
    const player = makePlayer('a', rng);

    const bottom = BOARD_ROWS - 1;
    // Set up a hole at (bottom, 4)
    // We fill all other cells in row bottom with solid blocks.
    for (let x = 0; x < BOARD_COLS; x++) {
      if (x !== 4) player.board[bottom][x] = 'I';
    }
    // Set up a solid block above the hole, at (bottom-1, 4)
    player.board[bottom - 1][4] = 'S';
    player.poisonBoard = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(0));
    player.poisonBoard[bottom - 1][4] = 2; // poisoned

    // Pre-checks:
    assert.equal(player.board[bottom][4], null, 'Hole should exist at bottom, 4');
    assert.equal(player.board[bottom - 1][4], 'S', 'Block should exist above the hole');

    // Run Tectonic Shift compaction (instant settle helper)
    applyTectonicShift(player);

    // After compaction, the block 'S' should fall down to fill the hole at (bottom, 4)
    // Since the rest of the bottom row was already filled, this fills the entire row,
    // which triggers the row clear. The row clear deletes the row and shifts unshifted rows.
    // So the bottom row should now be empty (since all blocks got cleared), and the solid row is gone.
    assert.equal(player.board[bottom].every(c => c === null), true, 'Bottom row should be cleared');
    assert.equal(player.poisonBoard[bottom].every(c => c === 0), true, 'Poison on bottom row should be cleared');
    assert.equal(player.linesCleared, 0, 'No lines cleared counter should be added');
    assert.equal(player.tectonicShiftNextStepTick, null, 'Cascade should be idle after settle');
  });

  it('Tectonic Shift clears multiple completed garbage rows together', () => {
    const player = makePlayer('a', makeRng(1));
    const bottom = BOARD_ROWS - 1;

    for (const y of [bottom - 1, bottom]) {
      for (let x = 0; x < BOARD_COLS; x++) {
        player.board[y][x] = 'G';
      }
    }

    applyTectonicShift(player);

    const fullRows = player.board.filter((row) => row.every((cell) => cell !== null));
    assert.equal(fullRows.length, 0, 'Every simultaneously completed garbage row should clear');
    assert.equal(player.linesCleared, 0, 'Garbage clears remain silent');
  });

  it('Tectonic Shift animates one row per step then clears all full rows together', () => {
    const rng = makeRng(1);
    const player = makePlayer('a', rng);
    const bottom = BOARD_ROWS - 1;

    // Column 4 has a 2-cell air gap under an S (needs two gravity steps).
    for (let x = 0; x < BOARD_COLS; x++) {
      if (x !== 4) player.board[bottom][x] = 'I';
    }
    player.board[bottom - 2][4] = 'S';
    player.poisonBoard = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(0));
    player.poisonBoard[bottom - 2][4] = 3;

    startTectonicShift(player, 10);
    assert.equal(player.tectonicShiftNextStepTick, 10);
    assert.ok((player.tectonicShiftStepTicks ?? 0) >= 5, 'Step pacing should be set');

    advanceTectonicShift(player, 10);
    assert.equal(player.board[bottom - 1][4], 'S', 'Block drops one row on first step');
    assert.equal(player.board[bottom - 2][4], null);
    assert.equal(player.poisonBoard[bottom - 1][4], 3, 'Poison rides with the block');
    assert.ok(player.tectonicShiftNextStepTick != null, 'Still cascading');
    assert.equal(player.board[bottom].every((c) => c !== null), false, 'No clear until fully settled');

    advanceTectonicShift(player, player.tectonicShiftNextStepTick!);
    assert.equal(player.board[bottom][4], 'S', 'Block fills the hole on second step');
    assert.ok(player.tectonicShiftNextStepTick != null, 'Still active after last gravity step');

    // Drain remaining gravity / min-duration hold, then silent clear.
    let guard = 0;
    while (player.tectonicShiftNextStepTick != null && guard++ < 100) {
      advanceTectonicShift(player, player.tectonicShiftNextStepTick);
    }
    assert.equal(player.tectonicShiftNextStepTick, null, 'Cascade finished after silent clear');
    assert.equal(player.board[bottom].every((c) => c === null), true, 'Full rows cleared together after settle');
    assert.equal(player.linesCleared, 0, 'Silent clear must not bump linesCleared / shop rolls');
  });
});
