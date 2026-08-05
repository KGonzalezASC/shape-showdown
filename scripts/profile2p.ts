import puppeteer from 'puppeteer';

async function run2PlayerProfiling() {
  console.log('Launching browser for 2-player profiling session...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page1 = await browser.newPage();
  const page2 = await browser.newPage();

  // Set viewport to standard desktop resolution
  await page1.setViewport({ width: 1280, height: 800 });
  await page2.setViewport({ width: 1280, height: 800 });

  console.log('Connecting Player 1 to http://localhost:3000/?profile=1&profileBoard=1...');
  await page1.goto('http://localhost:3000/?profile=1&profileBoard=1');

  console.log('Connecting Player 2 to http://localhost:3000/?profile=1&profileBoard=1...');
  await page2.goto('http://localhost:3000/?profile=1&profileBoard=1');

  console.log('Waiting for players to connect and match countdown to finish...');
  await new Promise((r) => setTimeout(r, 4000));

  // Focus and press F6 to activate Drill Console mode (continuous falling pieces & gameplay)
  await page1.bringToFront();
  await page1.keyboard.press('F6');
  await page2.bringToFront();
  await page2.keyboard.press('F6');

  console.log('Allowing 5 seconds of active 2-player gameplay with falling pieces, canvas, and animations...');
  await new Promise((r) => setTimeout(r, 5000));

  console.log('Executing performance diagnostic suite on Player 1...');
  const reportJson = await page1.evaluate(async () => {
    // @ts-ignore
    if (window.__shapeShowdownPerf && typeof window.runAutoProfileSuite === 'function') {
      // @ts-ignore
      return await window.runAutoProfileSuite();
    }
    // @ts-ignore
    const perf = window.__shapeShowdownPerf;
    if (!perf) return null;

    const res = {};
    res['baseline'] = perf.snapshot();

    perf.applyAllDisabled();
    await new Promise((r) => setTimeout(r, 800));
    res['allDisabled'] = perf.snapshot();

    perf.reset();
    perf.toggleAnimations(true);
    await new Promise((r) => setTimeout(r, 800));
    res['animationsDisabled'] = perf.snapshot();

    perf.reset();
    perf.toggleBlurs(true);
    await new Promise((r) => setTimeout(r, 800));
    res['blursDisabled'] = perf.snapshot();

    perf.reset();
    perf.toggleGlows(true);
    await new Promise((r) => setTimeout(r, 800));
    res['glowsDisabled'] = perf.snapshot();

    perf.reset();
    perf.toggleCanvasOverlays(true);
    await new Promise((r) => setTimeout(r, 800));
    res['canvasOverlaysDisabled'] = perf.snapshot();

    perf.reset();
    return res;
  });

  console.log('\n================ PERF DIAGNOSTIC REPORT ================');
  console.log(JSON.stringify(reportJson, null, 2));
  console.log('========================================================\n');

  await browser.close();
}

run2PlayerProfiling().catch(console.error);
