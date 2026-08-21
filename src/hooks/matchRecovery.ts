import type { MatchAssignment } from '../types';
import { DISCONNECT_SEAT_LEASE_MS } from '../constants';

export type MatchRecoveryDependencies = {
  requestAssignment: () => Promise<MatchAssignment | null>;
  wait: (milliseconds: number) => Promise<void>;
  now?: () => number;
  deadlineMs?: number;
};

export type MatchRecoveryReason = 'transport' | 'ticket' | 'runtime';

export function canContinueMatchRecovery(input: {
  reason: MatchRecoveryReason;
  attempts: number;
  nowMs: number;
  deadlineAtMs: number;
}): boolean {
  if (input.nowMs >= input.deadlineAtMs) return false;
  if (input.reason === 'runtime') return true;
  return input.attempts < 1;
}

export async function pollForMatchRecoveryAssignment(
  dependencies: MatchRecoveryDependencies,
): Promise<MatchAssignment | null> {
  const now = dependencies.now ?? Date.now;
  const deadline = now() + (dependencies.deadlineMs ?? DISCONNECT_SEAT_LEASE_MS);
  let delay = 250;

  while (now() < deadline) {
    const assignment = await dependencies.requestAssignment();
    if (assignment !== null) return assignment;
    await dependencies.wait(delay);
    delay = Math.min(delay * 2, 4_000);
  }

  return null;
}
