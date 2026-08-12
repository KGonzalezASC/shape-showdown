import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { replayMatch } from './replayDriver.js';
import { GameManager } from '../GameManager.js';
import type { Server, Socket } from 'socket.io';
import type { ReplayDataV2 } from '../../src/types.js';
import { EventEmitter } from 'node:events';
import { createPlayerRngChannels } from '../../src/rng.js';
import { makePlayer } from '../tetris/engine.js';
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
        remainingTime: 120,
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
        remainingTime: 120,
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
        remainingTime: 120,
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
        remainingTime: 120,
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
        remainingTime: 120,
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
});
