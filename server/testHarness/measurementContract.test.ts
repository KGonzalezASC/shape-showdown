import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRoleOutcomeDelta,
  type SingleRunTrace,
  type PlayerOutcomeSnapshot,
} from './measurementContract.js';

function makeMockSnapshot(
  playerId: string,
  overrides?: Partial<PlayerOutcomeSnapshot>,
): PlayerOutcomeSnapshot {
  return {
    playerId,
    score: 100,
    linesCleared: 5,
    piecesLocked: 20,
    survivalTicks: 600,
    toppedOut: false,
    spending: 0,
    netWalletChange: 100,
    availableFundsMedian: 60,
    availableFundsMax: 100,
    pressure: {
      aggregateHeight: 10,
      maxHeight: 3,
      holes: 1,
      bumpiness: 2,
      fillRatio: 0.05,
      poisonCells: 0,
    },
    cadence: {
      invalidActions: 0,
      repeatedRotations: 0,
      hardDropCadence: 25,
      planInvalidations: 0,
    },
    ...overrides,
  };
}

describe('Measurement Contract & Role-Aware Deltas', () => {
  it('computes role outcome deltas between Control and Treatment traces without conflating buyer and recipient', () => {
    const controlTrace: SingleRunTrace = {
      evidenceType: 'deterministic in-process simulation',
      policyId: 'rulesBot-v1',
      seed: 1234,
      observationMode: 'player-limited',
      costPolicy: 'reference-price',
      armType: 'control',
      enableShop: true,
      enableGarbage: true,
      durationTicks: 600,
      finalStatus: 'ended',
      winnerId: 'p1',
      players: {
        p1: makeMockSnapshot('p1', { score: 200, spending: 0 }),
        p2: makeMockSnapshot('p2', {
          score: 150,
          pressure: { aggregateHeight: 12, maxHeight: 4, holes: 2, bumpiness: 3, fillRatio: 0.06, poisonCells: 0 },
        }),
      },
      purchases: [],
      activations: [],
    };

    const treatmentTrace: SingleRunTrace = {
      ...controlTrace,
      armType: 'treatment',
      treatmentId: 'elixir-pulse',
      winnerId: 'p1',
      players: {
        p1: makeMockSnapshot('p1', { score: 145, spending: 55 }), // p1 bought Poison for 55
        p2: makeMockSnapshot('p2', {
          score: 120,
          pressure: { aggregateHeight: 16, maxHeight: 5, holes: 4, bumpiness: 5, fillRatio: 0.08, poisonCells: 4 }, // p2 (recipient) received poison & higher pressure
        }),
      },
      purchases: [
        { tick: 100, playerId: 'p1', itemId: 'frost-shift', cost: 55, accepted: true },
      ],
      activations: [
        { tick: 100, playerId: 'p1', itemId: 'frost-shift', targetId: 'p2', success: true },
      ],
    };

    const deltas = computeRoleOutcomeDelta(controlTrace, treatmentTrace, 'p1', 'p2');

    assert.equal(deltas.buyerId, 'p1');
    assert.equal(deltas.recipientId, 'p2');

    // Direct recipient delta (p2's board pressure changes)
    assert.equal(deltas.directRecipientDelta.holesDelta, 2); // 4 - 2
    assert.equal(deltas.directRecipientDelta.aggregateHeightDelta, 4); // 16 - 12
    assert.equal(deltas.directRecipientDelta.poisonCellsDelta, 4); // 4 - 0

    // Buyer outcome delta (p1's score change after spending 55)
    assert.equal(deltas.buyerOutcomeDelta.scoreDelta, -55); // 145 - 200
    assert.equal(deltas.economicCost, 55);

    // Opponent outcome delta (p2's score change)
    assert.equal(deltas.opponentOutcomeDelta.scoreDelta, -30); // 120 - 150

    // Match outcome delta
    assert.equal(deltas.matchOutcomeDelta.winnerChanged, false);
  });
});
