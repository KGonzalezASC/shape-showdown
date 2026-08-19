import type { MatchAssignment } from '../types';

export type MatchRecoveryDependencies = {
  requestAssignment: () => Promise<MatchAssignment | null>;
  wait: (milliseconds: number) => Promise<void>;
  now?: () => number;
  deadlineMs?: number;
};

export async function pollForMatchRecoveryAssignment(
  dependencies: MatchRecoveryDependencies,
): Promise<MatchAssignment | null> {
  const now = dependencies.now ?? Date.now;
  const deadline = now() + (dependencies.deadlineMs ?? 60_000);
  let delay = 250;

  while (now() < deadline) {
    const assignment = await dependencies.requestAssignment();
    if (assignment !== null) return assignment;
    await dependencies.wait(delay);
    delay = Math.min(delay * 2, 4_000);
  }

  return null;
}
