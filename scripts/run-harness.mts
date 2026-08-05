import { Scenario } from '../server/testHarness/scenario.js';
import { ScriptedDriver } from '../server/testHarness/inputDriver.js';

function parseArgs(args: string[]) {
  let seed = 12345;
  let ticks = 180;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--seed' && i + 1 < args.length) {
      seed = parseInt(args[++i], 10);
    } else if (arg === '--ticks' && i + 1 < args.length) {
      ticks = parseInt(args[++i], 10);
    }
  }

  return { seed, ticks };
}

const config = parseArgs(process.argv.slice(2));

console.log(`[Run Harness] Starting scenario run (seed: ${config.seed}, ticks: ${config.ticks})...`);

const scenario = new Scenario({
  seed: config.seed,
  drivers: {
    p1: new ScriptedDriver({ 10: { actions: ['hardDrop'] } }),
    p2: new ScriptedDriver({ 20: { actions: ['rotateCW'] } }),
  },
});

const report = scenario.advance(config.ticks);

console.log(`[Run Harness] Finished run: finalTick=${report.finalTick}, status=${report.status}, winner=${report.winnerId}`);
console.log('Metrics:', JSON.stringify(report.metrics, null, 2));
