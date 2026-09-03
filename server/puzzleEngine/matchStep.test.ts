import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchStep, canonicalMatchEvents } from '../../src/puzzle/runtime/matchStep.js';
import { makePlayer } from '../../src/puzzle/runtime/engine.js';
import { createPlayerRngChannels } from '../../src/rng.js';
import { BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';
import type { GameState, MatchEvent } from '../../src/types.js';

describe('matchStep authoritative match seam', () => {
  it('advances tick and steps both players independently', () => {
    const seed = 12345;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p2Rng = createPlayerRngChannels(seed, 1);
    const p1 = makePlayer('p1', p1Rng);
    const p2 = makePlayer('p2', p2Rng);

    const gameState: GameState = {
      players: { p1, p2 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 0,
      seed,
    };

    const rngLookup = { p1: p1Rng, p2: p2Rng };
    const result = matchStep(gameState, rngLookup);

    assert.equal(gameState.tick, 1);
    assert.equal(result.tick, 1);
    assert.equal(result.matchEnded, false);
    assert.ok(result.stepResults.p1);
    assert.ok(result.stepResults.p2);
  });

  it('keeps a live match running past the legacy 120-second duration', () => {
    const gameState: GameState = {
      players: {},
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 0,
      seed: 1,
    };

    for (let i = 0; i < 7_201; i += 1) {
      const result = matchStep(gameState, {});
      assert.equal(result.matchEnded, false);
    }

    assert.equal(gameState.tick, 7_201);
    assert.equal(gameState.status, 'playing');
  });

  it('commits attacks to opponent in pass 2 after independent simulation pass', () => {
    const seed = 54321;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p2Rng = createPlayerRngChannels(seed, 1);
    const p1 = makePlayer('p1', p1Rng);
    const p2 = makePlayer('p2', p2Rng);

    const bottom = BOARD_ROWS - 1;
    for (let x = 1; x < BOARD_COLS; x += 1) p1.board[bottom][x] = 'I';
    p1.activePiece = { type: 'I', rotation: 0, x: -1, y: bottom - 1 };
    p1.lockDelayRemainingTicks = 0;

    const gameState: GameState = {
      players: { p1, p2 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 0,
      seed,
    };

    const result = matchStep(gameState, (id) => (id === 'p1' ? p1Rng : p2Rng));

    assert.equal(result.stepResults.p1.linesClearedThisStep, 1);
    assert.equal(result.stepResults.p1.attackLinesQueued, 8);
    assert.ok(p2.pendingGarbage.length > 0);
    assert.ok(result.events.some((ev) => ev.type === 'attackSent' && ev.playerId === 'p1' && ev.lines === 8));
  });

  it('stops processing remaining players immediately on top-out', () => {
    const seed = 999;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p2Rng = createPlayerRngChannels(seed, 1);
    const p1 = makePlayer('p1', p1Rng);
    const p2 = makePlayer('p2', p2Rng);

    p1.topOut = false;
    p1.activePiece = null;
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < BOARD_COLS; x += 1) p1.board[y][x] = 'I';
    }

    const p2GravityBefore = p2.gravityCounter;

    const gameState: GameState = {
      players: { p1, p2 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 10,
      seed,
    };

    const result = matchStep(gameState, { p1: p1Rng, p2: p2Rng });

    assert.equal(gameState.status, 'ended');
    assert.equal(result.matchEnded, true);
    assert.equal(result.winnerId, 'p2');
    assert.equal(p2.gravityCounter, p2GravityBefore);
  });

  it('canonicalizes events by tick, type priority, and playerId', () => {
    const events: MatchEvent[] = [
      { tick: 5, type: 'topOut', playerId: 'p2' },
      { tick: 5, type: 'lineClear', playerId: 'p1', lines: 4, plusAttack: false },
      { tick: 5, type: 'attackSent', playerId: 'p1', lines: 4 },
      { tick: 5, type: 'lineClear', playerId: 'p0', lines: 1, plusAttack: false },
    ];

    const sorted = canonicalMatchEvents(events);
    assert.equal(sorted[0].type, 'lineClear');
    assert.equal(sorted[0].playerId, 'p0');
    assert.equal(sorted[1].type, 'lineClear');
    assert.equal(sorted[1].playerId, 'p1');
    assert.equal(sorted[2].type, 'attackSent');
    assert.equal(sorted[3].type, 'topOut');
  });

  it('can suppress outgoing garbage without suppressing the line clear result', () => {
    const seed = 2468;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p2Rng = createPlayerRngChannels(seed, 1);
    const p1 = makePlayer('p1', p1Rng);
    const p2 = makePlayer('p2', p2Rng);
    const bottom = BOARD_ROWS - 1;
    for (let x = 1; x < BOARD_COLS; x += 1) p1.board[bottom][x] = 'I';
    p1.activePiece = { type: 'I', rotation: 0, x: -1, y: bottom - 1 };
    p1.lockDelayRemainingTicks = 0;

    const gameState: GameState = {
      players: { p1, p2 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 0,
      seed,
    };

    const result = matchStep(gameState, { p1: p1Rng, p2: p2Rng }, { enableGarbage: false });

    assert.equal(result.stepResults.p1.linesClearedThisStep, 1);
    assert.equal(p2.pendingGarbage.length, 0);
    assert.equal(result.events.some((event) => event.type === 'attackSent'), false);
  });

  it('enqueues garbage with 48 ticks arrival delay for single-clear and 18 ticks for multi-clear', () => {
    const seed = 54321;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p2Rng = createPlayerRngChannels(seed, 1);
    const p1 = makePlayer('p1', p1Rng);
    const p2 = makePlayer('p2', p2Rng);

    // Setup 1 line clear on p1
    const bottom = BOARD_ROWS - 1;
    for (let x = 1; x < BOARD_COLS; x += 1) p1.board[bottom][x] = 'I';
    p1.activePiece = { type: 'I', rotation: 0, x: -1, y: bottom - 1 };
    p1.lockDelayRemainingTicks = 0;

    const gameState: GameState = {
      players: { p1, p2 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 10,
      seed,
    };

    matchStep(gameState, { p1: p1Rng, p2: p2Rng });
    assert.equal(p2.pendingGarbage.length, 1);
    // Single clear at start tick 10 (step tick 11): arrivalTick = 11 + 18 + 30 = 59 (48 ticks delay after step tick)
    assert.equal(p2.pendingGarbage[0].arrivalTick, 59);

    // Multi-clear on p2: clear pending garbage so p2 attack is committed to p1, setup 2 completed rows except col 0
    p2.pendingGarbage = [];
    const p2Bottom = BOARD_ROWS - 1;
    for (let x = 1; x < BOARD_COLS; x += 1) {
      p2.board[p2Bottom][x] = 'I';
      p2.board[p2Bottom - 1][x] = 'I';
    }
    // Place an 'I' piece vertically (rotation 3 has x=1 offset) at x=-1 so blocks fall at col 0
    p2.activePiece = { type: 'I', rotation: 3, x: -1, y: p2Bottom - 3 };
    p2.lockDelayRemainingTicks = 0;

    matchStep(gameState, { p1: p1Rng, p2: p2Rng });
    assert.ok(p1.pendingGarbage.length > 0);
    // Double clear (multi-clear) at step tick 12: arrivalTick = 12 + 18 = 30 (18 ticks delay after step tick)
    assert.equal(p1.pendingGarbage[0].arrivalTick, 30);
  });
});
