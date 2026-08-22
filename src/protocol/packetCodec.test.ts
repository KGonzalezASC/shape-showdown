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
  it('round-trips a keyframe including seat ids', () => {
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
    snapshot.local.pendingGarbage = [{ lines: 3, arrivalTick: 45 }];
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
    assert.equal(decoded.local.id, 'local');
    assert.equal(decoded.opponent.id, 'opp');
    assert.equal(decoded.local.board[5][3], 'T');
    assert.equal(decoded.local.poisonBoard[5][3], 2);
    assert.deepEqual(decoded.local.activePiece, snapshot.local.activePiece);
    assert.deepEqual(decoded.local.holdPiece, snapshot.local.holdPiece);
    // Wire expiry was absolute (42); decode relativizes against header tick 10.
    assert.equal(decoded.local.activeEffects[0]?.expiresAtTick, 32);
    assert.equal(decoded.local.pendingGarbage[0]?.lines, 3);
    assert.equal(decoded.local.pendingGarbage[0]?.ticksUntilArrival, 35);
    assert.equal(decoded.opponent.poisonBoard[5][4], 3);
    assert.deepEqual(decoded.opponent.activePiece, snapshot.opponent.activePiece);
    assert.equal(decoded.opponent.activeEffects[0]?.expiresAtTick, 80);
    assert.equal(decoded.opponent.magnetPermanentStacks, 3);
    assert.equal(decoded.opponent.magnetPieceBoost, 1);
    assert.equal(decoded.local.shop.offerIds[0], 'freeze');
    assert.equal(decoded.opponent.score, 50);
  });

  it('omits seat ids from deltas and keeps the baseline ids after merge', () => {
    const baseline = emptySnapshot();
    const changed = structuredClone(baseline) as SeatWireSnapshot;
    changed.local.score += 1;
    changed.opponent.score += 2;
    const delta = encodeDeltaPacket(changed, baseline, 2, 1);
    assert.ok(delta);

    // Delta payload must be smaller than an equivalent keyframe meta pair carrying ids.
    const applied = applyDeltaPacket(baseline, delta!);
    assert.equal(applied.local.id, 'local');
    assert.equal(applied.opponent.id, 'opp');
    assert.equal(applied.local.score, baseline.local.score + 1);
    assert.equal(applied.opponent.score, baseline.opponent.score + 2);
  });

  it('skips the delta entirely when only the simulation tick advanced', () => {
    const baseline = emptySnapshot();
    baseline.local.landingForecastAtTick = 10 + 30;
    baseline.local.pendingGarbage = [{ lines: 2, arrivalTick: 10 + 50 }];
    baseline.local.poisonSpread = { generationsRemaining: 3, nextSpreadTick: 10 + 90, variant: 1 };
    baseline.opponent.pendingGarbage = [{ lines: 4, arrivalTick: 10 + 70 }];
    baseline.opponent.tectonicShiftNextStepTick = 10 + 20;

    const advanced = structuredClone(baseline) as SeatWireSnapshot;
    advanced.tick += 1;

    const delta = encodeDeltaPacket(advanced, baseline, 4, 2);
    assert.equal(delta, null);
  });

  it('delta payload size is independent of seat id length', () => {
    const base = emptySnapshot();
    const changed = structuredClone(base) as SeatWireSnapshot;
    changed.local.score += 1;
    const shortIdDelta = encodeDeltaPacket(changed, base, 2, 1);
    assert.ok(shortIdDelta);

    const longBase = structuredClone(base) as SeatWireSnapshot;
    longBase.local.id = '0f14d0ab-9605-4a62-a9e4-5ed26688389b';
    longBase.opponent.id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const longChanged = structuredClone(longBase) as SeatWireSnapshot;
    longChanged.local.score += 1;
    const longIdDelta = encodeDeltaPacket(longChanged, longBase, 2, 1);
    assert.ok(longIdDelta);

    // If ids rode the delta wire, the 72 extra id characters would inflate this packet.
    assert.equal(shortIdDelta.byteLength, longIdDelta.byteLength);
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
