import { PairedRunner, createSimpleShopPolicy, type BotShopPolicy } from './pairedRunner.js';
import { computePlayerPressure, type BoardPressureMetrics } from './boardPressure.js';

export interface ExperimentRunMetrics {
  seed: number;
  durationTicks: number;
  survivalTick: number;
  toppedOut: boolean;
  winnerId: string | null;
  grossScore: number;
  spending: number;
  netWalletChange: number;
  availableFundsMedian: number;
  availableFundsMax: number;
  linesCleared: number;
  pendingGarbageLines: number;
  purchaseCount: number;
  finalPressure: BoardPressureMetrics;
}

export interface ExperimentTraceConfig {
  runs: number;
  seconds: number;
  seeds?: number[];
  targetItemId?: string;
  enableGarbage?: boolean;
  shopPolicies?: Record<string, BotShopPolicy>;
}

export interface ExperimentTraceResult {
  evidenceType: 'deterministic in-process simulation';
  config: ExperimentTraceConfig;
  runCount: number;
  survivalRate: number;
  avgGrossScore: number;
  avgSpending: number;
  avgNetWalletChange: number;
  medianAvailableFunds: number;
  maxAvailableFunds: number;
  avgLinesCleared: number;
  avgPurchases: number;
  runs: ExperimentRunMetrics[];
}

function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function runExperimentTrace(config: ExperimentTraceConfig): ExperimentTraceResult {
  const runCount = Math.max(1, config.runs);
  const durationTicks = Math.max(1, Math.round(config.seconds * 60));
  const targetItem = config.targetItemId ?? 'frost-shift';

  const seeds = config.seeds ?? Array.from({ length: runCount }, (_, i) => 1000 + i * 17);

  const runMetricsList: ExperimentRunMetrics[] = [];

  for (let i = 0; i < runCount; i++) {
    const seed = seeds[i % seeds.length];
    const shopPolicies = config.shopPolicies ?? {
      p1: createSimpleShopPolicy(targetItem, 40),
      p2: createSimpleShopPolicy(targetItem, 40),
    };

    const runner = new PairedRunner({
      seed,
      enableShop: true,
      enableGarbage: config.enableGarbage ?? true,
      shopPolicies,
    });

    const report = runner.run(durationTicks);
    const p1State = report.scenarioReport.gameState.players.p1;
    const p1Metrics = report.metrics.p1;

    const p1Purchases = report.purchases.filter((p) => p.playerId === 'p1' && p.accepted);
    const totalSpending = p1Purchases.reduce((sum, purchase) => sum + (purchase.cost ?? 0), 0);
    const grossScore = p1Metrics.score + totalSpending;
    const netWalletChange = p1Metrics.score;
    const fundsSamples = [
      0,
      ...(report.walletHistory.p1 ?? []),
      p1Metrics.score,
    ];
    const availableFundsMax = Math.max(...fundsSamples);
    const availableFundsMedian = Math.round(calculateMedian(fundsSamples));

    const pressure = computePlayerPressure(p1State);

    runMetricsList.push({
      seed,
      durationTicks,
      survivalTick: report.ticks,
      toppedOut: p1Metrics.topOut,
      winnerId: report.winnerId,
      grossScore,
      spending: totalSpending,
      netWalletChange,
      availableFundsMedian,
      availableFundsMax,
      linesCleared: p1Metrics.linesCleared,
      pendingGarbageLines: p1Metrics.pendingGarbageLines,
      purchaseCount: p1Purchases.length,
      finalPressure: pressure,
    });
  }

  const survivals = runMetricsList.filter((r) => !r.toppedOut).length;
  const survivalRate = survivals / runCount;
  const avgGrossScore = Math.round(runMetricsList.reduce((sum, r) => sum + r.grossScore, 0) / runCount);
  const avgSpending = Math.round(runMetricsList.reduce((sum, r) => sum + r.spending, 0) / runCount);
  const avgNetWalletChange = Math.round(runMetricsList.reduce((sum, r) => sum + r.netWalletChange, 0) / runCount);
  const medianAvailableFunds = Math.round(calculateMedian(runMetricsList.map((r) => r.availableFundsMedian)));
  const maxAvailableFunds = Math.max(...runMetricsList.map((r) => r.availableFundsMax));
  const avgLinesCleared = Number((runMetricsList.reduce((sum, r) => sum + r.linesCleared, 0) / runCount).toFixed(1));
  const avgPurchases = Number((runMetricsList.reduce((sum, r) => sum + r.purchaseCount, 0) / runCount).toFixed(1));

  return {
    evidenceType: 'deterministic in-process simulation',
    config,
    runCount,
    survivalRate,
    avgGrossScore,
    avgSpending,
    avgNetWalletChange,
    medianAvailableFunds,
    maxAvailableFunds,
    avgLinesCleared,
    avgPurchases,
    runs: runMetricsList,
  };
}
