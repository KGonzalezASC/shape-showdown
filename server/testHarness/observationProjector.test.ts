import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultObservationProjector,
  StandardObservationProjector,
} from './observationProjector.js';
import { applyBomberBlastSimulation, RulesBot } from './rulesBot.js';
import { Scenario } from './scenario.js';
import { ScriptedDriver } from './inputDriver.js';
import { createPlayerRngChannels } from '../../src/rng.js';
import { makePlayer } from '../../src/puzzle/runtime/engine.js';
import { BOARD_COLS, BOARD_HIDDEN_ROWS, BOARD_ROWS, CURTAIN_FROST_ROWS } from '../../src/constants.js';
import type { GameState } from '../../src/types.js';

describe('Observation Projector Seam', () => {
  it('projects omniscient observation without board or poison masking', () => {
    const seed = 12345;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', p1Rng);
    p1.board[0][0] = 'I'; // Hidden spawn row
    p1.board[BOARD_ROWS - 1][0] = 'I';
    p1.poisonBoard = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => 0),
    );
    p1.poisonBoard[BOARD_ROWS - 1][0] = 1;

    const gameState: GameState = {
      players: { p1 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 15,
      seed,
    };

    const obs = defaultObservationProjector.project(gameState, 'p1', 'omniscient');

    assert.equal(obs.tick, 15);
    assert.equal(obs.context.mode, 'omniscient');
    assert.equal(obs.context.boardVisibility, null);
    assert.equal(obs.context.poisonVisibility, null);
    assert.equal(obs.player.board[0][0], 'I');
    assert.equal(obs.player.board[BOARD_ROWS - 1][0], 'I');
    assert.equal(obs.player.poisonBoard?.[BOARD_ROWS - 1][0], 1);
    assert.ok(obs.context.revision.includes('omni'));
  });

  it('always masks hidden spawn rows (0 and 1) in player-limited mode', () => {
    const seed = 12345;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', p1Rng);
    p1.board[0][0] = 'T'; // Hidden row 0
    p1.board[1][5] = 'Z'; // Hidden row 1
    p1.poisonBoard = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => 0),
    );
    p1.poisonBoard[0][0] = 3;

    const gameState: GameState = {
      players: { p1 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 1,
      seed,
    };

    const obs = defaultObservationProjector.project(gameState, 'p1', 'player-limited');

    assert.equal(obs.player.board[0][0], null);
    assert.equal(obs.player.board[1][5], null);
    assert.equal(obs.player.poisonBoard?.[0][0], 0);
  });

  it('masks board and poisonBoard using exact internal board row indices for Curtain', () => {
    const seed = 54321;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', p1Rng);

    const cutoffRow = 10; // Visible cutoff row
    p1.swapCutoffRow = cutoffRow;
    const expectedMaskedStart = BOARD_HIDDEN_ROWS + cutoffRow + CURTAIN_FROST_ROWS; // 2 + 10 + 3 = 15

    p1.board[expectedMaskedStart - 1][0] = 'J'; // Board row 14 (inside curtain frost band -> visible)
    p1.board[expectedMaskedStart][0] = 'L'; // Board row 15 (below curtain frost band -> masked)

    p1.poisonBoard = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => 0),
    );
    p1.poisonBoard[expectedMaskedStart - 1][0] = 2;
    p1.poisonBoard[expectedMaskedStart][0] = 3;

    p1.activeEffects = [{ id: 'curtain-1', kind: 'curtain', label: 'Curtain' }];

    const gameState: GameState = {
      players: { p1 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 50,
      seed,
    };

    const projector = new StandardObservationProjector();
    const obs = projector.project(gameState, 'p1', 'player-limited');

    assert.equal(obs.context.mode, 'player-limited');
    assert.equal(obs.context.boardVisibility?.cutoffRow, cutoffRow);
    assert.equal(obs.context.boardVisibility?.frostRows, CURTAIN_FROST_ROWS);
    assert.equal(obs.context.boardVisibility?.maskedRowsStart, expectedMaskedStart);

    // Board cell inside frost band (row 14) is visible
    assert.equal(obs.player.board[expectedMaskedStart - 1][0], 'J');
    assert.equal(obs.player.poisonBoard?.[expectedMaskedStart - 1][0], 2);

    // Board cell and poison cell below frost band (row 15) are masked together
    assert.equal(obs.player.board[expectedMaskedStart][0], null);
    assert.equal(obs.player.poisonBoard?.[expectedMaskedStart][0], 0);
  });

  it('keeps revision STABLE across ordinary ticks when visibility/effects are unchanged', () => {
    const seed = 999;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', p1Rng);

    const gameState1: GameState = {
      players: { p1 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 1,
      seed,
    };

    const gameState2: GameState = {
      ...gameState1,
      tick: 50,
    };

    const obs1 = defaultObservationProjector.project(gameState1, 'p1', 'player-limited');
    const obs2 = defaultObservationProjector.project(gameState2, 'p1', 'player-limited');

    assert.equal(obs1.context.revision, obs2.context.revision);
  });

  it('changes revision across warning -> active -> clear effect states', () => {
    const seed = 999;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', p1Rng);

    const gameState: GameState = {
      players: { p1 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 100,
      seed,
    };

    const projector = new StandardObservationProjector();

    // 1. Clear state
    const obsClear = projector.project(gameState, 'p1', 'player-limited');

    // 2. Warning state
    p1.activeEffects = [{ id: 'cw-1', kind: 'curtain-warn', label: 'Curtain Warning' }];
    const obsWarn = projector.project(gameState, 'p1', 'player-limited');

    // 3. Active curtain state
    p1.activeEffects = [{ id: 'c-1', kind: 'curtain', label: 'Curtain' }];
    const obsActive = projector.project(gameState, 'p1', 'player-limited');

    assert.notEqual(obsClear.context.revision, obsWarn.context.revision);
    assert.notEqual(obsWarn.context.revision, obsActive.context.revision);
  });

  it('simulates Bomber blast as union around all locked cells of a piece shape', () => {
    const board = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => 'I' as const),
    );

    // Place an I piece horizontally at y=10 across columns 2..5
    const placedCells: Array<[number, number]> = [
      [2, 10],
      [3, 10],
      [4, 10],
      [5, 10],
    ];

    const simBoard = applyBomberBlastSimulation(board, placedCells, 2);

    // Cells around cell [2, 10] (e.g. [0, 10]) and around [5, 10] (e.g. [7, 10]) are all blasted
    assert.equal(simBoard[10][0], null); // (2-0)^2 + 0 <= 4 -> blasted
    assert.equal(simBoard[10][7], null); // (7-5)^2 + 0 <= 4 -> blasted
    // Farther cell e.g. [10, 10] is not blasted
    assert.equal(simBoard[10][9], 'I');
  });

  it('runs custom driver with player-limited observation mode in Scenario', () => {
    const customDriver = new ScriptedDriver({}, 'player-limited');
    const scenario = new Scenario({
      seed: 777,
      drivers: { p1: customDriver },
    });

    const report = scenario.advance(1);
    assert.equal(report.finalTick, 1);
    assert.equal(customDriver.observationMode, 'player-limited');
  });

  it('normalizes absolute timestamps to relative ticks in player-limited mode while preserving omniscient absolute ticks', () => {
    const seed = 12345;
    const p1Rng = createPlayerRngChannels(seed, 0);
    const p1 = makePlayer('p1', p1Rng);
    p1.pendingGarbage = [{ lines: 3, arrivalTick: 120 }];
    p1.holdFrozenUntilTick = 150;
    p1.satelliteDelayUntilTick = 140;
    p1.tectonicShiftNextStepTick = 110;
    p1.lastHardDropTick = 90;
    p1.poisonSpread = { generationsRemaining: 3, nextSpreadTick: 160, variant: 1 };
    p1.activeEffects = [{ id: 'curtain-1450', kind: 'curtain', label: 'Curtain', expiresAtTick: 340 }];

    const gameState: GameState = {
      players: { p1 },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 100,
      seed,
    };

    // Omniscient mode: exposes raw server tick and absolute timestamps
    const omniObs = defaultObservationProjector.project(gameState, 'p1', 'omniscient');
    assert.equal(omniObs.tick, 100);
    assert.equal(omniObs.player.pendingGarbage[0].arrivalTick, 120);
    assert.equal(omniObs.player.activeEffects?.[0].expiresAtTick, 340);
    assert.equal(omniObs.player.activeEffects?.[0].id, 'curtain-1450');
    assert.equal(omniObs.player.poisonSpread?.nextSpreadTick, 160);
    assert.ok(omniObs.context.revision.includes('340'));

    // Player-limited mode: tick is 0, arrivalTick is undefined, ticksUntilArrival is relative (20), activeEffects expiresAtTick is relative (240)
    const limitedObs = defaultObservationProjector.project(gameState, 'p1', 'player-limited');
    assert.equal(limitedObs.tick, 0);
    assert.equal(limitedObs.player.pendingGarbage[0].arrivalTick, undefined);
    assert.equal(limitedObs.player.pendingGarbage[0].ticksUntilArrival, 20); // 120 - 100
    assert.equal(limitedObs.player.holdFrozenUntilTick, 50); // 150 - 100
    assert.equal(limitedObs.player.satelliteDelayUntilTick, 40); // 140 - 100
    assert.equal(limitedObs.player.tectonicShiftNextStepTick, 10); // 110 - 100
    assert.equal(limitedObs.player.lastHardDropTick, 10); // 100 - 90
    assert.equal(limitedObs.player.activeEffects?.[0].expiresAtTick, 240); // 340 - 100
    assert.equal(limitedObs.player.poisonSpread?.nextSpreadTick, 60); // 160 - 100
    assert.ok(!limitedObs.player.activeEffects?.[0].id.includes('1450')); // ID is sanitized
    assert.equal(limitedObs.context.effects[0].expiresAtTick, 240);
    assert.ok(!limitedObs.context.revision.includes('340')); // Revision does NOT leak absolute tick

    // Revision stability check across ticks while effect remains active
    const gameStateTick101: GameState = { ...gameState, tick: 101 };
    const limitedObs101 = defaultObservationProjector.project(gameStateTick101, 'p1', 'player-limited');
    assert.equal(limitedObs.context.revision, limitedObs101.context.revision);

    // Revision invalidation check on same-kind effect replacement
    const p1NewCurtain = makePlayer('p1', p1Rng);
    p1NewCurtain.activeEffects = [{ id: 'curtain-1690', kind: 'curtain', label: 'Curtain', expiresAtTick: 400 }];
    const gameStateNewCurtain: GameState = { ...gameState, players: { p1: p1NewCurtain } };
    const limitedObsNewCurtain = defaultObservationProjector.project(gameStateNewCurtain, 'p1', 'player-limited');
    assert.notEqual(limitedObs.context.revision, limitedObsNewCurtain.context.revision);
  });
});
