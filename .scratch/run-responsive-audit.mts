import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Keithythefrog/.gemini/antigravity-ide/brain/0a16ad3b-6ac8-4d6c-a502-8d097e582c12';

interface AuditProfile {
  name: string;
  width: number;
  height: number;
  hasTouch: boolean;
  isMobile: boolean;
  touchControls: boolean;
  state: 'gameplay' | 'catalog';
}

const PROFILES: AuditProfile[] = [
  {
    name: '01_compact_phone_320x568',
    width: 320,
    height: 568,
    hasTouch: true,
    isMobile: true,
    touchControls: true,
    state: 'gameplay',
  },
  {
    name: '02_iphone_se_375x667',
    width: 375,
    height: 667,
    hasTouch: true,
    isMobile: true,
    touchControls: true,
    state: 'gameplay',
  },
  {
    name: '03_modern_phone_390x844',
    width: 390,
    height: 844,
    hasTouch: true,
    isMobile: true,
    touchControls: true,
    state: 'gameplay',
  },
  {
    name: '04_large_android_412x915',
    width: 412,
    height: 915,
    hasTouch: true,
    isMobile: true,
    touchControls: true,
    state: 'gameplay',
  },
  {
    name: '05_tablet_portrait_touch_on_768x1024',
    width: 768,
    height: 1024,
    hasTouch: true,
    isMobile: true,
    touchControls: true,
    state: 'gameplay',
  },
  {
    name: '06_tablet_portrait_touch_off_768x1024',
    width: 768,
    height: 1024,
    hasTouch: false,
    isMobile: false,
    touchControls: false,
    state: 'gameplay',
  },
  {
    name: '07_tablet_landscape_1024x768',
    width: 1024,
    height: 768,
    hasTouch: false,
    isMobile: false,
    touchControls: false,
    state: 'gameplay',
  },
  {
    name: '08_desktop_standard_1440x900',
    width: 1440,
    height: 900,
    hasTouch: false,
    isMobile: false,
    touchControls: false,
    state: 'gameplay',
  },
  {
    name: '09_desktop_short_1024x600',
    width: 1024,
    height: 600,
    hasTouch: false,
    isMobile: false,
    touchControls: false,
    state: 'gameplay',
  },
  {
    name: '10_catalog_mobile_375x667',
    width: 375,
    height: 667,
    hasTouch: true,
    isMobile: true,
    touchControls: false,
    state: 'catalog',
  },
  {
    name: '11_catalog_desktop_1440x900',
    width: 1440,
    height: 900,
    hasTouch: false,
    isMobile: false,
    touchControls: false,
    state: 'catalog',
  },
];

async function main() {
  console.log('Launching headless browser via Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results: Array<{
    profile: string;
    viewport: string;
    touch: boolean;
    scrollX: number;
    scrollY: number;
    docWidth: number;
    docHeight: number;
    boardBox?: { width: number; height: number; cellSize: number };
    controlsBox?: { top: number; bottom: number; height: number };
    screenshotPath: string;
    passed: boolean;
  }> = [];

  for (const p of PROFILES) {
    console.log(`Auditing ${p.name} (${p.width}x${p.height}, touch: ${p.touchControls})...`);
    const page = await browser.newPage();
    await page.setViewport({
      width: p.width,
      height: p.height,
      hasTouch: p.hasTouch,
      isMobile: p.isMobile,
    });

    // Set touch controls preference before navigation
    await page.evaluateOnNewDocument((touchPref) => {
      localStorage.setItem('puzzleTouchControls', String(touchPref));
    }, p.touchControls);

    await page.goto('http://localhost:3000/#puzzles', { waitUntil: 'networkidle0' });

    if (p.state === 'gameplay') {
      // Click level 1 or Today's challenge if on catalog
      await page.waitForSelector('button', { timeout: 5000 });
      const started = await page.evaluate(() => {
        // Try clicking Today's challenge or level 1
        const buttons = Array.from(document.querySelectorAll('button'));
        const levelBtn = buttons.find((b) => b.textContent?.includes("Today's Challenge") || b.textContent?.includes('Jstris:'));
        if (levelBtn) {
          levelBtn.click();
          return true;
        }
        return false;
      });

      // Wait for playfield to mount
      await page.waitForFunction(() => document.querySelector('.game-board-shell') !== null, {
        timeout: 5000,
      });
      // Allow ResizeObserver and layout to settle
      await new Promise((resolve) => setTimeout(resolve, 600));
    } else {
      // Allow catalog view to settle
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    // Measure metrics
    const metrics = await page.evaluate((isGameplay, checkControls) => {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const docWidth = document.documentElement.scrollWidth;
      const docHeight = document.documentElement.scrollHeight;
      const clientWidth = document.documentElement.clientWidth;
      const clientHeight = document.documentElement.clientHeight;

      let boardInfo: { width: number; height: number; cellSize: number } | undefined;
      const board = document.querySelector('.game-board-shell');
      if (board) {
        const rect = board.getBoundingClientRect();
        boardInfo = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          cellSize: Math.round(rect.width / 10),
        };
      }

      let controlsInfo: { top: number; bottom: number; height: number } | undefined;
      if (checkControls) {
        // Find mobile controls container
        const buttons = Array.from(document.querySelectorAll('button'));
        const dropBtn = buttons.find((b) => b.getAttribute('aria-label')?.includes('Hard drop') || b.textContent?.includes('↑'));
        if (dropBtn) {
          const parent = dropBtn.closest('.ss-mobile-controls, [aria-label="Touch controls"]') || dropBtn.parentElement?.parentElement;
          if (parent) {
            const rect = parent.getBoundingClientRect();
            controlsInfo = {
              top: Math.round(rect.top),
              bottom: Math.round(rect.bottom),
              height: Math.round(rect.height),
            };
          }
        }
      }

      return {
        scrollX,
        scrollY,
        docWidth,
        docHeight,
        clientWidth,
        clientHeight,
        boardInfo,
        controlsInfo,
      };
    }, p.state === 'gameplay', p.touchControls);

    const screenshotName = `audit_${p.name}.png`;
    const screenshotPath = path.join(ARTIFACT_DIR, screenshotName);
    await page.screenshot({ path: screenshotPath });

    const passed =
      (p.state === 'gameplay'
        ? metrics.scrollY === 0 &&
          metrics.docHeight <= p.height &&
          (!p.touchControls || (metrics.controlsInfo && metrics.controlsInfo.bottom <= p.height + 2))
        : metrics.scrollX === 0);

    results.push({
      profile: p.name,
      viewport: `${p.width}x${p.height}`,
      touch: p.touchControls,
      scrollX: metrics.scrollX,
      scrollY: metrics.scrollY,
      docWidth: metrics.docWidth,
      docHeight: metrics.docHeight,
      boardBox: metrics.boardInfo,
      controlsBox: metrics.controlsInfo,
      screenshotPath,
      passed,
    });

    await page.close();
  }

  await browser.close();

  console.log('\n--- AUDIT RESULTS TABLE ---');
  console.table(
    results.map((r) => ({
      profile: r.profile,
      viewport: r.viewport,
      touch: r.touch ? 'ON' : 'OFF',
      scrollY: r.scrollY,
      docHeight: r.docHeight,
      cellSize: r.boardBox?.cellSize ?? 'N/A',
      controlsBottom: r.controlsBox?.bottom ?? 'N/A',
      pass: r.passed ? 'PASS' : 'FAIL',
    })),
  );

  const allPassed = results.every((r) => r.passed);
  console.log(`\nAll profiles passed: ${allPassed}`);
  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
