import type { ExperimentTraceResult } from './experimentTrace.js';

export interface EconomyPricingReport {
  evidenceType: 'deterministic in-process simulation';
  label: string;
  disclaimer: string;
  markdown: string;
  summary: {
    runs: number;
    survivalRate: number;
    medianFunds: number;
    maxFunds: number;
    avgSpending: number;
    avgNetWalletChange: number;
  };
}

export function generatePricingReport(
  result: ExperimentTraceResult,
  title = 'Power-Up Economy & Pricing Report',
): EconomyPricingReport {
  const label = 'Evidence Type: deterministic in-process simulation';
  const disclaimer =
    'PROVISIONAL CANDIDATE EVIDENCE ONLY: Pricing recommendations are derived projections requiring live playtest and transport validation.';

  const mdLines: string[] = [
    `# ${title}`,
    '',
    `> **${label}**`,
    `> *${disclaimer}*`,
    '',
    '## Executive Summary',
    '',
    `| Metric | Result |`,
    `| --- | --- |`,
    `| Simulation Runs | ${result.runCount} |`,
    `| Match Duration | ${result.config.seconds} seconds (${result.config.seconds * 60} ticks) |`,
    `| Survival Rate | ${(result.survivalRate * 100).toFixed(1)}% |`,
    `| Avg Gross Score | ${result.avgGrossScore} |`,
    `| Avg Shop Spending | ${result.avgSpending} |`,
    `| Avg Net Wallet Change | ${result.avgNetWalletChange} |`,
    `| Median Available Funds | ${result.medianAvailableFunds} |`,
    `| Max Available Funds | ${result.maxAvailableFunds} |`,
    `| Avg Lines Cleared | ${result.avgLinesCleared} |`,
    `| Avg Purchases / Match | ${result.avgPurchases} |`,
    '',
    '## Per-Run Trace Breakdown',
    '',
    '| Run | Seed | Ticks | Topped Out | Gross Score | Spending | Max Funds | Lines | Purchases |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  result.runs.forEach((r, idx) => {
    mdLines.push(
      `| #${idx + 1} | ${r.seed} | ${r.survivalTick} | ${r.toppedOut ? 'Yes' : 'No'} | ${r.grossScore} | ${r.spending} | ${r.availableFundsMax} | ${r.linesCleared} | ${r.purchaseCount} |`,
    );
  });

  mdLines.push('');

  return {
    evidenceType: 'deterministic in-process simulation',
    label,
    disclaimer,
    markdown: mdLines.join('\n'),
    summary: {
      runs: result.runCount,
      survivalRate: result.survivalRate,
      medianFunds: result.medianAvailableFunds,
      maxFunds: result.maxAvailableFunds,
      avgSpending: result.avgSpending,
      avgNetWalletChange: result.avgNetWalletChange,
    },
  };
}
