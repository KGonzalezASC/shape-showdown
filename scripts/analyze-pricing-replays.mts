import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

type ReplayInput = {
  tick: number;
  playerId: string;
  kind: string;
  itemId?: string;
  accepted?: boolean;
  cost?: number;
};

type ReplayPlayer = { score: number };

type Replay = {
  initialState: {
    players: Record<string, { shop?: { offerIds?: string[] } }>;
  };
  inputs: ReplayInput[];
  keyframes: Array<{
    tick: number;
    players: Record<string, ReplayPlayer>;
  }>;
  events: Array<{
    tick: number;
    type: string;
    playerId?: string;
    offerIds?: string[];
  }>;
};

type ItemConfig = {
  id: string;
  name: string;
  folder: string;
  basePrice: number;
  strength: number;
  tier: string;
  pairRoots?: string[];
  evidence: 'direct' | 'pair-only' | 'mechanics-prior';
};

type Attempt = {
  tick: number;
  resource: number;
};

type Trajectory = {
  itemId: string;
  mode: string;
  suite: string;
  file: string;
  playerId: string;
  attempts: Attempt[];
  eligibleOffers: number;
};

const TICKS_PER_SECOND = 60;
const WINDOW_SECONDS = 20;
const replayRoot = join(process.cwd(), 'fixtures', 'replays');

// Strength is a replay-backed pricing prior from 0 (situational/weak) to 1
// (highest demonstrated value). It chooses a retention target; it is not an
// additional multiplier on top of the resulting curve.
const ITEMS: ItemConfig[] = [
  { id: 'fortify-frame', name: 'Snag', folder: 'snag', basePrice: 60, strength: 1.00, tier: 'S+', evidence: 'direct' },
  { id: 'satellite-link', name: 'Satellite', folder: 'satellite', basePrice: 80, strength: 0.90, tier: 'S', evidence: 'direct' },
  { id: 'curtain', name: 'Curtain', folder: 'curtain', basePrice: 140, strength: 0.78, tier: 'A', evidence: 'direct' },
  { id: 'gravity-lure', name: 'Magnet', folder: 'magnet', basePrice: 125, strength: 0.72, tier: 'A', evidence: 'direct' },
  { id: 'tectonic-shift', name: 'Tectonic Shift', folder: 'tectonic-shift', basePrice: 140, strength: 0.58, tier: 'B', evidence: 'direct' },
  { id: 'retrim', name: 'Re-Trim', folder: '', basePrice: 120, strength: 0.58, tier: 'B', pairRoots: ['retrim-curtain'], evidence: 'pair-only' },
  { id: 'wildcard-four', name: 'Wildcard +4', folder: '', basePrice: 60, strength: 0.45, tier: 'B-', pairRoots: ['elixir-wildcard-four'], evidence: 'pair-only' },
  { id: 'elixir-pulse', name: 'Elixir', folder: '', basePrice: 55, strength: 0.36, tier: 'C+', pairRoots: ['elixir-wild-purge', 'elixir-wildcard-four'], evidence: 'pair-only' },
  { id: 'quickstep-clock', name: 'Sticky', folder: 'sticky', basePrice: 50, strength: 0.34, tier: 'C', evidence: 'direct' },
  { id: 'vortex-step', name: 'Wild Purge', folder: '', basePrice: 70, strength: 0.30, tier: 'C', pairRoots: ['elixir-wild-purge'], evidence: 'pair-only' },
  { id: 'frost-shift', name: 'Freeze', folder: '', basePrice: 45, strength: 0.30, tier: 'C provisional', evidence: 'mechanics-prior' },
  { id: 'storage-toxin', name: 'Contagion', folder: '', basePrice: 50, strength: 0.30, tier: 'C provisional', evidence: 'mechanics-prior' },
  { id: 'nova-charge', name: 'Bomber', folder: 'bomber', basePrice: 110, strength: 0.12, tier: 'D', evidence: 'direct' },
  { id: 'bounty-tax', name: 'Tax Siphon', folder: 'bounty-tax', basePrice: 50, strength: 0.08, tier: 'D/special', evidence: 'direct' },
];

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function round5(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

function priceAtLevel(item: ItemConfig, growthRate: number, level: number): number {
  return level === 0 ? item.basePrice : round5(item.basePrice * growthRate ** level);
}

function interpolate(points: Array<{ tick: number; value: number }>, tick: number): number {
  if (points.length === 0) return 0;
  if (tick <= points[0].tick) return points[0].value;
  for (let index = 1; index < points.length; index += 1) {
    const after = points[index];
    if (tick > after.tick) continue;
    const before = points[index - 1];
    if (after.tick === before.tick) return after.value;
    const progress = (tick - before.tick) / (after.tick - before.tick);
    return before.value + (after.value - before.value) * progress;
  }
  return points.at(-1)!.value;
}

function buildTrajectories(
  replay: Replay,
  item: ItemConfig,
  metadata: Omit<Trajectory, 'playerId' | 'attempts' | 'eligibleOffers'>,
): Trajectory[] {
  const acceptedTargetPurchases = replay.inputs.filter((input) => (
    input.kind === 'shopPurchase'
    && input.itemId === item.id
    && input.accepted === true
  ));
  const playerIds = metadata.suite.includes('mirror')
    ? Object.keys(replay.initialState.players)
    : ['p1'];

  return playerIds.map((playerId) => {
    const purchases = acceptedTargetPurchases.filter((purchase) => purchase.playerId === playerId);
    const resourcePoints = replay.keyframes
      .filter((frame) => frame.players[playerId])
      .map((frame) => {
        const restoredTargetSpending = purchases
          .filter((purchase) => purchase.tick <= frame.tick)
          .reduce((sum, purchase) => sum + (purchase.cost ?? item.basePrice), 0);
        return {
          tick: frame.tick,
          value: frame.players[playerId].score + restoredTargetSpending,
        };
      });

    return {
      ...metadata,
      playerId,
      eligibleOffers: (
        replay.initialState.players[playerId]?.shop?.offerIds?.includes(item.id) ? 1 : 0
      ) + replay.events.filter((event) => (
        event.type === 'shopRoll'
        && event.playerId === playerId
        && event.offerIds?.includes(item.id)
      )).length,
      attempts: purchases.map((purchase) => ({
        tick: purchase.tick,
        resource: interpolate(resourcePoints, purchase.tick),
      })),
    };
  });
}

async function loadItemTrajectories(item: ItemConfig): Promise<Trajectory[]> {
  const trajectories: Trajectory[] = [];
  for (const suite of item.folder ? [item.folder, `${item.folder}-mirror`] : []) {
    for (const mode of ['garbage-off', 'garbage-on']) {
      const directory = join(replayRoot, suite, mode);
      let files: string[];
      try {
        files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
      } catch {
        continue;
      }
      for (const file of files) {
        const replay = JSON.parse(await readFile(join(directory, file), 'utf8')) as Replay;
        trajectories.push(...buildTrajectories(replay, item, {
          itemId: item.id,
          mode,
          suite,
          file,
        }));
      }
    }
  }

  async function replayFilesUnder(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return replayFilesUnder(path);
      return entry.isFile() && /^seed-.*\.json$/.test(entry.name) ? [path] : [];
    }));
    return nested.flat();
  }

  for (const pairRoot of item.pairRoots ?? []) {
    const directory = join(replayRoot, 'pairs', pairRoot);
    for (const path of await replayFilesUnder(directory)) {
      const suite = relative(replayRoot, path).replaceAll('\\', '/');
      const mode = suite.includes('/garbage-on/') ? 'garbage-on' : 'garbage-off';
      const replay = JSON.parse(await readFile(path, 'utf8')) as Replay;
      trajectories.push(...buildTrajectories(replay, item, {
        itemId: item.id,
        mode,
        suite,
        file: path.split(/[\\/]/).at(-1)!,
      }));
    }
  }
  return trajectories;
}

function observedWindowCounts(trajectory: Trajectory, windowSeconds: number): number[] {
  const counts: number[] = [];
  const windowTicks = windowSeconds * TICKS_PER_SECOND;
  let startTick: number | null = null;
  let count = 0;
  for (const attempt of trajectory.attempts) {
    if (startTick === null || attempt.tick > startTick + windowTicks) {
      if (count > 0) counts.push(count);
      startTick = attempt.tick;
      count = 1;
    } else {
      count += 1;
    }
  }
  if (count > 0) counts.push(count);
  return counts;
}

function allowanceFor(item: ItemConfig, trajectories: Trajectory[]): number {
  const counts = trajectories.flatMap((trajectory) => observedWindowCounts(trajectory, WINDOW_SECONDS));
  const empirical = Math.round(quantile(counts, 0.75));
  const strengthCap = item.strength >= 0.85 ? 2 : item.strength >= 0.65 ? 3 : item.strength >= 0.45 ? 4 : 5;
  if (item.evidence !== 'direct') return strengthCap;
  return Math.max(2, Math.min(5, strengthCap, empirical || strengthCap));
}

function simulate(
  trajectory: Trajectory,
  item: ItemConfig,
  allowance: number,
  growthRate: number,
): { accepted: number; attempted: number; levels: number[]; prices: number[] } {
  const windowTicks = WINDOW_SECONDS * TICKS_PER_SECOND;
  let level = 0;
  let windowStart: number | null = null;
  let purchasesInWindow = 0;
  let alternativeSpending = 0;
  const levels: number[] = [];
  const prices: number[] = [];

  for (const attempt of trajectory.attempts) {
    if (windowStart !== null && (
      attempt.tick > windowStart + windowTicks
      || purchasesInWindow >= allowance
    )) {
      level += 1;
      windowStart = null;
      purchasesInWindow = 0;
    }

    const price = priceAtLevel(item, growthRate, level);
    const available = attempt.resource - alternativeSpending;
    if (available + 1e-6 < price) continue;

    if (windowStart === null) windowStart = attempt.tick;
    purchasesInWindow += 1;
    alternativeSpending += price;
    levels.push(level);
    prices.push(price);
  }

  return {
    accepted: prices.length,
    attempted: trajectory.attempts.length,
    levels,
    prices,
  };
}

function nominalAttemptsByLevel(
  trajectory: Trajectory,
  allowance: number,
): Array<Attempt & { level: number }> {
  const windowTicks = WINDOW_SECONDS * TICKS_PER_SECOND;
  let level = 0;
  let windowStart: number | null = null;
  let purchasesInWindow = 0;
  return trajectory.attempts.map((attempt) => {
    if (windowStart !== null && (
      attempt.tick > windowStart + windowTicks
      || purchasesInWindow >= allowance
    )) {
      level += 1;
      windowStart = null;
      purchasesInWindow = 0;
    }
    if (windowStart === null) windowStart = attempt.tick;
    purchasesInWindow += 1;
    return { ...attempt, level };
  });
}

function targetLateWalletBurden(item: ItemConfig): number {
  return 0.15 + 0.10 * item.strength;
}

function growthRateFromStrengthAndDemand(item: ItemConfig, demand: number): number {
  if (item.id === 'bounty-tax') return 1.20;
  return Math.round((1.20 + 0.45 * (item.strength + demand)) * 20) / 20;
}

function fitGrowth(item: ItemConfig, trajectories: Trajectory[], allowance: number): {
  growthRate: number;
  retention: number;
  medianAccepted: number;
  p75Accepted: number;
  maxLevel: number;
  referenceLevel: number;
  referenceResource: number;
  targetPrice: number;
} {
  const attempted = trajectories.reduce((sum, trajectory) => sum + trajectory.attempts.length, 0);
  const nominal = trajectories.map((trajectory) => nominalAttemptsByLevel(trajectory, allowance));
  const trajectoryMaxLevels = nominal.map((attempts) => Math.max(0, ...attempts.map((attempt) => attempt.level)));
  const referenceLevel = Math.max(1, Math.round(quantile(trajectoryMaxLevels, 0.75)));
  const resourcesAtReference = nominal
    .flat()
    .filter((attempt) => attempt.level === referenceLevel)
    .map((attempt) => attempt.resource);
  const fallbackResources = nominal.flat().map((attempt) => attempt.resource);
  const referenceResource = quantile(resourcesAtReference.length > 0 ? resourcesAtReference : fallbackResources, 0.5);
  const targetPrice = Math.max(item.basePrice, round5(referenceResource * targetLateWalletBurden(item)));
  const growthRate = Math.max(1.05, Math.min(3, (targetPrice / item.basePrice) ** (1 / referenceLevel)));

  const simulations = trajectories.map((trajectory) => simulate(trajectory, item, allowance, growthRate));
  const accepted = simulations.reduce((sum, simulation) => sum + simulation.accepted, 0);
  const acceptedCounts = simulations.map((simulation) => simulation.accepted);
  return {
    growthRate,
    retention: attempted === 0 ? 0 : accepted / attempted,
    medianAccepted: quantile(acceptedCounts, 0.5),
    p75Accepted: quantile(acceptedCounts, 0.75),
    maxLevel: Math.max(0, ...simulations.flatMap((simulation) => simulation.levels)),
    referenceLevel,
    referenceResource,
    targetPrice,
  };
}

const reports = [];
for (const item of ITEMS) {
  const trajectories = await loadItemTrajectories(item);
  const attempts = trajectories.flatMap((trajectory) => trajectory.attempts);
  const gapsSeconds = trajectories.flatMap((trajectory) => trajectory.attempts.slice(1).map((attempt, index) => (
    (attempt.tick - trajectory.attempts[index].tick) / TICKS_PER_SECOND
  )));
  const allowance = allowanceFor(item, trajectories);
  const affordabilityAnchor = fitGrowth(item, trajectories, allowance);
  const eligibleOffers = trajectories.reduce((sum, trajectory) => sum + trajectory.eligibleOffers, 0);
  const conditionalBuyRate = eligibleOffers === 0 ? 0 : attempts.length / eligibleOffers;
  const medianObservedPurchases = quantile(trajectories.map((trajectory) => trajectory.attempts.length), 0.5);
  const demandScore = item.evidence !== 'direct' ? 0.50 : (
    Math.min(1, conditionalBuyRate / 0.30)
    + Math.min(1, medianObservedPurchases / 18)
  ) / 2;
  const growthRate = growthRateFromStrengthAndDemand(item, demandScore);
  const simulations = trajectories.map((trajectory) => simulate(trajectory, item, allowance, growthRate));
  const attemptedCount = simulations.reduce((sum, simulation) => sum + simulation.attempted, 0);
  const acceptedCount = simulations.reduce((sum, simulation) => sum + simulation.accepted, 0);
  const acceptedCounts = simulations.map((simulation) => simulation.accepted);
  const prices = Array.from({ length: 10 }, (_, level) => priceAtLevel(item, growthRate, level));
  const windowCounts = trajectories.flatMap((trajectory) => observedWindowCounts(trajectory, WINDOW_SECONDS));

  reports.push({
    item: item.name,
    itemId: item.id,
    tier: item.tier,
    evidence: item.evidence,
    strengthPrior: item.strength,
    basePrice: item.basePrice,
    trajectories: trajectories.length,
    attemptedPurchases: attempts.length,
    eligibleOffers,
    conditionalBuyRate,
    demandScore,
    observedPurchasesPerTrajectory: {
      median: quantile(trajectories.map((trajectory) => trajectory.attempts.length), 0.5),
      p75: quantile(trajectories.map((trajectory) => trajectory.attempts.length), 0.75),
    },
    interpurchaseGapSeconds: {
      median: quantile(gapsSeconds, 0.5),
      p75: quantile(gapsSeconds, 0.75),
      within15Seconds: gapsSeconds.length === 0 ? 0 : gapsSeconds.filter((gap) => gap <= 15).length / gapsSeconds.length,
      within20Seconds: gapsSeconds.length === 0 ? 0 : gapsSeconds.filter((gap) => gap <= 20).length / gapsSeconds.length,
      within25Seconds: gapsSeconds.length === 0 ? 0 : gapsSeconds.filter((gap) => gap <= 25).length / gapsSeconds.length,
    },
    purchasesPer20SecondWindow: {
      median: quantile(windowCounts, 0.5),
      p75: quantile(windowCounts, 0.75),
      p90: quantile(windowCounts, 0.9),
    },
    engagementWindowSeconds: WINDOW_SECONDS,
    samePriceAllowance: allowance,
    targetLateWalletBurden: targetLateWalletBurden(item),
    empiricalLateAnchor: {
      referenceLevel: affordabilityAnchor.referenceLevel,
      medianRestoredResource: affordabilityAnchor.referenceResource,
      walletBurdenTargetPrice: affordabilityAnchor.targetPrice,
    },
    recommendedGrowthRate: growthRate,
    frozenTrajectoryRetention: attemptedCount === 0 ? 0 : acceptedCount / attemptedCount,
    frozenTrajectoryAcceptedPurchases: {
      median: quantile(acceptedCounts, 0.5),
      p75: quantile(acceptedCounts, 0.75),
    },
    highestObservedAcceptedLevel: Math.max(0, ...simulations.flatMap((simulation) => simulation.levels)),
    firstTenPrices: prices,
  });
}

console.log(JSON.stringify({
  methodology: {
    replaySuites: 'buyer-recipient plus mirror, garbage-off and garbage-on',
    windowSeconds: WINDOW_SECONDS,
    allowance: 'minimum of empirical p75 purchases per anchored window and strength-tier cap',
    targetLateWalletBurden: '0.15 + 0.10 * strengthPrior',
    demandScore: 'mean of conditional buy rate normalized at 30% and median purchases per trajectory normalized at 18',
    growthFormula: 'round to nearest 0.05 of 1.20 + 0.45 * (strengthPrior + demandScore); Tax Siphon is a 1.20 gated-economy exception',
    affordabilityCheck: 'restored resource and frozen-trajectory acceptance are diagnostics, not independent per-item growth solvers',
    warning: 'Frozen trajectories estimate affordability only; rejected purchases do not change later simulated boards or income.',
  },
  reports,
}, null, 2));
