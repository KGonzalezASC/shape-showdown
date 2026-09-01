import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';

const REPO = String.raw`C:\Users\Keithythefrog\source\BubbleBlitzers`;
const BIN = process.env.PROOF_BIN;
if (!BIN) throw new Error('PROOF_BIN required');
const PROFILE = process.env.PROOF_PROFILE || path.join(REPO, '.scratch', 'playtest-profiles', 'puzzle-proof');
const OUT = process.env.PROOF_OUT || path.join(REPO, '.scratch', 'puzzle-browser-proof');
const BASE = process.env.PROOF_URL || 'http://localhost:3000/';
const CAP_MS = Number(process.env.PROOF_CAP_MS || 180000);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });
const steps = [];
const report = { startedAt: new Date().toISOString(), bin: BIN, profile: PROFILE, out: OUT, base: BASE, steps, screenshots: {}, terminal: null, errors: [] };
function note(step, ok, detail) { steps.push({ step, ok, detail, at: new Date().toISOString() }); console.log('[' + (ok ? 'OK' : 'FAIL') + '] ' + step + (detail ? ' — ' + detail : '')); }
async function shot(page, name) { const file = path.join(OUT, name + '.png'); await page.screenshot({ path: file, fullPage: false }); report.screenshots[name] = file; console.log('[SHOT]', file); return file; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  if (!fs.existsSync(BIN)) throw new Error('binary missing: ' + BIN);
  console.log('Launching headed browser', { BIN, PROFILE, OUT });
  const browser = await puppeteer.launch({ executablePath: BIN, headless: false, userDataDir: PROFILE, defaultViewport: { width: 1440, height: 900 }, args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900', '--window-position=60,40'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (err) => { report.errors.push('pageerror: ' + err.message); console.log('[pageerror]', err.message); });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href="#puzzles"]', { timeout: 20000 });
    await sleep(800);
    await shot(page, '01-landing');
    note('1-landing', true, BASE);
    const puzzlesLink = await page.$('a[href="#puzzles"]');
    if (!puzzlesLink) throw new Error('Puzzles link not found');
    await puzzlesLink.click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((b) => /Random curated/i.test(b.textContent || '')), { timeout: 20000 });
    await sleep(600);
    await shot(page, '02-puzzles-picker');
    note('2-puzzles-picker', true, 'Random curated visible');
    const clicked = await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find((b) => /Random curated/i.test(b.textContent || '')); if (!btn) return false; btn.click(); return true; });
    if (!clicked) throw new Error('Random curated button not clickable');
    note('3-random-curated', true);
    await page.waitForFunction(() => { const body = document.body?.innerText || ''; return /Loading puzzle|Connecting|Puzzle|Upcoming|lines/i.test(body) || !!document.querySelector('canvas'); }, { timeout: 20000 });
    await sleep(1500);
    await shot(page, '03-gameplay-start');
    note('4-gameplay-start', true);
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'x', 'z', ' ', 'c', 'Shift'];
    const start = Date.now(); let midTaken = false; let terminal = null;
    while (Date.now() - start < CAP_MS) {
      const status = await page.evaluate(() => { const text = document.body?.innerText || ''; if (/Solved!/i.test(text)) return { done: true, result: 'Solved!', text: text.slice(0, 500) }; if (/Top Out/i.test(text)) return { done: true, result: 'Top Out', text: text.slice(0, 500) }; if (/Session Ended/i.test(text)) return { done: true, result: 'Session Ended', text: text.slice(0, 500) }; return { done: false, result: '', text: '' }; });
      if (status.done) { terminal = { result: status.result, text: status.text }; break; }
      await page.bringToFront();
      try { await page.keyboard.press(keys[Math.floor(Math.random() * keys.length)]); } catch {}
      if (!midTaken && Date.now() - start > 12000) { await shot(page, '04-gameplay-mid'); midTaken = true; note('5-gameplay-mid', true); }
      await sleep(90 + Math.floor(Math.random() * 80));
    }
    if (!midTaken) { await shot(page, '04-gameplay-mid'); note('5-gameplay-mid', true, 'late mid shot'); }
    if (!terminal) { terminal = await page.evaluate(() => { const text = document.body?.innerText || ''; if (/Solved!/i.test(text)) return { result: 'Solved!', text: text.slice(0, 500) }; if (/Top Out/i.test(text)) return { result: 'Top Out', text: text.slice(0, 500) }; if (/Session Ended/i.test(text)) return { result: 'Session Ended', text: text.slice(0, 500) }; return { result: 'TIMEOUT', text: text.slice(0, 500) }; }); }
    report.terminal = terminal;
    await sleep(400);
    await shot(page, '05-terminal');
    note('6-terminal', terminal.result === 'Solved!' || terminal.result === 'Top Out', terminal.result);
    report.finishedAt = new Date().toISOString();
    report.elapsedMs = Date.now() - Date.parse(String(report.startedAt));
    const reportPath = path.join(OUT, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('[REPORT]', reportPath);
    console.log(JSON.stringify({ terminal, steps }, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report.errors.push(msg); note('fatal', false, msg);
    try { await shot(page, '05-terminal'); } catch {}
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    throw err;
  } finally { await browser.close().catch(() => undefined); }
}
main().catch((err) => { console.error(err); process.exit(1); });
