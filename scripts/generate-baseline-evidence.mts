import fs from 'node:fs';
import path from 'node:path';
import { runBotQuality, runItemImpact } from '../server/testHarness/experimentRunners.js';

console.log('[Baseline Evidence] Recording baseline bot quality and item impact evidence...');

const botQualityReport = runBotQuality({
  runs: 15,
  seconds: 120,
  policyId: 'rulesBot-v1',
  observationMode: 'player-limited',
  enableGarbage: false,
});

const curtainImpactReport = runItemImpact({
  runs: 15,
  seconds: 120,
  targetItemId: 'frost-shift',
  costPolicy: 'reference-price',
  policyId: 'rulesBot-v1',
  observationMode: 'player-limited',
  enableGarbage: false,
});

const poisonImpactReport = runItemImpact({
  runs: 15,
  seconds: 120,
  targetItemId: 'elixir-pulse',
  costPolicy: 'reference-price',
  policyId: 'rulesBot-v1',
  observationMode: 'player-limited',
  enableGarbage: false,
});

const summaryDoc = [
  '# Baseline Simulation Evidence Report',
  '',
  `> **Evidence Type: ${botQualityReport.evidenceType}**`,
  '> *Baseline benchmark recorded prior to bot policy or pricing matrix changes.*',
  '',
  '## 1. Baseline Bot Quality (RulesBot v1)',
  '',
  `| Metric | Value |`,
  `| --- | --- |`,
  `| Policy ID | ${botQualityReport.policyId} |`,
  `| Observation Mode | ${botQualityReport.observationMode} |`,
  `| Simulation Runs | ${botQualityReport.runCount} (${botQualityReport.durationSeconds}s each) |`,
  `| Survival Rate | ${(botQualityReport.survivalRate * 100).toFixed(1)}% |`,
  `| Avg Score | ${botQualityReport.avgScore} |`,
  `| Avg Lines Cleared | ${botQualityReport.avgLinesCleared} |`,
  `| Avg Holes | ${botQualityReport.avgHoles} |`,
  `| Avg Cavity Depth | ${botQualityReport.avgCavityDepth} |`,
  `| Avg Deepest Cavity | ${botQualityReport.avgDeepestCavity} |`,
  `| Avg Aggregate Height | ${botQualityReport.avgAggregateHeight} |`,
  `| Avg Bumpiness | ${botQualityReport.avgBumpiness} |`,
  '',
  '## 2. Baseline Item Impact (Curtain / Frost-Shift)',
  '',
  `| Metric | Value |`,
  `| --- | --- |`,
  `| Matched Seed Cases | ${curtainImpactReport.matchedCasesCount} |`,
  `| Cost Policy | ${curtainImpactReport.costPolicy} |`,
  `| Avg Direct Recipient Holes Delta | ${curtainImpactReport.avgDirectRecipientHolesDelta} |`,
  `| Avg Direct Recipient Height Delta | ${curtainImpactReport.avgDirectRecipientHeightDelta} |`,
  `| Avg Buyer Score Delta | ${curtainImpactReport.avgBuyerScoreDelta} |`,
  `| Avg Buyer Survival Delta (ticks) | ${curtainImpactReport.avgBuyerSurvivalDelta} |`,
  `| Avg Economic Cost (spent) | ${curtainImpactReport.avgEconomicCost} |`,
  '',
  '## 3. Baseline Item Impact (Poison / Elixir-Pulse)',
  '',
  `| Metric | Value |`,
  `| --- | --- |`,
  `| Matched Seed Cases | ${poisonImpactReport.matchedCasesCount} |`,
  `| Cost Policy | ${poisonImpactReport.costPolicy} |`,
  `| Avg Direct Recipient Poison Cells Delta | ${poisonImpactReport.avgDirectRecipientPoisonDelta} |`,
  `| Avg Direct Recipient Holes Delta | ${poisonImpactReport.avgDirectRecipientHolesDelta} |`,
  `| Avg Direct Recipient Height Delta | ${poisonImpactReport.avgDirectRecipientHeightDelta} |`,
  `| Avg Buyer Score Delta | ${poisonImpactReport.avgBuyerScoreDelta} |`,
  `| Avg Economic Cost (spent) | ${poisonImpactReport.avgEconomicCost} |`,
  '',
].join('\n');

const outDir = path.resolve('docs/baseline');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const summaryPath = path.join(outDir, 'baseline-evidence.md');
fs.writeFileSync(summaryPath, summaryDoc, 'utf8');

console.log(`[Baseline Evidence] Written baseline evidence report to ${summaryPath}`);
