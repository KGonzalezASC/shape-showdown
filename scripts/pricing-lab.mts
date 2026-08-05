import fs from 'node:fs';
import path from 'node:path';
import { runExperimentTrace } from '../server/testHarness/experimentTrace.js';
import { generatePricingReport } from '../server/testHarness/economyPricing.js';

function parseArgs(args: string[]) {
  let runs = 10;
  let seconds = 120;
  let phases = 12;
  let markdown = false;
  let outPath: string | null = null;
  let target = 'frost-shift';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--runs' && i + 1 < args.length) {
      runs = parseInt(args[++i], 10);
    } else if (arg === '--seconds' && i + 1 < args.length) {
      seconds = parseInt(args[++i], 10);
    } else if (arg === '--phases' && i + 1 < args.length) {
      phases = parseInt(args[++i], 10);
    } else if (arg === '--markdown') {
      markdown = true;
    } else if (arg === '--out' && i + 1 < args.length) {
      outPath = args[++i];
    } else if (arg === '--target' && i + 1 < args.length) {
      target = args[++i];
    }
  }

  return { runs, seconds, phases, markdown, outPath, target };
}

const config = parseArgs(process.argv.slice(2));
console.log(`[Pricing Lab] Running ${config.runs} simulations (${config.seconds}s duration, target: ${config.target})...`);

const traceResult = runExperimentTrace({
  runs: config.runs,
  seconds: config.seconds,
  targetItemId: config.target,
});

const report = generatePricingReport(traceResult, `Pricing Lab Simulation (${config.target})`);

if (config.outPath) {
  const resolved = path.resolve(config.outPath);
  fs.writeFileSync(resolved, report.markdown, 'utf8');
  console.log(`[Pricing Lab] Report written to ${resolved}`);
} else {
  console.log(report.markdown);
}
