import type { NameDropPlan } from './nameDropShared';

export interface NameDropPlaybackClock {
  plan: NameDropPlan | null;
  cycle: number;
  startedAt: number;
}

/**
 * Redraws such as responsive resizes keep the existing clock. A different
 * plan or cycle is the only reason to begin the falling sequence again.
 */
export function syncNameDropPlaybackClock(
  clock: NameDropPlaybackClock,
  plan: NameDropPlan,
  cycle: number,
  now: number,
): NameDropPlaybackClock {
  if (clock.plan === plan && clock.cycle === cycle) return clock;
  return { plan, cycle, startedAt: now };
}
