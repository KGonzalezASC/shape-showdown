import puppeteer, { type Page } from 'puppeteer';

const ORIGIN = process.env.LAYOUT_TRACE_ORIGIN ?? 'http://localhost:3000';

function collectGeometry() {
  const canvases = [...document.querySelectorAll('canvas')].map((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      id: canvas.closest('[id]')?.id ?? canvas.getAttribute('class') ?? 'canvas',
      css: [Math.round(rect.width), Math.round(rect.height)] as [number, number],
      backing: [canvas.width, canvas.height] as [number, number],
    };
  });
  const full = canvases
    .filter((entry) => entry.css[0] >= 200)
    .map((entry) => entry.css);
  const mini = canvases
    .filter((entry) => entry.css[0] > 0 && entry.css[0] < 200)
    .map((entry) => entry.css);
  const rail = document.querySelector<HTMLElement>('.shop-utility-rail');
  const screen = document.querySelector<HTMLElement>('.shape-showdown-screen');
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    full,
    mini,
    canvasCount: canvases.length,
    canvases,
    rail: rail
      ? {
        client: [rail.clientWidth, rail.clientHeight],
        scroll: [rail.scrollWidth, rail.scrollHeight],
      }
      : null,
    documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    screenWidth: screen ? Math.round(screen.getBoundingClientRect().width) : null,
    connected: !document.body.innerText.includes('Connecting to Game Server'),
  };
}

async function waitForPlayfield(page: Page) {
  await page.waitForFunction(() => {
    const text = document.body.innerText.toLowerCase();
    return text.includes('your field')
      || text.includes('waiting for opponent')
      || text.includes('searching')
      || text.includes('connecting to game server');
  }, { timeout: 20000 });
}

async function settle(page: Page, ms = 120) {
  await page.evaluate((delay) => new Promise((resolve) => {
    window.setTimeout(resolve, delay);
  }), ms);
}

async function traceCrossing(page: Page, widths: number[], height: number) {
  const frames: unknown[] = [];
  await page.evaluate(() => {
    (window as unknown as { __layoutTrace?: unknown[] }).__layoutTrace = [];
  });
  for (const width of widths) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluate(() => new Promise<void>((resolve) => {
      const traces = (window as unknown as { __layoutTrace: unknown[] }).__layoutTrace;
      let remaining = 8;
      const finish = () => resolve();
      const sample = () => {
        const canvases = [...document.querySelectorAll('canvas')].map((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return [Math.round(rect.width), Math.round(rect.height)] as [number, number];
        });
        traces.push({
          width: window.innerWidth,
          full: canvases.filter((size) => size[0] >= 200),
          mini: canvases.filter((size) => size[0] > 0 && size[0] < 200),
        });
        remaining -= 1;
        if (remaining <= 0) {
          finish();
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      window.setTimeout(finish, 120);
    }));
    frames.push({
      settled: await page.evaluate(collectGeometry),
      crossing: await page.evaluate(() => (window as unknown as { __layoutTrace: unknown[] }).__layoutTrace.splice(0)),
    });
  }
  return frames;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page1 = await browser.newPage();
  const page2 = await browser.newPage();
  await page1.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page2.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page1.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page2.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page1.bringToFront();
  await waitForPlayfield(page1);
  await waitForPlayfield(page2);
  await settle(page1, 2500);
  console.error('playfield ready', await page1.evaluate(() => document.body.innerText.slice(0, 120)));

  const baseline = {
    '1280x800': await page1.evaluate(collectGeometry),
  };

  const crossing901 = await traceCrossing(page1, [902, 901, 900, 901, 902, 900], 800);
  const crossing661 = await traceCrossing(page1, [662, 661, 660, 659], 800);
  const narrow = await traceCrossing(page1, [430], 800);
  const short = await traceCrossing(page1, [900], 560);

  console.log(JSON.stringify({
    origin: ORIGIN,
    baseline,
    crossing901,
    crossing661,
    narrow,
    short,
  }, null, 2));

  await browser.close();
}

await main();
