import type {
  ActionType,
  GameState,
  InputState,
  MatchEvent,
  PlayerState,
  ReplayDataV2,
  ReplayInputFrame,
} from '../../src/types.js';
import { createPlayerRngChannels, type RngChannels } from '../../src/rng.js';
import { applyShopPurchase, openPlayerShop } from '../shop.js';
import { PRICING_POLICY_VERSION } from '../../src/shop/shopPricing.js';
import { matchStep } from '../puzzleEngine/matchStep.js';
import type { DriverObservation, InputDriver, PlayerCommand } from './inputDriver.js';

export interface ReplayVerificationOptions {
  strictReplayMode?: boolean;
}

export interface ReplayDivergenceReport {
  diverged: boolean;
  tick?: number;
  reason?: string;
}

export interface ReplayRunResult {
  seed: number;
  finalTick: number;
  status: GameState['status'];
  winnerId: string | null;
  divergence?: ReplayDivergenceReport;
  replayedEvents: MatchEvent[];
  replayedKeyframes: Array<{ tick: number; players: Record<string, PlayerState>; rng?: Record<string, RngChannels> }>;
  gameState: GameState;
}

export interface ReplayCursor {
  gameState: GameState;
  rngChannels: Map<string, RngChannels>;
}

export interface ReplayToTickOptions extends ReplayVerificationOptions {
  fromCursor?: ReplayCursor;
}

export interface ReplayToTickResult {
  seed: number;
  tick: number;
  finalTick: number;
  status: GameState['status'];
  winnerId: string | null;
  divergence?: ReplayDivergenceReport;
  replayedEvents: MatchEvent[];
  events: MatchEvent[];
  gameState: GameState;
  cursor: ReplayCursor;
}

export interface ReplayEffectSpan {
  id: string;
  kind: string;
  label: string;
  startTick: number;
  endTick: number;
}

/** Driver implementation for playing back recorded input state and action frames. */
class ReplayDriver implements InputDriver {
  private readonly framesByTick = new Map<number, ReplayInputFrame[]>();

  constructor(frames: readonly ReplayInputFrame[]) {
    for (const frame of frames) {
      const list = this.framesByTick.get(frame.tick) ?? [];
      list.push(frame);
      this.framesByTick.set(frame.tick, list);
    }
  }

  next(observation: DriverObservation): PlayerCommand {
    const frames = (this.framesByTick.get(observation.tick) ?? [])
      .filter((frame) => frame.playerId === observation.player.player.id);
    let inputState: InputState | undefined;
    const actions: ActionType[] = [];

    for (const frame of frames) {
      if (frame.kind === 'inputState' && frame.inputState) {
        inputState = {
          left: !!frame.inputState.left,
          right: !!frame.inputState.right,
          softDrop: !!frame.inputState.softDrop,
        };
      } else if (frame.kind === 'action' && frame.action) {
        actions.push(frame.action);
      }
    }

    return { inputState, actions };
  }
}

/** Computes the total span in ticks from recorded keyframes, events, and inputs. */
export function getReplayTotalTicks(replayData: ReplayDataV2): number {
  return Math.max(
    0,
    ...replayData.keyframes.map((k) => k.tick),
    ...replayData.events.map((e) => e.tick),
    ...replayData.inputs.map((i) => i.tick),
  );
}

/**
 * Reconstructs game state at an exact target tick.
 * Resumes from the latest keyframe containing RNG at or before targetTick (or kickoff),
 * applying inputs and advancing matchStep to reach targetTick.
 */
export function replayToTick(
  replayData: ReplayDataV2,
  targetTick: number,
  options?: ReplayToTickOptions,
): ReplayToTickResult {
  if (!replayData || replayData.version !== 2) {
    throw new Error(`Unsupported or malformed replay data (expected version 2)`);
  }

  if (
    replayData.pricingPolicyVersion !== undefined &&
    replayData.pricingPolicyVersion !== PRICING_POLICY_VERSION
  ) {
    throw new Error(`Unsupported replay pricing policy: ${replayData.pricingPolicyVersion}`);
  }
  const isLegacyPricingReplay = replayData.pricingPolicyVersion === undefined;

  const totalTicks = getReplayTotalTicks(replayData);
  const desiredTick = Math.max(0, Math.min(totalTicks, Math.floor(targetTick)));

  // Find latest snapshot with RNG at or before desiredTick
  let bestKeyframe: import('../../src/types.js').ReplayKeyframe | null = null;
  for (const k of replayData.keyframes) {
    if (k.tick <= desiredTick && k.rng !== undefined && Object.keys(k.rng).length > 0) {
      if (!bestKeyframe || k.tick > bestKeyframe.tick) {
        bestKeyframe = k;
      }
    }
  }
  const bestKeyframeTick = bestKeyframe ? bestKeyframe.tick : 0;

  let gameState: GameState;
  const rngChannelsByPlayer = new Map<string, RngChannels>();
  let startTick = 0;

  if (
    options?.fromCursor &&
    options.fromCursor.gameState.tick <= desiredTick &&
    options.fromCursor.gameState.tick >= bestKeyframeTick
  ) {
    gameState = JSON.parse(JSON.stringify(options.fromCursor.gameState));
    for (const [id, ch] of options.fromCursor.rngChannels.entries()) {
      rngChannelsByPlayer.set(id, structuredClone(ch));
    }
    startTick = gameState.tick;
  } else if (bestKeyframe) {
    gameState = {
      ...JSON.parse(JSON.stringify(replayData.initialState)),
      tick: bestKeyframe.tick,
      players: JSON.parse(JSON.stringify(bestKeyframe.players)),
      status: 'playing',
    };
    for (const [id, ch] of Object.entries(bestKeyframe.rng!)) {
      rngChannelsByPlayer.set(id, structuredClone(ch));
    }
    startTick = bestKeyframe.tick;
  } else {
    gameState = JSON.parse(JSON.stringify(replayData.initialState));
    gameState.tick = 0;
    const pids = Object.keys(gameState.players);
    pids.forEach((id, index) => {
      const slot = replayData.playerSlots?.[id] ?? index;
      rngChannelsByPlayer.set(id, createPlayerRngChannels(replayData.seed, slot));
    });
    startTick = 0;
  }

  const inputsByTick = new Map<number, ReplayInputFrame[]>();
  for (const frame of replayData.inputs) {
    if (frame.tick > startTick && frame.tick <= desiredTick) {
      const list = inputsByTick.get(frame.tick) ?? [];
      list.push(frame);
      inputsByTick.set(frame.tick, list);
    }
  }

  const pids = Object.keys(gameState.players);
  const replayedEvents: MatchEvent[] = [];
  let divergence: ReplayDivergenceReport | undefined;

  for (let tick = startTick + 1; tick <= desiredTick; tick++) {
    if (gameState.status !== 'playing') break;

    const frames = inputsByTick.get(tick) ?? [];
    for (const frame of frames) {
      const player = gameState.players[frame.playerId];
      if (!player) continue;

      if (frame.kind === 'inputState' && frame.inputState) {
        player.inputState = {
          left: !!frame.inputState.left,
          right: !!frame.inputState.right,
          softDrop: !!frame.inputState.softDrop,
        };
      } else if (frame.kind === 'action' && frame.action) {
        player.actionQueue.push(frame.action);
      } else if (frame.kind === 'shopOpen') {
        const accepted = openPlayerShop(player, gameState.tick);
        if (!divergence && options?.strictReplayMode && frame.accepted !== undefined && frame.accepted !== accepted) {
          divergence = {
            diverged: true,
            tick,
            reason: `shopOpen acceptance mismatch for ${frame.playerId}: recorded ${frame.accepted}, actual ${accepted}`,
          };
        }
      } else if (frame.kind === 'shopPurchase' && frame.itemId) {
        const opponentId = pids.find((id) => id !== frame.playerId);
        const opponent = opponentId ? gameState.players[opponentId] : null;
        const channels = rngChannelsByPlayer.get(frame.playerId)!;
        const accepted = applyShopPurchase(
          gameState,
          player,
          opponent,
          frame.itemId,
          channels.shop,
          isLegacyPricingReplay
            ? {
                pricingMode: 'legacy',
                ...(frame.cost === undefined ? {} : { overrideCost: frame.cost }),
              }
            : undefined,
        );

        if (!divergence && options?.strictReplayMode && frame.accepted !== undefined && frame.accepted !== accepted) {
          divergence = {
            diverged: true,
            tick,
            reason: `shopPurchase acceptance mismatch for ${frame.playerId} on ${frame.itemId}: recorded ${frame.accepted}, actual ${accepted}`,
          };
        }
      }
    }

    const stepRes = matchStep(gameState, rngChannelsByPlayer);
    replayedEvents.push(...stepRes.events);
    if (stepRes.matchEnded) break;
  }

  const cursor: ReplayCursor = {
    gameState: JSON.parse(JSON.stringify(gameState)),
    rngChannels: new Map([...rngChannelsByPlayer.entries()].map(([id, ch]) => [id, structuredClone(ch)])),
  };

  return {
    seed: gameState.seed,
    tick: gameState.tick,
    finalTick: gameState.tick,
    status: gameState.status,
    winnerId: gameState.winnerId,
    divergence,
    replayedEvents,
    events: replayedEvents,
    gameState,
    cursor,
  };
}

/**
 * Derives accurate active effect durations by stepping the replay tape.
 * Prevents missing short effects when keyframes are sparse (e.g. 5s / 300 ticks).
 */
export function extractReplayEffectSpans(
  replayData: ReplayDataV2,
  totalTicks?: number,
): Record<string, ReplayEffectSpan[]> {
  const maxTick = totalTicks ?? getReplayTotalTicks(replayData);
  const gameState: GameState = JSON.parse(JSON.stringify(replayData.initialState));
  const pids = Object.keys(gameState.players);
  const rngChannelsByPlayer = new Map<string, RngChannels>();

  pids.forEach((id, index) => {
    const slot = replayData.playerSlots?.[id] ?? index;
    rngChannelsByPlayer.set(id, createPlayerRngChannels(replayData.seed, slot));
  });

  const inputsByTick = new Map<number, ReplayInputFrame[]>();
  for (const frame of replayData.inputs) {
    const list = inputsByTick.get(frame.tick) ?? [];
    list.push(frame);
    inputsByTick.set(frame.tick, list);
  }

  const isLegacyPricingReplay = replayData.pricingPolicyVersion === undefined;

  const resultSpans: Record<string, ReplayEffectSpan[]> = {};
  const activeSpansByPlayer: Record<string, Map<string, ReplayEffectSpan>> = {};
  for (const pid of pids) {
    resultSpans[pid] = [];
    activeSpansByPlayer[pid] = new Map<string, ReplayEffectSpan>();
  }

  const recordActiveEffects = (currentTick: number) => {
    for (const pid of pids) {
      const player = gameState.players[pid];
      if (!player) continue;
      const activeMap = activeSpansByPlayer[pid];
      const currentActiveIds = new Set<string>();

      for (const effect of player.activeEffects) {
        const effectKey = `${effect.id}:${effect.kind}`;
        currentActiveIds.add(effectKey);
        const knownEnd = effect.expiresAtTick ?? currentTick;
        const existing = activeMap.get(effectKey);
        if (existing) {
          existing.endTick = Math.max(existing.endTick, currentTick, knownEnd);
        } else {
          activeMap.set(effectKey, {
            id: effect.id,
            kind: effect.kind,
            label: effect.label,
            startTick: currentTick,
            endTick: Math.max(currentTick, knownEnd),
          });
        }
      }

      for (const [effectKey, span] of activeMap.entries()) {
        if (!currentActiveIds.has(effectKey)) {
          resultSpans[pid].push(span);
          activeMap.delete(effectKey);
        }
      }
    }
  };

  recordActiveEffects(0);

  for (let tick = 1; tick <= maxTick; tick++) {
    if (gameState.status !== 'playing') break;

    const frames = inputsByTick.get(tick) ?? [];
    for (const frame of frames) {
      const player = gameState.players[frame.playerId];
      if (!player) continue;

      if (frame.kind === 'inputState' && frame.inputState) {
        player.inputState = {
          left: !!frame.inputState.left,
          right: !!frame.inputState.right,
          softDrop: !!frame.inputState.softDrop,
        };
      } else if (frame.kind === 'action' && frame.action) {
        player.actionQueue.push(frame.action);
      } else if (frame.kind === 'shopOpen') {
        openPlayerShop(player, gameState.tick);
      } else if (frame.kind === 'shopPurchase' && frame.itemId) {
        const opponentId = pids.find((id) => id !== frame.playerId);
        const opponent = opponentId ? gameState.players[opponentId] : null;
        const channels = rngChannelsByPlayer.get(frame.playerId)!;
        applyShopPurchase(
          gameState,
          player,
          opponent,
          frame.itemId,
          channels.shop,
          isLegacyPricingReplay
            ? {
                pricingMode: 'legacy',
                ...(frame.cost === undefined ? {} : { overrideCost: frame.cost }),
              }
            : undefined,
        );
      }
    }

    const stepRes = matchStep(gameState, rngChannelsByPlayer);
    recordActiveEffects(gameState.tick);
    if (stepRes.matchEnded) break;
  }

  for (const pid of pids) {
    resultSpans[pid].push(...activeSpansByPlayer[pid].values());
  }

  return resultSpans;
}

/** Replays a full ReplayDataV2 input tape through authoritative matchStep and shop handlers. */
export function replayMatch(
  replayData: ReplayDataV2,
  options?: ReplayVerificationOptions,
): ReplayRunResult {
  if (!replayData || replayData.version !== 2) {
    throw new Error(`Unsupported or malformed replay data (expected version 2)`);
  }

  const gameState: GameState = JSON.parse(JSON.stringify(replayData.initialState));
  const pids = Object.keys(gameState.players);
  const rngChannelsByPlayer = new Map<string, RngChannels>();

  pids.forEach((id, index) => {
    const slot = replayData.playerSlots?.[id] ?? index;
    rngChannelsByPlayer.set(id, createPlayerRngChannels(replayData.seed, slot));
  });

  const inputsByTick = new Map<number, ReplayInputFrame[]>();
  for (const frame of replayData.inputs) {
    const list = inputsByTick.get(frame.tick) ?? [];
    list.push(frame);
    inputsByTick.set(frame.tick, list);
  }

  const replayedEvents: MatchEvent[] = [];
  if (
    replayData.pricingPolicyVersion !== undefined &&
    replayData.pricingPolicyVersion !== PRICING_POLICY_VERSION
  ) {
    throw new Error(`Unsupported replay pricing policy: ${replayData.pricingPolicyVersion}`);
  }
  const isLegacyPricingReplay = replayData.pricingPolicyVersion === undefined;

  const initialRng: Record<string, RngChannels> = {};
  for (const [id, ch] of rngChannelsByPlayer.entries()) {
    initialRng[id] = structuredClone(ch);
  }
  const replayedKeyframes: Array<{ tick: number; players: Record<string, PlayerState>; rng?: Record<string, RngChannels> }> = [
    {
      tick: 0,
      players: JSON.parse(JSON.stringify(gameState.players)),
      rng: initialRng,
    },
  ];

  let divergence: ReplayDivergenceReport | undefined;
  const keyframeInterval = replayData.keyframeIntervalTicks ?? 300;
  const maxTick = getReplayTotalTicks(replayData);

  for (let tick = 1; tick <= maxTick; tick++) {
    if (gameState.status !== 'playing') break;

    const frames = inputsByTick.get(tick) ?? [];
    for (const frame of frames) {
      const player = gameState.players[frame.playerId];
      if (!player) continue;

      if (frame.kind === 'inputState' && frame.inputState) {
        player.inputState = {
          left: !!frame.inputState.left,
          right: !!frame.inputState.right,
          softDrop: !!frame.inputState.softDrop,
        };
      } else if (frame.kind === 'action' && frame.action) {
        player.actionQueue.push(frame.action);
      } else if (frame.kind === 'shopOpen') {
        const accepted = openPlayerShop(player, gameState.tick);
        if (!divergence && options?.strictReplayMode && frame.accepted !== undefined && frame.accepted !== accepted) {
          divergence = {
            diverged: true,
            tick,
            reason: `shopOpen acceptance mismatch for ${frame.playerId}: recorded ${frame.accepted}, actual ${accepted}`,
          };
        }
      } else if (frame.kind === 'shopPurchase' && frame.itemId) {
        const opponentId = pids.find((id) => id !== frame.playerId);
        const opponent = opponentId ? gameState.players[opponentId] : null;
        const channels = rngChannelsByPlayer.get(frame.playerId)!;
        const accepted = applyShopPurchase(
          gameState,
          player,
          opponent,
          frame.itemId,
          channels.shop,
          isLegacyPricingReplay
            ? {
                pricingMode: 'legacy',
                ...(frame.cost === undefined ? {} : { overrideCost: frame.cost }),
              }
            : undefined,
        );

        if (!divergence && options?.strictReplayMode && frame.accepted !== undefined && frame.accepted !== accepted) {
          divergence = {
            diverged: true,
            tick,
            reason: `shopPurchase acceptance mismatch for ${frame.playerId} on ${frame.itemId}: recorded ${frame.accepted}, actual ${accepted}`,
          };
        }
      }
    }

    const stepRes = matchStep(gameState, rngChannelsByPlayer);
    replayedEvents.push(...stepRes.events);

    if (tick % keyframeInterval === 0 || stepRes.matchEnded) {
      const clonedRng: Record<string, RngChannels> = {};
      for (const [id, ch] of rngChannelsByPlayer.entries()) {
        clonedRng[id] = structuredClone(ch);
      }
      replayedKeyframes.push({
        tick: gameState.tick,
        players: JSON.parse(JSON.stringify(gameState.players)),
        rng: clonedRng,
      });
    }

    if (stepRes.matchEnded) break;
  }

  return {
    seed: gameState.seed,
    finalTick: gameState.tick,
    status: gameState.status,
    winnerId: gameState.winnerId,
    divergence,
    replayedEvents,
    replayedKeyframes,
    gameState,
  };
}
