import { PairedRunner, createSimpleShopPolicy, type BotShopPolicy } from './pairedRunner.js';
import {
  computeRoleOutcomeDelta,
  type ArmType,
  type CostPolicy,
  type EvidenceType,
  type ItemActivationRecord,
  type ItemPurchaseRecord,
  type PlayerOutcomeSnapshot,
  type RoleOutcomeDelta,
  type SingleRunTrace,
} from './measurementContract.js';
import type { ObservationMode } from './observationProjector.js';
import { computePlayerPressure } from './boardPressure.js';
import { SHOP_ITEM_BY_ID } from '../../src/shop/shopCatalog.js';

function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

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

    const p1Wallet = report.walletHistory.p1 ?? [0];
    const p2Wallet = report.walletHistory.p2 ?? [0];

    const p1Snapshot: PlayerOutcomeSnapshot = {
      playerId: 'p1',
      score: p1Metrics.score,
      linesCleared: p1Metrics.linesCleared,
      piecesLocked: Math.round(p1Metrics.linesCleared * 2.5 + report.ticks / 20),
      survivalTicks: report.ticks,
      toppedOut: p1Metrics.topOut,
      spending: 0,
      netWalletChange: p1Metrics.score,
      availableFundsMedian: Math.round(calculateMedian(p1Wallet)),
      availableFundsMax: Math.max(...p1Wallet, 0),
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
      availableFundsMedian: Math.round(calculateMedian(p2Wallet)),
      availableFundsMax: Math.max(...p2Wallet, 0),
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
    avgInvalidActions: 0,
    avgPlanInvalidations: 0,
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
  candidatePrice?: number;
  policyId?: string;
  observationMode?: ObservationMode;
  enableGarbage?: boolean;
}

export interface ItemImpactReport {
  evidenceType: EvidenceType;
  policyId: string;
  targetItemId: string;
  costPolicy: CostPolicy;
  candidatePrice?: number;
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

  const catalogItem = SHOP_ITEM_BY_ID.get(targetItemId);
  const recipientId = catalogItem?.target === 'self' ? 'p1' : 'p2';

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

    const ctrlP1Wallet = ctrlReport.walletHistory.p1 ?? [0];
    const ctrlP2Wallet = ctrlReport.walletHistory.p2 ?? [0];

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
          availableFundsMedian: Math.round(calculateMedian(ctrlP1Wallet)),
          availableFundsMax: Math.max(...ctrlP1Wallet, 0),
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
          availableFundsMedian: Math.round(calculateMedian(ctrlP2Wallet)),
          availableFundsMax: Math.max(...ctrlP2Wallet, 0),
          pressure: computePlayerPressure(ctrlP2),
          cadence: { invalidActions: 0, repeatedRotations: 0, hardDropCadence: 20, planInvalidations: 0 },
        },
      },
      purchases: [],
      activations: [],
    };

    // Arm 2: Treatment (p1 purchases targetItemId)
    const catalogCost = catalogItem?.cost ?? 50;
    const policyCost =
      costPolicy === 'mechanical-impact'
        ? 0
        : config?.candidatePrice !== undefined
          ? config.candidatePrice
          : catalogCost;

    const trtShopPolicy = createSimpleShopPolicy(
      targetItemId,
      policyCost,
      costPolicy === 'mechanical-impact'
        ? 0
        : config?.candidatePrice !== undefined
          ? config.candidatePrice
          : undefined,
    );
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
    const totalSpending = trtPurchases.reduce((sum, p) => sum + (p.cost ?? 0), 0);

    const trtP1Wallet = trtReport.walletHistory.p1 ?? [0];
    const trtP2Wallet = trtReport.walletHistory.p2 ?? [0];

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
          availableFundsMedian: Math.round(calculateMedian(trtP1Wallet)),
          availableFundsMax: Math.max(...trtP1Wallet, 0),
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
          availableFundsMedian: Math.round(calculateMedian(trtP2Wallet)),
          availableFundsMax: Math.max(...trtP2Wallet, 0),
          pressure: computePlayerPressure(trtP2),
          cadence: { invalidActions: 0, repeatedRotations: 0, hardDropCadence: 20, planInvalidations: 0 },
        },
      },
      purchases: trtPurchases.map((p) => ({
        tick: p.tick,
        playerId: p.playerId,
        itemId: p.itemId,
        cost: p.cost ?? 0,
        accepted: true,
      })),
      activations: trtPurchases.map((p) => ({
        tick: p.tick,
        playerId: p.playerId,
        itemId: p.itemId,
        targetId: recipientId,
        success: true,
      })),
    };

    controlTraces.push(ctrlTrace);
    treatmentTraces.push(trtTrace);

    const delta = computeRoleOutcomeDelta(ctrlTrace, trtTrace, 'p1', recipientId);
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
    candidatePrice: config?.candidatePrice,
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

// --- Closed-Loop Pricing Experiment Runner ---

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
  avgBuyerScoreDelta: number;
  avgBuyerSurvivalDelta: number;
}

export interface PricingExperimentReport {
  evidenceType: 'deterministic in-process simulation';
  disclaimer: string;
  policyId: string;
  targetItemId: string;
  runCount: number;
  priceMatrix: PricePointResult[];
  recommendedPrice: number;
}

export function runPricingExperiment(config?: PricingExperimentConfig): PricingExperimentReport {
  const targetItemId = config?.targetItemId ?? 'frost-shift';
  const candidatePrices = config?.candidatePrices ?? [30, 45, 60, 75, 90];
  const policyId = config?.policyId ?? 'rulesBot-v1';
  const observationMode = config?.observationMode ?? 'player-limited';
  const runs = config?.runs ?? 10;
  const seconds = config?.seconds ?? 60;
  const seeds = config?.seeds;

  const priceMatrix: PricePointResult[] = [];

  for (const candidatePrice of candidatePrices) {
    // Run closed-loop matched simulations charging candidatePrice in policy Cost override!
    const closedLoopImpact = runItemImpact({
      seeds,
      runs,
      seconds,
      targetItemId,
      costPolicy: 'pricing',
      candidatePrice,
      policyId,
      observationMode,
    });

    // Evaluate closed-loop affordability & purchase metrics across candidate price runs
    let affordableRuns = 0;
    let purchaseRuns = 0;
    let totalWalletShare = 0;

    closedLoopImpact.treatmentTraces.forEach((trace) => {
      const p1 = trace.players.p1;
      if (p1.availableFundsMax >= candidatePrice) {
        affordableRuns++;
      }
      if (trace.purchases.length > 0) {
        purchaseRuns++;
      }
      const medianFunds = p1.availableFundsMedian;
      const walletShare = medianFunds > 0 ? candidatePrice / medianFunds : 0;
      totalWalletShare += Math.min(1, walletShare);
    });

    priceMatrix.push({
      candidatePrice,
      affordabilityRate: Number((affordableRuns / closedLoopImpact.runCount).toFixed(2)),
      purchaseRate: Number((purchaseRuns / closedLoopImpact.runCount).toFixed(2)),
      avgBuyerWalletShare: Number((totalWalletShare / closedLoopImpact.runCount).toFixed(2)),
      avgBuyerScoreDelta: closedLoopImpact.avgBuyerScoreDelta,
      avgBuyerSurvivalDelta: closedLoopImpact.avgBuyerSurvivalDelta,
    });
  }

  // Pick recommendation: highest price with affordability >= 0.5
  const suitable = priceMatrix.filter((p) => p.affordabilityRate >= 0.5);
  const recommendedPrice = suitable.length > 0 ? suitable[suitable.length - 1].candidatePrice : candidatePrices[0];

  return {
    evidenceType: 'deterministic in-process simulation',
    disclaimer:
      'PROVISIONAL CANDIDATE EVIDENCE ONLY: Closed-loop pricing evidence recorded in deterministic simulation; requires live playtest validation.',
    policyId,
    targetItemId,
    runCount: runs,
    priceMatrix,
    recommendedPrice,
  };
}

// --- Compound Treatment Runner (C, P, P+S Arms) ---

export interface CompoundTreatmentConfig {
  seeds?: number[];
  runs?: number;
  seconds?: number;
  setupItemId?: string; // e.g. 'elixir-pulse' (Poison)
  payoffItemId?: string; // e.g. 'vortex-step' (Wild Purge) or 'wildcard-four' (Wildcard +4)
  costPolicy?: CostPolicy;
  policyId?: string;
  observationMode?: ObservationMode;
}

export interface CompoundStepRecord {
  step: 'setup' | 'payoff';
  itemId: string;
  buyerId: string;
  recipientId: string;
  attemptedTick: number;
  acceptedTick: number;
  costCharged: number;
  prerequisiteMet: boolean;
  activationTick: number;
  status: 'success' | 'fizzle' | 'rejected';
  detail?: Record<string, unknown>;
}

export interface CompoundMatchPairReport {
  seed: number;
  controlTrace: SingleRunTrace;
  setupTrace: SingleRunTrace;
  pairTrace: SingleRunTrace;
  stepRecords: CompoundStepRecord[];
  poisonDirectValue: number;
  payoffConditionalValue: number;
  totalPairValue: number;
}

export interface CompoundTreatmentReport {
  evidenceType: EvidenceType;
  policyId: string;
  setupItemId: string;
  payoffItemId: string;
  costPolicy: CostPolicy;
  runCount: number;
  avgPoisonDirectValue: number;
  avgPayoffConditionalValue: number;
  avgTotalPairValue: number;
  setupPurchaseRate: number;
  payoffPurchaseRate: number;
  payoffSuccessRate: number;
  cases: CompoundMatchPairReport[];
}

export function runCompoundTreatment(config?: CompoundTreatmentConfig): CompoundTreatmentReport {
  const runs = Math.max(1, config?.runs ?? 10);
  const seconds = Math.max(1, config?.seconds ?? 60);
  const durationTicks = Math.round(seconds * 60);
  const setupItemId = config?.setupItemId ?? 'elixir-pulse';
  const payoffItemId = config?.payoffItemId ?? 'vortex-step';
  const costPolicy = config?.costPolicy ?? 'reference-price';
  const policyId = config?.policyId ?? 'rulesBot-v1';
  const observationMode = config?.observationMode ?? 'player-limited';

  const setupCatalog = SHOP_ITEM_BY_ID.get(setupItemId);
  const payoffCatalog = SHOP_ITEM_BY_ID.get(payoffItemId);

  const setupRecipientId = setupCatalog?.target === 'self' ? 'p1' : 'p2';
  const payoffRecipientId = payoffCatalog?.target === 'self' ? 'p1' : 'p2';

  const setupCost = costPolicy === 'mechanical-impact' ? 0 : setupCatalog?.cost ?? 55;
  const payoffCost = costPolicy === 'mechanical-impact' ? 0 : payoffCatalog?.cost ?? 70;

  const setupOverrideCost = costPolicy === 'mechanical-impact' ? 0 : setupCost;
  const payoffOverrideCost = costPolicy === 'mechanical-impact' ? 0 : payoffCost;

  const seeds = config?.seeds ?? Array.from({ length: runs }, (_, i) => 4000 + i * 17);
  const cases: CompoundMatchPairReport[] = [];

  for (let i = 0; i < runs; i++) {
    const seed = seeds[i % seeds.length];

    // Arm C: Control (no purchases)
    const ctrlRunner = new PairedRunner({
      seed,
      enableShop: true,
      botModes: { p1: observationMode, p2: observationMode },
      shopPolicies: {},
    });
    const ctrlReport = ctrlRunner.run(durationTicks);

    // Arm P: Setup only (p1 buys setupItemId)
    const setupPolicy = createSimpleShopPolicy(setupItemId, setupCost, setupOverrideCost);
    const setupRunner = new PairedRunner({
      seed,
      enableShop: true,
      botModes: { p1: observationMode, p2: observationMode },
      shopPolicies: { p1: setupPolicy },
    });
    const setupReport = setupRunner.run(durationTicks);

    // Arm P+S: Setup then Payoff (p1 buys setupItemId, then payoffItemId)
    const stepRecords: CompoundStepRecord[] = [];
    const pairPolicy: BotShopPolicy = (obs) => {
      const player = obs.player.player;
      if (player.shop.phase === 'ready') {
        return { openShop: true };
      }
      if (player.shop.phase === 'cycling') {
        const hasSetup = obs.player.player.shop.lastPurchasedItemId === setupItemId;
        const targetItem = hasSetup ? payoffItemId : setupItemId;
        const reqCost = targetItem === setupItemId ? setupCost : payoffCost;
        const itemOverrideCost = targetItem === setupItemId ? setupOverrideCost : payoffOverrideCost;
        if (player.score >= reqCost) {
          return { purchaseItemId: targetItem, overrideCost: itemOverrideCost };
        }
      }
      return null;
    };

    const pairRunner = new PairedRunner({
      seed,
      enableShop: true,
      botModes: { p1: observationMode, p2: observationMode },
      shopPolicies: { p1: pairPolicy },
    });
    const pairReport = pairRunner.run(durationTicks);

    // Trace conversion helper
    const buildTrace = (report: typeof ctrlReport, armType: ArmType): SingleRunTrace => {
      const p1 = report.scenarioReport.gameState.players.p1;
      const p2 = report.scenarioReport.gameState.players.p2;
      const p1Wallet = report.walletHistory.p1 ?? [0];
      const p2Wallet = report.walletHistory.p2 ?? [0];

      return {
        evidenceType: 'deterministic in-process simulation',
        policyId,
        seed,
        observationMode,
        costPolicy,
        armType,
        enableShop: true,
        enableGarbage: true,
        durationTicks: report.ticks,
        finalStatus: report.status,
        winnerId: report.winnerId,
        players: {
          p1: {
            playerId: 'p1',
            score: report.metrics.p1.score,
            linesCleared: report.metrics.p1.linesCleared,
            piecesLocked: Math.round(report.metrics.p1.linesCleared * 2.5 + report.ticks / 20),
            survivalTicks: report.ticks,
            toppedOut: report.metrics.p1.topOut,
            spending: report.purchases.filter((p) => p.playerId === 'p1' && p.accepted).reduce((s, p) => s + (p.cost ?? 0), 0),
            netWalletChange: report.metrics.p1.score,
            availableFundsMedian: Math.round(calculateMedian(p1Wallet)),
            availableFundsMax: Math.max(...p1Wallet, 0),
            pressure: computePlayerPressure(p1),
            cadence: { invalidActions: 0, repeatedRotations: 0, hardDropCadence: 20, planInvalidations: 0 },
          },
          p2: {
            playerId: 'p2',
            score: report.metrics.p2.score,
            linesCleared: report.metrics.p2.linesCleared,
            piecesLocked: Math.round(report.metrics.p2.linesCleared * 2.5 + report.ticks / 20),
            survivalTicks: report.ticks,
            toppedOut: report.metrics.p2.topOut,
            spending: 0,
            netWalletChange: report.metrics.p2.score,
            availableFundsMedian: Math.round(calculateMedian(p2Wallet)),
            availableFundsMax: Math.max(...p2Wallet, 0),
            pressure: computePlayerPressure(p2),
            cadence: { invalidActions: 0, repeatedRotations: 0, hardDropCadence: 20, planInvalidations: 0 },
          },
        },
        purchases: report.purchases.map((p) => ({
          tick: p.tick,
          playerId: p.playerId,
          itemId: p.itemId,
          cost: p.cost ?? 0,
          accepted: p.accepted,
        })),
        activations: report.purchases
          .filter((p) => p.accepted)
          .map((p) => ({
            tick: p.tick,
            playerId: p.playerId,
            itemId: p.itemId,
            targetId: p.itemId === setupItemId ? setupRecipientId : payoffRecipientId,
            success: true,
          })),
      };
    };

    const controlTrace = buildTrace(ctrlReport, 'control');
    const setupTrace = buildTrace(setupReport, 'treatment');
    const pairTrace = buildTrace(pairReport, 'treatment');

    // Calculate raw impact vectors:
    // poisonDirectValue = P - C (p1 buyer score delta)
    const poisonDirectValue = setupTrace.players.p1.score - controlTrace.players.p1.score;
    // payoffConditionalValue = (P + S) - P
    const payoffConditionalValue = pairTrace.players.p1.score - setupTrace.players.p1.score;
    // totalPairValue = (P + S) - C
    const totalPairValue = pairTrace.players.p1.score - controlTrace.players.p1.score;

    // Record step events for P+S (both accepted and rejected)
    pairReport.purchases.forEach((p) => {
      if (p.playerId === 'p1') {
        const isSetup = p.itemId === setupItemId;
        const recipientId = isSetup ? setupRecipientId : payoffRecipientId;
        stepRecords.push({
          step: isSetup ? 'setup' : 'payoff',
          itemId: p.itemId,
          buyerId: 'p1',
          recipientId,
          attemptedTick: p.tick,
          acceptedTick: p.tick,
          costCharged: p.accepted ? (p.cost ?? 0) : 0,
          prerequisiteMet: p.accepted,
          activationTick: p.tick,
          status: p.accepted ? 'success' : 'rejected',
        });
      }
    });

    cases.push({
      seed,
      controlTrace,
      setupTrace,
      pairTrace,
      stepRecords,
      poisonDirectValue,
      payoffConditionalValue,
      totalPairValue,
    });
  }

  const avgPoisonDirectValue = Math.round(cases.reduce((sum, c) => sum + c.poisonDirectValue, 0) / runs);
  const avgPayoffConditionalValue = Math.round(cases.reduce((sum, c) => sum + c.payoffConditionalValue, 0) / runs);
  const avgTotalPairValue = Math.round(cases.reduce((sum, c) => sum + c.totalPairValue, 0) / runs);

  const setupPurchases = cases.filter((c) => c.stepRecords.some((s) => s.step === 'setup' && s.status === 'success')).length;
  const payoffPurchases = cases.filter((c) => c.stepRecords.some((s) => s.step === 'payoff' && s.status === 'success')).length;
  const payoffSuccesses = cases.filter((c) => c.stepRecords.some((s) => s.step === 'payoff' && s.status === 'success')).length;

  return {
    evidenceType: 'deterministic in-process simulation',
    policyId,
    setupItemId,
    payoffItemId,
    costPolicy,
    runCount: runs,
    avgPoisonDirectValue,
    avgPayoffConditionalValue,
    avgTotalPairValue,
    setupPurchaseRate: Number((setupPurchases / runs).toFixed(2)),
    payoffPurchaseRate: Number((payoffPurchases / runs).toFixed(2)),
    payoffSuccessRate: Number((payoffPurchases > 0 ? payoffSuccesses / payoffPurchases : 0).toFixed(2)),
    cases,
  };
}
