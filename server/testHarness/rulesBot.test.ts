import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoard, RulesBot } from './rulesBot.js';
import { Scenario } from './scenario.js';
import { createEmptyBoard, detectTSpinFor, previewAttackFromClear } from '../tetris/engine.js';
import { BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';
import type { DriverObservation } from './inputDriver.js';
import { defaultObservationProjector } from './observationProjector.js';

describe('RulesBot Adapter & Attack Preview', () => {
  describe('previewAttackFromClear Engine Rules', () => {
    it('calculates standard line clear attack lines accurately', () => {
      assert.equal(previewAttackFromClear({ lines: 0 }), 0);
      assert.equal(previewAttackFromClear({ lines: 1 }), 1);
      assert.equal(previewAttackFromClear({ lines: 2 }), 1);
      assert.equal(previewAttackFromClear({ lines: 3 }), 2);
      assert.equal(previewAttackFromClear({ lines: 4 }), 4);
    });

    it('applies T-Spin bonuses for full and mini T-spins', () => {
      assert.equal(previewAttackFromClear({ lines: 1, tSpin: 'full' }), 2);
      assert.equal(previewAttackFromClear({ lines: 2, tSpin: 'full' }), 4);
      assert.equal(previewAttackFromClear({ lines: 3, tSpin: 'full' }), 6);
      assert.equal(previewAttackFromClear({ lines: 1, tSpin: 'mini' }), 1);
      assert.equal(previewAttackFromClear({ lines: 2, tSpin: 'mini' }), 2);
    });

    it('applies Back-to-Back bonus (+1) on consecutive Tetris or T-spins', () => {
      assert.equal(previewAttackFromClear({ lines: 4, backToBack: true }), 5);
      assert.equal(previewAttackFromClear({ lines: 2, tSpin: 'full', backToBack: true }), 5);
      // Non-B2B clear does not receive B2B bonus even if backToBack was active
      assert.equal(previewAttackFromClear({ lines: 1, backToBack: true }), 1);
    });

    it('applies combo and perfect clear bonuses', () => {
      // Combo 0 (first consecutive clear): +0 bonus -> total 1
      assert.equal(previewAttackFromClear({ lines: 1, combo: 0 }), 1);
      // Combo 1 (second consecutive clear): +1 bonus -> total 2
      assert.equal(previewAttackFromClear({ lines: 1, combo: 1 }), 2);
      // Perfect clear: +7 bonus (4 + 7 = 11)
      assert.equal(previewAttackFromClear({ lines: 4, perfectClear: true }), 11);
    });
  });

  it('evaluates board stack metrics accurately', () => {
    const board = createEmptyBoard();
    for (let x = 1; x < BOARD_COLS; x++) {
      board[BOARD_ROWS - 1][x] = 'I';
    }
    board[BOARD_ROWS - 2][0] = 'J';

    const metrics = evaluateBoard(board);
    assert.equal(metrics.holes, 1);
    assert.ok(metrics.aggregateHeight > 0);
    assert.ok(metrics.bumpiness > 0);
  });

  it('projects player-limited observation by masking Curtain rows', () => {
    const scenario = new Scenario({ seed: 1234 });
    const p1 = scenario.getPlayerState('p1');
    p1.board[BOARD_ROWS - 1][0] = 'I';
    p1.activeEffects = [{ id: 'curtain-1', kind: 'curtain', label: 'Curtain' }];

    const state = scenario.getReport().gameState;

    const omniObs = defaultObservationProjector.project(state, 'p1', 'omniscient');
    const limitedObs = defaultObservationProjector.project(state, 'p1', 'player-limited');

    assert.equal(omniObs.player.board[BOARD_ROWS - 1][0], 'I');
    assert.equal(limitedObs.player.board[BOARD_ROWS - 1][0], null);
  });

  it('emits deterministic movement and action commands without mutating state directly', () => {
    const bot = new RulesBot();
    const scenario = new Scenario({ seed: 555 });
    const p1 = scenario.getPlayerState('p1');
    const boardBefore = JSON.stringify(p1.board);

    const obs: DriverObservation = {
      tick: 1,
      player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient'),
    };

    const cmd = bot.next(obs);
    assert.ok(cmd.inputState !== undefined || (cmd.actions && cmd.actions.length > 0));
    assert.equal(JSON.stringify(p1.board), boardBefore);
  });

  it('differentiates plan selection and scores between projected imminent (arrivalTick=10) and delayed (arrivalTick=65) garbage', () => {
    const botImminent = new RulesBot({ mode: 'player-limited' });
    const botDelayed = new RulesBot({ mode: 'player-limited' });

    const scenarioImminent = new Scenario({ seed: 777 });
    const scenarioDelayed = new Scenario({ seed: 777 });

    const pImminent = scenarioImminent.getPlayerState('p1');
    const pDelayed = scenarioDelayed.getPlayerState('p1');

    // Fill bottom 3 rows except column 0
    for (let y = BOARD_ROWS - 3; y < BOARD_ROWS; y++) {
      for (let x = 1; x < BOARD_COLS; x++) {
        pImminent.board[y][x] = 'I';
        pDelayed.board[y][x] = 'I';
      }
    }
    // High stack height condition to trigger imminent defense vs delayed building
    pImminent.board[BOARD_ROWS - 10][5] = 'Z';
    pDelayed.board[BOARD_ROWS - 10][5] = 'Z';

    const currentTick = 5;
    (scenarioImminent as unknown as { gameState: { tick: number } }).gameState.tick = currentTick;
    (scenarioDelayed as unknown as { gameState: { tick: number } }).gameState.tick = currentTick;

    // Use absolute arrivalTick on raw player state so projector derives relative ticks
    pImminent.pendingGarbage = [{ lines: 4, arrivalTick: currentTick + 5 }]; // ticksUntilArrival = 5 (imminent)
    pDelayed.pendingGarbage = [{ lines: 4, arrivalTick: currentTick + 65 }]; // ticksUntilArrival = 65 (delayed)

    const obsImminent: DriverObservation = {
      tick: 0,
      player: defaultObservationProjector.project(scenarioImminent.getReport().gameState, 'p1', 'player-limited'),
    };
    const obsDelayed: DriverObservation = {
      tick: 0,
      player: defaultObservationProjector.project(scenarioDelayed.getReport().gameState, 'p1', 'player-limited'),
    };

    // Verify projector correctly derived relative ticksUntilArrival and stripped arrivalTick
    assert.equal(obsImminent.player.player.pendingGarbage[0].ticksUntilArrival, 5);
    assert.equal(obsImminent.player.player.pendingGarbage[0].arrivalTick, undefined);
    assert.equal(obsDelayed.player.player.pendingGarbage[0].ticksUntilArrival, 65);
    assert.equal(obsDelayed.player.player.pendingGarbage[0].arrivalTick, undefined);

    const planImminent = (botImminent as unknown as {
      findBestPlacement: (p: typeof obsImminent.player.player, type: string, b: boolean, t?: number) => { rotation: number; x: number; score: number };
    }).findBestPlacement(obsImminent.player.player, 'I', false);

    const planDelayed = (botDelayed as unknown as {
      findBestPlacement: (p: typeof obsDelayed.player.player, type: string, b: boolean, t?: number) => { rotation: number; x: number; score: number };
    }).findBestPlacement(obsDelayed.player.player, 'I', false);

    assert.ok(planImminent);
    assert.ok(planDelayed);
    // Imminent garbage defense vs delayed building produce distinct plan scores & placement decisions
    assert.notEqual(planImminent.score, planDelayed.score);
  });

  it('cancels mixed packets FIFO and classifies imminent lines correctly', () => {
    const bot = new RulesBot({ mode: 'player-limited' });
    const packets = [
      { lines: 2, ticksUntilArrival: 5 },
      { lines: 4, ticksUntilArrival: 40 },
    ];

    const sim = (bot as unknown as {
      simulateGarbageCancellation: (
        p: typeof packets,
        attack: number,
        currentTick?: number,
      ) => { cancelledTotal: number; cancelledImminent: number };
    }).simulateGarbageCancellation(packets, 2);

    assert.equal(sim.cancelledTotal, 2);
    assert.equal(sim.cancelledImminent, 2);

    const sim4 = (bot as unknown as {
      simulateGarbageCancellation: (
        p: typeof packets,
        attack: number,
        currentTick?: number,
      ) => { cancelledTotal: number; cancelledImminent: number };
    }).simulateGarbageCancellation(packets, 4);

    assert.equal(sim4.cancelledTotal, 4);
    assert.equal(sim4.cancelledImminent, 2);
  });

  it('incorporates Combo and Back-to-Back attack amounts into placement scoring', () => {
    const scenarioCombo = new Scenario({ seed: 101 });
    const scenarioBase = new Scenario({ seed: 101 });

    const pCombo = scenarioCombo.getPlayerState('p1');
    const pBase = scenarioBase.getPlayerState('p1');

    // Fill row BOARD_ROWS - 1 except col 0 for a 1-line clear
    for (let x = 1; x < BOARD_COLS; x++) {
      pCombo.board[BOARD_ROWS - 1][x] = 'I';
      pBase.board[BOARD_ROWS - 1][x] = 'I';
    }

    pCombo.combo = 4; // High combo multiplier (+2 bonus attack lines)
    pBase.combo = -1; // No combo

    const botCombo = new RulesBot({ mode: 'player-limited' });
    const botBase = new RulesBot({ mode: 'player-limited' });

    const obsCombo = defaultObservationProjector.project(scenarioCombo.getReport().gameState, 'p1', 'player-limited');
    const obsBase = defaultObservationProjector.project(scenarioBase.getReport().gameState, 'p1', 'player-limited');

    const planCombo = (botCombo as unknown as {
      findBestPlacement: (p: typeof obsCombo.player, type: string, b: boolean) => { rotation: number; x: number; score: number };
    }).findBestPlacement(obsCombo.player, 'I', false);

    const planBase = (botBase as unknown as {
      findBestPlacement: (p: typeof obsBase.player, type: string, b: boolean) => { rotation: number; x: number; score: number };
    }).findBestPlacement(obsBase.player, 'I', false);

    assert.ok(planCombo);
    assert.ok(planBase);
    // Active combo grants higher attack output and placement score
    assert.ok(planCombo.score > planBase.score);
  });

  it('evaluates T-spin preview on simulated post-placement board and distinguishes rotated vs unrotated drops', () => {
    const scenario = new Scenario({ seed: 303 });
    const p = scenario.getPlayerState('p1');

    // Create a canonical T-slot at (x=1, y=BOARD_ROWS-2) with 3 corners occupied:
    // cx=2, cy=BOARD_ROWS-2
    // Corners: top-left (1, BOARD_ROWS-3), top-right (3, BOARD_ROWS-3), bottom-left (1, BOARD_ROWS-1), bottom-right (3, BOARD_ROWS-1)
    p.board[BOARD_ROWS - 1][1] = 'I'; // bottom-left corner
    p.board[BOARD_ROWS - 1][3] = 'I'; // bottom-right corner
    p.board[BOARD_ROWS - 3][1] = 'I'; // top-left corner

    // Active piece starts at rotation 0
    p.activePiece = { type: 'T', rotation: 0, x: 1, y: BOARD_ROWS - 3 };

    const obs = defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient');

    const simBoardUnrotated = p.board.map((r) => [...r]);
    simBoardUnrotated[BOARD_ROWS - 2][1] = 'T';
    simBoardUnrotated[BOARD_ROWS - 2][2] = 'T';
    simBoardUnrotated[BOARD_ROWS - 2][3] = 'T';
    simBoardUnrotated[BOARD_ROWS - 3][2] = 'T';

    const candidateUnrotated = { type: 'T' as const, rotation: 0 as const, x: 1, y: BOARD_ROWS - 3, bomber: false };
    const candidateRotated = { type: 'T' as const, rotation: 2 as const, x: 1, y: BOARD_ROWS - 3, bomber: false };

    // Unrotated drop (rotation 0 -> 0) returns false
    const tSpinUnrotated = detectTSpinFor(simBoardUnrotated, candidateUnrotated, false);
    // Rotated drop (rotation 0 -> 2) into 3-corner T-slot returns 'full'
    const tSpinRotated = detectTSpinFor(simBoardUnrotated, candidateRotated, true);

    assert.equal(tSpinUnrotated, false);
    assert.equal(tSpinRotated, 'full');

    const bot = new RulesBot();
    const plan = (bot as unknown as {
      findBestPlacement: (p: typeof obs.player, type: string, b: boolean) => { rotation: number; x: number; score: number };
    }).findBestPlacement(obs.player, 'T', false);

    assert.ok(plan);
  });

  it('replans immediately when a projected garbage countdown crosses the urgency threshold', () => {
    const bot = new RulesBot({ mode: 'player-limited' });
    const scenario = new Scenario({ seed: 202 });
    const p1 = scenario.getPlayerState('p1');
    
    // Start with delayed garbage (arrivalTick = 25 at tick 0 -> ticksUntilArrival = 25)
    p1.pendingGarbage = [{ lines: 3, arrivalTick: 25 }];
    (scenario as unknown as { gameState: { tick: number } }).gameState.tick = 0;

    const obs1: DriverObservation = {
      tick: 0,
      player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'player-limited'),
    };

    bot.next(obs1);
    assert.equal(bot['lastImminentState'], false);

    // Advance tick to 10 (arrivalTick = 25 -> ticksUntilArrival = 15, crossing the 18 threshold)
    (scenario as unknown as { gameState: { tick: number } }).gameState.tick = 10;
    const obs2: DriverObservation = {
      tick: 0,
      player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'player-limited'),
    };

    bot.next(obs2);
    // Imminent state flipped to true and plan was re-evaluated for imminent defense
    assert.equal(bot['lastImminentState'], true);
  });
});
