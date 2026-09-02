import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_COLS, BOARD_ROWS } from '../../src/constants.js';
import { PuzzleSession } from './puzzleSession.js';
import { generatePuzzleLevel } from './puzzleGenerator.js';
import { RulesBot } from '../testHarness/rulesBot.js';
import type { PuzzleLevel } from './puzzleTypes.js';
import { applyScriptedShopAttack } from '../shop.js';
import { makePlayer } from '../puzzleEngine/engine.js';
import { createPlayerRngChannels } from '../../src/rng.js';
import { buildPoisonBeatLevel } from './catalog/authoredLevels.js';

describe('puzzle poison stacking matches multiplayer elixir-pulse', () => {
  it('poisons active piece when present and pushes field effect', () => {
    const rng = createPlayerRngChannels(1, 't');
    const player = makePlayer('p', rng);
    // Non-empty board + active piece
    player.board[BOARD_ROWS - 1][0] = 'G';
    assert.ok(player.activePiece);
    applyScriptedShopAttack('elixir-pulse', player, 10, { variant: 3 });
    assert.equal(player.activePiece!.poisoned, true);
    assert.equal(player.activePiece!.poisonVariant, 3);
    assert.equal(player.poisonNextPiece, false);
    assert.ok(player.activeEffects?.some((e) => e.kind === 'poison'));
  });

  it('sets poisonNextPiece only when board is not empty and no active piece', () => {
    const rng = createPlayerRngChannels(2, 't');
    const player = makePlayer('p', rng);
    player.activePiece = null;
    player.board[BOARD_ROWS - 1][0] = 'G';
    applyScriptedShopAttack('elixir-pulse', player, 10, { variant: 2 });
    assert.equal(player.poisonNextPiece, true);
    assert.equal(player.poisonNextVariant, 2);
  });

  it('does not set poisonNextPiece when board is empty and no active piece', () => {
    const rng = createPlayerRngChannels(3, 't');
    const player = makePlayer('p', rng);
    player.activePiece = null;
    // empty board
    applyScriptedShopAttack('elixir-pulse', player, 10, { variant: 1 });
    assert.equal(!!player.poisonNextPiece, false);
    assert.ok(player.activeEffects?.some((e) => e.kind === 'poison'));
  });

  it('session poison → lock seeds poisonBoard and schedules spread waves', () => {
    const level: PuzzleLevel = generatePuzzleLevel({
      id: 'poison-stack',
      name: 'poison-stack',
      seed: 99,
      garbageRows: 2,
      goal: { kind: 'clear-lines', lines: 1 },
      timeline: [{ tick: 30, kind: 'poison', params: { variant: 2 } }],
    });
    // Force early poison so active piece is still falling.
    level.timeline = [{ tick: 5, kind: 'poison', params: { variant: 2 } }];
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 60 * 30,
    });
    let sawPoisonedLock = false;
    for (let i = 0; i < 60 * 20; i++) {
      const before = session.getPlayerState();
      const report = session.advance(1);
      const p = session.getPlayerState();
      if (p.poisonBoard?.some((row) => row.some((c) => c === 2))) {
        sawPoisonedLock = true;
        assert.ok(
          p.poisonSpread === null || p.poisonSpread.variant === 2,
          'spread scheduler uses the same variant',
        );
        break;
      }
      if (report.solved || report.topOut) break;
      void before;
    }
    assert.equal(sawPoisonedLock, true, 'poisoned piece must seed poisonBoard on lock');
  });

  it('retrim then curtain schedules pending shop effects like multiplayer', () => {
    const level = generatePuzzleLevel({
      id: 'retrim-curtain',
      name: 'retrim-curtain',
      seed: 7,
      garbageRows: 2,
      goal: { kind: 'survive', ticks: 400 },
      timeline: [
        { tick: 10, kind: 'retrim' },
        { tick: 80, kind: 'curtain' },
      ],
    });
    level.timeline = [
      { tick: 10, kind: 'retrim' },
      { tick: 80, kind: 'curtain' },
    ];
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 500,
    });
    session.advance(11);
    const afterRetrim = session.getPlayerState();
    assert.ok((afterRetrim.curtainDefenseLevel ?? 0) >= 1);
    assert.ok(afterRetrim.pendingShopEffects.some((e) => e.itemId === 'retrim'));
    session.advance(70);
    const afterCurtain = session.getPlayerState();
    assert.ok(afterCurtain.pendingShopEffects.some((e) => e.itemId === 'curtain'));
  });

  it('scripted wildcard-four skips when poisonBoard is empty (matches multiplayer gate)', () => {
    const rng = createPlayerRngChannels(11, 't');
    const player = makePlayer('p', rng);
    player.board[BOARD_ROWS - 1][0] = 'G';
    assert.ok(player.activePiece);
    // Poisoned falling piece alone is not enough — multiplayer requires stack poison.
    player.activePiece!.poisoned = true;
    player.activePiece!.poisonVariant = 2;
    applyScriptedShopAttack('wildcard-four', player, 20, { variant: 2 });
    assert.equal(player.customNextPieceOffsets, undefined);
    assert.equal(player.customNextPieceSourceCells, undefined);
    assert.ok(!(player.activeEffects ?? []).some((e) => e.kind === 'wildcard-four'));
  });

  it('scripted wildcard-four applies only after poison is on the stack', () => {
    const rng = createPlayerRngChannels(12, 't');
    const player = makePlayer('p', rng);
    player.board[BOARD_ROWS - 1][0] = 'G';
    player.board[BOARD_ROWS - 1][1] = 'G';
    player.board[BOARD_ROWS - 1][2] = 'G';
    player.board[BOARD_ROWS - 1][3] = 'G';
    player.poisonBoard = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => 0),
    );
    player.poisonBoard[BOARD_ROWS - 1][0] = 2;
    player.poisonBoard[BOARD_ROWS - 1][1] = 2;
    player.poisonBoard[BOARD_ROWS - 1][2] = 2;
    player.poisonBoard[BOARD_ROWS - 1][3] = 2;
    applyScriptedShopAttack('wildcard-four', player, 40, { variant: 2 });
    assert.ok(player.customNextPieceOffsets);
    assert.ok(player.customNextPieceSourceCells);
    assert.equal(player.customNextPieceVariant, 2);
    assert.ok((player.activeEffects ?? []).some((e) => e.kind === 'wildcard-four'));
  });

  it('authored poison-beat applies wildcard only after poison is stacked', () => {
    const level = buildPoisonBeatLevel();
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 60 * 30,
    });
    let poisonOnStackBeforeWildcard = false;
    let wildcardApplied = false;
    let sawPoisonedActive = false;
    for (let i = 0; i < 60 * 20; i++) {
      const before = session.getPlayerState();
      const poisonCells = before.poisonBoard?.flat().filter((c) => c > 0).length ?? 0;
      const hadCustom = before.customNextPieceOffsets != null;
      session.advance(1);
      const after = session.getPlayerState();
      if (after.activePiece?.poisoned) sawPoisonedActive = true;
      if (!hadCustom && after.customNextPieceOffsets != null) {
        wildcardApplied = true;
        poisonOnStackBeforeWildcard = poisonCells > 0;
      }
      if (session.isEnded) break;
    }
    assert.equal(sawPoisonedActive, true, 'poison hazard must mark the active piece');
    assert.equal(wildcardApplied, true, 'wildcard must fire while the attempt is still live');
    assert.equal(poisonOnStackBeforeWildcard, true, 'wildcard requires poison already on the stack');
    assert.equal(session.getReport().solved, true);
  });
});
