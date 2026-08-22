import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makePlayer } from '../puzzleEngine/engine.js';
import { makeRng } from '../../src/rng.js';
import type { GameState } from '../../src/types.js';
import { seatSnapshotToClientModel } from '../../src/protocol/clientMatchModel.js';
import { encodeKeyframePacket } from '../../src/protocol/encodeMatchPacket.js';
import { decodeKeyframePacket } from '../../src/protocol/decodeMatchPacket.js';
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

  it('projects absolute ticks that stay stable as the simulation tick advances', () => {
    const local = makePlayer('local', makeRng(51));
    const opponent = makePlayer('opponent', makeRng(52));
    local.pendingGarbage.push({ lines: 3, arrivalTick: 120 });
    local.activeEffects = [
      { id: 'magnet-1', kind: 'magnet', label: 'Magnet', expiresAtTick: 300 },
    ];
    const gameStateAt = (tick: number): GameState => ({
      players: { local, opponent },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick,
      seed: 51,
    });

    const at20 = buildSeatWireSnapshot(gameStateAt(20), 'local');
    const at21 = buildSeatWireSnapshot(gameStateAt(21), 'local');
    assert.ok(at20 && at21);

    // Wire values are absolute: identical across consecutive ticks.
    assert.deepEqual(at21.local.pendingGarbage, at20.local.pendingGarbage);
    assert.deepEqual(at21.local.activeEffects, at20.local.activeEffects);
    assert.equal(at20.local.pendingGarbage[0]?.arrivalTick, 120);

    // Decoded models stay relative to their own packet tick.
    const buffer = encodeKeyframePacket(at20, 1, 1);
    const decoded = decodeKeyframePacket(buffer);
    assert.equal(decoded.local.pendingGarbage[0]?.ticksUntilArrival, 100);
    assert.equal(decoded.local.activeEffects[0]?.expiresAtTick, 280);
  });
});
