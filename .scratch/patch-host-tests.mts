import fs from 'node:fs';

// --- gameServer.ts ---
{
  const path = 'server/gameServer.ts';
  let s = fs.readFileSync(path, 'utf8');
  s = s.replace(
    "mode?: 'catalog' | 'random' | 'generated'",
    "mode?: 'catalog' | 'random' | 'generated' | 'daily'",
  );
  fs.writeFileSync(path, s);
  console.log('gameServer patched');
}

// --- puzzleHost.test.ts ---
{
  const path = 'server/puzzle/puzzleHost.test.ts';
  let s = fs.readFileSync(path, 'utf8');
  if (!s.includes("mode: 'daily'")) {
    s = s.replace(
      `  it('lists catalog summaries', () => {
    const { host, socket } = makeHost();
    host.listCatalog();
    const catalog = socket.last('puzzle:catalog') as Array<{ id: string; name: string }>;
    assert.ok(Array.isArray(catalog));
    assert.ok(catalog.length >= 2);
    assert.ok(catalog.every((entry) => typeof entry.id === 'string' && typeof entry.name === 'string'));
  });`,
      `  it('lists catalog summaries with daily payload', () => {
    const { host, socket } = makeHost();
    host.listCatalog();
    const catalog = socket.last('puzzle:catalog') as {
      puzzles: Array<{ id: string; name: string }>;
      daily: { dateKey: string; puzzleId: string; name: string };
    };
    assert.ok(Array.isArray(catalog.puzzles));
    assert.ok(catalog.puzzles.length >= 2);
    assert.ok(catalog.puzzles.every((entry) => typeof entry.id === 'string' && typeof entry.name === 'string'));
    assert.match(catalog.daily.dateKey, /^\\d{4}-\\d{2}-\\d{2}$/);
    assert.equal(typeof catalog.daily.puzzleId, 'string');
    assert.equal(typeof catalog.daily.name, 'string');
    assert.ok(catalog.puzzles.some((entry) => entry.id === catalog.daily.puzzleId));
  });

  it('daily mode starts getDailyChallenge level', () => {
    const { host, socket } = makeHost();
    host.start({ mode: 'daily' });
    assert.ok(host.active);
    const started = socket.last('puzzle:started') as { levelId: string; puzzleId: string };
    const ids = new Set(listCuratedPuzzleLevels().map((level) => level.id));
    assert.ok(ids.has(started.levelId));
    assert.equal(started.puzzleId, started.levelId);
    host.stop();
  });`,
    );
  }
  fs.writeFileSync(path, s);
  console.log('puzzleHost.test patched');
}
