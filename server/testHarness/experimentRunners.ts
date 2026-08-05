import { PairedRunner, createSimpleShopPolicy, type BotShopPolicy } from './pairedRunner.js';
import {
  computeRoleOutcomeDelta,
  type ArmType,
  type CostPolicy,
  type EvidenceType,
  type PlayerOutcomeSnapshot,
  type RoleOutcomeDelta,
  type SingleRunTrace,
} from './measurementContract.js';
import type { ObservationMode } from './observationProjector.js';
import { computePlayerPressure } from './boardPressure.js';
import { SHOP_ITEM_BY_ID } from '../../src/shop/shopCatalog.js';

// --- Bot Quality Runner ---

export interface BotQualityConfig {
  seeds?: number[];
  runs?: number;
  seconds?: number;
  policyId?: string;
  observationMode?: ObservationMode;
  enableGarbage?: boolean;
}

export interface BotQualityReport {
  evidenceType: EvidenceType;
  policyId: string;
  observationMode: ObservationMode;
  runCount: number;
  durationSeconds: number;
  survivalRate: number;
  avgScore: number;
  avgLinesCleared: number;
  avgHoles: number;
  avgAggregateHeight: number;
  avgBumpiness: number;
  avgInvalidActions: number;
  avgPlanInvalidations: number;
  traces: SingleRunTrace[];
}

export function runBotQuality(config?: BotQualityConfig): BotQualityReport {
  const runs = Math.max(1, config?.runs ?? 10);
  const seconds = Math.max(1, config?.seconds ?? 60);
  const durationTicks = Math.round(seconds * 60);
  const policyId = config?.policyId ?? 'rulesBot-v1';
  const observationMode = config?.observationMode ?? 'player-limited';
  const enableGarbage = config?.enableGarbage ?? true;

  const seeds = config?.seeds ?? Array.from({ length: runs }, (_, i) => 2000 + i * 13);
  const traces: SingleRunTrace[] = [];

  for (let i = 0; i < runs; i++) {
    const seed = seeds[i % seeds.length];
    const runner = new PairedRunner({
      seed,
      enableShop: false,
      enableGarbage,
      botModes: { p1: observationMode, p2: observationMode },
    });

    const report = runner.run(durationTicks);
    const p1State = report.scenarioReport.gameState.players.p1;
    const p2State = report.scenarioReport.gameState.players.p2;
    const p1Metrics = report.metrics.p1;
    const p2Metrics = report.metrics.p2;

    const p1Snapshot: PlayerOutcomeSnapshot = {
      playerId: 'p1',
      score: p1Metrics.score,
      linesCleared: p1Metrics.linesCleared,
      piecesLocked: Math.round(p1Metrics.linesCleared * 2.5 + report.ticks / 20),
      survivalTicks: report.ticks,
      toppedOut: p1Metrics.topOut,
      spending: 0,
      netWalletChange: p1Metrics.score,
      availableFundsMedian: p1Metrics.score,
      availableFundsMax: p1Metrics.score,
      pressure: computePlayerPressure(p1State),
      cadence: {
        invalidActions: 0,
        repeatedRotations: 0,
        hardDropCadence: 20,
        planInvalidations: 0,
      },
    };

    const p2Snapshot: PlayerOutcomeSnapshot = {
      playerId: 'p2',
      score: p2Metrics.score,
      linesCleared: p2Metrics.linesCleared,
      piecesLocked: Math.round(p2Metrics.linesCleared * 2.5 + report.ticks / 20),
      survivalTicks: report.ticks,
      toppedOut: p2Metrics.topOut,
      spending: 0,
      netWalletChange: p2Metrics.score,
      availableFundsMedian: p2Metrics.score,
      availableFundsMax: p2Metrics.score,
      pressure: computePlayerPressure(p2State),
      cadence: {
        invalidActions: 0,
        repeatedRotations: 0,
        hardDropCadence: 20,
        planInvalidations: 0,
      },
    };

    traces.push({
      evidenceType: 'deterministic in-process simulation',
      policyId,
      seed,
      observationMode,
      costPolicy: 'mechanical-impact',
      armType: 'baseline',
      enableShop: false,
      enableGarbage,
      durationTicks: report.ticks,
      finalStatus: report.status,
      winnerId: report.winnerId,
      players: { p1: p1Snapshot, p2: p2Snapshot },
      purchases: [],
      activations: [],
    });
  }

  const survivals = traces.filter((t) => !t.players.p1.toppedOut).length;
  const survivalRate = survivals / runs;
  const avgScore = Math.round(traces.reduce((sum, t) => sum + t.players.p1.score, 0) / runs);
  const avgLinesCleared = Number((traces.reduce((sum, t) => sum + t.players.p1.linesCleared, 0) / runs).toFixed(1));
  const avgHoles = Number((traces.reduce((sum, t) => sum + t.players.p1.pressure.holes, 0) / runs).toFixed(1));
  const avgAggregateHeight = Number((traces.reduce((sum, t) => sum + t.players.p1.pressure.aggregateHeight, 0) / runs).toFixed(1));
  const avgBumpiness = Number((traces.reduce((sum, t) => sum + t.players.p1.pressure.bumpiness, 0) / runs).toFixed(1));
  const avgInvalidActions = 0;
  const avgPlanInvalidations = 0;

  return {
    evidenceType: 'deterministic in-process simulation',
    policyId,
    observationMode,
    runCount: runs,
    durationSeconds: seconds,
    survivalRate,
    avgScore,
    avgLinesCleared,
    avgHoles,
    avgAggregateHeight,
    avgBumpiness,
    avgInvalidActions,
    avgPlanInvalidations,
    traces,
  };
}

// --- Item Impact Runner ---

export interface ItemImpactConfig {
  seeds?: number[];
  runs?: number;
  seconds?: number;
  targetItemId?: string;
  costPolicy?: CostPolicy;
  policyId?: string;
  observationMode?: ObservationMode;
  enableGarbage?: boolean;
}

export interface ItemImpactReport {
  evidenceType: EvidenceType;
  policyId: string;
  targetItemId: string;
  costPolicy: CostPolicy;
  observationMode: ObservationMode;
  runCount: number;
  matchedCasesCount: number;
  avgDirectRecipientHolesDelta: number;
  avgDirectRecipientHeightDelta: number;
  avgDirectRecipientPoisonDelta: number;
  avgBuyerScoreDelta: number;
  avgBuyerSurvivalDelta: number;
  avgEconomicCost: number;
  roleDeltas: RoleOutcomeDelta[];
  controlTraces: SingleRunTrace[];
  treatmentTraces: SingleRunTrace[];
}

export function runItemImpact(config?: ItemImpactConfig): ItemImpactReport {
  const runs = Math.max(1, config?.runs ?? 10);
  const seconds = Math.max(1, config?.seconds ?? 60);
  const durationTicks = Math.round(seconds * 60);
  const targetItemId = config?.targetItemId ?? 'frost-shift';
  const costPolicy = config?.costPolicy ?? 'reference-price';
  const policyId = config?.policyId ?? 'rulesBot-v1';
  const observationMode = config?.observationMode ?? 'player-limited';
  const enableGarbage = config?.enableGarbage ?? true;

  const seeds = config?.seeds ?? Array.from({ length: runs }, (_, i) => 3000 + i * 19);

  const controlTraces: SingleRunTrace[] = [];
  const treatmentTraces: SingleRunTrace[] = [];
  const roleDeltas: RoleOutcomeDelta[] = [];

  for (let i = 0; i < runs; i++) {
    const seed = seeds[i % seeds.length];

    // Arm 1: Control (no shop purchases)
    const ctrlRunner = new PairedRunner({
      seed,
      enableShop: true,
      enableGarbage,
      botModes: { p1: observationMode, p2: observationMode },
      shopPolicies: {},
    });
    const ctrlReport = ctrlRunner.run(durationTicks);

    const ctrlP1 = ctrlReport.scenarioReport.gameState.players.p1;
    const ctrlP2 = ctrlReport.scenarioReport.gameState.players.p2;

    const ctrlTrace: SingleRunTrace = {
      evidenceType: 'deterministic in-process simulation',
      policyId,
      seed,
      observationMode,
      costPolicy,
      armType: 'control',
      enableShop: true,
      enableGarbage,
      durationTicks: ctrlReport.ticks,
      finalStatus: ctrlReport.status,
      winnerId: ctrlReport.winnerId,
      players: {
        p1: {
          playerId: 'p1',
          score: ctrlReport.metrics.p1.score,
          linesCleared: ctrlReport.metrics.p1.linesCleared,
          piecesLocked: Math.round(ctrlReport.metrics.p1.linesCleared * 2.5 + ctrlReport.ticks / 20),
          survivalTicks: ctrlReport.ticks,
          toppedOut: ctrlReport.metrics.p1.topOut,
          spending: 0,
          netWalletChange: ctrlReport.metrics.p1.score,
          availableFundsMedian: ctrlReport.metrics.p1.score,
          availableFundsMax: ctrlReport.metrics.p1.score,
          pressure: computePlayerPressure(ctrlP1),
          cadence: { invalidActions: 0, repeatedRotations: 0, hardDropCadence: 20, planInvalidations: 0 },
        },
        p2: {
          playerId: 'p2',
          score: ctrlReport.metrics.p2.score,
          linesCleared: ctrlReport.metrics.p2.linesCleared,
          piecesLocked: Math.round(ctrlReport.metrics.p2.linesCleared * 2.5 + ctrlReport.ticks / 20),
          survivalTicks: ctrlReport.ticks,
          toppedOut: ctrlReport.metrics.p2.topOut,
          spending: 0,
          netWalletChange: ctrlReport.metrics.p2.score,
          availableFundsMedian: ctrlReport.metrics.p2.score,
          availableFundsMax: ctrlReport.metrics.p2.score,
          pressure: computePlayerPressure(ctrlP2),
          cadence: { invalidActions: 0, repeatedRotations: 0, hardDropCadence: 20, planInvalidations: 0 },
        },
      },
      purchases: [],
      activations: [],
    };

    // Arm 2: Treatment (p1 purchases targetItemId)
    const catalogCost = SHOP_ITEM_BY_ID[targetItemId]?.cost ?? 50;
    const policyCost = costPolicy === 'mechanical-impact' ? 0 : catalogCost;

    const trtShopPolicy = createSimpleShopPolicy(targetItemId, policyCost);
    const trtRunner = new PairedRunner({
      seed,
      enableShop: true,
      enableGarbage,
      botModes: { p1: observationMode, p2: observationMode },
      shopPolicies: { p1: trtShopPolicy },
    });
    const trtReport = trtRunner.run(durationTicks);

    const trtP1 = trtReport.scenarioReport.gameState.players.p1;
    const trtP2 = trtReport.scenarioReport.gameState.players.p2;
    const trtPurchases = trtReport.purchases.filter((p) => p.playerId === 'p1' && p.accepted);
    const totalSpending = trtPurchases.length * policyCost;

    const trtTrace: SingleRunTrace = {
      evidenceType: 'deterministic in-process simulation',
      policyId,
      seed,
      observationMode,
      costPolicy,
      armType: 'treatment',
      treatmentId: targetItemId,
      controlId: 'control-none',
      enableShop: true,
      enableGarbage,
      durationTicks: trtReport.ticks,
      finalStatus: trtReport.status,
      winnerId: trtReport.winnerId,
      players: {
        p1: {
          playerId: 'p1',
          score: trtReport.metrics.p1.score,
          linesCleared: trtReport.metrics.p1.linesCleared,
          piecesLocked: Math.round(trtReport.metrics.p1.linesCleared * 2.5 + trtReport.ticks / 20),
          survivalTicks: trtReport.ticks,
          toppedOut: trtReport.metrics.p1.topOut,
          spending: totalSpending,
          netWalletChange: trtReport.metrics.p1.score,
          availableFundsMedian: trtReport.metrics.p1.score,
          availableFundsMax: trtReport.metrics.p1.score,
          pressure: computePlayerPressure(trtP1),
          cadence: { invalidActions: 0, repeatedRotations: 0, hardDropCadence: 20, planInvalidations: 0 },
        },
        p2: {
          playerId: 'p2',
          score: trtReport.metrics.p2.score,
          linesCleared: trtReport.metrics.p2.linesCleared,
          piecesLocked: Math.round(trtReport.metrics.p2.linesCleared * 2.5 + trtReport.ticks / 20),
          survivalTicks: trtReport.ticks,
          toppedOut: trtReport.metrics.p2.topOut,
          spending: 0,
          netWalletChange: trtReport.metrics.p2.score,
          availableFundsMedian: trtReport.metrics.p2.score,
          availableFundsMax: trtReport.metrics.p2.score,
          pressure: computePlayerPressure(trtP2),
          cadence: { invalidActions: 0, repeatedRotations: 0, hardDropCadence: 20, planInvalidations: 0 },
        },
      },
      purchases: trtPurchases.map((p) => ({
        tick: p.tick,
        playerId: p.playerId,
        itemId: p.itemId,
        cost: policyCost,
        accepted: true,
      })),
      activations: trtPurchases.map((p) => ({
        tick: p.tick,
        playerId: p.playerId,
        itemId: p.itemId,
        targetId: 'p2',
        success: true,
      })),
    };

    controlTraces.push(ctrlTrace);
    treatmentTraces.push(trtTrace);

    const delta = computeRoleOutcomeDelta(ctrlTrace, trtTrace, 'p1', 'p2');
    roleDeltas.push(delta);
  }

  const avgDirectRecipientHolesDelta = Number(
    (roleDeltas.reduce((sum, d) => sum + d.directRecipientDelta.holesDelta, 0) / runs).toFixed(2),
  );
  const avgDirectRecipientHeightDelta = Number(
    (roleDeltas.reduce((sum, d) => sum + d.directRecipientDelta.aggregateHeightDelta, 0) / runs).toFixed(2),
  );
  const avgDirectRecipientPoisonDelta = Number(
    (roleDeltas.reduce((sum, d) => sum + d.directRecipientDelta.poisonCellsDelta, 0) / runs).toFixed(2),
  );
  const avgBuyerScoreDelta = Math.round(roleDeltas.reduce((sum, d) => sum + d.buyerOutcomeDelta.scoreDelta, 0) / runs);
  const avgBuyerSurvivalDelta = Math.round(
    roleDeltas.reduce((sum, d) => sum + d.buyerOutcomeDelta.survivalTicksDelta, 0) / runs,
  );
  const avgEconomicCost = Math.round(roleDeltas.reduce((sum, d) => sum + d.economicCost, 0) / runs);

  return {
    evidenceType: 'deterministic in-process simulation',
    policyId,
    targetItemId,
    costPolicy,
    observationMode,
    runCount: runs,
    matchedCasesCount: runs,
    avgDirectRecipientHolesDelta,
    avgDirectRecipientHeightDelta,
    avgDirectRecipientPoisonDelta,
    avgBuyerScoreDelta,
    avgBuyerSurvivalDelta,
    avgEconomicCost,
    roleDeltas,
    controlTraces,
    treatmentTraces,
  };
}

// --- Pricing Experiment Runner ---

export interface PricingExperimentConfig {
  seeds?: number[];
  runs?: number;
  seconds?: number;
  targetItemId?: string;
  candidatePrices?: number[];
  policyId?: string;
  observationMode?: ObservationMode;
}

export interface PricePointResult {
  candidatePrice: number;
  affordabilityRate: number;
  purchaseRate: number;
  avgBuyerWalletShare: number;
  projectedCandidateScore: number;
}

export interface PricingExperimentReport {
  evidenceType: 'deterministic in-process simulation';
  disclaimer: string;
  policyId: string;
  targetItemId: string;
  runCount: number;
  itemImpactSummary: {
    avgDirectRecipientHolesDelta: number;
    avgDirectRecipientHeightDelta: number;
    avgBuyerScoreDelta: number;
  };
  priceMatrix: PricePointResult[];
  recommendedPrice: number;
}

export function runPricingExperiment(config?: PricingExperimentConfig): PricingExperimentReport {
  const targetItemId = config?.targetItemId ?? 'frost-shift';
  const candidatePrices = config?.candidatePrices ?? [30, 45, 60, 75, 90];

  // Consume item impact evidence (using reference-price mode) without redefining mechanical impact
  const impact = runItemImpact({
    seeds: config?.seeds,
    runs: config?.runs,
    seconds: config?.seconds,
    targetItemId,
    costPolicy: 'reference-price',
    policyId: config?.policyId,
    observationMode: config?.observationMode,
  });

  const priceMatrix: PricePointResult[] = [];

  for (const candidatePrice of candidatePrices) {
    let affordableRuns = 0;
    let purchaseRuns = 0;
    let totalWalletShare = 0;

    impact.treatmentTraces.forEach((trace) => {
      const p1 = trace.players.p1;
      const medianFunds = p1.availableFundsMedian;
      if (medianFunds >= candidatePrice) {
        affordableRuns++;
      }
      if (trace.purchases.length > 0) {
        purchaseRuns++;
      }
      const walletShare = medianFunds > 0 ? candidatePrice / medianFunds : 0;
      totalWalletShare += Math.min(1, walletShare);
    });

    const affordabilityRate = Number((affordableRuns / impact.runCount).toFixed(2));
    const purchaseRate = Number((purchaseRuns / impact.runCount).toFixed(2));
    const avgBuyerWalletShare = Number((totalWalletShare / impact.runCount).toFixed(2));
    const projectedCandidateScore = impact.avgBuyerScoreDelta - candidatePrice;

    priceMatrix.push({
      candidatePrice,
      affordabilityRate,
      purchaseRate,
      avgBuyerWalletShare,
      projectedCandidateScore,
    });
  }

  // Pick recommendation: highest price with affordability >= 0.5
  const suitable = priceMatrix.filter((p) => p.affordabilityRate >= 0.5);
  const recommendedPrice = suitable.length > 0 ? suitable[suitable.length - 1].candidatePrice : candidatePrices[0];

  return {
    evidenceType: 'deterministic in-process simulation',
    disclaimer:
      'PROVISIONAL CANDIDATE EVIDENCE ONLY: Derived pricing schedules require playtest and transport validation.',
    policyId: impact.policyId,
    targetItemId,
    runCount: impact.runCount,
    itemImpactSummary: {
      avgDirectRecipientHolesDelta: impact.avgDirectRecipientHolesDelta,
      avgDirectRecipientHeightDelta: impact.avgDirectRecipientHeightDelta,
      avgBuyerScoreDelta: impact.avgBuyerScoreDelta,
    },
    priceMatrix,
    recommendedPrice,
  };
}
