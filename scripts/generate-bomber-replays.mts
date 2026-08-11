import fs from 'node:fs';
import path from 'node:path';
import { createPlayerRngChannels, type RngChannels } from '../src/rng.js';
import { SHOP_ITEM_BY_ID, SHOP_ROLL_POOL } from '../src/shop/shopCatalog.js';
import type {
  GameState,
  InputState,
  MatchEvent,
  PlayerState,
  ReplayDataV2,
  ReplayInputFrame,
  ReplayKeyframe,
} from '../src/types.js';
import { applyShopPurchase, openPlayerShop } from '../server/shop.js';
import { makePlayer } from '../server/tetris/engine.js';
import { matchStep } from '../server/tetris/matchStep.js';
import { Scenario } from '../server/testHarness/scenario.js';
import { computePlayerPressure } from '../server/testHarness/boardPressure.js';
import type { DriverObservation, InputDriver, PlayerCommand } from '../server/testHarness/inputDriver.js';
import { RulesBot } from '../server/testHarness/rulesBot.js';

type PowerupKey = 'bomber' | 'satellite' | 'magnet' | 'snag' | 'sticky' | 'curtain' | 'tectonic-shift' | 'bounty-tax';

interface PowerupConfig {
  key: PowerupKey;
  itemId: string;
  displayName: string;
  outputDirectory: string;
  reportPath: string;
  mechanicDescription: string;
}

const POWERUPS: Record<PowerupKey, PowerupConfig> = {
  bomber: {
    key: 'bomber',
    itemId: 'nova-charge',
    displayName: 'Bomber',
    outputDirectory: 'bomber',
    reportPath: 'docs/baseline/bomber-evidence.md',
    mechanicDescription:
      'On purchase, Bomber arms the current active piece (or the next spawn); on lock it clears the radius-2 circular blast footprint without gravity or direct score.',
  },
  satellite: {
    key: 'satellite',
    itemId: 'satellite-link',
    displayName: 'Satellite',
    outputDirectory: 'satellite',
    reportPath: 'docs/baseline/satellite-evidence.md',
    mechanicDescription:
      'On purchase, Satellite arms until incoming garbage is queued; it adds 90 ticks to queued packets and adds 90 ticks to newly queued packets for 600 ticks.',
  },
  magnet: {
    key: 'magnet',
    itemId: 'gravity-lure',
    displayName: 'Magnet',
    outputDirectory: 'magnet',
    reportPath: 'docs/baseline/magnet-evidence.md',
    mechanicDescription:
      'On purchase, Magnet accelerates the opponent: the first three purchases add +2 gravity each permanently, then later purchases add +1 gravity to the current piece until it locks, with a 12-tick minimum per cell.',
  },
  snag: {
    key: 'snag',
    itemId: 'fortify-frame',
    displayName: 'Snag',
    outputDirectory: 'snag',
    reportPath: 'docs/baseline/snag-evidence.md',
    mechanicDescription:
      'On purchase, Snag blocks the opponent from hard-dropping or soft-dropping the current piece until it locks or is held; if the current piece already hard-dropped, the next spawn is blocked instead.',
  },
  sticky: {
    key: 'sticky',
    itemId: 'quickstep-clock',
    displayName: 'Sticky',
    outputDirectory: 'sticky',
    reportPath: 'docs/baseline/sticky-evidence.md',
    mechanicDescription:
      'On purchase, Sticky limits the opponent current piece to two grounded lock-delay move/rotation resets instead of the normal ten; if no piece is active, the cap applies to the next spawn.',
  },
  curtain: {
    key: 'curtain',
    itemId: 'curtain',
    displayName: 'Curtain',
    outputDirectory: 'curtain',
    reportPath: 'docs/baseline/curtain-evidence.md',
    mechanicDescription:
      'On purchase, Curtain lowers the opponent swap line and frosts the three rows above a four-second blackout below that frontier; the authoritative board remains unchanged.',
  },
  'tectonic-shift': {
    key: 'tectonic-shift',
    itemId: 'tectonic-shift',
    displayName: 'Tectonic Shift',
    outputDirectory: 'tectonic-shift',
    reportPath: 'docs/baseline/tectonic-shift-evidence.md',
    mechanicDescription:
      'On purchase, Tectonic Shift collapses all columns downward to fill holes; cleared lines award no score, garbage, or shop rolls.',
  },
  'bounty-tax': {
    key: 'bounty-tax',
    itemId: 'bounty-tax',
    displayName: 'Tax Siphon',
    outputDirectory: 'bounty-tax',
    reportPath: 'docs/baseline/bounty-tax-evidence.md',
    mechanicDescription:
      'On purchase, Tax Siphon steals 30% of the opponent score and adds it to the buyer score; can only be purchased when trailing behind.',
  },
};

const PLAYER_IDS = ['p1', 'p2'] as const;
const DEFAULT_RUNS = 15;
const DEFAULT_SECONDS = 120;
const DEFAULT_SEED_START = 910000;
const DEFAULT_SEED_STEP = 17;
const DEFAULT_KEYFRAME_INTERVAL_TICKS = 120;

type GarbageMode = 'garbage-off' | 'garbage-on';
type ReplayRoleMode = 'buyer-recipient' | 'mirror';

interface RunResult {
  roleMode: ReplayRoleMode;
  mode: GarbageMode;
  seed: number;
  finalTick: number;
  status: GameState['status'];
  winnerId: string | null;
  purchases: number;
  acceptedPurchasesByPlayer: Record<string, number>;
  scores: Record<string, number>;
  linesCleared: Record<string, number>;
  topOut: Record<string, boolean>;
  playerMetrics: Record<string, PlayerRunMetrics>;
  replayPath: string;
  replayBytes: number;
  buyerId?: 'p1';
  recipientId?: 'p2';
}

interface PlayerRunMetrics {
  score: number;
  linesCleared: number;
  topOut: boolean;
  survivalTicks: number;
  holes: number;
  cavityDepth: number;
  aggregateHeight: number;
  bumpiness: number;
}

interface ModeAnalytics {
  trajectoryCount: number;
  survivingTrajectories: number;
  pooledSurvival: number;
  pooledSurvival95CI: [number, number];
  avgScore: number;
  medianScore: number;
  avgLines: number;
  medianLines: number;
  avgHoles: number;
  medianHoles: number;
  avgCavityDepth: number;
  medianCavityDepth: number;
  avgAggregateHeight: number;
  medianAggregateHeight: number;
  avgBumpiness: number;
  medianBumpiness: number;
  avgSurvivalTimeSeconds: number;
  medianSurvivalTimeSeconds: number;
}

interface RecordingDriver extends InputDriver {
  readonly inputFrames: ReplayInputFrame[];
  readonly bot: RulesBot;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Compare replay JSON semantically while ignoring object insertion order. */
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`);
  return `{${entries.join(',')}}`;
}

function firstDifference(left: unknown, right: unknown, pathLabel = '$'): string | null {
  if (stableSerialize(left) === stableSerialize(right)) return null;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return `${pathLabel}: actual=${JSON.stringify(left)} expected=${JSON.stringify(right)}`;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  for (const key of keys) {
    const difference = firstDifference(leftRecord[key], rightRecord[key], `${pathLabel}.${key}`);
    if (difference) return difference;
  }
  return `${pathLabel}: values differ`;
}

function parseArgs(args: string[]): {
  powerup: PowerupKey;
  runs: number;
  seconds: number;
  seedStart: number;
  seedStep: number;
  keyframeIntervalTicks: number;
  mode: GarbageMode | 'both';
  roleMode: ReplayRoleMode;
} {
  const parseIntegerArg = (name: string, raw: string, minimum?: number): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || (minimum !== undefined && value < minimum)) {
      const constraint = minimum === undefined ? 'an integer' : `an integer >= ${minimum}`;
      throw new Error(`Invalid ${name}: ${raw}; expected ${constraint}`);
    }
    return value;
  };

  const config = {
    powerup: 'bomber' as PowerupKey,
    runs: DEFAULT_RUNS,
    seconds: DEFAULT_SECONDS,
    seedStart: DEFAULT_SEED_START,
    seedStep: DEFAULT_SEED_STEP,
    keyframeIntervalTicks: DEFAULT_KEYFRAME_INTERVAL_TICKS,
    mode: 'both' as GarbageMode | 'both',
    roleMode: 'buyer-recipient',
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--powerup' && next) {
      if (!['bomber', 'satellite', 'magnet', 'snag', 'sticky', 'curtain', 'tectonic-shift', 'bounty-tax'].includes(next)) {
        throw new Error(`Unsupported powerup: ${next}`);
      }
      config.powerup = next;
    }
    if (arg === '--runs' && next) config.runs = parseIntegerArg('--runs', next, 1);
    if (arg === '--seconds' && next) config.seconds = parseIntegerArg('--seconds', next, 1);
    if (arg === '--seed-start' && next) config.seedStart = parseIntegerArg('--seed-start', next);
    if (arg === '--seed-step' && next) config.seedStep = parseIntegerArg('--seed-step', next);
    if (arg === '--keyframe-interval' && next) {
      config.keyframeIntervalTicks = parseIntegerArg('--keyframe-interval', next, 1);
    }
    if (arg === '--mode' && next) {
      if (!['both', 'garbage-off', 'garbage-on'].includes(next)) {
        throw new Error(`Unsupported mode: ${next}`);
      }
      config.mode = next as GarbageMode | 'both';
    }
    if (arg === '--roles' && next) {
      if (!['buyer-recipient', 'mirror'].includes(next)) {
        throw new Error(`Unsupported roles: ${next}`);
      }
      config.roleMode = next as ReplayRoleMode;
    }
    if (arg.startsWith('--')) i += 1;
  }

  return config;
}

function makeRecordingDriver(garbageEnabled: boolean): RecordingDriver {
  const bot = new RulesBot({ mode: 'player-limited', garbageEnabled });
  let previousInput: InputState = { left: false, right: false, softDrop: false };
  const inputFrames: ReplayInputFrame[] = [];

  return {
    observationMode: 'player-limited',
    bot,
    inputFrames,
    next(observation: DriverObservation): PlayerCommand {
      const command = bot.next(observation);
      const tick = (observation.replayTick ?? observation.tick) + 1;

      if (command.inputState) {
        const inputState: InputState = {
          left: !!command.inputState.left,
          right: !!command.inputState.right,
          softDrop: !!command.inputState.softDrop,
        };
        if (
          inputState.left !== previousInput.left ||
          inputState.right !== previousInput.right ||
          inputState.softDrop !== previousInput.softDrop
        ) {
          inputFrames.push({ tick, playerId: observation.player.player.id, kind: 'inputState', inputState });
          previousInput = inputState;
        }
      }

      for (const action of command.actions ?? []) {
        inputFrames.push({ tick, playerId: observation.player.player.id, kind: 'action', action });
      }

      return command;
    },
  };
}

function purchasePowerupWhenAvailable(scenario: Scenario, playerId: string, powerup: PowerupConfig): void {
  const player = scenario.getPlayerState(playerId);
  if (player.score < SHOP_ITEM_BY_ID.get(powerup.itemId)!.cost) return;

  if (player.shop.phase === 'ready') {
    scenario.openShop(playerId);
    return;
  }

  if (
    player.shop.phase === 'cycling' &&
    player.shop.cycleIndex >= 0 &&
    player.shop.offerIds[player.shop.cycleIndex] === powerup.itemId
  ) {
    scenario.purchase(playerId, powerup.itemId);
  }
}

function buildKeyframe(
  tick: number,
  players: Record<string, PlayerState>,
  drivers: Record<string, RecordingDriver>,
): ReplayKeyframe {
  const decisionTraces: ReplayKeyframe['decisionTraces'] = {};
  for (const playerId of PLAYER_IDS) {
    const trace = drivers[playerId].bot.lastDecisionTrace;
    if (trace) decisionTraces[playerId] = clone(trace);
  }

  return {
    tick,
    players: clone(players),
    decisionTraces: Object.keys(decisionTraces).length > 0 ? decisionTraces : undefined,
  };
}

function shopFramesFromScenario(
  commandRecords: ReturnType<Scenario['getReport']>['commandRecords'],
  powerup: PowerupConfig,
): ReplayInputFrame[] {
  const frames: ReplayInputFrame[] = [];
  for (const record of commandRecords) {
    const tick = record.tick + 1;
    if (record.kind === 'openShop') {
      frames.push({
        tick,
        playerId: record.playerId,
        kind: 'shopOpen',
        accepted: record.accepted ?? false,
      });
    } else if (record.kind === 'purchase') {
      const detail = record.detail as { itemId?: string } | undefined;
      if (!detail?.itemId) continue;
      frames.push({
        tick,
        playerId: record.playerId,
        kind: 'shopPurchase',
        itemId: detail.itemId,
        accepted: record.accepted ?? false,
        cost: detail.itemId === powerup.itemId ? SHOP_ITEM_BY_ID.get(powerup.itemId)!.cost : undefined,
      });
    }
  }
  return frames;
}

function sortReplayInputs(frames: ReplayInputFrame[]): ReplayInputFrame[] {
  const kindOrder: Record<ReplayInputFrame['kind'], number> = {
    shopOpen: 0,
    shopPurchase: 1,
    inputState: 2,
    action: 3,
  };
  return frames.sort((a, b) => a.tick - b.tick || kindOrder[a.kind] - kindOrder[b.kind]);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Wilson interval is stable for small pooled samples and for 0/100% survival. */
function wilson95(successes: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.959963984540054;
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (proportion + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt(
    (proportion * (1 - proportion)) / total + (z * z) / (4 * total * total),
  );
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function summarizeMode(
  results: RunResult[],
  role: 'pooled' | 'buyer' | 'recipient' = 'pooled',
): ModeAnalytics {
  const trajectories = results.flatMap((result) => {
    if (role === 'buyer') return [result.playerMetrics[result.buyerId ?? 'p1']];
    if (role === 'recipient') return [result.playerMetrics[result.recipientId ?? 'p2']];
    return PLAYER_IDS.map((playerId) => result.playerMetrics[playerId]);
  });
  const survivalCount = trajectories.filter((trajectory) => !trajectory.topOut).length;
  const survivalCI = wilson95(survivalCount, trajectories.length);
  const scores = trajectories.map((trajectory) => trajectory.score);
  const lines = trajectories.map((trajectory) => trajectory.linesCleared);
  const holes = trajectories.map((trajectory) => trajectory.holes);
  const cavityDepths = trajectories.map((trajectory) => trajectory.cavityDepth);
  const aggregateHeights = trajectories.map((trajectory) => trajectory.aggregateHeight);
  const bumpiness = trajectories.map((trajectory) => trajectory.bumpiness);
  const survivalSeconds = trajectories.map((trajectory) => trajectory.survivalTicks / 60);

  return {
    trajectoryCount: trajectories.length,
    survivingTrajectories: survivalCount,
    pooledSurvival: survivalCount / trajectories.length,
    pooledSurvival95CI: survivalCI,
    avgScore: mean(scores),
    medianScore: median(scores),
    avgLines: mean(lines),
    medianLines: median(lines),
    avgHoles: mean(holes),
    medianHoles: median(holes),
    avgCavityDepth: mean(cavityDepths),
    medianCavityDepth: median(cavityDepths),
    avgAggregateHeight: mean(aggregateHeights),
    medianAggregateHeight: median(aggregateHeights),
    avgBumpiness: mean(bumpiness),
    medianBumpiness: median(bumpiness),
    avgSurvivalTimeSeconds: mean(survivalSeconds),
    medianSurvivalTimeSeconds: median(survivalSeconds),
  };
}

function formatNumber(value: number, fractionDigits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatSurvival(analytics: ModeAnalytics): string {
  const [lower, upper] = analytics.pooledSurvival95CI;
  return `**${formatPercent(analytics.pooledSurvival)}** (95% CI: ${(lower * 100).toFixed(1)}–${(upper * 100).toFixed(1)}%)`;
}

function analyticsTable(
  analyticsByMode: Record<GarbageMode, ModeAnalytics>,
  survivalLabel = 'Pooled survival',
): string[] {
  const off = analyticsByMode['garbage-off'];
  const on = analyticsByMode['garbage-on'];
  return [
    '| Metric | Garbage off | Garbage on |',
    '| --- | ---: | ---: |',
    `| ${survivalLabel} (${off.trajectoryCount} trajectories/mode) | ${formatSurvival(off)} | ${formatSurvival(on)} |`,
    `| Avg score | ${formatInteger(off.avgScore)} | ${formatInteger(on.avgScore)} |`,
    `| Median score | ${formatInteger(off.medianScore)} | ${formatInteger(on.medianScore)} |`,
    `| Avg lines | ${formatNumber(off.avgLines)} | ${formatNumber(on.avgLines)} |`,
    `| Median lines | ${formatInteger(off.medianLines)} | ${formatInteger(on.medianLines)} |`,
    `| Avg holes | ${formatNumber(off.avgHoles)} | ${formatNumber(on.avgHoles)} |`,
    `| Median holes | ${formatNumber(off.medianHoles)} | ${formatNumber(on.medianHoles)} |`,
    `| Avg cavity depth | ${formatNumber(off.avgCavityDepth)} | ${formatNumber(on.avgCavityDepth)} |`,
    `| Median cavity depth | ${formatNumber(off.medianCavityDepth)} | ${formatNumber(on.medianCavityDepth)} |`,
    `| Avg aggregate height | ${formatNumber(off.avgAggregateHeight)} | ${formatNumber(on.avgAggregateHeight)} |`,
    `| Median aggregate height | ${formatNumber(off.medianAggregateHeight)} | ${formatNumber(on.medianAggregateHeight)} |`,
    `| Avg bumpiness | ${formatNumber(off.avgBumpiness)} | ${formatNumber(on.avgBumpiness)} |`,
    `| Median bumpiness | ${formatNumber(off.medianBumpiness)} | ${formatNumber(on.medianBumpiness)} |`,
    `| Avg survival time | ${formatNumber(off.avgSurvivalTimeSeconds, 1)}s | ${formatNumber(on.avgSurvivalTimeSeconds, 1)}s |`,
    `| Median survival time | ${formatNumber(off.medianSurvivalTimeSeconds, 1)}s | ${formatNumber(on.medianSurvivalTimeSeconds, 1)}s |`,
  ];
}

function verifyReplay(replay: ReplayDataV2, enableGarbage: boolean): void {
  const gameState = clone(replay.initialState);
  const playerIds = Object.keys(gameState.players);
  const rngChannelsByPlayer = new Map<string, RngChannels>();
  for (const [index, playerId] of playerIds.entries()) {
    const slot = replay.playerSlots?.[playerId] ?? index;
    const channels = createPlayerRngChannels(replay.seed, slot);
    // Scenario creates players (and consumes initial piece/shop RNG) before
    // the replay starts. Warm the reconstructed channels to the same point.
    makePlayer(`replay-${playerId}`, channels);
    rngChannelsByPlayer.set(playerId, channels);
  }

  const inputsByTick = new Map<number, ReplayInputFrame[]>();
  for (const frame of replay.inputs) {
    const frames = inputsByTick.get(frame.tick) ?? [];
    frames.push(frame);
    inputsByTick.set(frame.tick, frames);
  }

  const replayedEvents: MatchEvent[] = [];
  const finalTick = replay.keyframes[replay.keyframes.length - 1]?.tick ?? 0;

  for (let tick = 1; tick <= finalTick; tick += 1) {
    if (gameState.status !== 'playing') break;

    for (const frame of inputsByTick.get(tick) ?? []) {
      const player = gameState.players[frame.playerId];
      if (!player) throw new Error(`Replay ${replay.seed}: missing player ${frame.playerId}`);

      if (frame.kind === 'inputState' && frame.inputState) {
        player.inputState = clone(frame.inputState);
      } else if (frame.kind === 'action' && frame.action) {
        player.actionQueue.push(frame.action);
      } else if (frame.kind === 'shopOpen') {
        const accepted = openPlayerShop(player, gameState.tick);
        if (accepted !== frame.accepted) {
          throw new Error(
            `Replay ${replay.seed}: shopOpen mismatch at tick ${tick} player=${frame.playerId} recorded=${frame.accepted} actual=${accepted} phase=${player.shop.phase} index=${player.shop.cycleIndex} offers=${player.shop.offerIds.join(',')}`,
          );
        }
      } else if (frame.kind === 'shopPurchase') {
        const opponentId = playerIds.find((id) => id !== frame.playerId);
        const opponent = opponentId ? gameState.players[opponentId] : null;
        const channels = rngChannelsByPlayer.get(frame.playerId);
        if (!channels) throw new Error(`Replay ${replay.seed}: missing RNG for ${frame.playerId}`);
        const accepted = applyShopPurchase(gameState, player, opponent, frame.itemId, channels.shop);
        if (accepted !== frame.accepted) {
          throw new Error(`Replay ${replay.seed}: shopPurchase mismatch at tick ${tick}`);
        }
      }
    }

    const stepResult = matchStep(gameState, rngChannelsByPlayer, {
      enableShop: true,
      enableGarbage,
    });
    replayedEvents.push(...stepResult.events);
    const expectedKeyframe = replay.keyframes.find((keyframe) => keyframe.tick === tick);
    if (expectedKeyframe && stableSerialize(gameState.players) !== stableSerialize(expectedKeyframe.players)) {
      const actualScores = playerIds.map((id) => `${id}:${gameState.players[id].score}`).join(',');
      const expectedScores = playerIds.map((id) => `${id}:${expectedKeyframe.players[id].score}`).join(',');
      throw new Error(
        `Replay ${replay.seed}: keyframe mismatch at tick ${tick} actualScores=${actualScores} expectedScores=${expectedScores} firstDiff=${firstDifference(gameState.players, expectedKeyframe.players)}`,
      );
    }
    if (stepResult.matchEnded) break;
  }

  if (gameState.tick !== finalTick) {
    throw new Error(`Replay ${replay.seed}: final tick mismatch (${gameState.tick} !== ${finalTick})`);
  }
  if (stableSerialize(replayedEvents) !== stableSerialize(replay.events)) {
    throw new Error(`Replay ${replay.seed}: event log mismatch`);
  }

  const finalKeyframe = replay.keyframes[replay.keyframes.length - 1];
  if (!finalKeyframe || stableSerialize(gameState.players) !== stableSerialize(finalKeyframe.players)) {
    throw new Error(`Replay ${replay.seed}: final keyframe mismatch`);
  }
}

function runOne(
  seed: number,
  mode: GarbageMode,
  seconds: number,
  keyframeIntervalTicks: number,
  outDir: string,
  powerup: PowerupConfig,
  roleMode: ReplayRoleMode,
): RunResult {
  const enableGarbage = mode === 'garbage-on';
  const drivers: Record<string, RecordingDriver> = {
    p1: makeRecordingDriver(enableGarbage),
    p2: makeRecordingDriver(enableGarbage),
  };
  const scenario = new Scenario({
    seed,
    playerIds: PLAYER_IDS,
    drivers,
    enableShop: true,
    enableGarbage,
  });
  const initialState = clone(scenario.getReport().gameState);
  const keyframes: ReplayKeyframe[] = [buildKeyframe(0, initialState.players, drivers)];
  const maxTicks = seconds * 60;

  for (let i = 0; i < maxTicks; i += 1) {
    const before = scenario.getReport();
    if (before.status !== 'playing') break;

    const purchasers = roleMode === 'mirror' ? PLAYER_IDS : ['p1'] as const;
    for (const playerId of purchasers) purchasePowerupWhenAvailable(scenario, playerId, powerup);

    const after = scenario.advance(1);
    if (after.gameState.tick % keyframeIntervalTicks === 0 || after.status !== 'playing') {
      keyframes.push(buildKeyframe(after.gameState.tick, after.gameState.players, drivers));
    }
  }

  const finalReport = scenario.getReport();
  const inputs = sortReplayInputs([
    ...drivers.p1.inputFrames,
    ...drivers.p2.inputFrames,
    ...shopFramesFromScenario(finalReport.commandRecords, powerup),
  ]);
  const replay: ReplayDataV2 = {
    version: 2,
    date: runDate,
    seed,
    playerSlots: { p1: 0, p2: 1 },
    keyframeIntervalTicks,
    initialState,
    inputs,
    keyframes,
    events: finalReport.events,
  };

  verifyReplay(replay, enableGarbage);

  const modeDir = path.join(outDir, mode);
  fs.mkdirSync(modeDir, { recursive: true });
  const replayPath = path.join(modeDir, `seed-${seed}.json`);
  const serialized = JSON.stringify(replay);
  fs.writeFileSync(replayPath, serialized, 'utf8');

  const acceptedPurchases = finalReport.commandRecords.filter(
    (record) => record.kind === 'purchase' && record.accepted,
  );
  const acceptedPurchasesByPlayer = Object.fromEntries(
    PLAYER_IDS.map((playerId) => [
      playerId,
      acceptedPurchases.filter((record) => record.playerId === playerId).length,
    ]),
  );

  const playerMetrics = Object.fromEntries(
    PLAYER_IDS.map((playerId) => {
      const player = finalReport.gameState.players[playerId];
      const pressure = computePlayerPressure(player);
      const metrics: PlayerRunMetrics = {
        score: finalReport.metrics[playerId].score,
        linesCleared: finalReport.metrics[playerId].linesCleared,
        topOut: finalReport.metrics[playerId].topOut,
        survivalTicks: finalReport.finalTick,
        holes: pressure.holes,
        cavityDepth: pressure.totalCavityDepth ?? 0,
        aggregateHeight: pressure.aggregateHeight,
        bumpiness: pressure.bumpiness,
      };
      return [playerId, metrics];
    }),
  ) as Record<string, PlayerRunMetrics>;

  return {
    mode,
    roleMode,
    seed,
    finalTick: finalReport.finalTick,
    status: finalReport.status,
    winnerId: finalReport.winnerId,
    purchases: acceptedPurchases.length,
    acceptedPurchasesByPlayer,
    scores: Object.fromEntries(PLAYER_IDS.map((id) => [id, finalReport.metrics[id].score])),
    linesCleared: Object.fromEntries(PLAYER_IDS.map((id) => [id, finalReport.metrics[id].linesCleared])),
    topOut: Object.fromEntries(PLAYER_IDS.map((id) => [id, finalReport.metrics[id].topOut])),
    playerMetrics,
  replayPath: path.relative(process.cwd(), replayPath).split(path.sep).join('/'),
    replayBytes: Buffer.byteLength(serialized),
    ...(roleMode === 'buyer-recipient' ? { buyerId: 'p1' as const, recipientId: 'p2' as const } : {}),
  };
}

const config = parseArgs(process.argv.slice(2));
const powerup = POWERUPS[config.powerup];
const shopItem = SHOP_ITEM_BY_ID.get(powerup.itemId);
if (!shopItem) throw new Error(`Missing ${powerup.itemId} from shop catalog`);

const isMirror = config.roleMode === 'mirror';
const outputDirectory = isMirror ? `${powerup.outputDirectory}-mirror` : powerup.outputDirectory;
const reportPath = isMirror
  ? powerup.reportPath.replace('-evidence.md', '-mirror-evidence.md')
  : powerup.reportPath;
const outDir = path.resolve(`fixtures/replays/${outputDirectory}`);
fs.mkdirSync(outDir, { recursive: true });
const runDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const seeds = Array.from({ length: config.runs }, (_, index) => config.seedStart + index * config.seedStep);
const results: RunResult[] = [];

const summaryPath = path.join(outDir, 'summary.json');
if (config.mode !== 'both' && fs.existsSync(summaryPath)) {
  const previous = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as { results?: RunResult[] };
  results.push(...(previous.results ?? []).filter(
    (result) => (result.mode !== config.mode || !seeds.includes(result.seed)) &&
      (result.roleMode ?? 'buyer-recipient') === config.roleMode,
  ));
}

console.log(`[${powerup.displayName} Replay Generator] ${config.runs} seeds × garbage off/on, ${config.seconds}s each`);
console.log(`[${powerup.displayName} Replay Generator] seeds=${seeds.join(',')}`);
console.log(`[${powerup.displayName} Replay Generator] shop pool=[${SHOP_ROLL_POOL.map((item) => item.id).join(',')}]`);

const modes = config.mode === 'both'
  ? (['garbage-off', 'garbage-on'] as const)
  : [config.mode];
for (const mode of modes) {
  for (const seed of seeds) {
    const result = runOne(seed, mode, config.seconds, config.keyframeIntervalTicks, outDir, powerup, config.roleMode);
    results.push(result);
    console.log(
      `[${powerup.displayName} Replay Generator] ${mode} seed=${seed} tick=${result.finalTick} purchases=${result.purchases} bytes=${result.replayBytes}`,
    );
  }
}
results.sort((left, right) => left.mode.localeCompare(right.mode) || left.seed - right.seed);
const reportSeeds = [...new Set(results.map((result) => result.seed))].sort((a, b) => a - b);
const evidenceRunsPerMode = Math.min(
  ...(['garbage-off', 'garbage-on'] as const).map(
    (mode) => results.filter((result) => result.mode === mode).length,
  ),
);

const summary = {
  schemaVersion: 2,
  experiment: isMirror ? `${powerup.key}-mirror-matches` : `${powerup.key}-buyer-only`,
  roleMode: config.roleMode,
  itemId: powerup.itemId,
  itemName: shopItem.name,
  itemCost: shopItem.cost,
  runsPerMode: evidenceRunsPerMode,
  secondsPerRun: config.seconds,
  observationMode: 'player-limited',
  enableShop: true,
  shopRollPool: SHOP_ROLL_POOL.map((item) => item.id),
  keyframeIntervalTicks: config.keyframeIntervalTicks,
  seeds: reportSeeds,
  analytics: Object.fromEntries(
    (['garbage-off', 'garbage-on'] as const).map((mode) => [
      mode,
      {
        pooled: summarizeMode(results.filter((result) => result.mode === mode)),
        ...(isMirror ? {} : {
          buyer: summarizeMode(results.filter((result) => result.mode === mode), 'buyer'),
          recipient: summarizeMode(results.filter((result) => result.mode === mode), 'recipient'),
        }),
      },
    ]),
  ),
  results,
};
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

const analyticsByMode = {
  'garbage-off': summarizeMode(results.filter((result) => result.mode === 'garbage-off')),
  'garbage-on': summarizeMode(results.filter((result) => result.mode === 'garbage-on')),
} satisfies Record<GarbageMode, ModeAnalytics>;
const roleAnalytics = {
  buyer: {
    'garbage-off': summarizeMode(results.filter((result) => result.mode === 'garbage-off'), 'buyer'),
    'garbage-on': summarizeMode(results.filter((result) => result.mode === 'garbage-on'), 'buyer'),
  },
  recipient: {
    'garbage-off': summarizeMode(results.filter((result) => result.mode === 'garbage-off'), 'recipient'),
    'garbage-on': summarizeMode(results.filter((result) => result.mode === 'garbage-on'), 'recipient'),
  },
} satisfies Record<'buyer' | 'recipient', Record<GarbageMode, ModeAnalytics>>;

const replayNote = powerup.key === 'bomber'
  ? 'The replay viewer suppresses Bomber shard animation for sparse keyframe transitions because a 120-tick board diff cannot distinguish Bomber-cleared cells from ordinary line-clear removals. The authoritative board state and live-game Bomber animation remain enabled.'
  : powerup.key === 'satellite'
    ? 'Satellite timing is represented by the authoritative pending-garbage arrival ticks in each replay; the replay viewer does not synthesize a separate Satellite animation.'
    : powerup.key === 'magnet'
      ? 'Magnet gravity is represented by the authoritative player gravity state in each replay; the replay viewer does not synthesize a separate Magnet animation.'
      : powerup.key === 'snag'
        ? 'Snag is represented by the authoritative hard/soft-drop blocking state and recorded input frames; the replay viewer does not synthesize a separate Snag animation.'
        : powerup.key === 'sticky'
          ? 'Sticky is represented by the authoritative lock-reset cap and recorded input frames; the replay viewer does not synthesize a separate Sticky animation.'
          : 'Curtain is represented by the authoritative swap cutoff, active effect, and player-limited masked board; the replay viewer does not synthesize a separate blackout animation.';

const botMechanicNote = powerup.key === 'magnet'
  ? 'RulesBot v1 uses the player-visible Magnet stacks and current-piece boost to penalize placements whose estimated control window is already exceeded; the metrics below are the corrected v1 baseline after rerunning the matched suite.'
  : powerup.key === 'curtain'
    ? 'RulesBot v1 remembers the last visible board while it remains inferable. In garbage-enabled matches, hidden garbage makes that snapshot stale, so the known match rule selects a low-assumption recovery policy that never reads the authoritative concealed board.'
    : '';

const primaryAnalytics = isMirror
  ? [
      '### Pooled mirror-match metrics',
      '',
      ...analyticsTable(analyticsByMode),
    ]
  : [
      '### Curtain buyer',
      '',
      ...analyticsTable(roleAnalytics.buyer, 'Buyer survival'),
      '',
      '### Curtain recipient',
      '',
      ...analyticsTable(roleAnalytics.recipient, 'Recipient survival'),
      '',
      '### Pooled (secondary)',
      '',
      ...analyticsTable(analyticsByMode),
    ];

const markdown = [
  `# ${powerup.displayName} ${isMirror ? 'mirror-match' : 'buyer-only'} RulesBot replay suite`,
  '',
  `- Seeds per mode: ${evidenceRunsPerMode}`,
  `- Duration per seed: ${config.seconds}s`,
  `- Observation mode: player-limited`,
  '- Shop pool: normal catalog roll pool',
  ...(isMirror
    ? [`- Both p1 and p2 may purchase \`${powerup.itemId}\` (${powerup.displayName}); this is a mirror-match suite, not recipient-impact evidence`]
    : [`- Only p1 may purchase \`${powerup.itemId}\` (${powerup.displayName})`]),
  `- Keyframe interval: ${config.keyframeIntervalTicks} ticks`,
  '- Evidence type: deterministic in-process simulation',
  ...(isMirror ? ['- Purchase roles: both players are symmetric buyers; no recipient role is assigned'] : ['- Purchase roles: p1 is the only buyer; p2 is the recipient']),
  '',
  `| Mode | Runs | Total accepted ${powerup.displayName} purchases | Runs with a purchase |`,
  '| --- | ---: | ---: | ---: |',
];
for (const mode of ['garbage-off', 'garbage-on'] as const) {
  const modeResults = results.filter((result) => result.mode === mode);
  markdown.push(
    `| ${mode} | ${modeResults.length} | ${modeResults.reduce((sum, result) => sum + result.purchases, 0)} | ${modeResults.filter((result) => result.purchases > 0).length} |`,
  );
}
markdown.push(
  '',
  '## Analytics',
  '',
  `Buyer and recipient metrics are primary. Pooled metrics are secondary. Survival is a trajectory that did not top out before the ${config.seconds}-second cap; intervals use Wilson 95% confidence limits.`,
  '',
  ...primaryAnalytics,
  '',
  'Each JSON replay includes the recorded shop-open/purchase frames and is self-verified against authoritative `matchStep` before being written.',
  '',
);
fs.writeFileSync(path.join(outDir, 'README.md'), markdown.join('\n'), 'utf8');

const report = [
  `# ${powerup.displayName} replay evidence`,
  '',
  `Generated ${runDate} from the ${powerup.displayName} ${isMirror ? 'mirror-match' : 'buyer-only'} RulesBot replay suite.`,
  '',
  '## Configuration',
  '',
  `- ${evidenceRunsPerMode} matched seeds per mode: \`${reportSeeds.join(', ')}\``,
  `- ${config.seconds}-second cap per match; ${results.length} matches and ${results.length * 2} pooled player trajectories total`,
  '- Observation mode: `player-limited`',
  '- Shop enabled with the normal catalog roll pool',
  ...(isMirror
    ? [`- Both p1 and p2 may purchase \`${powerup.itemId}\` (${powerup.displayName})`, '- Role contract: symmetric mirror matches; do not interpret as recipient-impact evidence']
    : [`- Only p1 purchases \`${powerup.itemId}\` (${powerup.displayName}); p2 makes no shop purchases`, '- Role contract: `p1` is the only powerup buyer; `p2` is the recipient']),
  `- Authoritative mechanic under test: ${powerup.mechanicDescription}`,
  ...(botMechanicNote ? [`- ${botMechanicNote}`] : []),
  `- Replay keyframes every ${config.keyframeIntervalTicks} ticks; each replay is checked against authoritative \`matchStep\` before being written`,
  '- Evidence type: deterministic in-process simulation, not browser/live-network evidence',
  '',
  '## Results',
  '',
  ...primaryAnalytics,
  '',
  `| Mode | Matches | Player trajectories | Surviving trajectories | Accepted ${powerup.displayName} purchases |`,
  '| --- | ---: | ---: | ---: | ---: |',
  ...(['garbage-off', 'garbage-on'] as const).map((mode) => {
    const modeResults = results.filter((result) => result.mode === mode);
    const analytics = analyticsByMode[mode];
    return `| ${mode} | ${modeResults.length} | ${analytics.trajectoryCount} | ${analytics.survivingTrajectories} | ${modeResults.reduce((sum, result) => sum + result.purchases, 0)} |`;
  }),
  '',
  '## Replay artifacts',
  '',
  `- [${powerup.displayName} replay folder](../../fixtures/replays/${outputDirectory}/)`,
  `- [Garbage-off replays](../../fixtures/replays/${outputDirectory}/garbage-off/)`,
  `- [Garbage-on replays](../../fixtures/replays/${outputDirectory}/garbage-on/)`,
  `- [Machine-readable summary](../../fixtures/replays/${outputDirectory}/summary.json)`,
  '',
  replayNote,
  '',
];
fs.writeFileSync(path.resolve(reportPath), report.join('\n'), 'utf8');

console.log(`[${powerup.displayName} Replay Generator] wrote ${results.length} verified replays to ${outDir}`);
