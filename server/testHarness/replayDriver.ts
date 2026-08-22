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
  replayedKeyframes: Array<{ tick: number; players: Record<string, PlayerState> }>;
  gameState: GameState;
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
  const replayedKeyframes: Array<{ tick: number; players: Record<string, PlayerState> }> = [
    {
      tick: 0,
      players: JSON.parse(JSON.stringify(gameState.players)),
    },
  ];

  let divergence: ReplayDivergenceReport | undefined;
  const keyframeInterval = replayData.keyframeIntervalTicks ?? 30;
  const maxTick = Math.max(
    0,
    ...replayData.keyframes.map((k) => k.tick),
    ...replayData.events.map((e) => e.tick),
    ...replayData.inputs.map((i) => i.tick),
  );

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
      replayedKeyframes.push({
        tick: gameState.tick,
        players: JSON.parse(JSON.stringify(gameState.players)),
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
