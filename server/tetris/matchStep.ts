import {
  GameState,
  MatchEvent,
  RESTART_DELAY_SECONDS,
} from '../../src/types.js';
import type { RngChannels } from '../../src/rng.js';
import type { MatchStepOptions, StepResult } from './stepTypes.js';
import {
  enqueueGarbage,
  stepPlayer,
  tickSeconds,
} from './engine.js';

const MATCH_EVENT_ORDER: Record<MatchEvent['type'], number> = {
  lineClear: 10,
  garbageApplied: 20,
  attackSent: 30,
  poisonSpread: 40,
  shopRoll: 50,
  tectonicStep: 60,
  tectonicComplete: 70,
  topOut: 80,
};

export function canonicalMatchEvents(events: MatchEvent[]): MatchEvent[] {
  return [...events].sort((left, right) => (
    (left.tick - right.tick)
    || (MATCH_EVENT_ORDER[left.type] - MATCH_EVENT_ORDER[right.type])
    || left.playerId.localeCompare(right.playerId)
  ));
}

export interface MatchTickResult {
  tick: number;
  stepResults: Record<string, StepResult>;
  events: MatchEvent[];
  matchEnded: boolean;
  winnerId: string | null;
}

export type PlayerRngLookup = ((playerId: string) => RngChannels) | Record<string, RngChannels> | Map<string, RngChannels>;

function getPlayerRng(lookup: PlayerRngLookup, playerId: string): RngChannels {
  if (typeof lookup === 'function') {
    return lookup(playerId);
  }
  if (lookup instanceof Map) {
    const rng = lookup.get(playerId);
    if (!rng) throw new Error(`No RNG channels for player ${playerId}`);
    return rng;
  }
  const rng = lookup[playerId];
  if (!rng) throw new Error(`No RNG channels for player ${playerId}`);
  return rng;
}

export function matchStep(
  gameState: GameState,
  playerRngLookup: PlayerRngLookup,
  options?: MatchStepOptions,
): MatchTickResult {
  if (gameState.status !== 'playing') {
    return {
      tick: gameState.tick,
      stepResults: {},
      events: [],
      matchEnded: false,
      winnerId: gameState.winnerId,
    };
  }

  gameState.tick += 1;
  gameState.remainingTime = Math.max(0, gameState.remainingTime - tickSeconds());

  const matchEvents: MatchEvent[] = [];
  const pids = Object.keys(gameState.players);
  const stepResults: Record<string, StepResult> = {};
  let matchEndedThisTick = false;

  // Pass 1: step both players independently (no opponent mutation during step)
  for (const id of pids) {
    if (gameState.status !== 'playing') break;
    const player = gameState.players[id];
    const rng = getPlayerRng(playerRngLookup, id);
    const stepRes = stepPlayer(gameState.tick, player, rng, matchEvents, options);
    stepResults[id] = stepRes;

    if (player.topOut) {
      gameState.status = 'ended';
      const opponentId = pids.find((pid) => pid !== id);
      gameState.winnerId = opponentId ?? null;
      gameState.restartTimer = RESTART_DELAY_SECONDS;
      matchEndedThisTick = true;
      break;
    }
  }

  // Pass 2: commit outgoing attacks to opponents
  if (gameState.status === 'playing' && options?.enableGarbage !== false) {
    for (const id of pids) {
      const attack = stepResults[id]?.attackLinesQueued ?? 0;
      if (attack > 0) {
        const opponentId = pids.find((pid) => pid !== id);
        const opponent = opponentId ? gameState.players[opponentId] : null;
        if (opponent) {
          enqueueGarbage(opponent, attack, gameState.tick);
          matchEvents.push({
            tick: gameState.tick,
            type: 'attackSent',
            playerId: id,
            lines: attack,
          });
        }
      }
    }
  }

  const orderedEvents = canonicalMatchEvents(matchEvents);

  return {
    tick: gameState.tick,
    stepResults,
    events: orderedEvents,
    matchEnded: matchEndedThisTick,
    winnerId: gameState.winnerId,
  };
}
