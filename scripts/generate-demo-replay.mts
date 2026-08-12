import fs from 'node:fs';
import path from 'node:path';
import { Scenario } from '../server/testHarness/scenario.js';
import { RulesBot } from '../server/testHarness/rulesBot.js';
import type { GameState, ReplayDataV2, ReplayKeyframe } from '../src/types.js';
import { PRICING_POLICY_VERSION } from '../src/shop/shopPricing.js';

console.log('[Replay Generator] Generating replay of improved RulesBot vs RulesBot match...');

const seed = 2000;
const p1Bot = new RulesBot({ mode: 'omniscient' });
const p2Bot = new RulesBot({ mode: 'omniscient' });

const scenario = new Scenario({
  seed,
  playerIds: ['p1', 'p2'],
  drivers: {
    p1: p1Bot,
    p2: p2Bot,
  },
  enableShop: true,
  enableGarbage: true,
});

const initialState: GameState = JSON.parse(JSON.stringify(scenario.getReport().gameState));
const keyframes: ReplayKeyframe[] = [];
const keyframeIntervalTicks = 10;

keyframes.push({
  tick: 0,
  players: JSON.parse(JSON.stringify(initialState.players)),
});

const maxTicks = 3600; // 60 seconds at 60Hz
for (let t = 1; t <= maxTicks; t++) {
  const currentReport = scenario.getReport();
  if (currentReport.status !== 'playing') break;

  scenario.advance(1);

  const updatedReport = scenario.getReport();
  if (t % keyframeIntervalTicks !== 0 && updatedReport.status === 'playing') continue;

  const updatedState = updatedReport.gameState;
  const decisionTraces: Record<string, any> = {};

  if (p1Bot.lastDecisionTrace) {
    decisionTraces.p1 = JSON.parse(JSON.stringify(p1Bot.lastDecisionTrace));
  }
  if (p2Bot.lastDecisionTrace) {
    decisionTraces.p2 = JSON.parse(JSON.stringify(p2Bot.lastDecisionTrace));
  }

  keyframes.push({
    tick: t,
    players: JSON.parse(JSON.stringify(updatedState.players)),
    decisionTraces: Object.keys(decisionTraces).length > 0 ? decisionTraces : undefined,
  });
}

const finalReport = scenario.getReport();

const replayData: ReplayDataV2 = {
  version: 2,
  date: new Date().toISOString().slice(0, 10),
  seed,
  pricingPolicyVersion: PRICING_POLICY_VERSION,
  playerSlots: { p1: 0, p2: 1 },
  keyframeIntervalTicks,
  initialState,
  inputs: [],
  keyframes,
  events: finalReport.events,
};

const outDir = path.resolve('fixtures/replays');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const replayPath = path.join(outDir, 'improved_rulesbot_demo.json');
fs.writeFileSync(replayPath, JSON.stringify(replayData, null, 2), 'utf8');

console.log(`[Replay Generator] Successfully wrote demo replay (${keyframes.length} frames, final tick: ${finalReport.finalTick}, winner: ${finalReport.winnerId}) to ${replayPath}`);
