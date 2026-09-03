from pathlib import Path

# Client gate: also require spread finished
p = Path('src/hooks/useShopConfirm.ts')
s = p.read_text(encoding='utf8')
old = "      if (pickedId === 'wildcard-four' && !opponent?.opponentHasPoison) return;"
neu = "      if (pickedId === 'wildcard-four' && (!opponent?.opponentHasPoison || opponent.poisonSpread != null)) return;"
if old not in s:
    raise SystemExit('useShopConfirm gate not found')
p.write_text(s.replace(old, neu), encoding='utf8')
print('patched useShopConfirm.ts')

# Update synergy tests
p = Path('server/puzzle/puzzlePoisonSynergy.test.ts')
s = p.read_text(encoding='utf8')

# Strengthen empty-board test comment; add mid-spread skip test after stack test
old_stack = """  it('scripted wildcard-four applies only after poison is on the stack', () => {
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
  });"""

neu_stack = """  it('scripted wildcard-four applies only after poison is on the stack', () => {
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
    player.poisonSpread = null;
    applyScriptedShopAttack('wildcard-four', player, 40, { variant: 2 });
    assert.ok(player.customNextPieceOffsets);
    assert.ok(player.customNextPieceSourceCells);
    assert.equal(player.customNextPieceVariant, 2);
    assert.ok((player.activeEffects ?? []).some((e) => e.kind === 'wildcard-four'));
  });

  it('scripted wildcard-four skips while poisonSpread is still running', () => {
    const rng = createPlayerRngChannels(13, 't');
    const player = makePlayer('p', rng);
    player.board[BOARD_ROWS - 1][0] = 'G';
    player.board[BOARD_ROWS - 1][1] = 'G';
    player.poisonBoard = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => 0),
    );
    player.poisonBoard[BOARD_ROWS - 1][0] = 2;
    player.poisonBoard[BOARD_ROWS - 1][1] = 2;
    player.poisonSpread = {
      generationsRemaining: 2,
      nextSpreadTick: 100,
      variant: 2,
    };
    const applied = applyScriptedShopAttack('wildcard-four', player, 40, { variant: 2 });
    assert.equal(applied, false);
    assert.equal(player.customNextPieceOffsets, undefined);
    assert.ok(!(player.activeEffects ?? []).some((e) => e.kind === 'wildcard-four'));
  });"""

if old_stack not in s:
    raise SystemExit('stack test block not found')
s = s.replace(old_stack, neu_stack)

# Update authored poison-beat test to assert spread finished before shape lock
old_authored = """  it('authored poison-beat applies wildcard only after poison is stacked', () => {
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
  });"""

neu_authored = """  it('authored poison-beat applies wildcard only after poison is stacked and spread finished', () => {
    const level = buildPoisonBeatLevel();
    assert.equal(level.goal.kind, 'clear-lines');
    assert.equal(level.goal.kind === 'clear-lines' ? level.goal.lines : -1, 10);
    const wildcardEvent = level.timeline.find((e) => !('loop' in e) && e.kind === 'wildcard');
    assert.ok(wildcardEvent && !('loop' in wildcardEvent));
    assert.equal(!('loop' in wildcardEvent!) ? wildcardEvent.tick : -1, 170);
    const session = new PuzzleSession({
      level,
      driver: new RulesBot({ mode: 'omniscient' }),
      maxTicks: 60 * 60,
    });
    let poisonOnStackBeforeWildcard = false;
    let spreadIdleBeforeWildcard = false;
    let wildcardApplied = false;
    let wildcardTick: number | null = null;
    let sawPoisonedActive = false;
    for (let i = 0; i < 60 * 45; i++) {
      const before = session.getPlayerState();
      const poisonCells = before.poisonBoard?.flat().filter((c) => c > 0).length ?? 0;
      const spreadActive = before.poisonSpread != null;
      const hadCustom = before.customNextPieceOffsets != null;
      session.advance(1);
      const after = session.getPlayerState();
      if (after.activePiece?.poisoned) sawPoisonedActive = true;
      if (!hadCustom && after.customNextPieceOffsets != null) {
        wildcardApplied = true;
        wildcardTick = session.tick;
        poisonOnStackBeforeWildcard = poisonCells > 0;
        spreadIdleBeforeWildcard = !spreadActive;
      }
      if (session.isEnded) break;
    }
    assert.equal(sawPoisonedActive, true, 'poison hazard must mark the active piece');
    assert.equal(wildcardApplied, true, 'wildcard must fire while the attempt is still live');
    assert.equal(poisonOnStackBeforeWildcard, true, 'wildcard requires poison already on the stack');
    assert.equal(spreadIdleBeforeWildcard, true, 'wildcard shape must wait until poisonSpread is done');
    assert.ok(wildcardTick != null && wildcardTick >= 170, 'wildcard applies at/after authored earliest tick');
    assert.equal(session.getReport().solved, true);
  });"""

if old_authored not in s:
    raise SystemExit('authored test block not found')
s = s.replace(old_authored, neu_authored)

# Fix skip-when-empty test to assert return false
old_skip = """    applyScriptedShopAttack('wildcard-four', player, 20, { variant: 2 });
    assert.equal(player.customNextPieceOffsets, undefined);
    assert.equal(player.customNextPieceSourceCells, undefined);
    assert.ok(!(player.activeEffects ?? []).some((e) => e.kind === 'wildcard-four'));
  });"""

neu_skip = """    const applied = applyScriptedShopAttack('wildcard-four', player, 20, { variant: 2 });
    assert.equal(applied, false);
    assert.equal(player.customNextPieceOffsets, undefined);
    assert.equal(player.customNextPieceSourceCells, undefined);
    assert.ok(!(player.activeEffects ?? []).some((e) => e.kind === 'wildcard-four'));
  });"""

if old_skip not in s:
    raise SystemExit('skip empty test not found')
s = s.replace(old_skip, neu_skip)

p.write_text(s, encoding='utf8')
print('patched puzzlePoisonSynergy.test.ts')
