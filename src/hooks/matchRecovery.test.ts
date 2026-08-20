import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { MatchAssignment } from '../types';
import { pollForMatchRecoveryAssignment } from './matchRecovery';

const assignment: MatchAssignment = {
  matchId: 'match-1',
  playerId: 'player-1',
  seat: 'A',
  ticket: 'ticket-1',
  matchSeed: 123,
  protocolVersion: 2,
};

describe('match recovery assignment polling', () => {
  test('backs off while the durable match has no replacement ticket', async () => {
    const delays: number[] = [];
    let attempts = 0;

    const result = await pollForMatchRecoveryAssignment({
      requestAssignment: async () => {
        attempts += 1;
        return attempts === 3 ? assignment : null;
      },
      wait: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    assert.deepEqual(result, assignment);
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [250, 500]);
  });

  test('stops polling after the recovery deadline', async () => {
    let clock = 0;
    let attempts = 0;

    const result = await pollForMatchRecoveryAssignment({
      requestAssignment: async () => {
        attempts += 1;
        return null;
      },
      wait: async (milliseconds) => {
        clock += milliseconds;
      },
      now: () => clock,
      deadlineMs: 1_000,
    });

    assert.equal(result, null);
    assert.equal(attempts, 3);
  });
});
