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
  createPlayerRngChannels,
} from '../../src/rng.js';
import {
  GRAVITY_TICKS_PER_CELL,
  SATELLITE_PACKET_DELAY_TICKS,
  STICKY_LOCK_RESET_CAP,
  BOARD_ROWS,
  BOARD_COLS,
  BOARD_VISIBLE_ROWS,
  BOARD_HIDDEN_ROWS,
  HOLD_SWAP_CUTOFF_VISIBLE_ROW,
  HOLD_SWAP_CUTOFF_MIN_ROW,
  COUNTDOWN_SECONDS,
  LANDING_FORECAST_TICKS,
} from '../../src/constants.js';
import { GameState, PlayerState } from '../../src/types.js';

function makeGame(players: PlayerState[]): GameState {
  const playerMap: Record<string, PlayerState> = {};
  for (const p of players) playerMap[p.id] = p;
  return {
    players: playerMap,
    status: 'playing',
    countdown: COUNTDOWN_SECONDS,
    winnerId: null,
    tick: 0,
    seed: 1,
  };
}

describe('puzzle engine', () => {
  it('uses the compact 10x18 field with a 10x20 simulation board', () => {
    const player = makePlayer('a', makeRng(41));

    assert.equal(BOARD_COLS, 10);
    assert.equal(BOARD_VISIBLE_ROWS, 18);
    assert.equal(BOARD_HIDDEN_ROWS, 2);
    assert.equal(BOARD_ROWS, 20);
    assert.equal(HOLD_SWAP_CUTOFF_VISIBLE_ROW, 10);
    assert.equal(HOLD_SWAP_CUTOFF_MIN_ROW, 5);
    assert.equal(player.swapCutoffRow, HOLD_SWAP_CUTOFF_VISIBLE_ROW);
    assert.equal(player.activePiece?.y, BOARD_HIDDEN_ROWS - 2);
  });

  it('spawns valid active piece for new player', () => {
    const rng = makeRng(42);
    const player = makePlayer('a', rng);
    assert.ok(player.activePiece);
    assert.equal(player.nextQueue.length >= 5, true);
    assert.equal(player.landingForecastTicksRemaining, LANDING_FORECAST_TICKS);
  });

  it('expires the Landing Forecast after exactly 40 simulation ticks', () => {
    const rng = makeRng(43);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    for (let tick = 1; tick <= LANDING_FORECAST_TICKS; tick += 1) {
      game.tick = tick;
      stepPlayer(game.tick, player, rng, []);
    }

    assert.equal(player.landingForecastTicksRemaining, 0);
    assert.ok(player.activePiece);
  });

  it('advances one cell per simulation tick while soft drop is held', () => {
    const rng = makeRng(43);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);
    assert.ok(player.activePiece);

    const startY = player.activePiece!.y;
    player.inputState.softDrop = true;
    stepPlayer(game.tick, player, rng, []);
    stepPlayer(game.tick, player, rng, []);

    assert.equal(player.activePiece?.y, startY + 2);
    assert.equal(player.score, 2);
  });

  it('supports hold swapping and maintains cooldown until lock', () => {
    const rng = makeRng(7);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    player.actionQueue.push('hold');
    stepPlayer(game.tick, player, rng, []);
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
    stepPlayer(game.tick, player, rng, []);

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
    stepPlayer(game.tick, player, rng, []);

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
    stepPlayer(game.tick, player, rng, []);

    assert.equal(player.holdPiece, null);
    assert.equal(player.canHold, true);
    assert.equal(player.activePiece?.type, beforeType);
    assert.equal(isHoldFrozen(player, game.tick), true);

    player.holdPiece = { type: 'T' };
    player.canHold = true;
    player.actionQueue.push('hold');
    stepPlayer(game.tick, player, rng, []);

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
    stepPlayer(game.tick, player, rng, []);

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
    stepPlayer(game.tick, player, rng, []);

    assert.equal(player.holdPiece?.type, bomberType);
    assert.equal(player.holdPiece?.bomber, true);
    // Hold-into-empty clears active until the next tick's spawn.
    assert.equal(player.activePiece, null);

    stepPlayer(game.tick, player, rng, []);
    assert.ok(player.activePiece);
    assert.equal(!!player.activePiece.bomber, false);

    player.canHold = true;
    player.activePiece.y = BOARD_HIDDEN_ROWS;
    player.actionQueue.push('hold');
    stepPlayer(game.tick, player, rng, []);

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
    player.activePiece.y = BOARD_ROWS - 5;
    assert.equal(lockResetCapFor(player), STICKY_LOCK_RESET_CAP);

    while (player.lockResetsUsed < STICKY_LOCK_RESET_CAP) {
      player.actionQueue.push('rotateCW');
      stepPlayer(game.tick, player, rng, []);
    }
    assert.equal(player.lockResetsUsed, STICKY_LOCK_RESET_CAP);

    const delayAfterCap = player.lockDelayRemainingTicks;
    player.actionQueue.push('rotateCW');
    stepPlayer(game.tick, player, rng, []);
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
    const supportRow = BOARD_ROWS - 4;
    for (let x = 0; x < 10; x++) player.board[supportRow][x] = 'G';
    const activeRow = BOARD_ROWS - 6;
    player.activePiece = { type: 'O', rotation: 0, x: 4, y: activeRow };
    player.lowestY = activeRow;
    player.lockResetsUsed = STICKY_LOCK_RESET_CAP;
    player.lockDelayRemainingTicks = 5;
    player.gravityCounter = 999;

    stepPlayer(game.tick, player, rng, []);
    assert.equal(player.lockResetsUsed, STICKY_LOCK_RESET_CAP);

    const delayAfterGravity = player.lockDelayRemainingTicks;
    player.actionQueue.push('rotateCW');
    stepPlayer(game.tick, player, rng, []);
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
    assert.equal(player.magnetPieceBoost, 2);
    assert.equal(magnetGravityLevel(player), 6);

    applyMagnetToOpponent(player);
    assert.equal(player.magnetPermanentStacks, 3);
    assert.equal(player.magnetPieceBoost, 3);
    assert.equal(magnetGravityLevel(player), 9);
    applyMagnetToOpponent(player);
    assert.equal(player.magnetPermanentStacks, 3);
    assert.equal(player.magnetPieceBoost, 4);
    assert.equal(magnetGravityLevel(player), 10);

    applyMagnetToOpponent(player);
    assert.equal(player.magnetPieceBoost, 5);
    assert.equal(magnetGravityLevel(player), 11);
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
    stepPlayer(game.tick, player, rng, []);
    assert.equal(player.activePiece?.y, yBefore);
    assert.equal(player.pieceHasHardDropped, false);

    player.pieceHasHardDropped = true;
    applySnagToOpponent(player);
    assert.equal(player.snagHardDropBlocked, true);
    assert.equal(player.snagNextPiece, true);

    player.actionQueue.push('hardDrop');
    stepPlayer(game.tick, player, rng, []);
    assert.equal(player.pieceHasHardDropped, true);
  });

  it('treats hard drop as terminal before a queued hold', () => {
    const rng = makeRng(30);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);

    player.actionQueue.push('hardDrop', 'hold');
    stepPlayer(game.tick, player, rng, []);

    assert.equal(player.holdPiece, null);
    assert.equal(player.actionQueue.length, 0);
    assert.equal(player.activePiece, null);
  });

  it('retains the hard-drop tick after the piece locks so a 30Hz client can animate it', () => {
    const rng = makeRng(31);
    const player = makePlayer('a', rng);
    const opponent = makePlayer('b', rng);
    const game = makeGame([player, opponent]);
    game.tick = 17;

    player.actionQueue.push('hardDrop');
    stepPlayer(game.tick, player, rng, []);

    assert.equal(player.lastHardDropTick, 17);

    game.tick = 18;
    stepPlayer(game.tick, player, rng, []);
    assert.equal(player.lastHardDropTick, 17);
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

    const blastRow = BOARD_ROWS - 5;
    player.board[blastRow][5] = 'G';
    player.board[blastRow][6] = 'G';
    detonateBomberBlast(player, [{ x: 5, y: blastRow }]);
    assert.equal(player.board[blastRow][5], null);
    assert.equal(player.board[blastRow][6], null);
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
    stepPlayer(game.tick, player, rng, []);
    
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
    stepPlayer(game.tick, player, rng, []);

    // Line clear has occurred! The sticky cap must be cleared (undefined).
    assert.equal(player.pieceLockResetCap, undefined);
  });

  it('provides order-independent attack queuing in two-pass match stepping', () => {
    const seed = 777;
    const p1ChannelsA = createPlayerRngChannels(seed, 0);
    const p2ChannelsA = createPlayerRngChannels(seed, 1);
    // Scenario A: P1 stepped then P2 stepped in Pass 1
    const p1A = makePlayer('p1', p1ChannelsA);
    const p2A = makePlayer('p2', p2ChannelsA);
    const bottomA = BOARD_ROWS - 1;
    for (let x = 0; x < BOARD_COLS - 1; x++) p1A.board[bottomA][x] = 'I';
    p1A.activePiece = { type: 'I', rotation: 0, x: -1, y: bottomA - 1 };
    p1A.lockDelayRemainingTicks = 0;

    const eventsA: any[] = [];
    const resP1A = stepPlayer(10, p1A, p1ChannelsA, eventsA);
    const resP2A = stepPlayer(10, p2A, p2ChannelsA, eventsA);

    const p2ChannelsB = createPlayerRngChannels(seed, 1);
    const p1ChannelsB = createPlayerRngChannels(seed, 0);
    // Scenario B: P2 stepped then P1 stepped in Pass 1
    const p2B = makePlayer('p2', p2ChannelsB);
    const p1B = makePlayer('p1', p1ChannelsB);
    const bottomB = BOARD_ROWS - 1;
    for (let x = 0; x < BOARD_COLS - 1; x++) p1B.board[bottomB][x] = 'I';
    p1B.activePiece = { type: 'I', rotation: 0, x: -1, y: bottomB - 1 };
    p1B.lockDelayRemainingTicks = 0;

    const eventsB: any[] = [];
    const resP2B = stepPlayer(10, p2B, p2ChannelsB, eventsB);
    const resP1B = stepPlayer(10, p1B, p1ChannelsB, eventsB);

    assert.equal(resP1A.attackLinesQueued, resP1B.attackLinesQueued);
    assert.equal(resP2A.attackLinesQueued, resP2B.attackLinesQueued);
    assert.equal(p1A.linesCleared, p1B.linesCleared);
    assert.equal(p2A.linesCleared, p2B.linesCleared);
    assert.deepEqual(p1A.activePiece, p1B.activePiece);
    assert.deepEqual(p1A.nextQueue, p1B.nextQueue);
    assert.deepEqual(p1A.shop.offerIds, p1B.shop.offerIds);
    assert.deepEqual(p2A.activePiece, p2B.activePiece);
    assert.deepEqual(p2A.nextQueue, p2B.nextQueue);
    assert.deepEqual(p2A.shop.offerIds, p2B.shop.offerIds);
  });

  it('skips shop rolling and shop timer tick when enableShop is false (dummy simulation)', () => {
    const rng = makeRng(101);
    const player = makePlayer('dummy', rng);
    const initialOffers = [...player.shop.offerIds];

    const bottom = BOARD_ROWS - 1;
    for (let x = 4; x < BOARD_COLS; x++) player.board[bottom][x] = 'I';
    player.activePiece = { type: 'I', rotation: 0, x: 0, y: bottom - 1 };
    player.lockDelayRemainingTicks = 0;

    const events: any[] = [];
    const res = stepPlayer(1, player, rng, events, { enableShop: false });

    assert.equal(res.linesClearedThisStep, 1);
    assert.equal(res.shopRolled, false);
    assert.deepEqual(player.shop.offerIds, initialOffers);
    assert.equal(events.some((e) => e.type === 'shopRoll'), false);
  });

  it('emits detailed shopRoll match event with offerIds when shop is enabled', () => {
    const rng = makeRng(202);
    const player = makePlayer('p1', rng);
    const bottom = BOARD_ROWS - 1;
    for (let x = 4; x < BOARD_COLS; x++) player.board[bottom][x] = 'I';
    player.activePiece = { type: 'I', rotation: 0, x: 0, y: bottom - 1 };
    player.lockDelayRemainingTicks = 0;

    const events: any[] = [];
    const res = stepPlayer(5, player, rng, events, { enableShop: true });

    assert.equal(res.shopRolled, true);
    const rollEvent = events.find((e) => e.type === 'shopRoll');
    assert.ok(rollEvent);
    assert.ok(Array.isArray(rollEvent.offerIds));
    assert.equal(rollEvent.offerIds.length, player.shop.offerIds.length);
  });

  it('reports structured tectonic progress and completion on silent line clears', () => {
    const rng = makeRng(303);
    const player = makePlayer('p1', rng);

    // Fill the bottom row completely to trigger a silent clear on tectonic settle
    const bottom = BOARD_ROWS - 1;
    for (let x = 0; x < BOARD_COLS; x++) player.board[bottom][x] = 'G';

    player.tectonicShiftNextStepTick = 10;
    player.tectonicShiftStartTick = 10;
    player.tectonicShiftStepTicks = 1;

    const events: any[] = [];
    // Tick 10: Tectonic fall phase active
    const resStart = stepPlayer(10, player, rng, events);
    assert.equal(resStart.tectonic.active, true);
    assert.equal(resStart.tectonic.completed, false);

    // Tick 30: Tectonic duration elapses (10 + 18 = 28 ticks) and silent clear settles
    const resEnd = stepPlayer(30, player, rng, events);
    assert.equal(resEnd.tectonic.active, false);
    assert.equal(resEnd.tectonic.completed, true);
    assert.equal(resEnd.tectonic.rowsCleared, 1);
    assert.equal(events.some((e) => e.type === 'tectonicComplete' && e.rowsCleared === 1), true);
    // Silent clear must NOT increment score or linesCleared
    assert.equal(player.score, 0);
  });

  it('caps Re-Trim swapCutoffRow at HOLD_SWAP_CUTOFF_MIN_ROW (5) after 5+ purchases', () => {
    const rng = makeRng(404);
    const player = makePlayer('p1', rng);

    assert.equal(player.swapCutoffRow, 10);

    // Apply 7 retrim shop effects to test capping
    for (let i = 0; i < 7; i++) {
      player.pendingShopEffects.push({
        itemId: 'retrim',
        activationTick: i + 1,
      });
      stepPlayer(i + 1, player, rng, []);
    }

    // Must be capped at row 5 (5 purchases from 10 to 5, extra purchases stay at 5)
    assert.equal(player.swapCutoffRow, 5);
  });
});
