from pathlib import Path
p = Path("server/puzzle/puzzleHost.test.ts")
s = p.read_text(encoding="utf8")
old = '''  it('streams poisonBoard and poisoned activePiece like multiplayer public state', async () => {
    const { host, socket } = makeHost();
    host.start({ mode: 'catalog', puzzleId: 'authored-poison-beat' });
    // Poison fires at tick 90 and locks onto the stack shortly after (~114).
    const deadline = Date.now() + 5000;
    let sawPoisonedPiece = false;
    let sawPoisonBoard = false;
    while (Date.now() < deadline && (!sawPoisonedPiece || !sawPoisonBoard)) {
      await new Promise((r) => setTimeout(r, 50));
      const state = socket.last('puzzle:state') as {
        activePiece?: { poisoned?: boolean; poisonVariant?: number } | null;
        poisonBoard?: number[][];
        customNextPieceSourceCells?: [number, number][];
        curtainDefenseLevel?: number;
      };
      if (state?.activePiece?.poisoned) sawPoisonedPiece = true;
      if (state?.poisonBoard?.some((row) => row.some((cell) => cell > 0))) sawPoisonBoard = true;
      assert.equal(typeof state.curtainDefenseLevel, 'number');
    }
    assert.equal(sawPoisonedPiece, true, 'wire must carry poisoned activePiece');
    assert.equal(sawPoisonBoard, true, 'wire must carry poisonBoard after lock');
    host.stop();
  });
'''
neu = '''  it('streams poisonBoard and poisoned activePiece like multiplayer public state', async () => {
    const { host, socket } = makeHost();
    host.start({ mode: 'catalog', puzzleId: 'authored-poison-beat' });
    // Wait for poison hazard (~tick 90), then hard-drop so lock seeds poisonBoard.
    const deadline = Date.now() + 8000;
    let sawPoisonedPiece = false;
    let sawPoisonBoard = false;
    while (Date.now() < deadline && (!sawPoisonedPiece || !sawPoisonBoard)) {
      await new Promise((r) => setTimeout(r, 40));
      const state = socket.last('puzzle:state') as {
        tick?: number;
        activePiece?: { poisoned?: boolean; poisonVariant?: number } | null;
        poisonBoard?: number[][] | undefined;
        curtainDefenseLevel?: number;
      };
      assert.ok(state);
      assert.equal(typeof state.curtainDefenseLevel, 'number');
      assert.ok(Array.isArray(state.poisonBoard), 'poisonBoard must be present on the wire');
      if (state.activePiece?.poisoned) {
        sawPoisonedPiece = true;
        host.pushAction('hardDrop' as ActionType);
      }
      if (state.poisonBoard?.some((row) => row.some((cell) => cell > 0))) {
        sawPoisonBoard = true;
      }
    }
    assert.equal(sawPoisonedPiece, true, 'wire must carry poisoned activePiece');
    assert.equal(sawPoisonBoard, true, 'wire must carry poisonBoard after lock');
    host.stop();
  });
'''
if old not in s:
    raise SystemExit('host test block missing')
p.write_text(s.replace(old, neu), encoding='utf8')
print('updated host test')
