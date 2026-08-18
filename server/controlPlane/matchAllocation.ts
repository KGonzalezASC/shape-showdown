import type { Database } from './database.js';
import { MatchStore, type JoinTicket, type MatchRecord } from './matchStore.js';
import { QueueStore } from './queueLobbyStore.js';

export type MatchAllocation = {
  match: MatchRecord;
  tickets: {
    A: JoinTicket;
    B: JoinTicket;
  };
};

export class MatchAllocationService {
  public constructor(private readonly database: Database) {}

  public async allocateNextMatch(input: {
    correlationId: string;
    matchSeed: number;
    gameServerUrl: string;
    protocolVersion: number;
  }): Promise<MatchAllocation | null> {
    return this.database.begin(async (transaction) => {
      const pair = await new QueueStore(transaction).claimPair();
      if (pair === null) return null;

      const matches = new MatchStore(transaction);
      const match = await matches.createMatch({
        correlationId: input.correlationId,
        matchSeed: input.matchSeed,
        playerAId: pair[0].playerId,
        playerBId: pair[1].playerId,
        gameServerUrl: input.gameServerUrl,
        protocolVersion: input.protocolVersion,
      });
      const ticketA = await matches.issueJoinTicket({
        matchId: match.id,
        playerId: pair[0].playerId,
        seat: 'A',
      });
      const ticketB = await matches.issueJoinTicket({
        matchId: match.id,
        playerId: pair[1].playerId,
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
}
