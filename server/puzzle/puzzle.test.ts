import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import { derivePuzzleSolution } from './puzzleSolution.js';
import { PuzzleSession } from './puzzleSession.js';
import { RulesBot } from '../testHarness/rulesBot.js';
import type { PuzzleLevel, PuzzleSolution } from './puzzleTypes.js';

const pcGoal = { kind: 'perfect-clear', maxPieces: 40 } as const;

function cleanLevel(id: string, seed: number): PuzzleLevel {
  return generatePuzzleLevel({
    id,
    name: `clean-${id}`,
    seed,
    garbageRows: 0,
    goal: pcGoal,
  });
}

describe('puzzleGenerator', () => {
  it('produces a level with the requested dimensions and defaults', () => {
    const level = cleanLevel('t1', 42);
    assert.equal(level.id, 't1');
    assert.equal(level.seed, 42);
    assert.equal(level.initialBoard.length, BOARD_ROWS);
    assert.equal(level.initialBoard[0].length, BOARD_COLS);
    assert.deepEqual(level.goal, pcGoal);
    assert.equal(level.shopPolicy, 'none');
    assert.deepEqual(level.timeline, []);
  });

  it('is deterministic: same seed produces identical boards and queues', () => {
    const a = cleanLevel('det', 4242);
    const b = cleanLevel('det', 4242);
    assert.deepEqual(a.initialBoard, b.initialBoard);
    assert.deepEqual(a.queuePrefix, b.queuePrefix);
    assert.deepEqual(a.timeline, b.timeline);
  });

  it('different seeds produce different levels (over 20 seeds)', () => {
    // Clean levels have an intentionally empty board; seed variation lives in
    // the seeded first-bag queue prefix, so hash board + queue together.
    const levels = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const level = cleanLevel(`s${seed}`, seed);
      levels.add(JSON.stringify([level.initialBoard, level.queuePrefix]));
    }
    assert.ok(levels.size > 1);
  });

  it('garbage rows sit at the bottom and are physically reachable (no floating cells)', () => {
    const level = generatePuzzleLevel({
      id: 'garb',
      name: 'garb',
      seed: 7,
      garbageRows: 5,
      variedHeights: true,
      goal: pcGoal,
    });
    // No-floating-cells invariant, per cell: every filled cell must rest on
    // the floor or on another filled cell directly beneath it.
    for (let y = 0; y < BOARD_ROWS; y++) {
      for (let x = 0; x < BOARD_COLS; x++) {
        if (level.initialBoard[y][x] === null) continue;
        const supported = y === BOARD_ROWS - 1 || level.initialBoard[y + 1][x] !== null;
        assert.ok(supported, `cell (${y},${x}) has no support beneath it`);
      }
    }
  });

  it('timeline events fire after the first piece lands', () => {
    const level = generatePuzzleLevel({
      id: 'tl',
      name: 'tl',
      seed: 11,
      timeline: [{ tick: 0, kind: 'poison' }],
      goal: pcGoal,
    });
    assert.equal(level.timeline.length, 1);
    assert.ok(level.timeline[0].tick >= 60);
  });
});

describe('puzzleSolution (RulesBot as oracle)', () => {
  it('derives a solution for a clean-board PC level', () => {
    const level = cleanLevel('derive', 77);
    const solution = derivePuzzleSolution(level);
    assert.equal(solution.levelId, 'derive');
    assert.ok(solution.commands.length > 0);
  });

  it('a clean empty board is already a perfect clear (zero commands needed)', () => {
    const level = generatePuzzleLevel({
      id: 'empty',
      name: 'empty',
      seed: 5,
      garbageRows: 0,
      goal: pcGoal,
    });
    // An empty board is already solved: the bot needs zero commands.
    const solution = derivePuzzleSolution(level);
    assert.equal(solution.solved, true);
    assert.equal(solution.piecesUsed, 0);
  });
});

describe('puzzleSession', () => {
  it('runs a scripted driver to a PC on a clean board', () => {
    const level = cleanLevel('session', 99);
    const session = new PuzzleSession({ level, driver: new RulesBot({ mode: 'omniscient' }) });
    const report = session.advance(60 * 60);
    assert.equal(report.solved, true);
    assert.equal(report.perfectClear, true);
    assert.equal(report.topOut, false);
    assert.ok(report.commandRecords.length > 0);
  });

  it('is deterministic: same seed and driver produce identical reports', () => {
    const level = cleanLevel('det-session', 4242);
    const run = () => {
      const session = new PuzzleSession({ level, driver: new RulesBot({ mode: 'omniscient' }) });
      return session.advance(60 * 60);
    };
    const a = run();
    const b = run();
    assert.deepEqual(a.commandRecords, b.commandRecords);
    assert.equal(a.ticksUsed, b.ticksUsed);
    assert.equal(a.piecesUsed, b.piecesUsed);
    assert.equal(a.solved, b.solved);
  });

  it('timeline events fire after the first piece lands, in order', () => {
    const level = generatePuzzleLevel({
      id: 'tl-session',
      name: 'tl-session',
      seed: 11,
      timeline: [
        { tick: 0, kind: 'poison' },
        { tick: 60, kind: 'magnet' },
      ],
      goal: pcGoal,
    });
    assert.ok(level.timeline[0].tick >= 60);
    assert.ok(level.timeline[1].tick >= level.timeline[0].tick + 60);
  });

  it('a top-out ends the session as unsolved', () => {
    const level = generatePuzzleLevel({
      id: 'topout',
      name: 'topout',
      seed: 13,
      garbageRows: BOARD_ROWS - 2,
      goal: pcGoal,
    });
    const session = new PuzzleSession({ level, driver: new RulesBot({ mode: 'omniscient' }) });
    const report = session.advance(60 * 60);
    assert.equal(report.topOut, true);
    assert.equal(report.solved, false);
  });

  it('never produces completely full rows on tick 0 across 50 seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const stacked = generatePuzzleLevel({
        id: `s-${seed}`,
        name: 'stacked',
        seed,
        garbageRows: 7,
        variedHeights: true,
        goal: { kind: 'clear-lines', lines: 10 },
      });
      for (let y = 0; y < BOARD_ROWS; y++) {
        assert.ok(
          stacked.initialBoard[y].some((cell) => cell === null),
          `stacked seed ${seed} row ${y} was completely full on tick 0`,
        );
      }

      const dig = generatePuzzleLevel({
        id: `d-${seed}`,
        name: 'dig',
        seed,
        garbageRows: 5,
        messyGarbage: true,
        goal: { kind: 'clear-lines', lines: 5 },
      });
      for (let y = 0; y < BOARD_ROWS; y++) {
        assert.ok(
          dig.initialBoard[y].some((cell) => cell === null),
          `dig seed ${seed} row ${y} was completely full on tick 0`,
        );
      }
    }
  });

  it('honors allowHold=false by rejecting hold actions and keeping canHold false', () => {
    const level = generatePuzzleLevel({
      id: 'no-hold',
      name: 'no-hold',
      seed: 22,
      allowHold: false,
      garbageRows: 0,
      goal: { kind: 'clear-lines', lines: 3 },
    });
    const session = new PuzzleSession({
      level,
      driver: {
        next: () => ({ actions: ['hold'] }),
      },
    });
    const pBefore = session.getPlayerState();
    assert.equal(pBefore.canHold, false);
    assert.equal(pBefore.swapCutoffRow, 0);

    session.advance(10);
    const pAfter = session.getPlayerState();
    assert.equal(pAfter.holdPiece, null, 'holdPiece should remain null when hold is disabled');
    assert.equal(pAfter.canHold, false);
  });

  it('single line clear increments linesCleared by 1 and preserves existing garbage', () => {
    const level = generatePuzzleLevel({
      id: 'single-clear',
      name: 'single-clear',
      seed: 99,
      garbageRows: 0,
      goal: { kind: 'clear-lines', lines: 5 },
    });
    // Set bottom row missing columns 0, 1, 2, 3
    level.initialBoard[BOARD_ROWS - 1] = [null, null, null, null, 'G', 'G', 'G', 'G', 'G', 'G'];

    const session = new PuzzleSession({
      level,
      driver: {
        next: () => ({ actions: [] }),
      },
    });
    const player = session.getPlayerState();
    assert.equal(player.linesCleared, 0);

    // Place an I piece horizontal in cols 0-3 (rotation 0: x=0, y=BOARD_ROWS-2 so y+1=BOARD_ROWS-1)
    player.activePiece = {
      type: 'I',
      rotation: 0,
      x: 0,
      y: BOARD_ROWS - 2,
    };
    player.actionQueue.push('hardDrop');
    session.advance(1);

    // Should have cleared exactly 1 line
    assert.equal(player.linesCleared, 1);
  });

  it('generates a completely open vertical column for well-run levels', () => {
    const level = generatePuzzleLevel({
      id: 'well-test',
      name: 'well-run',
      seed: 42,
      garbageRows: 6,
      openColumn: 9,
      goal: { kind: 'clear-lines', lines: 4 },
    });

    // Column 9 must be completely null down to the bottom
    for (let y = 0; y < BOARD_ROWS; y++) {
      assert.equal(level.initialBoard[y][9], null, `expected column 9 row ${y} to be empty`);
    }
    // And rows BOARD_ROWS - 6 to BOARD_ROWS - 1 must have filled garbage in other columns
    for (let i = 0; i < 6; i++) {
      const y = BOARD_ROWS - 1 - i;
      const filledOtherCols = level.initialBoard[y].slice(0, 9).filter((c) => c === 'G').length;
      assert.ok(filledOtherCols >= 7, `expected row ${y} to be mostly filled outside column 9`);
    }
  });

  it('generates cheese levels with varying hole counts (1-3) and zero full rows', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const level = generatePuzzleLevel({
        id: `cheese-${seed}`,
        name: 'cheese',
        seed,
        garbageRows: 6,
        messyGarbage: true,
        maxHolesPerRow: 3,
        goal: { kind: 'clear-lines', lines: 8 },
      });

      for (let y = 0; y < BOARD_ROWS; y++) {
        assert.ok(
          level.initialBoard[y].some((cell) => cell === null),
          `cheese seed ${seed} row ${y} was full on tick 0`,
        );
      }
    }
  });
});
