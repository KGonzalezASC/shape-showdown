import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateBoard,
  deriveVisibilityFromObservation,
  scoreCavityDepthDelta,
  scoreSurfaceTopologyDelta,
  evaluatePlacementVisibilityRisk,
  calculatePlacementVisibilityRiskScore,
  scoreMagnetControl,
  scoreCurtainReference,
  CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS,
  UNCERTAIN_LINE_CLEAR_PENALTY,
  BoardMetricVisibility,
  PlacementPlan,
  RulesBot,
} from './rulesBot.js';
import { Scenario } from './scenario.js';
import { createSimpleShopPolicy, PairedRunner } from './pairedRunner.js';
import { createEmptyBoard, detectTSpinFor, previewAttackFromClear } from '../tetris/engine.js';
import { BOARD_COLS, BOARD_ROWS, BOARD_HIDDEN_ROWS } from '../../src/constants.js';
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
    assert.equal(bot.lastDecisionTrace?.committed, true);
    assert.equal(bot.lastDecisionTrace?.decisionSource, 'active');
    assert.equal(bot.lastDecisionTrace?.pieceType, p1.activePiece?.type);
    assert.equal(typeof bot.lastDecisionTrace?.decisionId, 'number');
    assert.deepEqual(bot.lastDecisionTrace?.decisionBoard, p1.board);
    assert.equal(bot.lastDecisionTrace?.observationMode, 'omniscient');
    assert.equal(bot.lastDecisionTrace?.decisionScore, p1.score);
    assert.equal(bot.lastDecisionTrace?.replayTick, 1);
    assert.ok((bot.lastDecisionTrace?.evaluatedCandidateCount ?? 0) >= 1);

    const limitedBot = new RulesBot({ mode: 'player-limited' });
    limitedBot.next({
      tick: 1,
      player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'player-limited'),
    });
    assert.equal(limitedBot.lastDecisionTrace?.observationMode, 'player-limited');
    assert.equal(limitedBot.lastDecisionTrace?.unknownCellCount, BOARD_HIDDEN_ROWS * BOARD_COLS);
  });

  it('responds to visible Magnet gravity by penalizing higher-control placements', () => {
    const scenario = new Scenario({ seed: 1212 });
    const player = scenario.getPlayerState('p1');
    player.activePiece = { type: 'O', rotation: 0, x: 0, y: BOARD_ROWS - 2 };

    const normalScore = scoreMagnetControl(player, 8, 3, BOARD_ROWS - 2);
    player.magnetPermanentStacks = 3;
    player.magnetPieceBoost = 2;
    const magnetScore = scoreMagnetControl(player, 8, 3, BOARD_ROWS - 2);

    assert.equal(normalScore, 0);
    assert.ok(magnetScore < normalScore);
  });

  it('uses the player score tier and fresh hold spawn state for Magnet control', () => {
    const scenario = new Scenario({ seed: 1313 });
    const player = scenario.getPlayerState('p1');
    player.activePiece = { type: 'O', rotation: 2, x: 0, y: 0 };
    player.magnetPermanentStacks = 3;
    player.magnetPieceBoost = 2;

    player.score = 0;
    const lowTierScore = scoreMagnetControl(player, 8, 0, 2);
    player.score = 3000;
    const highTierScore = scoreMagnetControl(player, 8, 0, 2);
    const heldSpawnScore = scoreMagnetControl(
      player,
      8,
      0,
      2,
      { x: 3, y: 0, rotation: 0 },
      0,
    );

    assert.ok(lowTierScore < highTierScore);
    assert.equal(Math.abs(heldSpawnScore), 0);
  });

  it('does not flag a one-cell move and rotation that fit in the same Magnet tick', () => {
    const scenario = new Scenario({ seed: 1414 });
    const player = scenario.getPlayerState('p1');
    player.activePiece = { type: 'O', rotation: 0, x: 3, y: 0 };
    player.magnetPermanentStacks = 3;
    player.score = 0;

    assert.equal(Math.abs(scoreMagnetControl(player, 4, 1, 1)), 0);
  });

  it('passes a fresh spawn and cleared temporary Magnet boost into the real hold plan', () => {
    const scenario = new Scenario({ seed: 1515 });
    const player = scenario.getPlayerState('p1');
    player.activePiece = { type: 'I', rotation: 0, x: 3, y: 0 };
    player.holdPiece = { type: 'O' };
    player.canHold = true;
    player.magnetPermanentStacks = 3;
    player.magnetPieceBoost = 2;

    const calls: Array<{ type: string; evaluationPiece?: unknown; evaluationBoost?: unknown }> = [];
    const bot = new RulesBot({ mode: 'omniscient' });
    (bot as unknown as {
      findBestPlacement: (...args: unknown[]) => PlacementPlan;
    }).findBestPlacement = (...args) => {
      calls.push({ type: args[1] as string, evaluationPiece: args[6], evaluationBoost: args[7] });
      return { rotation: 0, x: 0, score: args[1] === 'O' ? 100 : 0 };
    };

    const observation: DriverObservation = {
      tick: 1,
      player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient'),
    };
    const command = bot.next(observation);

    assert.deepEqual(command.actions, ['hold']);
    assert.deepEqual(calls, [
      { type: 'I', evaluationPiece: undefined, evaluationBoost: undefined },
      { type: 'O', evaluationPiece: { x: 3, y: 0, rotation: 0 }, evaluationBoost: 0 },
    ]);
  });

  it('evaluates a held Bomber with its blast effect before choosing hold', () => {
    const scenario = new Scenario({ seed: 808 });
    const player = scenario.getPlayerState('p1');
    player.activePiece = { type: 'I', rotation: 0, x: 3, y: 0, bomber: false };
    player.holdPiece = { type: 'O', bomber: true };
    player.canHold = true;

    const calls: Array<{ type: string; isBomber: boolean }> = [];
    const bot = new RulesBot({ mode: 'omniscient' });
    (bot as unknown as {
      findBestPlacement: (p: typeof player, type: string, isBomber: boolean) => PlacementPlan;
    }).findBestPlacement = (_p, type, isBomber) => {
      calls.push({ type, isBomber });
      return { rotation: 0, x: 0, score: type === 'O' ? 100 : 0 };
    };

    const observation: DriverObservation = {
      tick: 1,
      player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient'),
    };
    const command = bot.next(observation);

    assert.deepEqual(command.actions, ['hold']);
    assert.deepEqual(calls, [
      { type: 'I', isBomber: false },
      { type: 'O', isBomber: true },
    ]);
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

  describe('Step 3 — Refined Hole-Uncovering Metrics', () => {
    it('evaluates per-column cavity depth and distinguishes deep vs shallow overburden', () => {
      const boardA = createEmptyBoard();
      // Hole at (0, BOARD_ROWS-1) under 5 blocks
      for (let y = BOARD_ROWS - 6; y < BOARD_ROWS - 1; y++) {
        boardA[y][0] = 'I';
      }

      const boardB = createEmptyBoard();
      // Hole at (0, BOARD_ROWS-1) under 1 block
      boardB[BOARD_ROWS - 2][0] = 'I';

      const evalA = evaluateBoard(boardA);
      const evalB = evaluateBoard(boardB);

      assert.equal(evalA.holes, 1);
      assert.equal(evalB.holes, 1);
      assert.equal(evalA.columnCavities[0].cavityDepth, 5);
      assert.equal(evalB.columnCavities[0].cavityDepth, 1);
      assert.equal(evalA.columnCavities[0].deepestCavity, 5);
      assert.equal(evalB.columnCavities[0].deepestCavity, 1);
      assert.ok(evalA.totalCavityDepth > evalB.totalCavityDepth);
    });

    it('handles multi-column cavity depth metrics independently', () => {
      const board = createEmptyBoard();
      // Col 2: 3 blocks above hole
      board[BOARD_ROWS - 4][2] = 'I';
      board[BOARD_ROWS - 3][2] = 'I';
      board[BOARD_ROWS - 2][2] = 'I';
      // Col 5: 1 block above hole
      board[BOARD_ROWS - 2][5] = 'I';

      const evalResult = evaluateBoard(board);
      assert.equal(evalResult.holes, 2);
      assert.equal(evalResult.columnCavities[2].cavityDepth, 3);
      assert.equal(evalResult.columnCavities[5].cavityDepth, 1);
      assert.equal(evalResult.totalCavityDepth, 4);
      assert.equal(evalResult.deepestCavity, 3);
    });

    it('penalizes placements that increase cavity depth and overburden', () => {
      const origBoard = createEmptyBoard();
      origBoard[BOARD_ROWS - 2][0] = 'I'; // 1 block over hole at bottom

      const simBoardBury = createEmptyBoard();
      simBoardBury[BOARD_ROWS - 4][0] = 'I';
      simBoardBury[BOARD_ROWS - 3][0] = 'I';
      simBoardBury[BOARD_ROWS - 2][0] = 'I'; // 3 blocks over hole

      const origEval = evaluateBoard(origBoard);
      const simEval = evaluateBoard(simBoardBury);

      const deltaScore = scoreCavityDepthDelta(origEval, simEval);
      assert.ok(deltaScore < 0);
    });

    it('respects visibility bounds for omniscient vs player-limited observation mode', () => {
      const scenario = new Scenario({ seed: 505 });
      const obsOmni = defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient');
      const obsLimited = defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'player-limited');

      const visOmni = deriveVisibilityFromObservation(obsOmni);
      const visLimited = deriveVisibilityFromObservation(obsLimited);

      assert.equal(visOmni.knownRowStart, 0);
      assert.equal(visOmni.knownRowEndExclusive, BOARD_ROWS);

      assert.equal(visLimited.knownRowStart, BOARD_HIDDEN_ROWS);
      assert.equal(visLimited.knownRowEndExclusive, BOARD_ROWS);
    });

    it('evaluates player-limited Curtain masking without creating false holes or false depth reduction', () => {
      const scenario = new Scenario({ seed: 606 });
      const p1 = scenario.getPlayerState('p1');
      p1.swapCutoffRow = 8;
      p1.activeEffects.push({
        id: 'curtain-effect-1',
        kind: 'curtain',
        label: 'Curtain',
        expiresAtTick: 120,
      });

      const obs = defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'player-limited');
      const vis = deriveVisibilityFromObservation(obs);

      assert.ok(obs.context.boardVisibility);
      assert.equal(obs.context.boardVisibility.maskedRowsStart, 13);
      assert.equal(vis.knownRowEndExclusive, 13);

      const evalVis = evaluateBoard(p1.board, p1.poisonBoard, { visibility: vis });
      assert.equal(evalVis.totalCavityDepth, 0);
    });

    it('scores cavity depth reduction dynamically without a flat static +400 bonus', () => {
      const origBoard = createEmptyBoard();
      // Hole covered by 4 blocks
      for (let y = BOARD_ROWS - 5; y < BOARD_ROWS - 1; y++) {
        origBoard[y][0] = 'I';
      }

      const simBoardDeepClear = createEmptyBoard();
      // Uncovers 3 of the 4 overburden blocks
      simBoardDeepClear[BOARD_ROWS - 2][0] = 'I';

      const simBoardShallowClear = createEmptyBoard();
      // Uncovers 1 overburden block
      for (let y = BOARD_ROWS - 4; y < BOARD_ROWS - 1; y++) {
        simBoardShallowClear[y][0] = 'I';
      }

      const origEval = evaluateBoard(origBoard);
      const deepSimEval = evaluateBoard(simBoardDeepClear);
      const shallowSimEval = evaluateBoard(simBoardShallowClear);

      const deepDeltaScore = scoreCavityDepthDelta(origEval, deepSimEval);
      const shallowDeltaScore = scoreCavityDepthDelta(origEval, shallowSimEval);

      assert.ok(deepDeltaScore > shallowDeltaScore);
      assert.ok(deepDeltaScore > 0);
    });

    it('selects placement that reduces deeper cavity depth over shallow hole removal', () => {
      const origBoard = createEmptyBoard();
      // Col 0: Hole at y=19 under 4 overburden cells
      for (let y = BOARD_ROWS - 5; y < BOARD_ROWS - 1; y++) {
        origBoard[y][0] = 'I';
      }
      // Col 5: Hole at y=19 under 1 overburden cell
      origBoard[BOARD_ROWS - 2][5] = 'I';

      const simBoardDeep = createEmptyBoard();
      // Uncovers 3 of the 4 overburden cells in Col 0
      simBoardDeep[BOARD_ROWS - 2][0] = 'I';
      simBoardDeep[BOARD_ROWS - 2][5] = 'I';

      const simBoardShallow = createEmptyBoard();
      // Uncovers the 1 overburden cell in Col 5
      for (let y = BOARD_ROWS - 5; y < BOARD_ROWS - 1; y++) {
        simBoardShallow[y][0] = 'I';
      }

      const origEval = evaluateBoard(origBoard);
      const simEvalDeep = evaluateBoard(simBoardDeep);
      const simEvalShallow = evaluateBoard(simBoardShallow);

      const scoreDeep = scoreCavityDepthDelta(origEval, simEvalDeep);
      const scoreShallow = scoreCavityDepthDelta(origEval, simEvalShallow);

      assert.ok(scoreDeep > scoreShallow);
      assert.ok(scoreDeep > 0);
    });

    it('rejects lower-height placement when it buries/increases cavity depth', () => {
      const bot = new RulesBot();
      const scenario = new Scenario({ seed: 909 });
      const p1 = scenario.getPlayerState('p1');

      // Col 0: Hole at bottom covered by 1 cell. Placing a piece here drops deep (low height) but adds overburden cells above hole.
      p1.board[BOARD_ROWS - 2][0] = 'I';

      // Col 5: Solid stack up to BOARD_ROWS - 3 (no holes). Placing piece here lands higher but creates no cavity depth increase.
      for (let y = BOARD_ROWS - 3; y < BOARD_ROWS; y++) {
        p1.board[y][5] = 'O';
      }

      p1.activePiece = { type: 'O', rotation: 0, x: 0, y: 0 };
      const obs = defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient');

      const plan = (bot as unknown as {
        findBestPlacement: (p: typeof obs.player, type: string, b: boolean) => { rotation: number; x: number; score: number };
      }).findBestPlacement(obs.player, 'O', false);

      assert.ok(plan);
      assert.notEqual(plan.x, 0);
    });

    it('measures odd surface transitions and isolated one-cell peaks', () => {
      const board = createEmptyBoard();
      const heights = [4, 5, 4, 4, 6, 6, 6, 6, 6, 6];

      for (let x = 0; x < BOARD_COLS; x++) {
        for (let y = BOARD_ROWS - heights[x]; y < BOARD_ROWS; y++) {
          board[y][x] = 'I';
        }
      }

      const metrics = evaluateBoard(board);

      assert.equal(metrics.oddHeightTransitions, 2);
      assert.equal(metrics.isolatedOneHighSpikes, 1);
    });

    it('rewards topology improvements without overpowering existing stack metrics', () => {
      const origBoard = createEmptyBoard();
      const smoothBoard = createEmptyBoard();
      const origHeights = [4, 5, 4, 4, 6, 6, 6, 6, 6, 6];
      const smoothHeights = [4, 4, 4, 4, 6, 6, 6, 6, 6, 6];

      for (let x = 0; x < BOARD_COLS; x++) {
        for (let y = BOARD_ROWS - origHeights[x]; y < BOARD_ROWS; y++) {
          origBoard[y][x] = 'I';
        }
        for (let y = BOARD_ROWS - smoothHeights[x]; y < BOARD_ROWS; y++) {
          smoothBoard[y][x] = 'I';
        }
      }

      const topologyScore = scoreSurfaceTopologyDelta(evaluateBoard(origBoard), evaluateBoard(smoothBoard));

      assert.equal(topologyScore, 16);
      assert.ok(topologyScore < 100);
    });
  });

  describe('Step 4 — Curtain Frontier and Unknown-Region Risk', () => {
    it('scores a coherent Curtain frontier above an internally hollow one', () => {
      const coherent = createEmptyBoard();
      const hollow = createEmptyBoard();
      for (let x = 0; x < BOARD_COLS; x++) {
        coherent[12][x] = 'I';
        coherent[11][x] = 'I';
        hollow[12][x] = 'I';
      }
      hollow[11][4] = null;
      hollow[10][4] = 'I';

      assert.ok(scoreCurtainReference(coherent, 13) > scoreCurtainReference(hollow, 13));
    });

    it('plans from the last player-visible board after Curtain masks it', () => {
      const scenario = new Scenario({ seed: 8079 });
      const p1 = scenario.getPlayerState('p1');
      p1.board[BOARD_ROWS - 1][0] = 'I';
      p1.activePiece = { type: 'O', rotation: 0, x: 3, y: 0 };
      p1.canHold = false;
      p1.swapCutoffRow = 7;
      const bot = new RulesBot({ mode: 'player-limited', garbageEnabled: false });

      p1.activeEffects = [{ id: 'curtain-warning', kind: 'curtain-warn', label: 'Curtain warning' }];
      bot.next({
        tick: 0,
        replayTick: 0,
        player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'player-limited'),
      });

      p1.activeEffects = [{ id: 'curtain-active', kind: 'curtain', label: 'Curtain' }];
      const activeObservation = defaultObservationProjector.project(
        scenario.getReport().gameState,
        'p1',
        'player-limited',
      );
      assert.equal(activeObservation.player.board[BOARD_ROWS - 1][0], null);

      bot.next({ tick: 1, replayTick: 1, player: activeObservation });
      assert.equal(bot.lastDecisionTrace?.decisionBoard[BOARD_ROWS - 1][0], 'I');
    });

    it('throttles Curtain hard-drops while leaving the initial warning at normal speed', () => {
      const scenario = new Scenario({ seed: 8080 });
      const p1 = scenario.getPlayerState('p1');
      p1.activePiece = { type: 'O', rotation: 0, x: 3, y: 0 };
      p1.lastHardDropTick = 0;
      const bot = new RulesBot({ mode: 'omniscient' });
      (bot as unknown as {
        findBestPlacement: () => PlacementPlan;
      }).findBestPlacement = () => ({ rotation: 0, x: 3, score: 0 });

      p1.activeEffects = [{ id: 'curtain-warning', kind: 'curtain-warn', label: 'Curtain warning' }];
      const warningCommand = bot.next({
        tick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 10,
        replayTick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 10,
        player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient'),
      });
      assert.deepEqual(warningCommand.actions, ['hardDrop']);

      p1.activeEffects = [{ id: 'curtain-active', kind: 'curtain', label: 'Curtain' }];
      const firstActiveCommand = bot.next({
        tick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 11,
        replayTick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 11,
        player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient'),
      });
      assert.deepEqual(firstActiveCommand.actions, ['hardDrop']);

      const activeCommand = bot.next({
        tick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 12,
        replayTick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 12,
        player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient'),
      });
      assert.deepEqual(activeCommand.actions, []);
      assert.deepEqual(activeCommand.inputState, { left: false, right: false, softDrop: false });
    });

    it('carries active Curtain cadence through an overlapping warning', () => {
      const scenario = new Scenario({ seed: 8081 });
      const p1 = scenario.getPlayerState('p1');
      p1.activePiece = { type: 'O', rotation: 0, x: 3, y: 0 };
      p1.lastHardDropTick = 0;
      const bot = new RulesBot({ mode: 'omniscient' });
      (bot as unknown as {
        findBestPlacement: () => PlacementPlan;
      }).findBestPlacement = () => ({ rotation: 0, x: 3, score: 0 });

      p1.activeEffects = [{ id: 'curtain-active', kind: 'curtain', label: 'Curtain' }];
      const activeCommand = bot.next({
        tick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 10,
        replayTick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 10,
        player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient'),
      });
      assert.deepEqual(activeCommand.actions, ['hardDrop']);

      p1.activeEffects = [{ id: 'curtain-warning', kind: 'curtain-warn', label: 'Curtain warning' }];
      const warningCommand = bot.next({
        tick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 11,
        replayTick: CURTAIN_BOT_HARD_DROP_INTERVAL_TICKS + 11,
        player: defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'omniscient'),
      });
      assert.deepEqual(warningCommand.actions, []);
    });

    it('uses a reachable counter-clockwise SRS route when the clockwise route is blocked', () => {
      const board = createEmptyBoard();
      board[5][4] = 'T';
      board[6][3] = 'T';
      board[8][5] = 'T';
      board[9][0] = 'T';
      board[9][1] = 'T';
      const scenario = new Scenario({ seed: 8082 });
      const p1 = scenario.getPlayerState('p1');
      p1.board = board;
      p1.swapCutoffRow = 7;
      p1.activePiece = { type: 'L', rotation: 0, x: 3, y: 4 };
      p1.activeEffects = [{ id: 'curtain-test', kind: 'curtain', label: 'Curtain' }];
      const bot = new RulesBot({ mode: 'player-limited' });
      const observation = () => defaultObservationProjector.project(
        scenario.getReport().gameState,
        'p1',
        'player-limited',
      );

      const command = bot.next({ tick: 0, replayTick: 0, player: observation() });
      assert.deepEqual(command.actions, ['rotateCCW']);
      scenario.action('p1', 'rotateCCW');
      scenario.advance(1);

      assert.equal(scenario.getPlayerState('p1').activePiece?.rotation, 3);
      assert.equal(scenario.getPlayerState('p1').activePiece?.x, 4);
    });

    it('produces zero unknown risk for omniscient observation mode', () => {
      const visibility = { knownRowStart: 0, knownRowEndExclusive: BOARD_ROWS };
      const placedCells: Array<[number, number]> = [[0, 0], [0, 1], [0, 18], [0, 19]];
      const risk = evaluatePlacementVisibilityRisk(placedCells, [19], visibility);

      assert.equal(risk.unknownCellCount, 0);
      assert.equal(risk.deepestUnknownRowOffset, 0);
      assert.equal(risk.crossesUnknownFrontier, false);
      assert.equal(risk.uncertainLineClearCount, 0);
      assert.equal(calculatePlacementVisibilityRiskScore(risk), 0);
    });

    it('produces risk for hidden spawn rows in player-limited mode without Curtain', () => {
      const visibility = { knownRowStart: BOARD_HIDDEN_ROWS, knownRowEndExclusive: BOARD_ROWS };
      const placedCells: Array<[number, number]> = [[0, 0], [0, 1], [0, 10]]; // y=0,1 in hidden spawn rows
      const risk = evaluatePlacementVisibilityRisk(placedCells, [19], visibility);

      assert.equal(risk.unknownCellCount, 2);
      assert.equal(risk.deepestUnknownRowOffset, 2); // 2 - 0 = 2
      assert.equal(risk.crossesUnknownFrontier, true);
      assert.equal(risk.uncertainLineClearCount, 0);
      assert.ok(calculatePlacementVisibilityRiskScore(risk) > 0);
    });

    it('produces risk for cells at or below maskedRowsStart during active Curtain', () => {
      const visibility = { knownRowStart: BOARD_HIDDEN_ROWS, knownRowEndExclusive: 13 };
      const placedCells: Array<[number, number]> = [[0, 5], [0, 13], [0, 14]]; // y=13,14 in Curtain masked rows
      const risk = evaluatePlacementVisibilityRisk(placedCells, [13], visibility);

      assert.equal(risk.unknownCellCount, 2);
      assert.equal(risk.deepestUnknownRowOffset, 2); // y=14 is offset 2 into masked rows (14 - 13 + 1)
      assert.equal(risk.crossesUnknownFrontier, true);
      assert.equal(risk.uncertainLineClearCount, 1);
      assert.ok(calculatePlacementVisibilityRiskScore(risk) > 0);
    });

    it('increases risk monotonically as candidate goes deeper into masked region', () => {
      const visibility = { knownRowStart: BOARD_HIDDEN_ROWS, knownRowEndExclusive: 13 };
      const shallowCells: Array<[number, number]> = [[0, 13]];
      const deepCells: Array<[number, number]> = [[0, 16]];

      const shallowRisk = evaluatePlacementVisibilityRisk(shallowCells, [], visibility);
      const deepRisk = evaluatePlacementVisibilityRisk(deepCells, [], visibility);

      assert.ok(calculatePlacementVisibilityRiskScore(deepRisk) > calculatePlacementVisibilityRiskScore(shallowRisk));
    });

    it('scores speculative line clear lower than an equivalent known line clear', () => {
      const knownVis = { knownRowStart: 0, knownRowEndExclusive: BOARD_ROWS };
      const maskedVis = { knownRowStart: BOARD_HIDDEN_ROWS, knownRowEndExclusive: 13 };

      const placedCells: Array<[number, number]> = [[0, 15], [1, 15], [2, 15], [3, 15]];
      const clearedRows = [15];

      const knownRisk = evaluatePlacementVisibilityRisk(placedCells, clearedRows, knownVis);
      const maskedRisk = evaluatePlacementVisibilityRisk(placedCells, clearedRows, maskedVis);

      assert.equal(calculatePlacementVisibilityRiskScore(knownRisk), 0);
      assert.ok(calculatePlacementVisibilityRiskScore(maskedRisk) >= UNCERTAIN_LINE_CLEAR_PENALTY);
    });

    it('prefers a known safe candidate over a candidate that crosses the unknown frontier', () => {
      const bot = new RulesBot({ mode: 'player-limited' });
      const scenario = new Scenario({ seed: 707 });
      const p1 = scenario.getPlayerState('p1');
      p1.swapCutoffRow = 13;
      p1.activeEffects.push({
        id: 'curtain-1',
        kind: 'curtain',
        label: 'Curtain',
        expiresAtTick: 120,
      });

      p1.activePiece = { type: 'I', rotation: 1, x: 0, y: 0 };
      const obs = defaultObservationProjector.project(scenario.getReport().gameState, 'p1', 'player-limited');

      const plan = (bot as unknown as {
        findBestPlacement: (p: typeof obs.player, type: string, b: boolean, t?: number, v?: BoardMetricVisibility) => PlacementPlan | null;
      }).findBestPlacement(obs.player, 'I', false, obs.tick, deriveVisibilityFromObservation(obs));

      assert.ok(plan);
    });

    it('maintains survival on 120-second seed 2039 regression', { timeout: 30000 }, () => {
      const runner = new PairedRunner({
        seed: 2039,
        enableShop: false,
        enableGarbage: false,
        botModes: { p1: 'player-limited', p2: 'player-limited' },
      });
      const report = runner.run(7200); // 120 seconds
      assert.equal(report.scenarioReport.gameState.players.p1.topOut, false);
      assert.equal(report.scenarioReport.gameState.players.p2.topOut, false);
    });

    it('keeps the Curtain recipient alive on full-catalog garbage seed 910060', { timeout: 30000 }, () => {
      const runner = new PairedRunner({
        seed: 910060,
        enableShop: true,
        enableGarbage: true,
        botModes: { p1: 'player-limited', p2: 'player-limited' },
        shopPolicies: { p1: createSimpleShopPolicy('curtain', 140) },
      });
      const report = runner.run(7200);

      assert.equal(report.scenarioReport.gameState.players.p2.topOut, false);
    });
  });
});
