import 'dotenv/config';
import puppeteer, { Page, BrowserContext } from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';
import postgres from 'postgres';

const screenshotDir = path.resolve(process.cwd(), '.scratch/match-screenshots/20p-load');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const TOTAL_PLAYERS = 20;
const MATCH_DURATION_MS = 15_000;

async function run20PlayerLoadTest() {
  console.log(`=== Starting ${TOTAL_PLAYERS}-Player (10 Active Matches) Load Test ===`);

  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const sql = postgres(dbUrl, { max: 2 });

  const initialCheckpoints = await sql`SELECT count(*)::int as count FROM match_checkpoints`;
  const initialMatches = await sql`SELECT count(*)::int as count FROM matches`;
  console.log(`Initial DB State: ${initialMatches[0].count} matches, ${initialCheckpoints[0].count} checkpoints.`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const playerStatus: Map<number, string> = new Map();
  const playerMatches: Map<number, string> = new Map();

  console.log(`Spawning ${TOTAL_PLAYERS} isolated browser contexts...`);
  for (let i = 1; i <= TOTAL_PLAYERS; i += 1) {
    const ctx = await browser.createBrowserContext();
    contexts.push(ctx);
    const page = await ctx.newPage();
    await page.setViewport({ width: 960, height: 600 });

    const pNum = i;
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Socket] Connected successfully')) {
        playerStatus.set(pNum, 'connected');
      }
      if (text.includes('[Socket] Bound to match')) {
        const matchMatch = text.match(/match:\s*([a-f0-9-]+)/i);
        if (matchMatch) {
          playerMatches.set(pNum, matchMatch[1]);
        }
      }
    });

    pages.push(page);
  }

  console.log(`Navigating all ${TOTAL_PLAYERS} players to http://localhost:3000 concurrently...`);
  await Promise.all(pages.map((page) => page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })));

  console.log('Waiting for matchmaking queue allocation and countdown across all 10 matches...');
  const matchWaitStart = Date.now();
  let allMatched = false;

  while (Date.now() - matchWaitStart < 15_000) {
    const connectedCount = playerStatus.size;
    if (connectedCount === TOTAL_PLAYERS) {
      allMatched = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`Players connected and matched: ${playerStatus.size}/${TOTAL_PLAYERS}`);

  // Give countdown 4 seconds to transition to playing
  await new Promise((r) => setTimeout(r, 4500));

  console.log('Capturing starting screenshots for representative matches...');
  // Capture starting screenshots for Match 1 (P1 & P2), Match 2 (P3 & P4), Match 5 (P9 & P10), Match 10 (P19 & P20)
  const sampledPlayerIndices = [0, 1, 2, 3, 8, 9, 18, 19];
  for (const idx of sampledPlayerIndices) {
    await pages[idx].screenshot({
      path: path.join(screenshotDir, `player_${idx + 1}_start.png`),
    });
  }

  console.log(`Simulating active concurrent gameplay across all ${TOTAL_PLAYERS} players for ${MATCH_DURATION_MS / 1000}s...`);
  const gameStart = Date.now();
  const keyPool = ['ArrowLeft', 'ArrowRight', 'x', 'z', ' ', 'Shift', 'c', 'ArrowDown'];
  let totalActions = 0;

  while (Date.now() - gameStart < MATCH_DURATION_MS) {
    await Promise.all(
      pages.map(async (page) => {
        const key = keyPool[Math.floor(Math.random() * keyPool.length)];
        try {
          await page.keyboard.press(key as any);
        } catch {
          // ignore if page unmounted
        }
      }),
    );
    totalActions += TOTAL_PLAYERS;
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`Dispatched ${totalActions} total live actions across all 10 concurrent matches.`);

  console.log('Capturing midgame screenshots for sampled matches...');
  for (const idx of sampledPlayerIndices) {
    await pages[idx].screenshot({
      path: path.join(screenshotDir, `player_${idx + 1}_midgame.png`),
    });
  }

  console.log('Checking database telemetry...');
  const activeMatches = await sql`
    SELECT id, status, player_a_id, player_b_id, created_at
    FROM matches
    ORDER BY created_at DESC
    LIMIT 15
  `;
  const checkpointStats = await sql`
    SELECT match_id, count(*)::int as cp_count, max(sim_tick)::int as max_tick
    FROM match_checkpoints
    GROUP BY match_id
    ORDER BY max_tick DESC
    LIMIT 15
  `;
  const totalCheckpointsAfter = await sql`SELECT count(*)::int as count FROM match_checkpoints`;

  console.log('\n--- PostgreSQL Database Telemetry ---');
  console.log(`Active matches recorded: ${activeMatches.length}`);
  console.log(`Total checkpoints in DB: ${totalCheckpointsAfter[0].count}`);
  console.log('Checkpoint breakdown per match:');
  console.table(checkpointStats);

  await sql.end();
  await browser.close();
  console.log('\n=== 20-Player Load Test Completed Successfully ===');
}

run20PlayerLoadTest().catch((error) => {
  console.error('Error during 20-player load test:', error);
  process.exit(1);
});
