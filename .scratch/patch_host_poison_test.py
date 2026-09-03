from pathlib import Path
p = Path("server/puzzle/puzzleHost.test.ts")
s = p.read_text(encoding="utf8")
if "streams poisonBoard" in s:
    print("host test already present")
else:
    insert = '''
  it('streams poisonBoard and poisoned activePiece like multiplayer public state', async () => {
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
    # insert before final closing of describe
    idx = s.rfind("});")
    if idx < 0:
        raise SystemExit("describe end not found")
    s = s[:idx] + insert + s[idx:]
    p.write_text(s, encoding="utf8")
    print("added host poison wire test")
