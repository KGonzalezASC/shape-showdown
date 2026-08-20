import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import path from 'node:path';
import { createDatabase } from './database.js';
import { MatchStore } from './matchStore.js';
import { runMigrations } from './migrations.js';
import { GAME_PROTOCOL_VERSION } from '../../src/protocol/version.js';

const database = createDatabase();

describe('MatchStore ticket refresh integration', () => {
  if (database === null) {
    it('requires DATABASE_URL', { skip: 'DATABASE_URL is not configured' }, () => {});
    return;
  }

  after(async () => {
    await database.end({ timeout: 1 });
  });

  it('keeps concurrent replacement tickets valid and retires them at match end', async () => {
    const playerAId = randomUUID();
    const playerBId = randomUUID();
    let matchId: string | null = null;

    try {
      await runMigrations(database, path.join(process.cwd(), 'db', 'migrations'));
      await database`
        INSERT INTO players (id, display_name, auth_provider)
        VALUES
          (${playerAId}, ${'Ticket refresh test A'}, ${'guest'}),
          (${playerBId}, ${'Ticket refresh test B'}, ${'guest'})
      `;

      const matches = new MatchStore(database);
      const match = await matches.createMatch({
        correlationId: randomUUID(),
        matchSeed: 123,
        playerAId,
        playerBId,
        gameServerUrl: 'http://localhost:3000',
        protocolVersion: GAME_PROTOCOL_VERSION,
      });
      matchId = match.id;
      await matches.issueJoinTicket({ matchId, playerId: playerAId, seat: 'A' });
      await matches.issueJoinTicket({ matchId, playerId: playerBId, seat: 'B' });
      const consumedTicket = await matches.issueJoinTicket({
        matchId,
        playerId: playerAId,
        seat: 'A',
      });
      assert.equal((await matches.consumeJoinTicket(consumedTicket.ticket))?.playerId, playerAId);
      assert.equal(await matches.validateJoinTicket(consumedTicket.ticket), null);
      assert.equal(
        await matches.classifyJoinTicketRejection(consumedTicket.ticket),
        'consumed',
      );

      const replacements = await Promise.all(
        Array.from({ length: 40 }, () =>
          database.begin((transaction) =>
            new MatchStore(transaction).issueReplacementJoinTicket({
              matchId,
              playerId: playerAId,
              seat: 'A',
            }),
          ),
        ),
      );
      const validations = await Promise.all(
        replacements.map((ticket) => matches.validateJoinTicket(ticket.ticket)),
      );
      assert.ok(validations.every((ticket) => ticket?.matchId === matchId));

      const rows = await database<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM match_tickets
        WHERE match_id = ${matchId}
      `;
      assert.equal(rows[0]?.count, 42);

      await matches.deleteMatchTickets(matchId);
      const remainingRows = await database<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM match_tickets
        WHERE match_id = ${matchId}
      `;
      assert.equal(remainingRows[0]?.count, 0);
    } finally {
      if (matchId !== null) {
        await database`DELETE FROM matches WHERE id = ${matchId}`;
      }
      await database`DELETE FROM players WHERE id IN (${playerAId}, ${playerBId})`;
    }
  });
});
