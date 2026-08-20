import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makePlayer } from '../tetris/engine.js';
import { makeRng } from '../../src/rng.js';
import type { GameState } from '../../src/types.js';
import { seatSnapshotToClientModel } from '../../src/protocol/clientMatchModel.js';
import { BOARD_HIDDEN_ROWS } from '../../src/constants.js';
import { buildSeatWireSnapshot } from './seatProjection.js';

describe('seat projection', () => {
  it('keeps the hard-drop marker stable across snapshots', () => {
    const local = makePlayer('local', makeRng(11));
    const opponent = makePlayer('opponent', makeRng(12));
    local.lastHardDropTick = 12;

    const atTick30: GameState = {
      players: { local, opponent },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 30,
      seed: 11,
    };
    const atTick31: GameState = {
      ...atTick30,
      tick: 31,
    };

    assert.equal(buildSeatWireSnapshot(atTick30, 'local')?.local.lastHardDropTick, 12);
    assert.equal(buildSeatWireSnapshot(atTick31, 'local')?.local.lastHardDropTick, 12);
  });

  it('preserves only the opponent cells that are actually poisoned', () => {
    const local = makePlayer('local', makeRng(31));
    const opponent = makePlayer('opponent', makeRng(32));
    const visibleY = BOARD_HIDDEN_ROWS + 12;
    opponent.board[visibleY][3] = 'T';
    opponent.board[visibleY][4] = 'T';
    opponent.poisonBoard![visibleY][3] = 2;
    opponent.magnetPermanentStacks = 3;
    opponent.magnetPieceBoost = 1;
    const gameState: GameState = {
      players: { local, opponent },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 20,
      seed: 31,
    };

    const snapshot = buildSeatWireSnapshot(gameState, 'local');
    assert.ok(snapshot);
    const model = seatSnapshotToClientModel(snapshot, 'local');
    const poisonBoard = model.opponentPlayer?.poisonBoard ?? [];
    const poisonedCells = poisonBoard.flat().filter((variant) => variant > 0);

    assert.deepEqual(poisonedCells, [2]);
    assert.equal(poisonBoard[visibleY][3], 2);
    assert.equal(poisonBoard[visibleY][4], 0);
    assert.equal(model.opponentPlayer?.magnetPermanentStacks, 3);
    assert.equal(model.opponentPlayer?.magnetPieceBoost, 1);
  });

  it('keeps a curtained stack visible in the other seat view', () => {
    const local = makePlayer('local', makeRng(41));
    const opponent = makePlayer('opponent', makeRng(42));
    const visibleY = BOARD_HIDDEN_ROWS + 15;
    opponent.board[visibleY][2] = 'L';
    opponent.activeEffects = [
      { id: 'curtain-1', kind: 'curtain', label: 'Curtain', expiresAtTick: 240 },
    ];
    const gameState: GameState = {
      players: { local, opponent },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 20,
      seed: 41,
    };

    const snapshot = buildSeatWireSnapshot(gameState, 'local');

    assert.equal(snapshot?.opponent.board[15][2], 'L');
  });
});
