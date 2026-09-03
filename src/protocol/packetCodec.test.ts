import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_COLS, BOARD_ROWS } from '../constants.js';
import { encodeDeltaPacket, encodeKeyframePacket } from './encodeMatchPacket.js';
import { cloneSeatSnapshot, decodeKeyframePacket, applyDeltaPacket } from './decodeMatchPacket.js';
import type { SeatWireSnapshot } from './wireTypes.js';
import { GAME_PROTOCOL_VERSION, MAX_PACKET_BYTES } from './version.js';
import { BinaryReader, BinaryWriter } from './binary.js';
import { createPlayerRngChannels } from '../rng.js';
import { makePlayer } from '../puzzle/runtime/engine.js';
import { matchStep } from '../puzzle/runtime/matchStep.js';
import { RulesBot } from '../../server/testHarness/rulesBot.js';
import { defaultObservationProjector } from '../../server/testHarness/observationProjector.js';
import { buildSeatWireSnapshot } from '../../server/sync/seatProjection.js';
import type { GameState } from '../types.js';

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
        offerIds: ['frost-shift'],
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
  it('keeps the protocol at the v4 wire layout', () => {
    assert.equal(GAME_PROTOCOL_VERSION, 4);
  });

  it('round-trips a keyframe including seat ids', () => {
    const snapshot = emptySnapshot(1337);
    const pauseStartedAt = Date.now() - 1_000;
    snapshot.chrome.pausePlayerId = 'opp';
    snapshot.chrome.pauseStartedAt = pauseStartedAt;
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
    assert.equal(decoded.chrome.pausePlayerId, 'opp');
    assert.equal(decoded.chrome.pauseStartedAt, pauseStartedAt);
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
    assert.equal(decoded.local.shop.offerIds[0], 'frost-shift');
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

  it('sends a compact piece-only delta when only pieces move', () => {
    const baseline = emptySnapshot();
    baseline.local.activePiece = { type: 'T', rotation: 0, x: 3, y: 2 };
    baseline.opponent.activePiece = { type: 'L', rotation: 1, x: 4, y: 5 };
    const changed = structuredClone(baseline) as SeatWireSnapshot;
    changed.local.activePiece!.y += 1;
    changed.opponent.activePiece!.x -= 1;
    const delta = encodeDeltaPacket(changed, baseline, 2, 1);
    assert.ok(delta);
    // 14-byte header + 2-byte mask + two ≤6-byte compact pieces.
    assert.ok(delta.byteLength <= 32, `piece delta too large: ${delta.byteLength}`);
    const applied = applyDeltaPacket(baseline, delta!);
    assert.equal(applied.local.activePiece?.y, 3);
    assert.equal(applied.opponent.activePiece?.x, 3);
  });

  it('keeps meta sections out of piece-move deltas', () => {
    const baseline = emptySnapshot();
    baseline.local.activeEffects = [
      { id: 'poison-500', kind: 'poison', label: 'Poisoned', icon: '🧪', expiresAtTick: 600 },
    ];
    const changed = structuredClone(baseline) as SeatWireSnapshot;
    changed.local.activePiece = { type: 'I', rotation: 0, x: 0, y: 1 };
    const delta = encodeDeltaPacket(changed, baseline, 2, 1);
    assert.ok(delta);
    assert.ok(delta.byteLength < 30, `delta should carry only the piece: ${delta.byteLength}`);
    const applied = applyDeltaPacket(baseline, delta!);
    assert.deepEqual(applied.local.activeEffects, baseline.local.activeEffects);
    assert.equal(applied.local.activePiece?.type, 'I');
  });

  it('round-trips wildcard pieces with offsets and rotation nonce', () => {
    const snapshot = emptySnapshot();
    snapshot.local.activePiece = {
      type: 'T',
      rotation: 2,
      x: 3,
      y: 0,
      isWildcard: true,
      customOffsets: [[0, 0], [1, 0], [2, 0], [1, 1]],
      rotationBlockedNonce: 7,
    };
    snapshot.opponent.activePiece = {
      type: 'Z',
      rotation: 0,
      x: 4,
      y: 3,
      poisoned: true,
      poisonVariant: 2,
    };
    const buffer = encodeKeyframePacket(snapshot, 1, 1);
    const decoded = decodeKeyframePacket(buffer);
    assert.deepEqual(decoded.local.activePiece, snapshot.local.activePiece);
    assert.deepEqual(decoded.opponent.activePiece, snapshot.opponent.activePiece);
  });

  it('round-trips shop state through the catalog enum', () => {
    const snapshot = emptySnapshot();
    snapshot.local.shop = {
      offerIds: ['frost-shift', 'nova-charge', 'bounty-tax', 'tectonic-shift', 'retrim'],
      phase: 'cycling',
      cycleIndex: 2,
      lastPurchasedItemId: 'elixir-pulse',
      activeSynergySeeds: ['nova-charge'],
      pricing: {
        'nova-charge': { level: 2, purchasesInWindow: 1, windowStartedAtTick: 5 },
        retrim: { level: 0, purchasesInWindow: 0, windowStartedAtTick: null, lastWindowClosedBy: 'timer' },
      },
    };
    const buffer = encodeKeyframePacket(snapshot, 1, 1);
    const decoded = decodeKeyframePacket(buffer);
    assert.deepEqual(decoded.local.shop, snapshot.local.shop);
  });

  it('round-trips interned effect labels, icons, and structured ids', () => {
    const snapshot = emptySnapshot();
    snapshot.local.activeEffects = [
      { id: 'magnet-4100', kind: 'magnet', label: 'Magnet ×2 (+5)', icon: '🧲', expiresAtTick: 500 },
      { id: 'curtain-def-4200', kind: 'curtain-def', label: 'Curtain Def +3', icon: '🛡️' },
      { id: 'custom-thing', kind: 'sticky', label: 'Some Future Label', icon: '🧪' },
      { id: 'taxed-4300', kind: 'taxed', label: 'Taxed (-12)', icon: '💸', expiresAtTick: 4420 },
    ];
    const buffer = encodeKeyframePacket(snapshot, 1, 1);
    const decoded = decodeKeyframePacket(buffer);
    assert.deepEqual(decoded.local.activeEffects, [
      { id: 'magnet-4100', kind: 'magnet', label: 'Magnet ×2 (+5)', icon: '🧲', expiresAtTick: 490 },
      { id: 'curtain-def-4200', kind: 'curtain-def', label: 'Curtain Def +3', icon: '🛡️' },
      { id: 'custom-thing', kind: 'sticky', label: 'Some Future Label', icon: '🧪' },
      { id: 'taxed-4300', kind: 'taxed', label: 'Taxed (-12)', icon: '💸', expiresAtTick: 4410 },
    ]);
  });

  it('packs dirty board nibbles two per byte on odd cell counts', () => {
    const baseline = emptySnapshot();
    const changed = structuredClone(baseline) as SeatWireSnapshot;
    changed.local.board[7][0] = 'I';
    changed.local.board[9][3] = 'T';
    changed.local.board[9][4] = 'Z';
    changed.local.board[9][5] = 'L';
    const delta = encodeDeltaPacket(changed, baseline, 2, 1);
    assert.ok(delta);
    const applied = applyDeltaPacket(baseline, delta!);
    assert.equal(applied.local.board[7]?.[0], 'I');
    assert.equal(applied.local.board[9]?.[3], 'T');
    assert.equal(applied.local.board[9]?.[4], 'Z');
    assert.equal(applied.local.board[9]?.[5], 'L');
  });

  it('round-trips LEB128 varint boundaries', () => {
    for (const value of [0, 1, 127, 128, 16383, 16384, 0xffffffff]) {
      const writer = new BinaryWriter();
      writer.writeVarint(value);
      const reader = new BinaryReader(writer.finish());
      assert.equal(reader.readVarint(), value >>> 0);
    }
    assert.throws(() => {
      const writer = new BinaryWriter();
      writer.writeVarint(-1);
    });
  });

  it('structural dirty checks match JSON.stringify section masks on live play', () => {
    // Reference dirty bits: the pre-optimization JSON path. Keep this only as a
    // correctness oracle for the allocation-free compares in encodeDeltaPacket.
    function jsonSections(snapshot: SeatWireSnapshot, baseline: SeatWireSnapshot): number {
      let sections = 0;
      if (JSON.stringify(snapshot.chrome) !== JSON.stringify(baseline.chrome)) sections |= 1 << 0;
      if (JSON.stringify(snapshot.local.board) !== JSON.stringify(baseline.local.board)) sections |= 1 << 1;
      if (JSON.stringify(snapshot.local.poisonBoard) !== JSON.stringify(baseline.local.poisonBoard)) {
        sections |= 1 << 2;
      }
      const localMetaBaseline = {
        ...baseline.local,
        board: [],
        poisonBoard: [],
        shop: null,
        activePiece: null,
      };
      const localMetaSnapshot = {
        ...snapshot.local,
        board: [],
        poisonBoard: [],
        shop: null,
        activePiece: null,
      };
      if (JSON.stringify(localMetaSnapshot) !== JSON.stringify(localMetaBaseline)) sections |= 1 << 3;
      if (JSON.stringify(snapshot.local.shop) !== JSON.stringify(baseline.local.shop)) sections |= 1 << 4;
      if (JSON.stringify(snapshot.opponent.board) !== JSON.stringify(baseline.opponent.board)) {
        sections |= 1 << 5;
      }
      if (JSON.stringify(snapshot.opponent.poisonBoard) !== JSON.stringify(baseline.opponent.poisonBoard)) {
        sections |= 1 << 7;
      }
      const oppMetaBaseline = { ...baseline.opponent, board: [], activePiece: null };
      const oppMetaSnapshot = { ...snapshot.opponent, board: [], activePiece: null };
      if (JSON.stringify(oppMetaSnapshot) !== JSON.stringify(oppMetaBaseline)) sections |= 1 << 6;
      // Piece sections use the same field semantics as encodePieceCompact.
      const pieceJson = (p: SeatWireSnapshot['local']['activePiece']) => JSON.stringify(p);
      if (pieceJson(snapshot.local.activePiece) !== pieceJson(baseline.local.activePiece)) {
        sections |= 1 << 8;
      }
      if (pieceJson(snapshot.opponent.activePiece) !== pieceJson(baseline.opponent.activePiece)) {
        sections |= 1 << 9;
      }
      return sections;
    }

    const idA = '0f14d0ab-9605-4a62-a9e4-5ed26688389b';
    const idB = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const rngChannelsByPlayer = new Map();
    const players: GameState['players'] = {};
    for (const [id, slot] of [[idA, 0], [idB, 1]] as const) {
      const channels = createPlayerRngChannels(4101, slot);
      rngChannelsByPlayer.set(id, channels);
      players[id] = makePlayer(id, channels);
    }
    const gameState: GameState = {
      players,
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 0,
      seed: 4101,
    };
    const drivers = {
      [idA]: new RulesBot({ mode: 'omniscient', topology: 'none', garbageEnabled: true }),
      [idB]: new RulesBot({ mode: 'omniscient', topology: 'none', garbageEnabled: true }),
    };

    let baseline = buildSeatWireSnapshot(gameState, idA);
    assert.ok(baseline);
    baseline = cloneSeatSnapshot(baseline);
    let compared = 0;
    for (let tick = 0; tick < 900; tick += 1) {
      for (const id of [idA, idB]) {
        const obs = defaultObservationProjector.project(gameState, id, 'omniscient');
        const cmd = drivers[id].next({ tick: gameState.tick, replayTick: gameState.tick, player: obs });
        const raw = gameState.players[id];
        if (cmd.inputState) {
          raw.inputState = {
            left: !!cmd.inputState.left,
            right: !!cmd.inputState.right,
            softDrop: !!cmd.inputState.softDrop,
          };
        }
        if (cmd.actions?.length) raw.actionQueue.push(...cmd.actions);
      }
      const res = matchStep(gameState, rngChannelsByPlayer, { enableShop: true, enableGarbage: true });
      const snapshot = buildSeatWireSnapshot(gameState, idA);
      if (snapshot) {
        const expected = jsonSections(snapshot, baseline);
        const delta = encodeDeltaPacket(snapshot, baseline, compared + 1, 1);
        const actual = delta === null ? 0 : new DataView(delta).getUint16(14, true);
        assert.equal(actual, expected, `section mismatch at tick ${gameState.tick}`);
        baseline = cloneSeatSnapshot(snapshot);
        compared += 1;
      }
      if (res.matchEnded || gameState.status !== 'playing') break;
    }
    assert.ok(compared > 100);
  });
});
