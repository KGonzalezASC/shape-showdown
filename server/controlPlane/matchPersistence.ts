import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import {
  MatchStore,
  type JoinTicket,
  type MatchRecord,
  type MatchStatus,
} from './matchStore.js';
import {
  MatchResultStore,
  type MatchResultInput,
} from './matchResultStore.js';
import { logInfo } from '../observability/logger.js';
import { GAME_PROTOCOL_VERSION } from '../../src/protocol/version.js';

export type DurableMatchParticipants = {
  A: string;
  B: string;
};

export type StartDurableMatchInput = {
  matchSeed: number;
  participants: DurableMatchParticipants;
};

export type AdvanceDurableMatchInput = {
  matchId: string;
  expectedStatus: MatchStatus;
  nextStatus: MatchStatus;
};

export type DurableMatchFinalization = Omit<MatchResultInput, 'matchId'> & {
  matchId: string;
};

export type MatchCheckpoint = {
  simTick: number;
  stateBlob: Uint8Array;
};

export type MatchPersistence = {
  startMatch(input: StartDurableMatchInput): Promise<{
    match: MatchRecord;
    tickets: {
      A: JoinTicket;
      B: JoinTicket;
    };
  }>;
  advanceStatus(input: AdvanceDurableMatchInput): Promise<void>;
  finalizeMatch(input: DurableMatchFinalization): Promise<void>;
  writeCheckpoint?(input: {
    matchId: string;
    simTick: number;
    stateBlob: Uint8Array;
  }): Promise<void>;
  getLatestCheckpoint?(matchId: string): Promise<MatchCheckpoint | null>;
};

export class PostgresMatchPersistence implements MatchPersistence {
  public constructor(
    private readonly database: Database,
    private readonly gameServerUrl: string,
  ) {}

  public async startMatch(input: StartDurableMatchInput) {
    const allocation = await this.database.begin(async (transaction) => {
      const matches = new MatchStore(transaction);
      const match = await matches.createMatch({
        correlationId: randomUUID(),
        matchSeed: input.matchSeed,
        playerAId: input.participants.A,
        playerBId: input.participants.B,
        gameServerUrl: this.gameServerUrl,
        protocolVersion: GAME_PROTOCOL_VERSION,
      });

      const ticketA = await matches.issueJoinTicket({
        matchId: match.id,
        playerId: input.participants.A,
        seat: 'A',
      });
      const ticketB = await matches.issueJoinTicket({
        matchId: match.id,
        playerId: input.participants.B,
        seat: 'B',
      });

      return {
        match,
        tickets: {
          A: ticketA,
          B: ticketB,
        },
      };
    });
    logInfo('durable_match_created', {
      correlationId: allocation.match.correlationId,
      matchId: allocation.match.id,
      playerAId: allocation.match.playerAId,
      playerBId: allocation.match.playerBId,
    });
    return allocation;
  }

  public async advanceStatus(input: AdvanceDurableMatchInput): Promise<void> {
    const transition = await new MatchStore(this.database).updateMatchStatus(input);
    if (transition === null) {
      throw new Error(
        `Durable match status transition failed for ${input.matchId}: `
        + `${input.expectedStatus} -> ${input.nextStatus}`,
      );
    }
    logInfo('durable_match_status_changed', {
      matchId: input.matchId,
      nextStatus: input.nextStatus,
      previousStatus: input.expectedStatus,
    });
  }

  public async finalizeMatch(input: DurableMatchFinalization): Promise<void> {
    await this.database.begin(async (transaction) => {
      const matches = new MatchStore(transaction);
      await matches.finalizeActiveMatchStatus(input.matchId, 'ended');
      await new MatchResultStore(transaction).insertMatchResult(input);
      await matches.deleteMatchTickets(input.matchId);
    });
    logInfo('durable_match_finalized', {
      matchId: input.matchId,
      outcomeReason: input.outcomeReason,
      winnerId: input.winnerId,
    });
  }

  public async writeCheckpoint(input: {
    matchId: string;
    simTick: number;
    stateBlob: Uint8Array;
  }): Promise<void> {
    await this.database.begin(async (transaction) => {
      await transaction`
        INSERT INTO match_checkpoints (match_id, sim_tick, state_blob)
        VALUES (${input.matchId}, ${input.simTick}, ${input.stateBlob})
      `;
      await transaction`
        DELETE FROM match_checkpoints
        WHERE match_id = ${input.matchId}
          AND id NOT IN (
            SELECT id
            FROM match_checkpoints
            WHERE match_id = ${input.matchId}
            ORDER BY sim_tick DESC, id DESC
            LIMIT 2
          )
      `;
    });
    logInfo('durable_match_checkpoint_written', {
      matchId: input.matchId,
      simTick: input.simTick,
    });
  }

  public async getLatestCheckpoint(matchId: string): Promise<MatchCheckpoint | null> {
    const rows = await this.database<{
      sim_tick: number;
      state_blob: Uint8Array;
    }[]>`
      SELECT sim_tick, state_blob
      FROM match_checkpoints
      WHERE match_id = ${matchId}
      ORDER BY sim_tick DESC, id DESC
      LIMIT 1
    `;
    const row = rows[0];
    return row
      ? { simTick: row.sim_tick, stateBlob: row.state_blob }
      : null;
  }
}
