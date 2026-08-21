import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';

const screenshotDir = path.resolve(process.cwd(), '.scratch/match-screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function runLiveMatch() {
  console.log('=== Starting 2-Player Live Browser Match ===');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context1 = await browser.createBrowserContext();
  const context2 = await browser.createBrowserContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  await page1.setViewport({ width: 1280, height: 800 });
  await page2.setViewport({ width: 1280, height: 800 });

  page1.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[Socket]') || text.includes('error') || text.includes('match')) {
      console.log(`[Browser P1] ${text}`);
    }
  });

  page2.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[Socket]') || text.includes('error') || text.includes('match')) {
      console.log(`[Browser P2] ${text}`);
    }
  });

  console.log('Opening Player 1 at http://localhost:3000 ...');
  await page1.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });

  console.log('Opening Player 2 at http://localhost:3000 ...');
  await page2.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });

  console.log('Waiting for players to match and countdown to complete...');
  // Wait for countdown and active playing state
  await new Promise((r) => setTimeout(r, 4500));

  // Take screenshot at start of match
  await page1.screenshot({ path: path.join(screenshotDir, 'player1_start.png') });
  await page2.screenshot({ path: path.join(screenshotDir, 'player2_start.png') });
  console.log('Captured starting match screenshots.');

  console.log('Simulating 15 seconds of active gameplay between Player 1 and Player 2...');
  const startTime = Date.now();
  const durationMs = 15_000;

  const keyActions = ['ArrowLeft', 'ArrowRight', 'x', 'z', ' ', 'Shift', 'c'];

  let actionCount = 0;
  while (Date.now() - startTime < durationMs) {
    // Player 1 input
    const p1Key = keyActions[Math.floor(Math.random() * keyActions.length)];
    await page1.keyboard.press(p1Key as any);

    // Player 2 input
    const p2Key = keyActions[Math.floor(Math.random() * keyActions.length)];
    await page2.keyboard.press(p2Key as any);

    actionCount += 2;
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`Dispatched ${actionCount} gameplay actions across both clients.`);

  // Capture in-game action screenshots
  await page1.screenshot({ path: path.join(screenshotDir, 'player1_midgame.png') });
  await page2.screenshot({ path: path.join(screenshotDir, 'player2_midgame.png') });
  console.log('Captured midgame match screenshots.');

  console.log('=== Live Match Completed Successfully ===');
  await browser.close();
}

runLiveMatch().catch((error) => {
  console.error('Error during live browser match:', error);
  process.exit(1);
});
