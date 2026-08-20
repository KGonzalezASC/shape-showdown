import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { io as ioClient } from 'socket.io-client';
import { createDatabase } from './database.js';
import { MatchStore, type JoinTicket } from './matchStore.js';
import { runMigrations } from './migrations.js';
import { startGameServer, type RunningGameServer } from '../gameServer.js';
import type {
  MatchAssignment,
  SocketAuthErrorCode,
  SocketAuthErrorPayload,
} from '../../src/types.js';
import { GAME_PROTOCOL_VERSION } from '../../src/protocol/version.js';

const database = createDatabase();

describe('Socket match protocol contract', () => {
  if (database === null) {
    it('requires DATABASE_URL', { skip: 'DATABASE_URL is not configured' }, () => {});
    return;
  }

  after(async () => {
    await database.end({ timeout: 1 });
  });

  it('returns stable codes for consumed, wrong-player, wrong-seat, protocol, and cross-match tickets', async () => {
    await runMigrations(database, `${process.cwd()}/db/migrations`);

    const playerIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const matchIds = [randomUUID(), randomUUID()];
    let server: RunningGameServer | null = null;

    try {
      await database`
        INSERT INTO players (id, display_name, auth_provider)
        VALUES
          (${playerIds[0]}, 'Protocol Test A', 'guest'),
          (${playerIds[1]}, 'Protocol Test B', 'guest'),
          (${playerIds[2]}, 'Protocol Test C', 'guest'),
          (${playerIds[3]}, 'Protocol Test D', 'guest')
      `;
      await insertPlayingMatch(matchIds[0], playerIds[0], playerIds[1]);
      await insertPlayingMatch(matchIds[1], playerIds[2], playerIds[3]);

      const matches = new MatchStore(database);
      const ticketA = await matches.issueJoinTicket({
        matchId: matchIds[0],
        playerId: playerIds[0],
        seat: 'A',
      });
      const consumedTicket = await matches.issueJoinTicket({
        matchId: matchIds[0],
        playerId: playerIds[0],
        seat: 'A',
      });
      const wrongPlayerTicket = await matches.issueJoinTicket({
        matchId: matchIds[0],
        playerId: playerIds[0],
        seat: 'A',
      });
      const wrongSeatTicket = await matches.issueJoinTicket({
        matchId: matchIds[0],
        playerId: playerIds[0],
        seat: 'A',
      });
      const protocolTicket = await matches.issueJoinTicket({
        matchId: matchIds[0],
        playerId: playerIds[0],
        seat: 'A',
      });
      await matches.consumeJoinTicket(consumedTicket.ticket);

      server = await startGameServer({
        mode: 'production',
        config: {
          port: 0,
          host: '127.0.0.1',
          serveClient: false,
          replayKeyframeIntervalTicks: 30,
        },
      });

      assert.equal(
        (await expectConnectError(server.origin, toAuth(consumedTicket, {
          protocolVersion: GAME_PROTOCOL_VERSION,
          clientProtocolVersion: GAME_PROTOCOL_VERSION,
        }))).code,
        'MATCH_TICKET_CONSUMED',
      );
      assert.equal(
        (await expectConnectError(server.origin, {
          ...toAuth(wrongPlayerTicket, {
            protocolVersion: GAME_PROTOCOL_VERSION,
            clientProtocolVersion: GAME_PROTOCOL_VERSION,
          }),
          playerId: playerIds[2],
        })).code,
        'MATCH_TICKET_REJECTED',
      );
      assert.equal(
        (await expectConnectError(server.origin, {
          ...toAuth(wrongSeatTicket, {
            protocolVersion: GAME_PROTOCOL_VERSION,
            clientProtocolVersion: GAME_PROTOCOL_VERSION,
          }),
          seat: 'B',
        })).code,
        'MATCH_SEAT_REJECTED',
      );
      assert.equal(
        (await expectConnectError(server.origin, {
          ...toAuth(protocolTicket, {
            protocolVersion: GAME_PROTOCOL_VERSION,
            clientProtocolVersion: 1,
          }),
        })).code,
        'PROTOCOL_VERSION_MISMATCH',
      );
      assert.equal(
        (await expectConnectError(server.origin, {
          ...toAuth(ticketA, {
            protocolVersion: GAME_PROTOCOL_VERSION,
            clientProtocolVersion: GAME_PROTOCOL_VERSION,
          }),
          matchId: matchIds[1],
        })).code,
        'MATCH_TICKET_REJECTED',
      );
    } finally {
      if (server !== null) await server.stop();
      await database`DELETE FROM matches WHERE id IN ${database(matchIds)}`;
      await database`DELETE FROM players WHERE id IN ${database(playerIds)}`;
    }
  });
});

async function insertPlayingMatch(
  matchId: string,
  playerAId: string,
  playerBId: string,
): Promise<void> {
  await database!`
    INSERT INTO matches (
      id, correlation_id, match_seed, player_a_id, player_b_id,
      game_server_url, protocol_version, status
    )
    VALUES (
      ${matchId}, ${randomUUID()}, 12345, ${playerAId}, ${playerBId},
      'http://127.0.0.1:3000', ${GAME_PROTOCOL_VERSION}, 'playing'
    )
  `;
}

function toAuth(
  ticket: JoinTicket,
  overrides: { protocolVersion: number; clientProtocolVersion: number },
): MatchAssignment & { clientProtocolVersion: number } {
  return {
    matchId: ticket.matchId,
    playerId: ticket.playerId,
    seat: ticket.seat,
    ticket: ticket.ticket,
    matchSeed: 12345,
    protocolVersion: overrides.protocolVersion,
    clientProtocolVersion: overrides.clientProtocolVersion,
  };
}

function expectConnectError(
  origin: string,
  auth: MatchAssignment & { clientProtocolVersion?: number },
): Promise<SocketAuthErrorPayload> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(origin, {
      auth,
      transports: ['websocket'],
      reconnection: false,
    });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for Socket.IO connect_error'));
    }, 3_000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.close();
      reject(new Error('Expected Socket.IO connection to be rejected'));
    });
    socket.on('connect_error', (error: Error & { data?: unknown }) => {
      clearTimeout(timeout);
      socket.close();
      const data = error.data;
      if (isSocketAuthErrorPayload(data)) {
        resolve(data);
        return;
      }
      reject(new Error(`Socket.IO error did not contain a stable code: ${error.message}`));
    });
  });
}

function isSocketAuthErrorPayload(value: unknown): value is SocketAuthErrorPayload {
  return isRecord(value)
    && isSocketAuthErrorCode(value.code)
    && typeof value.message === 'string';
}

function isSocketAuthErrorCode(value: unknown): value is SocketAuthErrorCode {
  return [
    'MATCH_TICKET_REQUIRED',
    'MATCH_TICKET_REJECTED',
    'MATCH_TICKET_CONSUMED',
    'MATCH_SEAT_REJECTED',
    'MATCH_THIRD_SOCKET',
    'PROTOCOL_VERSION_MISMATCH',
    'MATCH_RUNTIME_UNAVAILABLE',
    'MATCH_VOIDED',
  ].includes(value as SocketAuthErrorCode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
