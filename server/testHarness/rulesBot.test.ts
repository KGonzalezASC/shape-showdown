import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoard, RulesBot } from './rulesBot.js';
import { Scenario } from './scenario.js';
import { createEmptyBoard } from '../tetris/engine.js';
import { BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';
import type { DriverObservation } from './inputDriver.js';

describe('RulesBot Adapter', () => {
  it('evaluates board stack metrics accurately', () => {
    const board = createEmptyBoard();
    // Fill bottom row except column 0
    for (let x = 1; x < BOARD_COLS; x++) {
      board[BOARD_ROWS - 1][x] = 'I';
    }
    // Place block above hole at x=0, y=BOARD_ROWS - 2
    board[BOARD_ROWS - 2][0] = 'J';

    const metrics = evaluateBoard(board);
    assert.equal(metrics.holes, 1);
    assert.ok(metrics.aggregateHeight > 0);
    assert.ok(metrics.bumpiness > 0);
  });

  it('projects player-limited observation by masking Curtain rows', () => {
    const omniscientBot = new RulesBot({ mode: 'omniscient' });
    const limitedBot = new RulesBot({ mode: 'player-limited' });

    const scenario = new Scenario({ seed: 1234 });
    const p1 = scenario.getPlayerState('p1');
    p1.board[BOARD_ROWS - 1][0] = 'I';
    p1.activeEffects = [{ id: 'curtain-1', kind: 'curtain', label: 'Curtain' }];

    const obs: DriverObservation = {
      tick: 10,
      player: { tick: 10, player: p1 },
    };

    const omniState = omniscientBot.projectObservation(obs);
    const limitedState = limitedBot.projectObservation(obs);

    assert.equal(omniState.board[BOARD_ROWS - 1][0], 'I');
    assert.equal(limitedState.board[BOARD_ROWS - 1][0], null); // masked by curtain
  });

  it('emits deterministic movement and action commands without mutating state directly', () => {
    const bot = new RulesBot();
    const scenario = new Scenario({ seed: 555 });
    const p1 = scenario.getPlayerState('p1');
    const boardBefore = JSON.stringify(p1.board);

    const obs: DriverObservation = {
      tick: 1,
      player: { tick: 1, player: p1 },
    };

    const cmd = bot.next(obs);

    assert.ok(cmd.inputState !== undefined || (cmd.actions && cmd.actions.length > 0));
    // State remains unmutated by bot decision loop
    assert.equal(JSON.stringify(p1.board), boardBefore);
  });
});
