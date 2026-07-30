import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  gravityTicksPerCellFor,
  magnetGravityLevel,
  isHoldFrozen,
  lockResetCapFor,
  makePlayer,
  makeRng,
  applyMagnetToOpponent,
  applySnagToOpponent,
  applyStickyToActivePiece,
  armSatelliteToBuyer,
  tryActivateSatellite,
  applyBomberToBuyer,
  detonateBomberBlast,
  stepPlayer,
} from './engine.js';
import {
  GRAVITY_TICKS_PER_CELL,
  SATELLITE_PACKET_DELAY_TICKS,
  STICKY_LOCK_RESET_CAP,
  BOARD_ROWS,
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  COUNTDOWN_SECONDS,
  GAME_DURATION,
} from '../../src/constants.js';
import { GameState, PlayerState } from '../../src/types.js';

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

    player.activePiece.y = BOARD_HIDDEN_ROWS;
    const beforeType = player.activePiece.type;
    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);

    assert.equal(player.holdPiece?.type, beforeType);
    assert.equal(player.canHold, false);
  });

  it('blocks hold when piece is below swap threshold', () => {
    const rng = makeRng(13);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    assert.ok(player.activePiece);
    if (!player.activePiece) return;

    player.activePiece.y = BOARD_HIDDEN_ROWS + player.swapCutoffRow;
    const beforeType = player.activePiece.type;
    const beforeQueue = [...player.nextQueue];
    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);

    assert.equal(player.holdPiece, null);
    assert.equal(player.canHold, true);
    assert.equal(player.activePiece?.type, beforeType);
    assert.deepEqual(player.nextQueue, beforeQueue);
  });

  it('blocks hold store and swap while storage is frozen', () => {
    const rng = makeRng(17);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    assert.ok(player.activePiece);
    player.holdFrozenUntilTick = 9999;
    player.activePiece.y = BOARD_HIDDEN_ROWS;
    const beforeType = player.activePiece.type;

    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);

    assert.equal(player.holdPiece, null);
    assert.equal(player.canHold, true);
    assert.equal(player.activePiece?.type, beforeType);
    assert.equal(isHoldFrozen(player, game.tick), true);

    player.holdPiece = { type: 'T' };
    player.canHold = true;
    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);

    assert.equal(player.holdPiece?.type, 'T');
    assert.equal(player.activePiece?.type, beforeType);
  });

  it('blocks hold while the active piece is poisoned', () => {
    const rng = makeRng(31);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    assert.ok(player.activePiece);
    player.activePiece.y = BOARD_HIDDEN_ROWS;
    player.activePiece.poisoned = true;
    player.activePiece.poisonVariant = 2;
    const beforeType = player.activePiece.type;

    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);

    assert.equal(player.holdPiece, null);
    assert.equal(player.canHold, true);
    assert.equal(player.activePiece?.type, beforeType);
    assert.equal(player.activePiece?.poisoned, true);
  });

  it('preserves bomber through hold store and swap', () => {
    const rng = makeRng(33);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    assert.ok(player.activePiece);
    player.activePiece.y = BOARD_HIDDEN_ROWS;
    player.activePiece.bomber = true;
    const bomberType = player.activePiece.type;

    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);

    assert.equal(player.holdPiece?.type, bomberType);
    assert.equal(player.holdPiece?.bomber, true);
    // Hold-into-empty clears active until the next tick's spawn.
    assert.equal(player.activePiece, null);

    stepPlayer(game, player, opponent, rng, []);
    assert.ok(player.activePiece);
    assert.equal(!!player.activePiece.bomber, false);

    player.canHold = true;
    player.activePiece.y = BOARD_HIDDEN_ROWS;
    player.actionQueue.push('hold');
    stepPlayer(game, player, opponent, rng, []);

    assert.equal(player.activePiece?.type, bomberType);
    assert.equal(!!player.activePiece?.bomber, true);
  });

  it('limits lock resets to sticky cap for the current piece only', () => {
    const rng = makeRng(19);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    assert.ok(player.activePiece);
    player.pieceLockResetCap = STICKY_LOCK_RESET_CAP;
    player.activePiece.y = 25;
    assert.equal(lockResetCapFor(player), STICKY_LOCK_RESET_CAP);

    while (player.lockResetsUsed < STICKY_LOCK_RESET_CAP) {
      player.actionQueue.push('rotateCW');
      stepPlayer(game, player, opponent, rng, []);
    }
    assert.equal(player.lockResetsUsed, STICKY_LOCK_RESET_CAP);

    const delayAfterCap = player.lockDelayRemainingTicks;
    player.actionQueue.push('rotateCW');
    stepPlayer(game, player, opponent, rng, []);
    assert.equal(player.lockResetsUsed, STICKY_LOCK_RESET_CAP);
    assert.equal(player.lockDelayRemainingTicks, delayAfterCap);
  });

  it('applySticky grants a fresh lock-reset budget even if the piece already used resets', () => {
    const rng = makeRng(20);
    const player = makePlayer('a', rng);
    player.lockResetsUsed = 9;
    applyStickyToActivePiece(player);
    assert.equal(player.pieceLockResetCap, STICKY_LOCK_RESET_CAP);
    assert.equal(player.lockResetsUsed, 0);
  });

  it('gravity reaching a new row does not refill sticky lock resets', () => {
    const rng = makeRng(21);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    assert.ok(player.activePiece);
    applyStickyToActivePiece(player);
    for (let x = 0; x < 10; x++) player.board[26][x] = 'G';
    player.activePiece = { type: 'O', rotation: 0, x: 4, y: 24 };
    player.lowestY = 24;
    player.lockResetsUsed = STICKY_LOCK_RESET_CAP;
    player.lockDelayRemainingTicks = 5;
    player.gravityCounter = 999;

    stepPlayer(game, player, opponent, rng, []);
    assert.equal(player.lockResetsUsed, STICKY_LOCK_RESET_CAP);

    const delayAfterGravity = player.lockDelayRemainingTicks;
    player.actionQueue.push('rotateCW');
    stepPlayer(game, player, opponent, rng, []);
    assert.equal(player.lockResetsUsed, STICKY_LOCK_RESET_CAP);
    assert.ok(
      player.lockDelayRemainingTicks <= delayAfterGravity,
      'rotate after sticky cap must not refresh lock delay',
    );
  });

  it('magnet adds permanent gravity stacks then piece boost after cap', () => {
    const rng = makeRng(23);
    const player = makePlayer('a', rng);
    assert.equal(gravityTicksPerCellFor(player), GRAVITY_TICKS_PER_CELL);

    applyMagnetToOpponent(player);
    applyMagnetToOpponent(player);
    assert.equal(player.magnetPermanentStacks, 2);
    assert.equal(magnetGravityLevel(player), 4);
    assert.equal(player.magnetPieceBoost, 0);

    applyMagnetToOpponent(player);
    assert.equal(player.magnetPermanentStacks, 3);
    assert.equal(magnetGravityLevel(player), 6);
    applyMagnetToOpponent(player);
    assert.equal(player.magnetPermanentStacks, 3);
    assert.equal(player.magnetPieceBoost, 1);
    assert.equal(magnetGravityLevel(player), 7);

    applyMagnetToOpponent(player);
    assert.equal(player.magnetPieceBoost, 2);
    assert.equal(magnetGravityLevel(player), 8);
    assert.equal(gravityTicksPerCellFor(player), 12); // floor at max combined level
  });

  it('snag blocks hard drop until lock and defers to next piece if already dropped', () => {
    const rng = makeRng(29);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    assert.ok(player.activePiece);
    applySnagToOpponent(player);
    assert.equal(player.snagHardDropBlocked, true);

    const yBefore = player.activePiece!.y;
    player.actionQueue.push('hardDrop');
    stepPlayer(game, player, opponent, rng, []);
    assert.equal(player.activePiece?.y, yBefore);
    assert.equal(player.pieceHasHardDropped, false);

    player.pieceHasHardDropped = true;
    applySnagToOpponent(player);
    assert.equal(player.snagHardDropBlocked, true);
    assert.equal(player.snagNextPiece, true);

    player.actionQueue.push('hardDrop');
    stepPlayer(game, player, opponent, rng, []);
    assert.equal(player.pieceHasHardDropped, true);
  });

  it('satellite arms and lingers until incoming garbage is queued', () => {
    const rng = makeRng(30);
    const player = makePlayer('a', rng);
    armSatelliteToBuyer(player, 100);
    assert.equal(player.satelliteArmed, true);
    assert.equal(player.satelliteDelayUntilTick, undefined);

    player.pendingGarbage.push({ lines: 2, arrivalTick: 200 });
    assert.equal(tryActivateSatellite(player, 150), true);
    assert.equal(player.satelliteArmed, false);
    assert.equal(player.pendingGarbage[0].arrivalTick, 200 + SATELLITE_PACKET_DELAY_TICKS);
    assert.ok((player.satelliteDelayUntilTick ?? 0) > 150);
  });

  it('satellite activates immediately when garbage is already queued', () => {
    const rng = makeRng(31);
    const player = makePlayer('a', rng);
    player.pendingGarbage.push({ lines: 2, arrivalTick: 200 });
    armSatelliteToBuyer(player, 100);
    assert.equal(player.satelliteArmed, false);
    assert.equal(player.pendingGarbage[0].arrivalTick, 200 + SATELLITE_PACKET_DELAY_TICKS);
    assert.ok((player.satelliteDelayUntilTick ?? 0) > 100);
  });

  it('bomber arms next piece and detonates in a circle without scoring', () => {
    const rng = makeRng(37);
    const player = makePlayer('a', rng);
    const scoreBefore = player.score;

    applyBomberToBuyer(player);
    assert.equal(player.activePiece?.bomber, true);

    player.board[25][5] = 'G';
    player.board[25][6] = 'G';
    detonateBomberBlast(player, [{ x: 5, y: 25 }]);
    assert.equal(player.board[25][5], null);
    assert.equal(player.board[25][6], null);
    assert.equal(player.score, scoreBefore);
  });

  it('sticky cap persists across pieces until a line clear occurs', () => {
    const rng = makeRng(50);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    // 1. Apply sticky and verify it is set.
    applyStickyToActivePiece(player);
    assert.equal(player.pieceLockResetCap, STICKY_LOCK_RESET_CAP);

    // 2. Lock the first piece without clearing a line.
    assert.ok(player.activePiece);
    const firstType = player.activePiece.type;
    
    // Position it at the floor so it is grounded and locks.
    player.activePiece.y = BOARD_ROWS - 2;
    player.lockDelayRemainingTicks = 0;
    stepPlayer(game, player, opponent, rng, []);
    
    // The first piece should have locked, and a new one spawned.
    assert.notEqual(player.activePiece?.type, firstType);
    // The sticky cap MUST persist because no lines were cleared!
    assert.equal(player.pieceLockResetCap, STICKY_LOCK_RESET_CAP);

    // 3. Lock the second piece WITH a line clear.
    const bottom = BOARD_ROWS - 1;
    for (let x = 1; x < BOARD_COLS; x++) {
      player.board[bottom][x] = 'I';
    }
    player.activePiece = {
      type: 'I',
      rotation: 0,
      x: -1,
      y: bottom - 1,
    };
    player.lockDelayRemainingTicks = 0;
    stepPlayer(game, player, opponent, rng, []);

    // Line clear has occurred! The sticky cap must be cleared (undefined).
    assert.equal(player.pieceLockResetCap, undefined);
  });
});
