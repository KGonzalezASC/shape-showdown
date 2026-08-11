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

export type PairKey = 'retrim-curtain' | 'elixir-wild-purge' | 'elixir-wildcard-four';
export type PairSequence = 'forward' | 'reverse' | 'valid' | 'reverse-negative';
export type GarbageMode = 'garbage-off' | 'garbage-on';
export type ReplayRoleMode = 'buyer-recipient' | 'mirror';

export interface PairConfig {
  key: PairKey;
  displayName: string;
  setupItemId: string;
  payoffItemId: string;
  reportPath: string;
  description: string;
}

export const PAIRS: Record<PairKey, PairConfig> = {
  'retrim-curtain': {
    key: 'retrim-curtain',
    displayName: 'Re-Trim & Curtain',
    setupItemId: 'retrim',
    payoffItemId: 'curtain',
    reportPath: 'docs/baseline/pairs/retrim-curtain.md',
    description: 'Re-Trim immediately satisfies Curtain setup; order is optional (Re-Trim -> Curtain or Curtain -> Re-Trim).',
  },
  'elixir-wild-purge': {
    key: 'elixir-wild-purge',
    displayName: 'Elixir into Wild Purge',
    setupItemId: 'elixir-pulse',
    payoffItemId: 'vortex-step',
    reportPath: 'docs/baseline/pairs/elixir-wild-purge.md',
    description: 'Mandatory sequence: Elixir -> visible opponent poison activation -> Wild Purge payoff.',
  },
  'elixir-wildcard-four': {
    key: 'elixir-wildcard-four',
    displayName: 'Elixir into Wildcard +4',
    setupItemId: 'elixir-pulse',
    payoffItemId: 'wildcard-four',
    reportPath: 'docs/baseline/pairs/elixir-wildcard-four.md',
    description: 'Mandatory sequence: Elixir -> visible opponent poison activation -> Wildcard +4 payoff.',
  },
};

const PLAYER_IDS = ['p1', 'p2'] as const;
const DEFAULT_RUNS = 15;
const DEFAULT_SECONDS = 120;
const DEFAULT_SEED_START = 910000;
const DEFAULT_SEED_STEP = 17;
const DEFAULT_KEYFRAME_INTERVAL_TICKS = 120;

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

interface RunResult {
  roleMode: ReplayRoleMode;
  mode: GarbageMode;
  sequence: PairSequence;
  seed: number;
  finalTick: number;
  status: GameState['status'];
  winnerId: string | null;
  purchases: number;
  acceptedPurchasesByPlayer: Record<string, number>;
  setupPurchasesByPlayer: Record<string, number>;
  payoffPurchasesByPlayer: Record<string, number>;
  rejectedAttemptsByPlayer: Record<string, number>;
  scores: Record<string, number>;
  linesCleared: Record<string, number>;
  topOut: Record<string, boolean>;
  playerMetrics: Record<string, PlayerRunMetrics>;
  replayPath: string;
  replayBytes: number;
  buyerId?: 'p1';
  recipientId?: 'p2';
}

interface RecordingDriver extends InputDriver {
  readonly inputFrames: ReplayInputFrame[];
  readonly bot: RulesBot;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

function parseArgs(args: string[]): {
  pair: PairKey;
  sequence: PairSequence;
  runs: number;
  seconds: number;
  seedStart: number;
  seedStep: number;
  keyframeIntervalTicks: number;
  mode: GarbageMode;
  roleMode: ReplayRoleMode;
} {
  const config = {
    pair: 'retrim-curtain' as PairKey,
    sequence: 'forward' as PairSequence,
    runs: DEFAULT_RUNS,
    seconds: DEFAULT_SECONDS,
    seedStart: DEFAULT_SEED_START,
    seedStep: DEFAULT_SEED_STEP,
    keyframeIntervalTicks: DEFAULT_KEYFRAME_INTERVAL_TICKS,
    mode: 'garbage-off' as GarbageMode,
    roleMode: 'buyer-recipient' as ReplayRoleMode,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--pair' && next) {
      if (!['retrim-curtain', 'elixir-wild-purge', 'elixir-wildcard-four'].includes(next)) {
        throw new Error(`Unsupported pair: ${next}`);
      }
      config.pair = next as PairKey;
    }
    if (arg === '--sequence' && next) {
      if (!['forward', 'reverse', 'valid', 'reverse-negative'].includes(next)) {
        throw new Error(`Unsupported sequence: ${next}`);
      }
      config.sequence = next as PairSequence;
    }
    if (arg === '--runs' && next) config.runs = Number(next);
    if (arg === '--seconds' && next) config.seconds = Number(next);
    if (arg === '--seed-start' && next) config.seedStart = Number(next);
    if (arg === '--seed-step' && next) config.seedStep = Number(next);
    if (arg === '--keyframe-interval' && next) config.keyframeIntervalTicks = Number(next);
    if (arg === '--mode' && next) {
      if (!['garbage-off', 'garbage-on'].includes(next)) {
        throw new Error(`Unsupported mode: ${next}`);
      }
      config.mode = next as GarbageMode;
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
      const catalogCost = SHOP_ITEM_BY_ID.get(detail.itemId)?.cost;
      frames.push({
        tick,
        playerId: record.playerId,
        kind: 'shopPurchase',
        itemId: detail.itemId,
        accepted: record.accepted ?? false,
        cost: catalogCost,
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

function verifyReplay(replay: ReplayDataV2, enableGarbage: boolean): void {
  const gameState = clone(replay.initialState);
  const playerIds = Object.keys(gameState.players);
  const rngChannelsByPlayer = new Map<string, RngChannels>();
  for (const [index, playerId] of playerIds.entries()) {
    const slot = replay.playerSlots?.[playerId] ?? index;
    const channels = createPlayerRngChannels(replay.seed, slot);
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
          throw new Error(`Replay ${replay.seed}: shopOpen mismatch at tick ${tick}`);
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
    if (stepResult.matchEnded) break;
  }
}

type PlayerPairState = {
  phase: 'setup' | 'waiting-for-activation' | 'payoff' | 'complete';
  attemptedReverseNegative?: boolean;
};

function executePairShopLogic(
  scenario: Scenario,
  playerId: string,
  pairConfig: PairConfig,
  sequence: PairSequence,
  playerPairStates: Record<string, PlayerPairState>,
): void {
  const player = scenario.getPlayerState(playerId);
  const pState = playerPairStates[playerId] ?? { phase: 'setup' };
  playerPairStates[playerId] = pState;

  const opponentId = PLAYER_IDS.find((id) => id !== playerId);
  const opponent = opponentId ? scenario.getPlayerState(opponentId) : null;

  // Determine item targets based on sequence
  let firstItem = pairConfig.setupItemId;
  let secondItem = pairConfig.payoffItemId;
  if (sequence === 'reverse') {
    firstItem = pairConfig.payoffItemId;
    secondItem = pairConfig.setupItemId;
  }

  const isElixirPair = pairConfig.key === 'elixir-wild-purge' || pairConfig.key === 'elixir-wildcard-four';

  // Handling reverse-negative control sequence for Elixir pairs
  if (sequence === 'reverse-negative') {
    if (!pState.attemptedReverseNegative) {
      const payoffCost = SHOP_ITEM_BY_ID.get(pairConfig.payoffItemId)?.cost ?? 70;
      if (player.score >= payoffCost) {
        if (player.shop.phase === 'ready') {
          scenario.openShop(playerId);
          return;
        }
        if (
          player.shop.phase === 'cycling' &&
          player.shop.cycleIndex >= 0 &&
          player.shop.offerIds[player.shop.cycleIndex] === pairConfig.payoffItemId
        ) {
          // Attempt payoff BEFORE setup (will be rejected by engine because opponent has no poison)
          scenario.purchase(playerId, pairConfig.payoffItemId);
          pState.attemptedReverseNegative = true;
          return;
        }
      }
    }
  }

  // Phase Machine for Pair Purchasing
  if (pState.phase === 'setup') {
    const cost = SHOP_ITEM_BY_ID.get(firstItem)?.cost ?? 50;
    if (player.score < cost) return;
    if (player.shop.phase === 'ready') {
      scenario.openShop(playerId);
      return;
    }
    if (
      player.shop.phase === 'cycling' &&
      player.shop.cycleIndex >= 0 &&
      player.shop.offerIds[player.shop.cycleIndex] === firstItem
    ) {
      const accepted = scenario.purchase(playerId, firstItem);
      if (accepted) {
        pState.phase = isElixirPair ? 'waiting-for-activation' : 'payoff';
      }
    }
    return;
  }

  if (pState.phase === 'waiting-for-activation') {
    // Check if poison is visible on opponent's board
    const opponentPoison = opponent?.poisonBoard ?? [];
    const hasVisiblePoison = opponentPoison.some((row) => row.some((gen) => gen > 0));
    if (hasVisiblePoison) {
      pState.phase = 'payoff';
    } else {
      return;
    }
  }

  if (pState.phase === 'payoff') {
    const cost = SHOP_ITEM_BY_ID.get(secondItem)?.cost ?? 50;
    if (player.score < cost) return;
    if (player.shop.phase === 'ready') {
      scenario.openShop(playerId);
      return;
    }
    if (
      player.shop.phase === 'cycling' &&
      player.shop.cycleIndex >= 0 &&
      player.shop.offerIds[player.shop.cycleIndex] === secondItem
    ) {
      const accepted = scenario.purchase(playerId, secondItem);
      if (accepted) {
        pState.phase = 'complete';
      }
    }
  }
}

function runOne(
  seed: number,
  mode: GarbageMode,
  seconds: number,
  keyframeIntervalTicks: number,
  outDir: string,
  pairConfig: PairConfig,
  sequence: PairSequence,
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
  const playerPairStates: Record<string, PlayerPairState> = {
    p1: { phase: 'setup' },
    p2: { phase: 'setup' },
  };

  for (let i = 0; i < maxTicks; i += 1) {
    const before = scenario.getReport();
    if (before.status !== 'playing') break;

    const purchasers = roleMode === 'mirror' ? PLAYER_IDS : (['p1'] as const);
    for (const playerId of purchasers) {
      executePairShopLogic(scenario, playerId, pairConfig, sequence, playerPairStates);
    }

    const after = scenario.advance(1);
    if (after.gameState.tick % keyframeIntervalTicks === 0 || after.status !== 'playing') {
      keyframes.push(buildKeyframe(after.gameState.tick, after.gameState.players, drivers));
    }
  }

  const finalReport = scenario.getReport();
  const inputs = sortReplayInputs([
    ...drivers.p1.inputFrames,
    ...drivers.p2.inputFrames,
    ...shopFramesFromScenario(finalReport.commandRecords),
  ]);
  const runDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

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

  const commandRecords = finalReport.commandRecords;
  const acceptedPurchases = commandRecords.filter((r) => r.kind === 'purchase' && r.accepted);
  const rejectedPurchases = commandRecords.filter((r) => r.kind === 'purchase' && !r.accepted);

  const acceptedPurchasesByPlayer = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, acceptedPurchases.filter((r) => r.playerId === id).length]),
  );

  const setupItem = sequence === 'reverse' ? pairConfig.payoffItemId : pairConfig.setupItemId;
  const payoffItem = sequence === 'reverse' ? pairConfig.setupItemId : pairConfig.payoffItemId;

  const setupPurchasesByPlayer = Object.fromEntries(
    PLAYER_IDS.map((id) => [
      id,
      acceptedPurchases.filter((r) => r.playerId === id && (r.detail as { itemId?: string })?.itemId === setupItem).length,
    ]),
  );
  const payoffPurchasesByPlayer = Object.fromEntries(
    PLAYER_IDS.map((id) => [
      id,
      acceptedPurchases.filter((r) => r.playerId === id && (r.detail as { itemId?: string })?.itemId === payoffItem).length,
    ]),
  );
  const rejectedAttemptsByPlayer = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, rejectedPurchases.filter((r) => r.playerId === id).length]),
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
    sequence,
    seed,
    finalTick: finalReport.finalTick,
    status: finalReport.status,
    winnerId: finalReport.winnerId,
    purchases: acceptedPurchases.length,
    acceptedPurchasesByPlayer,
    setupPurchasesByPlayer,
    payoffPurchasesByPlayer,
    rejectedAttemptsByPlayer,
    scores: Object.fromEntries(PLAYER_IDS.map((id) => [id, finalReport.metrics[id].score])),
    linesCleared: Object.fromEntries(PLAYER_IDS.map((id) => [id, finalReport.metrics[id].linesCleared])),
    topOut: Object.fromEntries(PLAYER_IDS.map((id) => [id, finalReport.metrics[id].topOut])),
    playerMetrics,
    replayPath: path.relative(process.cwd(), replayPath).split(path.sep).join('/'),
    replayBytes: Buffer.byteLength(serialized),
    ...(roleMode === 'buyer-recipient' ? { buyerId: 'p1' as const, recipientId: 'p2' as const } : {}),
  };
}

// Main Execution
const config = parseArgs(process.argv.slice(2));
const pairConfig = PAIRS[config.pair];
if (!pairConfig) throw new Error(`Unknown pair: ${config.pair}`);

const isMirror = config.roleMode === 'mirror';
const subDirName = isMirror ? `${config.sequence}-mirror` : config.sequence;
const outDir = path.resolve(`fixtures/replays/pairs/${pairConfig.key}/${subDirName}`);
fs.mkdirSync(outDir, { recursive: true });

const seeds = Array.from({ length: config.runs }, (_, index) => config.seedStart + index * config.seedStep);
const results: RunResult[] = [];

const summaryPath = path.join(outDir, 'summary.json');
if (fs.existsSync(summaryPath)) {
  const previous = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as { results?: RunResult[] };
  results.push(...(previous.results ?? []).filter(
    (r) => r.mode !== config.mode || !seeds.includes(r.seed),
  ));
}

console.log(`[Pair Replay Generator] Pair: ${pairConfig.displayName} | Seq: ${config.sequence} | Roles: ${config.roleMode} | Mode: ${config.mode}`);
console.log(`[Pair Replay Generator] Output Dir: ${outDir}`);

for (const seed of seeds) {
  const result = runOne(seed, config.mode, config.seconds, config.keyframeIntervalTicks, outDir, pairConfig, config.sequence, config.roleMode);
  results.push(result);
  console.log(
    `[Pair Replay Generator] ${config.mode} seed=${seed} tick=${result.finalTick} purchases=${result.purchases} bytes=${result.replayBytes}`,
  );
}

results.sort((a, b) => a.mode.localeCompare(b.mode) || a.seed - b.seed);

const evidenceRunsPerMode = Math.min(
  ...(['garbage-off', 'garbage-on'] as const).map(
    (m) => results.filter((r) => r.mode === m).length,
  ),
);

const summary = {
  schemaVersion: 2,
  experiment: `${pairConfig.key}-${config.sequence}-${config.roleMode}`,
  pairKey: pairConfig.key,
  pairName: pairConfig.displayName,
  sequence: config.sequence,
  roleMode: config.roleMode,
  runsPerMode: evidenceRunsPerMode,
  secondsPerRun: config.seconds,
  observationMode: 'player-limited',
  shopRollPool: SHOP_ROLL_POOL.map((item) => item.id),
  seeds: [...new Set(results.map((r) => r.seed))].sort((a, b) => a - b),
  results,
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(`[Pair Replay Generator] Wrote summary to ${summaryPath} with ${results.length} total results.`);
