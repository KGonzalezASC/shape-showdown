import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractReplayEffectSpans, replayMatch, replayToTick } from './replayDriver.js';
import { GameManager } from '../GameManager.js';
import type { Server, Socket } from 'socket.io';
import type { ReplayDataV2 } from '../../src/types.js';
import { EventEmitter } from 'node:events';
import { createPlayerRngChannels } from '../../src/rng.js';
import { makePlayer } from '../puzzleEngine/engine.js';
import { PRICING_POLICY_VERSION } from '../../src/shop/shopPricing.js';

class FakeSocket extends EventEmitter {
  id: string;
  disconnected = false;

  constructor(id: string) {
    super();
    this.id = id;
  }

  disconnect() {
    this.disconnected = true;
    this.emit('disconnect');
  }
}

function createFakeIo() {
  return {
    emit: () => true,
    on: () => undefined,
  } as unknown as Server;
}

describe('Replay Driver & Replay Matcher', () => {
  it('replays recorded GameManager tape to identical terminal state and event log', () => {
    const gm = new GameManager(createFakeIo(), 10);
    const p1Socket = new FakeSocket('player_one');
    const p2Socket = new FakeSocket('player_two');
    gm.handleConnection(p1Socket as unknown as Socket);
    gm.handleConnection(p2Socket as unknown as Socket);

    // Advance through countdown to playing
    for (let i = 0; i < 185; i++) {
      gm.tickOnceForTests();
    }

    const tickBeforeAction = (gm as unknown as { gameState: { tick: number } }).gameState.tick;
    p1Socket.emit('action', 'rotateCW');

    for (let i = 0; i < 20; i++) {
      gm.tickOnceForTests();
    }

    const internal = gm as unknown as { activeReplay: ReplayDataV2 | null };
    assert.ok(internal.activeReplay);

    const recordedReplay = JSON.parse(JSON.stringify(internal.activeReplay)) as ReplayDataV2;
    assert.equal(recordedReplay.inputs.find((frame) => frame.kind === 'action')?.tick, tickBeforeAction + 1);
    gm.stopLoop();

    const replayResult = replayMatch(recordedReplay);

    assert.equal(replayResult.seed, recordedReplay.seed);
    assert.equal(replayResult.finalTick, 20);
    assert.deepEqual(replayResult.replayedEvents, recordedReplay.events);
    assert.deepEqual(
      replayResult.gameState.players,
      recordedReplay.keyframes.find((keyframe) => keyframe.tick === 20)?.players,
    );
  });

  it('uses recorded player slots rather than socket ids to derive RNG channels', () => {
    const seed = 99999;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p2Rng = createPlayerRngChannels(seed, 1);
    const p1 = makePlayer('socket_alpha', p1Rng);
    const p2 = makePlayer('socket_beta', p2Rng);
    p1.activePiece = null;
    p2.activePiece = null;

    const replayTape: ReplayDataV2 = {
      version: 2,
      date: 'slot-test',
      seed,
      playerSlots: {
        socket_alpha: 0,
        socket_beta: 1,
      },
      keyframeIntervalTicks: 30,
      initialState: {
        players: {
          socket_alpha: p1,
          socket_beta: p2,
        },
        status: 'playing',
        countdown: 0,
        winnerId: null,
        tick: 0,
        seed,
      },
      inputs: [],
      keyframes: [{ tick: 1, players: { socket_alpha: p1, socket_beta: p2 } }],
      events: [],
    };

    const res = replayMatch(replayTape);
    assert.equal(res.finalTick, 1);
    assert.ok(res.gameState.players.socket_alpha.activePiece !== null);
  });

  it('reports divergence in strict mode when shop acceptance differs from recorded frame', () => {
    const seed = 123;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', p1Rng);

    const replayTape: ReplayDataV2 = {
      version: 2,
      date: 'diverge-test',
      seed,
      playerSlots: { p1: 0 },
      initialState: {
        players: { p1 },
        status: 'playing',
        countdown: 0,
        winnerId: null,
        tick: 0,
        seed,
      },
      inputs: [
        { tick: 1, playerId: 'p1', kind: 'shopPurchase', itemId: 'frost-shift', accepted: true }, // Expecting true, but p1 phase is 'waiting' so actual will be false!
      ],
      keyframes: [],
      events: [],
    };

    const res = replayMatch(replayTape, { strictReplayMode: true });

    assert.ok(res.divergence);
    assert.equal(res.divergence?.diverged, true);
    assert.ok(res.divergence?.reason?.includes('acceptance mismatch'));
  });

  it('plays legacy replays with their recorded base-price override', () => {
    const seed = 456;
    const channels = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', channels);
    p1.funds = 110;
    p1.shop.offerIds = ['nova-charge'];
    p1.shop.phase = 'cycling';
    p1.shop.cycleIndex = 0;

    const replayTape: ReplayDataV2 = {
      version: 2,
      date: 'legacy-pricing-test',
      seed,
      playerSlots: { p1: 0 },
      initialState: {
        players: { p1 },
        status: 'playing',
        countdown: 0,
        winnerId: null,
        tick: 0,
        seed,
      },
      inputs: [
        {
          tick: 1,
          playerId: 'p1',
          kind: 'shopPurchase',
          itemId: 'nova-charge',
          accepted: true,
          cost: 110,
        },
      ],
      keyframes: [{ tick: 1, players: { p1 } }],
      events: [],
    };

    const result = replayMatch(replayTape, { strictReplayMode: true });
    assert.equal(result.divergence, undefined);
    assert.equal(result.gameState.players.p1.funds, 0);
    assert.equal(result.gameState.players.p1.shop.pricing['nova-charge'].level, 0);
  });

  it('replays dynamic purchases at the recorded policy price', () => {
    const seed = 789;
    const channels = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', channels);
    p1.funds = 300;
    p1.shop.offerIds = ['nova-charge'];
    p1.shop.phase = 'cycling';
    p1.shop.cycleIndex = 0;
    p1.shop.pricing['nova-charge'] = {
      level: 2,
      purchasesInWindow: 0,
      windowStartedAtTick: null,
    };

    const replayTape: ReplayDataV2 = {
      version: 2,
      date: 'dynamic-pricing-test',
      seed,
      pricingPolicyVersion: PRICING_POLICY_VERSION,
      playerSlots: { p1: 0 },
      initialState: {
        players: { p1 },
        status: 'playing',
        countdown: 0,
        winnerId: null,
        tick: 0,
        seed,
      },
      inputs: [
        {
          tick: 1,
          playerId: 'p1',
          kind: 'shopPurchase',
          itemId: 'nova-charge',
          accepted: true,
          cost: 300,
        },
      ],
      keyframes: [{ tick: 1, players: { p1 } }],
      events: [],
    };

    const result = replayMatch(replayTape, { strictReplayMode: true });
    assert.equal(result.divergence, undefined);
    assert.equal(result.gameState.players.p1.funds, 0);
    assert.equal(result.gameState.players.p1.shop.pricing['nova-charge'].level, 2);
  });

  it('rejects an unknown replay pricing policy instead of treating it as legacy', () => {
    const seed = 790;
    const channels = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', channels);
    const replayTape: ReplayDataV2 = {
      version: 2,
      date: 'unknown-pricing-test',
      seed,
      pricingPolicyVersion: 'future-policy',
      initialState: {
        players: { p1 },
        status: 'playing',
        countdown: 0,
        winnerId: null,
        tick: 0,
        seed,
      },
      inputs: [],
      keyframes: [],
      events: [],
    };

    assert.throws(() => replayMatch(replayTape), /Unsupported replay pricing policy/);
  });

  it('reconstructs exact off-grid tick from 300-tick snapshot with RNG and matches full run', () => {
    const gm = new GameManager(createFakeIo(), 300);
    const p1Socket = new FakeSocket('player_one');
    const p2Socket = new FakeSocket('player_two');
    gm.handleConnection(p1Socket as unknown as Socket);
    gm.handleConnection(p2Socket as unknown as Socket);

    // Advance through countdown (180 ticks) to playing
    for (let i = 0; i < 185; i++) {
      gm.tickOnceForTests();
    }

    // Send actions across tick 300 boundary
    for (let i = 0; i < 330; i++) {
      if (i === 10) p1Socket.emit('action', 'rotateCW');
      if (i === 295) p1Socket.emit('action', 'rotateCCW');
      if (i === 305) p1Socket.emit('action', 'rotateCW');
      gm.tickOnceForTests();
    }

    const internal = gm as unknown as { activeReplay: ReplayDataV2 | null };
    assert.ok(internal.activeReplay);
    const recordedReplay = JSON.parse(JSON.stringify(internal.activeReplay)) as ReplayDataV2;
    gm.stopLoop();

    // Keyframes exist at 0 and 300, both carrying RNG channels
    assert.equal(recordedReplay.keyframeIntervalTicks, 300);
    const k0 = recordedReplay.keyframes.find((k) => k.tick === 0);
    const k300 = recordedReplay.keyframes.find((k) => k.tick === 300);
    assert.ok(k0?.rng?.player_one);
    assert.ok(k300?.rng?.player_one);

    // Full run baseline
    const fullResult = replayMatch(recordedReplay);

    // Seek to tick 301 (resumes from tick 300 keyframe, steps 1 tick)
    const result301 = replayToTick(recordedReplay, 301);
    assert.equal(result301.tick, 301);
    assert.ok(result301.gameState.players.player_one.activePiece !== null);

    // Verify tick 301 reached from snapshot equals full run from kickoff stopped at 301
    const legacyReplay301: ReplayDataV2 = {
      ...recordedReplay,
      keyframes: [{ tick: 0, players: recordedReplay.initialState.players }],
    };
    const groundTruth301 = replayToTick(legacyReplay301, 301);
    assert.deepEqual(result301.gameState.players, groundTruth301.gameState.players);

    // Seek to final tick matches fullResult
    const finalSeek = replayToTick(recordedReplay, fullResult.finalTick);
    assert.deepEqual(finalSeek.gameState.players, fullResult.gameState.players);
  });

  it('falls back to kickoff and matches full run when snapshots lack RNG', () => {
    const gm = new GameManager(createFakeIo(), 300);
    const p1Socket = new FakeSocket('player_one');
    const p2Socket = new FakeSocket('player_two');
    gm.handleConnection(p1Socket as unknown as Socket);
    gm.handleConnection(p2Socket as unknown as Socket);

    for (let i = 0; i < 185; i++) gm.tickOnceForTests();
    for (let i = 0; i < 330; i++) {
      if (i === 15) p1Socket.emit('action', 'rotateCW');
      if (i === 305) p2Socket.emit('action', 'rotateCCW');
      gm.tickOnceForTests();
    }

    const internal = gm as unknown as { activeReplay: ReplayDataV2 | null };
    assert.ok(internal.activeReplay);
    const recordedReplay = JSON.parse(JSON.stringify(internal.activeReplay)) as ReplayDataV2;
    gm.stopLoop();

    // Strip RNG from all keyframes to emulate legacy replay
    const legacyReplay: ReplayDataV2 = {
      ...recordedReplay,
      keyframes: recordedReplay.keyframes.map((k) => ({
        tick: k.tick,
        players: k.players,
      })),
    };

    const legacySeek305 = replayToTick(legacyReplay, 305);
    const groundTruthSeek305 = replayToTick(recordedReplay, 305);

    assert.equal(legacySeek305.tick, 305);
    assert.deepEqual(legacySeek305.gameState.players, groundTruthSeek305.gameState.players);
  });

  it('produces identical state when stepping sequentially with cursor versus seeking directly', () => {
    const gm = new GameManager(createFakeIo(), 300);
    const p1Socket = new FakeSocket('player_one');
    const p2Socket = new FakeSocket('player_two');
    gm.handleConnection(p1Socket as unknown as Socket);
    gm.handleConnection(p2Socket as unknown as Socket);

    for (let i = 0; i < 185; i++) gm.tickOnceForTests();
    for (let i = 0; i < 120; i++) {
      if (i % 10 === 0) p1Socket.emit('action', 'rotateCW');
      gm.tickOnceForTests();
    }

    const internal = gm as unknown as { activeReplay: ReplayDataV2 | null };
    assert.ok(internal.activeReplay);
    const recordedReplay = JSON.parse(JSON.stringify(internal.activeReplay)) as ReplayDataV2;
    gm.stopLoop();

    // Step sequentially from 0 to 5 using fromCursor
    let cursorResult = replayToTick(recordedReplay, 0);
    for (let t = 1; t <= 5; t++) {
      cursorResult = replayToTick(recordedReplay, t, { fromCursor: cursorResult.cursor });
    }

    // Direct single seek to tick 5
    const directResult = replayToTick(recordedReplay, 5);

    assert.deepEqual(cursorResult.gameState.players, directResult.gameState.players);
  });

  it('extracts exact short active effect spans across 300-tick keyframe gaps', () => {
    const seed = 54321;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p2Rng = createPlayerRngChannels(seed, 1);
    const p1 = makePlayer('p1', p1Rng);
    const p2 = makePlayer('p2', p2Rng);
    p1.funds = 100;
    p2.funds = 500;
    p1.shop.offerIds = ['bounty-tax'];
    p1.shop.phase = 'cycling';
    p1.shop.cycleIndex = 0;
    p1.activePiece = null;
    p2.activePiece = null;

    const replayTape: ReplayDataV2 = {
      version: 2,
      date: 'effect-span-test',
      seed,
      playerSlots: { p1: 0, p2: 1 },
      keyframeIntervalTicks: 300,
      initialState: {
        players: { p1, p2 },
        status: 'playing',
        countdown: 0,
        winnerId: null,
        tick: 0,
        seed,
      },
      inputs: [
        {
          tick: 50,
          playerId: 'p1',
          kind: 'shopPurchase',
          itemId: 'bounty-tax',
          accepted: true,
        },
      ],
      // Keyframes only at tick 0 and 300
      keyframes: [
        { tick: 0, players: { p1, p2 } },
        { tick: 300, players: { p1, p2 } },
      ],
      events: [],
    };

    const spans = extractReplayEffectSpans(replayTape, 300);
    assert.ok(spans.p1);
    // Tax Evasion effect on buyer (p1) starts at purchase tick 50 and is active through tick 229 (180 ticks, pruned at tick 230)
    const taxSpan = spans.p1.find((s) => s.kind === 'tax-siphon');
    assert.ok(taxSpan);
    assert.equal(taxSpan.startTick, 50);
    assert.equal(taxSpan.endTick, 229);
  });
});
