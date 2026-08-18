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
};

const PROTOCOL_VERSION = 1;

export class PostgresMatchPersistence implements MatchPersistence {
  public constructor(
    private readonly database: Database,
    private readonly gameServerUrl: string,
  ) {}

  public async startMatch(input: StartDurableMatchInput) {
    return this.database.begin(async (transaction) => {
      const matches = new MatchStore(transaction);
      const match = await matches.createMatch({
        correlationId: randomUUID(),
        matchSeed: input.matchSeed,
        playerAId: input.participants.A,
        playerBId: input.participants.B,
        gameServerUrl: this.gameServerUrl,
        protocolVersion: PROTOCOL_VERSION,
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
  }

  public async advanceStatus(input: AdvanceDurableMatchInput): Promise<void> {
    const transition = await new MatchStore(this.database).updateMatchStatus(input);
    if (transition === null) {
      throw new Error(
        `Durable match status transition failed for ${input.matchId}: `
        + `${input.expectedStatus} -> ${input.nextStatus}`,
      );
    }
  }

  public async finalizeMatch(input: DurableMatchFinalization): Promise<void> {
    await this.database.begin(async (transaction) => {
      await new MatchStore(transaction).updateMatchStatus({
        matchId: input.matchId,
        expectedStatus: 'playing',
        nextStatus: 'ended',
      });
      await new MatchResultStore(transaction).insertMatchResult(input);
    });
  }
}
