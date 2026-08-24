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

  /** Drains bounded waves and creates every pair in one database transaction. */
  public async allocateNextMatch(input: {
    correlationId: string;
    matchSeed: number;
    gameServerUrl: string;
    protocolVersion: number;
  }): Promise<MatchAllocation | null> {
    const allocations = await this.allocateNextMatches(input);
    return allocations[0] ?? null;
  }

  public async allocateNextMatches(input: {
    correlationId: string;
    matchSeed: number;
    gameServerUrl: string;
    protocolVersion: number;
  }): Promise<MatchAllocation[]> {
    return this.database.begin(async (transaction) => {
      const queue = new QueueStore(transaction);
      const claimed =
        (await queue.claimGuildPairs())
        .concat(await queue.claimScopePairs('discord_only'))
        .concat(await queue.claimScopePairs('global'));
      if (claimed.length === 0) return [];

      const matches = new MatchStore(transaction);
      const allocations: MatchAllocation[] = [];
      for (const [index, pair] of claimed.entries()) {
        const [first, second] = pair.pair;
        const match = await matches.createMatch({
          correlationId: input.correlationId,
          matchSeed: input.matchSeed + index,
          playerAId: first.playerId,
          playerBId: second.playerId,
          gameServerUrl: input.gameServerUrl,
          protocolVersion: input.protocolVersion,
          searchScope: pair.searchScope,
          guildId: pair.guildId,
          isRepeatPairing: pair.isRepeatPairing,
          playerASearchAttemptId: first.searchAttemptId,
          playerBSearchAttemptId: second.searchAttemptId,
        });
        const ticketA = await matches.issueJoinTicket({
          matchId: match.id,
          playerId: first.playerId,
          seat: 'A',
        });
        const ticketB = await matches.issueJoinTicket({
          matchId: match.id,
          playerId: second.playerId,
          seat: 'B',
        });
        await matches.markSearchAttemptsMatched({
          matchId: match.id,
          attempts: [
            { id: first.searchAttemptId, generation: first.generation },
            { id: second.searchAttemptId, generation: second.generation },
          ],
        });
        allocations.push({
          match,
          tickets: { A: ticketA, B: ticketB },
        });
      }
      return allocations;
    });
  }
}
