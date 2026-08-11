import type { GameState, MatchEvent } from '../../src/types.js';
import { SHOP_ITEM_BY_ID } from '../../src/shop/shopCatalog.js';
import type { DriverObservation, InputDriver, PlayerObservation } from './inputDriver.js';
import type { PlayerFixture } from './fixtures.js';
import { RulesBot, type ObservationMode, type RulesBotTopologyMode } from './rulesBot.js';
import { defaultObservationProjector } from './observationProjector.js';
import { Scenario, type PlayerMetrics, type ScenarioReport } from './scenario.js';

export interface ShopPolicyObservation extends DriverObservation {
  opponents: Readonly<Record<string, PlayerObservation>>;
}

export interface ShopPolicyDecision {
  openShop?: boolean;
  purchaseItemId?: string;
  overrideCost?: number;
}

export interface BotShopPolicy {
  (observation: ShopPolicyObservation): ShopPolicyDecision | null;
  onPurchaseResult?: (record: PurchaseRecord) => void;
}

export type PairPurchasePhase = 'setup' | 'waiting-for-activation' | 'payoff' | 'complete';

export interface PairShopPolicyConfig {
  setupItemId: string;
  payoffItemId: string;
  setupRequiredScore?: number;
  payoffRequiredScore?: number;
  setupOverrideCost?: number;
  payoffOverrideCost?: number;
  /** Defaults to immediate readiness once the setup purchase is accepted. */
  setupIsActive?: (observation: ShopPolicyObservation) => boolean;
  /** Defaults to true so a full-session bot continues buying complete pairs. */
  repeat?: boolean;
}

export interface PairShopPolicy extends BotShopPolicy {
  getPhase(): PairPurchasePhase;
}

export interface PairedRunnerConfig {
  seed: number;
  ticks?: number;
  playerIds?: readonly string[];
  players?: Record<string, PlayerFixture>;
  drivers?: Record<string, InputDriver>;
  botModes?: Record<string, ObservationMode>;
  botTopology?: Record<string, RulesBotTopologyMode>;
  shopPolicies?: Record<string, BotShopPolicy>;
  shopPolicyModes?: Record<string, ObservationMode>;
  enableShop?: boolean;
  enableGarbage?: boolean;
}

export interface PurchaseRecord {
  tick: number;
  playerId: string;
  itemId: string;
  accepted: boolean;
  cost?: number;
}

export interface PairedRunnerReport {
  seed: number;
  ticks: number;
  status: GameState['status'];
  winnerId: string | null;
  metrics: Record<string, PlayerMetrics>;
  purchases: PurchaseRecord[];
  events: MatchEvent[];
  walletHistory: Record<string, number[]>;
  scenarioReport: ScenarioReport;
}

/** Pre-built shop policy: opens shop when score >= required score and buys targetItem when ready/cycling. */
export function createSimpleShopPolicy(
  targetItem: string,
  requiredScore?: number,
  overrideCost?: number,
): BotShopPolicy {
  const catalogCost = SHOP_ITEM_BY_ID.get(targetItem)?.cost ?? 50;
  const minScore = requiredScore !== undefined ? requiredScore : (overrideCost !== undefined ? overrideCost : catalogCost);
  return (obs: DriverObservation) => {
    const player = obs.player.player;
    if (player.score < minScore) return null;
    if (player.shop.phase === 'ready') {
      return { openShop: true };
    }
    if (player.shop.phase === 'cycling') {
      return { purchaseItemId: targetItem, overrideCost };
    }
    return null;
  };
}

/**
 * Stateful setup -> activation -> payoff policy. Movement remains owned by the
 * InputDriver; this policy only acts on player-visible shop and prerequisite state.
 */
export function createPairShopPolicy(config: PairShopPolicyConfig): PairShopPolicy {
  const setupCatalogCost = SHOP_ITEM_BY_ID.get(config.setupItemId)?.cost ?? 0;
  const payoffCatalogCost = SHOP_ITEM_BY_ID.get(config.payoffItemId)?.cost ?? 0;
  const setupRequiredScore = config.setupRequiredScore
    ?? config.setupOverrideCost
    ?? setupCatalogCost;
  const payoffRequiredScore = config.payoffRequiredScore
    ?? config.payoffOverrideCost
    ?? payoffCatalogCost;
  const repeat = config.repeat ?? true;
  let phase: PairPurchasePhase = 'setup';

  const decide = ((observation: ShopPolicyObservation): ShopPolicyDecision | null => {
    if (phase === 'waiting-for-activation') {
      if (!config.setupIsActive?.(observation)) return null;
      phase = 'payoff';
    }
    if (phase === 'complete') return null;

    const isSetup = phase === 'setup';
    const targetItemId = isSetup ? config.setupItemId : config.payoffItemId;
    const requiredScore = isSetup ? setupRequiredScore : payoffRequiredScore;
    const overrideCost = isSetup ? config.setupOverrideCost : config.payoffOverrideCost;
    const player = observation.player.player;

    if (player.score < requiredScore) return null;
    if (player.shop.phase === 'ready') return { openShop: true };
    if (player.shop.phase !== 'cycling') return null;

    const highlightedItemId = player.shop.offerIds[player.shop.cycleIndex];
    if (highlightedItemId !== targetItemId) return null;
    return { purchaseItemId: targetItemId, overrideCost };
  }) as PairShopPolicy;

  decide.onPurchaseResult = (record: PurchaseRecord): void => {
    if (!record.accepted) return;
    if (phase === 'setup' && record.itemId === config.setupItemId) {
      phase = config.setupIsActive ? 'waiting-for-activation' : 'payoff';
      return;
    }
    if (phase === 'payoff' && record.itemId === config.payoffItemId) {
      phase = repeat ? 'setup' : 'complete';
    }
  };
  decide.getPhase = (): PairPurchasePhase => phase;
  return decide;
}

export class PairedRunner {
  private readonly scenario: Scenario;
  private readonly playerIds: string[];
  private readonly shopPolicies: Record<string, BotShopPolicy>;
  private readonly shopPolicyModes: Record<string, ObservationMode>;
  private readonly purchases: PurchaseRecord[] = [];
  private readonly walletHistory: Record<string, number[]>;

  constructor(config: PairedRunnerConfig) {
    this.playerIds = config.playerIds ? [...config.playerIds] : ['p1', 'p2'];
    const drivers: Record<string, InputDriver> = { ...config.drivers };

    for (const id of this.playerIds) {
      if (!drivers[id]) {
        const mode = config.botModes?.[id] ?? 'omniscient';
        drivers[id] = new RulesBot({
          mode,
          topology: config.botTopology?.[id] ?? 'none',
          garbageEnabled: config.enableGarbage ?? true,
        });
      }
    }

    this.shopPolicies = config.shopPolicies ?? {};
    this.shopPolicyModes = config.shopPolicyModes ?? {};

    this.scenario = new Scenario({
      seed: config.seed,
      playerIds: this.playerIds,
      players: config.players,
      drivers,
      enableShop: config.enableShop ?? true,
      enableGarbage: config.enableGarbage ?? true,
    });
    this.walletHistory = Object.fromEntries(this.playerIds.map((id) => [id, []]));
  }

  public run(ticks = 300): PairedRunnerReport {
    for (let t = 0; t < ticks; t++) {
      const stateBefore = this.scenario.getReport().gameState;
      if (stateBefore.status !== 'playing') break;

      for (const id of this.playerIds) {
        this.walletHistory[id].push(this.scenario.getPlayerState(id).score);
      }

      // Evaluate shop policy before tick
      for (const id of this.playerIds) {
        const policy = this.shopPolicies[id];
        if (policy) {
          const observationMode = this.shopPolicyModes[id] ?? 'omniscient';
          const opponents = Object.fromEntries(
            this.playerIds
              .filter((playerId) => playerId !== id)
              .map((playerId) => [
                playerId,
                defaultObservationProjector.project(stateBefore, playerId, observationMode),
              ]),
          );
          const obs: ShopPolicyObservation = {
            tick: stateBefore.tick,
            player: defaultObservationProjector.project(stateBefore, id, observationMode),
            opponents,
          };
          const decision = policy(obs);
          if (decision?.openShop) {
            this.scenario.openShop(id);
          }
          if (decision?.purchaseItemId) {
            const options = decision.overrideCost !== undefined ? { overrideCost: decision.overrideCost } : undefined;
            const accepted = this.scenario.purchase(id, decision.purchaseItemId, options);
            const catalogCost = SHOP_ITEM_BY_ID.get(decision.purchaseItemId)?.cost ?? 0;
            const actualCost = decision.overrideCost !== undefined ? decision.overrideCost : catalogCost;
            const purchaseRecord = {
              tick: stateBefore.tick,
              playerId: id,
              itemId: decision.purchaseItemId,
              accepted,
              cost: actualCost,
            } satisfies PurchaseRecord;
            this.purchases.push(purchaseRecord);
            policy.onPurchaseResult?.(purchaseRecord);
          }
        }
      }

      this.scenario.advance(1);
    }

    const report = this.scenario.getReport();

    return {
      seed: report.seed,
      ticks: report.finalTick,
      status: report.status,
      winnerId: report.winnerId,
      metrics: report.metrics,
      purchases: [...this.purchases],
      events: report.events,
      walletHistory: Object.fromEntries(
        Object.entries(this.walletHistory).map(([id, values]) => [id, [...values]]),
      ),
      scenarioReport: report,
    };
  }
}
