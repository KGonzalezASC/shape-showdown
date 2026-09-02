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
});
