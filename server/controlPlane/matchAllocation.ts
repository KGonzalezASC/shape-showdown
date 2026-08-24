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

  /**
   * Drains the queue once per tick in strict-pool priority order: guild,
   * discord-only, then global. The first successful claim wins; a younger
   * scoped pair can therefore beat an older global pair. That ordering is a
   * deliberate product choice, not global FIFO across pools.
   */
  public async allocateNextMatch(input: {
    correlationId: string;
    matchSeed: number;
    gameServerUrl: string;
    protocolVersion: number;
  }): Promise<MatchAllocation | null> {
    return this.database.begin(async (transaction) => {
      const queue = new QueueStore(transaction);
      const claimed =
        (await queue.claimGuildPair())
        ?? (await queue.claimScopePair('discord_only'))
        ?? (await queue.claimScopePair('global'));
      if (claimed === null) return null;

      const [first, second] = claimed.pair;
      const matches = new MatchStore(transaction);
      const match = await matches.createMatch({
        correlationId: input.correlationId,
        matchSeed: input.matchSeed,
        playerAId: first.playerId,
        playerBId: second.playerId,
        gameServerUrl: input.gameServerUrl,
        protocolVersion: input.protocolVersion,
        searchScope: claimed.searchScope,
        guildId: claimed.guildId,
        isRepeatPairing: claimed.isRepeatPairing,
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
