import fs from 'node:fs';

const path = 'server/puzzle/puzzleHost.ts';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes("dailyCalendar.js")) {
  s = s.replace(
    "import { getCuratedPuzzleEntry, listPuzzleCatalogSummaries, loadPuzzleCatalog } from './catalog/index.js';",
    "import { getCuratedPuzzleEntry, listPuzzleCatalogSummaries, loadPuzzleCatalog } from './catalog/index.js';\nimport { getDailyChallenge, getDailyChallengeSummary } from './catalog/dailyCalendar.js';",
  );
}

s = s.replace(
  "mode?: 'catalog' | 'random' | 'generated';",
  "mode?: 'catalog' | 'random' | 'generated' | 'daily';",
);

s = s.replace(
  `  /**
   * catalog: require puzzleId
   * random: pick a random curated entry
   * generated: legacy archetype generator (practice only)
   */`,
  `  /**
   * catalog: require puzzleId
   * random: pick a random curated entry
   * daily: today's challenge from the daily calendar
   * generated: legacy archetype generator (practice only)
   */`,
);

s = s.replace(
  `  public listCatalog(): void {
    this.socket.emit('puzzle:catalog', listPuzzleCatalogSummaries());
  }`,
  `  public listCatalog(): void {
    this.socket.emit('puzzle:catalog', {
      puzzles: listPuzzleCatalogSummaries(),
      daily: getDailyChallengeSummary(),
    });
  }`,
);

if (!s.includes("mode === 'daily'")) {
  s = s.replace(
    `    if (mode === 'catalog') {`,
    `    if (mode === 'daily') {
      return getDailyChallenge().entry.level;
    }

    if (mode === 'catalog') {`,
  );
}

fs.writeFileSync(path, s);
console.log('puzzleHost patched ok');
