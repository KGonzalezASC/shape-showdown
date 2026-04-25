import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer, makeRng, stepPlayer } from './engine.js';
import { GameState, PlayerState } from '../../src/types.js';
import { COUNTDOWN_SECONDS, GAME_DURATION } from '../../src/constants.js';

function makeGame(players: PlayerState[]): GameState {
  const playerMap: Record<string, PlayerState> = {};
  for (const p of players) playerMap[p.id] = p;
  return {
    players: playerMap,
    status: 'playing',
    countdown: COUNTDOWN_SECONDS,
    remainingTime: GAME_DURATION,
    winnerId: null,
    tick: 0,
    seed: 1,
  };
}

describe('tetris engine', () => {
  it('spawns valid active piece for new player', () => {
    const rng = makeRng(42);
    const player = makePlayer('a', rng);
    assert.ok(player.activePiece);
    assert.equal(player.nextQueue.length >= 5, true);
  });

  it('supports hold swapping and maintains cooldown until lock', () => {
    const rng = makeRng(7);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);
    assert.equal(player.canHold, false);
    assert.ok(player.holdPiece);
  });

  it('allows hold when piece is above swap threshold', () => {
    const rng = makeRng(11);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    assert.ok(player.activePiece);
    if (!player.activePiece) return;

    player.activePiece.y = 20;
    const beforeType = player.activePiece.type;
    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);

    assert.equal(player.holdPiece, beforeType);
    assert.equal(player.canHold, false);
  });

  it('blocks hold when piece is below swap threshold', () => {
    const rng = makeRng(13);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    assert.ok(player.activePiece);
    if (!player.activePiece) return;

    player.activePiece.y = 30;
    const beforeType = player.activePiece.type;
    const beforeQueue = [...player.nextQueue];
    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);

    assert.equal(player.holdPiece, null);
    assert.equal(player.canHold, true);
    assert.equal(player.activePiece?.type, beforeType);
    assert.deepEqual(player.nextQueue, beforeQueue);
  });
});
