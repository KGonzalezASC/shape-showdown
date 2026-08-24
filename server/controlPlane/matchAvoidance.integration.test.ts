import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import path from 'node:path';
import { createTestDatabase } from './testDatabase.js';
import type { Database } from './database.js';
import { MatchStore } from './matchStore.js';
import { QueueStore } from './queueLobbyStore.js';
import { runMigrations } from './migrations.js';
import { GAME_PROTOCOL_VERSION } from '../../src/protocol/version.js';

const database: Database | null = createTestDatabase();

type SeededPlayer = { playerId: string; sessionId: string };

async function insertPlayer(player: SeededPlayer): Promise<void> {
  await database!`
    INSERT INTO players (id, display_name, auth_provider)
    VALUES (${player.playerId}, ${'avoid-' + player.playerId.slice(0, 8)}, 'guest')
  `;
  await database!`
    INSERT INTO sessions (id, player_id, token_hash, expires_at)
    VALUES (
      ${player.sessionId},
      ${player.playerId},
      ${randomUUID().replaceAll('-', '')},
      CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    )
  `;
}

async function seedPlayers(count: number): Promise<SeededPlayer[]> {
  const players = Array.from({ length: count }, () => ({
    playerId: randomUUID(),
    sessionId: randomUUID(),
  }));
  for (const player of players) {
    await insertPlayer(player);
  }
  return players;
}

async function recordStartedMatch(playerAId: string, playerBId: string): Promise<string> {
  const matchId = randomUUID();
  await database!`
    INSERT INTO matches (
      id, correlation_id, match_seed, player_a_id, player_b_id,
      game_server_url, protocol_version, status,
      created_at, started_at, ended_at
    )
    VALUES (
      ${matchId}, ${randomUUID()}, 12345, ${playerAId}, ${playerBId},
      'http://localhost:3000', ${GAME_PROTOCOL_VERSION}, 'ended',
      CURRENT_TIMESTAMP - INTERVAL '5 minutes',
      CURRENT_TIMESTAMP - INTERVAL '4 minutes',
      CURRENT_TIMESTAMP - INTERVAL '3 minutes'
    )
  `;
  return matchId;
}

async function insertGhostMatch(playerAId: string, playerBId: string): Promise<string> {
  const matchId = randomUUID();
  await database!`
    INSERT INTO matches (
      id, correlation_id, match_seed, player_a_id, player_b_id,
      game_server_url, protocol_version, status, created_at
    )
    VALUES (
      ${matchId}, ${randomUUID()}, 1, ${playerAId}, ${playerBId},
      'http://localhost:3000', ${GAME_PROTOCOL_VERSION}, 'allocating',
      CURRENT_TIMESTAMP
    )
  `;
  return matchId;
}

async function wipeDatabase(): Promise<void> {
  await database!`DELETE FROM match_tickets`;
  await database!`DELETE FROM matches`;
  await database!`DELETE FROM queue_entries`;
  await database!`DELETE FROM lobby_members`;
  await database!`DELETE FROM lobbies`;
  await database!`DELETE FROM sessions`;
  await database!`DELETE FROM players`;
}

async function enqueue(store: QueueStore, player: SeededPlayer, guildId: string | null): Promise<void> {
  const entry = await store.upsertEntry({
    playerId: player.playerId,
    sessionId: player.sessionId,
    searchScope: guildId === null ? 'global' : 'guild',
    guildId,
  });
  assert.notEqual(entry, null);
}

async function cleanup(players: SeededPlayer[], matchIds: string[]): Promise<void> {
  await database!`DELETE FROM queue_entries`;
  if (matchIds.length > 0) {
    await database!`DELETE FROM matches WHERE id = ANY(${matchIds}::uuid[])`;
  }
  if (players.length > 0) {
    const playerIds = players.map((player) => player.playerId);
    await database!`DELETE FROM sessions WHERE player_id = ANY(${playerIds}::uuid[])`;
    await database!`DELETE FROM players WHERE id = ANY(${playerIds}::uuid[])`;
  }
}

describe('recent-opponent avoidance integration', () => {
  if (database === null) {
    it('requires TEST_DATABASE_URL', { skip: 'TEST_DATABASE_URL is not configured' }, () => {});
    return;
  }

  after(async () => {
    await database!.end({ timeout: 1 });
  });

  it('derives avoid_player_id from the latest started match, ignoring ghost allocations', async () => {
    const store = new QueueStore(database!);
    let players: SeededPlayer[] = [];
    const matchIds: string[] = [];
    try {
      await runMigrations(database!, path.join(process.cwd(), 'db', 'migrations'));
      await wipeDatabase();
      players = await seedPlayers(2);
      matchIds.push(await recordStartedMatch(players[0].playerId, players[1].playerId));

      await enqueue(store, players[0], null);
      const avoidRows = await database!<{ avoid_player_id: string | null }[]>`
        SELECT avoid_player_id FROM queue_entries WHERE player_id = ${players[0].playerId}
      `;
      assert.equal(avoidRows[0]?.avoid_player_id, players[1].playerId);

      await store.removeEntry(players[0].playerId);
      matchIds.push(await insertGhostMatch(players[1].playerId, players[0].playerId));
      await enqueue(store, players[0], null);
      const afterGhostRows = await database!<{ avoid_player_id: string | null }[]>`
        SELECT avoid_player_id FROM queue_entries WHERE player_id = ${players[0].playerId}
      `;
      assert.equal(afterGhostRows[0]?.avoid_player_id, players[1].playerId);
    } finally {
      await cleanup(players, matchIds);
    }
  });

  it('pairs twelve finished guild players into six fresh matches', async () => {
    const store = new QueueStore(database!);
    let players: SeededPlayer[] = [];
    const matchIds: string[] = [];
    try {
      await runMigrations(database!, path.join(process.cwd(), 'db', 'migrations'));
      await wipeDatabase();
      players = await seedPlayers(12);

      for (let index = 0; index < 6; index += 1) {
        matchIds.push(await recordStartedMatch(
          players[index * 2].playerId,
          players[index * 2 + 1].playerId,
        ));
      }
      const originalPairs = new Set(
        Array.from({ length: 6 }, (_, index) =>
          [players[index * 2].playerId, players[index * 2 + 1].playerId].sort().join(':')),
      );

      for (const player of players) {
        await enqueue(store, player, 'avoidance-test-guild');
      }

      const freshPairs: string[][] = [];
      for (let claim = 0; claim < 6; claim += 1) {
        const claimedPair = await store.claimGuildPair();
        assert.notEqual(claimedPair, null);
        assert.equal(claimedPair!.isRepeatPairing, false);
        assert.equal(claimedPair!.guildId, 'avoidance-test-guild');
        freshPairs.push(claimedPair!.pair.map((participant) => participant.playerId));
      }
      assert.equal(await store.claimGuildPair(), null);

      const pairedPlayerIds = freshPairs.flat();
      assert.equal(new Set(pairedPlayerIds).size, 12);
      for (const pair of freshPairs) {
        assert.ok(
          !originalPairs.has([...pair].sort().join(':')),
          `allocator recreated original pair ${pair.join(':')}`,
        );
      }
    } finally {
      await cleanup(players, matchIds);
    }
  });

  it('falls back to the previous opponent with a repeat flag when nobody else searches', async () => {
    const store = new QueueStore(database!);
    let players: SeededPlayer[] = [];
    const matchIds: string[] = [];
    try {
      await runMigrations(database!, path.join(process.cwd(), 'db', 'migrations'));
      await wipeDatabase();
      players = await seedPlayers(2);
      matchIds.push(await recordStartedMatch(players[0].playerId, players[1].playerId));

      await enqueue(store, players[0], 'repeat-fallback-guild');
      await enqueue(store, players[1], 'repeat-fallback-guild');

      const claimedPair = await store.claimGuildPair();
      assert.notEqual(claimedPair, null);
      assert.equal(claimedPair!.isRepeatPairing, true);
      assert.deepEqual(
        claimedPair!.pair.map((participant) => participant.playerId).sort(),
        players.map((player) => player.playerId).sort(),
      );
    } finally {
      await cleanup(players, matchIds);
    }
  });

  it('keeps the avoided player queued when a fresh partner exists', async () => {
    const store = new QueueStore(database!);
    let players: SeededPlayer[] = [];
    const matchIds: string[] = [];
    try {
      await runMigrations(database!, path.join(process.cwd(), 'db', 'migrations'));
      await wipeDatabase();
      players = await seedPlayers(3);
      matchIds.push(await recordStartedMatch(players[0].playerId, players[1].playerId));

      await enqueue(store, players[0], 'fresh-partner-guild');
      await enqueue(store, players[1], 'fresh-partner-guild');
      await enqueue(store, players[2], 'fresh-partner-guild');

      const claimedPair = await store.claimGuildPair();
      assert.notEqual(claimedPair, null);
      assert.equal(claimedPair!.isRepeatPairing, false);
      const pairedIds = claimedPair!.pair.map((participant) => participant.playerId);
      assert.ok(pairedIds.includes(players[0].playerId));
      assert.ok(pairedIds.includes(players[2].playerId));

      const remainingRows = await database!<{ player_id: string }[]>`
        SELECT player_id FROM queue_entries WHERE status = 'searching'
      `;
      assert.deepEqual(remainingRows.map((row) => row.player_id), [players[1].playerId]);
    } finally {
      await cleanup(players, matchIds);
    }
  });

  it('cancels never-joined matches past the grace window and spares joined ones', async () => {
    const matches = new MatchStore(database!);
    let players: SeededPlayer[] = [];
    const matchIds: string[] = [];
    try {
      await runMigrations(database!, path.join(process.cwd(), 'db', 'migrations'));
      await wipeDatabase();
      players = await seedPlayers(4);

      const zombieMatchId = randomUUID();
      matchIds.push(zombieMatchId);
      await database!`
        INSERT INTO matches (
          id, correlation_id, match_seed, player_a_id, player_b_id,
          game_server_url, protocol_version, status, created_at
        )
        VALUES (
          ${zombieMatchId}, ${randomUUID()}, 1, ${players[0].playerId}, ${players[1].playerId},
          'http://localhost:3000', ${GAME_PROTOCOL_VERSION}, 'allocating',
          CURRENT_TIMESTAMP - INTERVAL '10 minutes'
        )
      `;
      await matches.issueJoinTicket({
        matchId: zombieMatchId,
        playerId: players[0].playerId,
        seat: 'A',
      });

      const joinedMatchId = randomUUID();
      matchIds.push(joinedMatchId);
      await database!`
        INSERT INTO matches (
          id, correlation_id, match_seed, player_a_id, player_b_id,
          game_server_url, protocol_version, status, created_at
        )
        VALUES (
          ${joinedMatchId}, ${randomUUID()}, 2, ${players[2].playerId}, ${players[3].playerId},
          'http://localhost:3000', ${GAME_PROTOCOL_VERSION}, 'countdown',
          CURRENT_TIMESTAMP - INTERVAL '10 minutes'
        )
      `;
      const consumedTicket = await matches.issueJoinTicket({
        matchId: joinedMatchId,
        playerId: players[2].playerId,
        seat: 'A',
      });
      assert.notEqual(await matches.consumeJoinTicket(consumedTicket.ticket), null);

      const cancelledIds = await matches.cancelNeverJoinedMatches(60);
      assert.deepEqual(cancelledIds.sort(), [zombieMatchId]);

      const zombieStatus = await database!<{ status: string }[]>`
        SELECT status FROM matches WHERE id = ${zombieMatchId}
      `;
      assert.equal(zombieStatus[0]?.status, 'cancelled');

      const joinedStatus = await database!<{ status: string }[]>`
        SELECT status FROM matches WHERE id = ${joinedMatchId}
      `;
      assert.equal(joinedStatus[0]?.status, 'countdown');

      const activeForZombiePlayer = await matches.findActiveMatchForPlayer(players[0].playerId);
      assert.equal(activeForZombiePlayer, null);
    } finally {
      await cleanup(players, matchIds);
    }
  });
});
