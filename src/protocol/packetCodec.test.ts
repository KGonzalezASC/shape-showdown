import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_COLS, BOARD_ROWS } from '../constants.js';
import { encodeDeltaPacket, encodeKeyframePacket } from './encodeMatchPacket.js';
import { decodeKeyframePacket, applyDeltaPacket } from './decodeMatchPacket.js';
import type { SeatWireSnapshot } from './wireTypes.js';
import { MAX_PACKET_BYTES } from './version.js';
import { BinaryWriter } from './binary.js';

function emptySnapshot(seed = 42): SeatWireSnapshot {
  return {
    tick: 10,
    chrome: {
      status: 'playing',
      countdown: 0,
      seed,
      winnerId: null,
      pausePlayerId: null,
      pauseStartedAt: null,
    },
    local: {
      id: 'local',
      board: Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null)),
      poisonBoard: Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => 0)),
      activePiece: null,
      holdPiece: null,
      canHold: true,
      nextQueue: ['T'],
      score: 100,
      funds: 100,
      linesCleared: 2,
      combo: 0,
      backToBack: false,
      pendingGarbage: [],
      activeEffects: [],
      topOut: false,
      swapCutoffRow: 10,
      curtainDefenseLevel: 0,
      poisonSpread: null,
      shop: {
        offerIds: ['freeze'],
        phase: 'ready',
        cycleIndex: 0,
        lastPurchasedItemId: null,
        activeSynergySeeds: [],
        pricing: {},
      },
    },
    opponent: {
      id: 'opp',
      board: Array.from({ length: 18 }, () => Array.from({ length: BOARD_COLS }, () => null)),
      poisonBoard: Array.from({ length: 18 }, () => Array.from({ length: BOARD_COLS }, () => 0)),
      activePiece: null,
      score: 50,
      funds: 50,
      linesCleared: 1,
      combo: 0,
      backToBack: false,
      pendingGarbage: [],
      activeEffects: [],
      topOut: false,
      swapCutoffRow: 10,
      curtainDefenseLevel: 0,
      poisonSpread: null,
      hasHold: false,
      hasPoison: false,
    },
  };
}

describe('binary match packet codec', () => {
  it('round-trips a keyframe', () => {
    const snapshot = emptySnapshot(1337);
    snapshot.local.board[5][3] = 'T';
    snapshot.local.poisonBoard[5][3] = 2;
    snapshot.local.activePiece = {
      type: 'T',
      rotation: 1,
      x: 3,
      y: 2,
      poisoned: true,
      poisonVariant: 3,
      bomber: true,
    };
    snapshot.local.holdPiece = {
      type: 'O',
      poisoned: true,
      poisonVariant: 2,
      bomber: true,
    };
    snapshot.local.activeEffects = [
      { id: 'bomber-1', kind: 'bomber', label: 'Bomber', icon: '💣', expiresAtTick: 42 },
    ];
    snapshot.opponent.board[5][4] = 'L';
    snapshot.opponent.poisonBoard[5][4] = 3;
    snapshot.opponent.activePiece = {
      type: 'J',
      rotation: 0,
      x: 4,
      y: 3,
      bomber: true,
    };
    snapshot.opponent.activeEffects = [
      { id: 'freeze-1', kind: 'freeze', label: 'Frozen', icon: '❄️', expiresAtTick: 90 },
    ];
    snapshot.opponent.magnetPermanentStacks = 3;
    snapshot.opponent.magnetPieceBoost = 1;
    const buffer = encodeKeyframePacket(snapshot, 1, 1);
    const decoded = decodeKeyframePacket(buffer);
    assert.equal(decoded.tick, 10);
    assert.equal(decoded.chrome.seed, 1337);
    assert.equal(decoded.local.board[5][3], 'T');
    assert.equal(decoded.local.poisonBoard[5][3], 2);
    assert.deepEqual(decoded.local.activePiece, snapshot.local.activePiece);
    assert.deepEqual(decoded.local.holdPiece, snapshot.local.holdPiece);
    assert.deepEqual(decoded.local.activeEffects, snapshot.local.activeEffects);
    assert.equal(decoded.opponent.poisonBoard[5][4], 3);
    assert.deepEqual(decoded.opponent.activePiece, snapshot.opponent.activePiece);
    assert.deepEqual(decoded.opponent.activeEffects, snapshot.opponent.activeEffects);
    assert.equal(decoded.opponent.magnetPermanentStacks, 3);
    assert.equal(decoded.opponent.magnetPieceBoost, 1);
    assert.equal(decoded.local.shop.offerIds[0], 'freeze');
    assert.equal(decoded.opponent.score, 50);
  });

  it('encodes a delta with only changed board cells', () => {
    const baseline = emptySnapshot();
    const changed = structuredClone(baseline);
    changed.local.board[10][4] = 'I';
    const delta = encodeDeltaPacket(changed, baseline, 2, 1);
    assert.ok(delta);
    const applied = applyDeltaPacket(baseline, delta!);
    assert.equal(applied.local.board[10][4], 'I');
  });

  it('encodes precise opponent poison changes', () => {
    const baseline = emptySnapshot();
    const changed = structuredClone(baseline);
    changed.opponent.board[10][4] = 'I';
    changed.opponent.board[10][5] = 'I';
    changed.opponent.poisonBoard[10][4] = 2;
    const delta = encodeDeltaPacket(changed, baseline, 2, 1);
    assert.ok(delta);

    const applied = applyDeltaPacket(baseline, delta!);
    assert.equal(applied.opponent.poisonBoard[10][4], 2);
    assert.equal(applied.opponent.poisonBoard[10][5], 0);
  });

  it('returns null for empty deltas', () => {
    const snapshot = emptySnapshot();
    const delta = encodeDeltaPacket(snapshot, snapshot, 3, 1);
    assert.equal(delta, null);
  });

  it('enforces the packet size guard', () => {
    const writer = new BinaryWriter();
    for (let i = 0; i < Math.floor(MAX_PACKET_BYTES / 4); i += 1) {
      writer.writeU32(i);
    }
    assert.throws(() => writer.writeU32(0xffffffff));
  });
});
