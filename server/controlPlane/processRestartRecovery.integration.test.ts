import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createDatabase } from './database.js';
import { MatchStore } from './matchStore.js';
import { runMigrations } from './migrations.js';
import { startGameServer, type RunningGameServer } from '../gameServer.js';
import { makePlayer } from '../puzzleEngine/engine.js';
import { createPlayerRngChannels } from '../../src/rng.js';
import type { GameState, MatchAssignment } from '../../src/types.js';

const database = createDatabase();

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address === null || typeof address === 'string') {
        srv.close(() => reject(new Error('Could not obtain free port')));
        return;
      }
      const port = address.port;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  description: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${description} after ${timeoutMs}ms`);
}

async function createGuestPlayerAndSession(serverOrigin: string, displayName: string): Promise<{
  playerId: string;
  token: string;
}> {
  const response = await fetch(`${serverOrigin}/api/players/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create guest player: status ${response.status}`);
  }
  const data = (await response.json()) as {
    player: { id: string };
    session: { token: string };
  };
  return {
    playerId: data.player.id,
    token: data.session.token,
  };
}

async function enqueuePlayer(serverOrigin: string, token: string): Promise<void> {
  const response = await fetch(`${serverOrigin}/api/queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to enqueue player: status ${response.status}`);
  }
}

async function pollMatchAssignment(serverOrigin: string, token: string): Promise<MatchAssignment> {
  let assignment: MatchAssignment | null = null;
  await waitFor(async () => {
    const response = await fetch(`${serverOrigin}/api/match-assignment`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.status === 200) {
      assignment = (await response.json()) as MatchAssignment;
      return true;
    }
    return false;
  }, 'match assignment allocation', 15_000);

  if (assignment === null) {
    throw new Error('Match assignment was null after poll');
  }
  return assignment;
}

function connectSocket(
  serverOrigin: string,
  assignment: MatchAssignment,
): {
  socket: ClientSocket;
  getGameState: () => GameState | null;
  getIdentity: () => string | null;
  getEvents: () => unknown[];
  getErrors: () => string[];
  getDisconnectReason: () => string | null;
  isConnected: () => boolean;
} {
  let latestState: GameState | null = null;
  let receivedIdentity: string | null = null;
  let disconnectReason: string | null = null;
  let connected = false;
  const events: unknown[] = [];
  const errors: string[] = [];

  const socket = ioClient(serverOrigin, {
    auth: {
      ticket: assignment.ticket,
      matchId: assignment.matchId,
      playerId: assignment.playerId,
      protocolVersion: assignment.protocolVersion,
    },
    transports: ['websocket'],
    reconnection: false,
    autoConnect: true,
  });

  socket.on('connect', () => {
    connected = true;
  });

  socket.on('gameState', (state: GameState) => {
    latestState = state;
  });

  socket.on('playerIdentity', (identity: string) => {
    receivedIdentity = identity;
  });

  socket.on('matchEvent', (event: unknown) => {
    events.push(event);
  });

  socket.on('error', (error: unknown) => {
    errors.push(typeof error === 'string' ? error : JSON.stringify(error));
  });

  socket.on('connect_error', (error: Error) => {
    errors.push(error.message);
  });

  socket.on('disconnect', (reason: string) => {
    connected = false;
    disconnectReason = reason;
  });

  return {
    socket,
    getGameState: () => latestState,
    getIdentity: () => receivedIdentity,
    getEvents: () => events,
    getErrors: () => errors,
    getDisconnectReason: () => disconnectReason,
    isConnected: () => connected,
  };
}

describe('Process restart and graceful drain recovery integration', () => {
  if (database === null) {
    it('requires DATABASE_URL', { skip: 'DATABASE_URL is not configured' }, () => {});
    return;
  }

  after(async () => {
    await database.end({ timeout: 1 });
  });

  it('proves a two-player match survives controlled server shutdown and resumes from flushed checkpoint on restart', { timeout: 30_000 }, async () => {
    await runMigrations(database, path.join(process.cwd(), 'db', 'migrations'));

    let server1: RunningGameServer | null = null;
    let server2: RunningGameServer | null = null;
    let client1Socket: ClientSocket | null = null;
    let client2Socket: ClientSocket | null = null;
    let client1ResumedSocket: ClientSocket | null = null;
    let client2ResumedSocket: ClientSocket | null = null;

    let player1Id: string | null = null;
    let player2Id: string | null = null;
    let matchId: string | null = null;

    try {
      server1 = await startGameServer({
        mode: 'production',
        config: {
          port: 0,
          host: '127.0.0.1',
          serveClient: false,
          replayKeyframeIntervalTicks: 30,
        },
      });

      const guest1 = await createGuestPlayerAndSession(server1.origin, 'Recovery Player 1');
      const guest2 = await createGuestPlayerAndSession(server1.origin, 'Recovery Player 2');
      player1Id = guest1.playerId;
      player2Id = guest2.playerId;

      await enqueuePlayer(server1.origin, guest1.token);
      await enqueuePlayer(server1.origin, guest2.token);

      const assignment1 = await pollMatchAssignment(server1.origin, guest1.token);
      const assignment2 = await pollMatchAssignment(server1.origin, guest2.token);
      matchId = assignment1.matchId;

      assert.equal(assignment1.matchId, assignment2.matchId);
      assert.equal(assignment1.playerId, player1Id);
      assert.equal(assignment2.playerId, player2Id);
      assert.equal(assignment1.seat, 'A');
      assert.equal(assignment2.seat, 'B');
      assert.equal(assignment1.matchSeed, assignment2.matchSeed);
      assert.equal(assignment1.protocolVersion, 2);

      const client1 = connectSocket(server1.origin, assignment1);
      const client2 = connectSocket(server1.origin, assignment2);
      client1Socket = client1.socket;
      client2Socket = client2.socket;

      await waitFor(
        () => client1.isConnected() && client2.isConnected(),
        'both clients to connect to server 1',
      );

      await waitFor(
        () => {
          const state1 = client1.getGameState();
          const state2 = client2.getGameState();
          return state1?.status === 'playing' && state2?.status === 'playing';
        },
        'match state to reach playing status',
        10_000,
      );

      await waitFor(
        () => {
          const state = client1.getGameState();
          return state !== null && state.tick >= 60;
        },
        'authoritative simulation to tick past tick 60',
        8_000,
      );

      const matchRowsPre = await database<{ status: string }[]>`
        SELECT status FROM matches WHERE id = ${matchId}
      `;
      assert.equal(matchRowsPre[0]?.status, 'playing');

      const checkpointsPre = await database<{ sim_tick: number }[]>`
        SELECT sim_tick
        FROM match_checkpoints
        WHERE match_id = ${matchId}
        ORDER BY sim_tick DESC
      `;
      assert.ok(checkpointsPre.length > 0);
      const preShutdownTick = checkpointsPre[0].sim_tick;
      assert.ok(preShutdownTick >= 60);

      const resultsPre = await database<{ match_id: string }[]>`
        SELECT match_id FROM match_results WHERE match_id = ${matchId}
      `;
      assert.equal(resultsPre.length, 0);

      await server1.stop();
      server1 = null;

      const matchRowsPostShutdown = await database<{ status: string }[]>`
        SELECT status FROM matches WHERE id = ${matchId}
      `;
      assert.equal(matchRowsPostShutdown[0]?.status, 'playing');

      const checkpointsPostShutdown = await database<{ sim_tick: number }[]>`
        SELECT sim_tick
        FROM match_checkpoints
        WHERE match_id = ${matchId}
        ORDER BY sim_tick DESC
      `;
      assert.ok(checkpointsPostShutdown.length > 0);
      const flushedTick = checkpointsPostShutdown[0].sim_tick;
      assert.ok(flushedTick >= preShutdownTick);

      const resultsPostShutdown = await database<{ match_id: string }[]>`
        SELECT match_id FROM match_results WHERE match_id = ${matchId}
      `;
      assert.equal(resultsPostShutdown.length, 0);

      client1Socket.disconnect();
      client2Socket.disconnect();

      server2 = await startGameServer({
        mode: 'production',
        config: {
          port: 0,
          host: '127.0.0.1',
          serveClient: false,
          replayKeyframeIntervalTicks: 30,
        },
      });

      const replacementAssignment1 = await pollMatchAssignment(server2.origin, guest1.token);
      const replacementAssignment2 = await pollMatchAssignment(server2.origin, guest2.token);

      assert.equal(replacementAssignment1.matchId, matchId);
      assert.equal(replacementAssignment2.matchId, matchId);
      assert.equal(replacementAssignment1.playerId, player1Id);
      assert.equal(replacementAssignment2.playerId, player2Id);
      assert.equal(replacementAssignment1.seat, 'A');
      assert.equal(replacementAssignment2.seat, 'B');
      assert.equal(replacementAssignment1.matchSeed, assignment1.matchSeed);
      assert.ok(replacementAssignment1.ticket.length > 0);
      assert.ok(replacementAssignment2.ticket.length > 0);

      const resumedClient1 = connectSocket(server2.origin, replacementAssignment1);
      const resumedClient2 = connectSocket(server2.origin, replacementAssignment2);
      client1ResumedSocket = resumedClient1.socket;
      client2ResumedSocket = resumedClient2.socket;

      await waitFor(
        () => resumedClient1.isConnected() && resumedClient2.isConnected(),
        'both clients to connect to server 2',
      );

      await waitFor(
        () => {
          const state = resumedClient1.getGameState();
          return state !== null && state.status === 'playing';
        },
        'resumed match to enter playing state',
      );

      const restoredState = resumedClient1.getGameState()!;
      assert.equal(restoredState.status, 'playing');
      assert.ok(restoredState.tick >= flushedTick);
      assert.equal(resumedClient1.getIdentity(), player1Id);
      assert.equal(resumedClient2.getIdentity(), player2Id);

      await waitFor(
        () => {
          const state = resumedClient1.getGameState();
          return state !== null && state.tick >= flushedTick + 30;
        },
        'restored match to continue advancing ticks past flushed tick',
        8_000,
      );

      const activeMatchesCount = await database<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM matches
        WHERE id = ${matchId}
      `;
      assert.equal(activeMatchesCount[0]?.count, 1);

      client1ResumedSocket.disconnect();
      client2ResumedSocket.disconnect();

      await server2.stop();
      server2 = null;

      const checkpointsPostServer2 = await database<{ sim_tick: number }[]>`
        SELECT sim_tick
        FROM match_checkpoints
        WHERE match_id = ${matchId}
        ORDER BY sim_tick DESC
      `;
      assert.ok(checkpointsPostServer2.length > 0);
      const postServer2Tick = checkpointsPostServer2[0].sim_tick;
      assert.ok(
        postServer2Tick >= flushedTick + 30,
        `Expected postServer2Tick (${postServer2Tick}) >= flushedTick (${flushedTick}) + 30`,
      );

      const matchRowsFinal = await database<{ status: string }[]>`
        SELECT status FROM matches WHERE id = ${matchId}
      `;
      assert.equal(matchRowsFinal[0]?.status, 'playing');

      const resultsFinal = await database<{ match_id: string }[]>`
        SELECT match_id FROM match_results WHERE match_id = ${matchId}
      `;
      assert.equal(resultsFinal.length, 0);
    } finally {
      client1Socket?.disconnect();
      client2Socket?.disconnect();
      client1ResumedSocket?.disconnect();
      client2ResumedSocket?.disconnect();

      if (server1 !== null) await server1.stop();
      if (server2 !== null) await server2.stop();

      if (matchId !== null) {
        await database`DELETE FROM matches WHERE id = ${matchId}`;
      }
      if (player1Id !== null || player2Id !== null) {
        const ids = [player1Id, player2Id].filter((id): id is string => id !== null);
        await database`DELETE FROM players WHERE id IN ${database(ids)}`;
      }
    }
  });

  it('proves incompatible or corrupt checkpoint envelope finalizes match once as void_server_crash', { timeout: 15_000 }, async () => {
    await runMigrations(database, path.join(process.cwd(), 'db', 'migrations'));

    const playerAId = randomUUID();
    const playerBId = randomUUID();
    const matchId = randomUUID();
    let server: RunningGameServer | null = null;
    let clientSocket: ClientSocket | null = null;

    try {
      await database`
        INSERT INTO players (id, display_name, auth_provider)
        VALUES
          (${playerAId}, 'Incompatible Test A', 'guest'),
          (${playerBId}, 'Incompatible Test B', 'guest')
      `;

      await database`
        INSERT INTO matches (
          id, correlation_id, match_seed, player_a_id, player_b_id,
          game_server_url, protocol_version, status
        )
        VALUES (
          ${matchId}, ${randomUUID()}, 12345, ${playerAId}, ${playerBId},
          'http://127.0.0.1:3000', 1, 'playing'
        )
      `;

      const corruptStateBlob = Buffer.from(JSON.stringify({
        version: 999,
        matchId,
        invalidPayload: true,
      }), 'utf8');

      await database`
        INSERT INTO match_checkpoints (match_id, sim_tick, state_blob)
        VALUES (${matchId}, 100, ${corruptStateBlob})
      `;

      const matches = new MatchStore(database);
      const ticketA = await matches.issueJoinTicket({ matchId, playerId: playerAId, seat: 'A' });

      server = await startGameServer({
        mode: 'production',
        config: {
          port: 0,
          host: '127.0.0.1',
          serveClient: false,
          replayKeyframeIntervalTicks: 30,
        },
      });

      const client = connectSocket(server.origin, {
        matchId,
        playerId: playerAId,
        seat: 'A',
        ticket: ticketA.ticket,
        matchSeed: 12345,
        protocolVersion: 2,
      });
      clientSocket = client.socket;

      await waitFor(async () => {
        const results = await database<{ outcome_reason: string }[]>`
          SELECT outcome_reason FROM match_results WHERE match_id = ${matchId}
        `;
        return results.length === 1 && results[0].outcome_reason === 'void_server_crash';
      }, 'match to be finalized as void_server_crash in postgres');

      const matchRow = await database<{ status: string }[]>`
        SELECT status FROM matches WHERE id = ${matchId}
      `;
      assert.equal(matchRow[0]?.status, 'ended');

      const resultRows = await database<{
        match_id: string;
        winner_id: string | null;
        loser_id: string | null;
        outcome_reason: string;
      }[]>`
        SELECT match_id, winner_id, loser_id, outcome_reason
        FROM match_results
        WHERE match_id = ${matchId}
      `;
      assert.equal(resultRows.length, 1);
      assert.equal(resultRows[0].winner_id, null);
      assert.equal(resultRows[0].loser_id, null);
      assert.equal(resultRows[0].outcome_reason, 'void_server_crash');

      const ticketsRemaining = await database<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM match_tickets
        WHERE match_id = ${matchId}
      `;
      assert.equal(ticketsRemaining[0]?.count, 0);
    } finally {
      clientSocket?.disconnect();
      if (server !== null) await server.stop();
      await database`DELETE FROM matches WHERE id = ${matchId}`;
      await database`DELETE FROM players WHERE id IN (${playerAId}, ${playerBId})`;
    }
  });

  it('proves restore timeout with withheld reconnect finalizes match once as void_server_crash', { timeout: 15_000 }, async () => {
    await runMigrations(database, path.join(process.cwd(), 'db', 'migrations'));

    const playerAId = randomUUID();
    const playerBId = randomUUID();
    const matchId = randomUUID();
    let server: RunningGameServer | null = null;
    let clientASocket: ClientSocket | null = null;

    try {
      await database`
        INSERT INTO players (id, display_name, auth_provider)
        VALUES
          (${playerAId}, 'Timeout Test A', 'guest'),
          (${playerBId}, 'Timeout Test B', 'guest')
      `;

      await database`
        INSERT INTO matches (
          id, correlation_id, match_seed, player_a_id, player_b_id,
          game_server_url, protocol_version, status
        )
        VALUES (
          ${matchId}, ${randomUUID()}, 54321, ${playerAId}, ${playerBId},
          'http://127.0.0.1:3000', 1, 'playing'
        )
      `;

      const rngA = createPlayerRngChannels(54321, 0);
      const rngB = createPlayerRngChannels(54321, 1);
      const validStateBlob = Buffer.from(JSON.stringify({
        version: 1,
        matchId,
        state: {
          players: {
            [playerAId]: makePlayer(playerAId, rngA),
            [playerBId]: makePlayer(playerBId, rngB),
          },
          status: 'playing',
          countdown: 0,
          winnerId: null,
          tick: 180,
          seed: 54321,
        },
        participants: [
          {
            runtimeId: playerAId,
            playerId: playerAId,
            slot: 0,
            rng: rngA,
          },
          {
            runtimeId: playerBId,
            playerId: playerBId,
            slot: 1,
            rng: rngB,
          },
        ],
        disconnectBudgets: [],
      }), 'utf8');

      await database`
        INSERT INTO match_checkpoints (match_id, sim_tick, state_blob)
        VALUES (${matchId}, 180, ${validStateBlob})
      `;

      const matches = new MatchStore(database);
      const ticketA = await matches.issueJoinTicket({ matchId, playerId: playerAId, seat: 'A' });

      server = await startGameServer({
        mode: 'production',
        config: {
          port: 0,
          host: '127.0.0.1',
          serveClient: false,
          replayKeyframeIntervalTicks: 30,
          recoveryVoidTimeoutMs: 150,
        },
      });

      const clientA = connectSocket(server.origin, {
        matchId,
        playerId: playerAId,
        seat: 'A',
        ticket: ticketA.ticket,
        matchSeed: 54321,
        protocolVersion: 2,
      });
      clientASocket = clientA.socket;

      await waitFor(() => clientA.isConnected(), 'client A to connect and restore checkpoint');

      await waitFor(async () => {
        const results = await database<{ outcome_reason: string }[]>`
          SELECT outcome_reason FROM match_results WHERE match_id = ${matchId}
        `;
        return results.length === 1 && results[0].outcome_reason === 'void_server_crash';
      }, 'restore timeout to finalize match as void_server_crash in postgres', 5_000);

      const matchRow = await database<{ status: string }[]>`
        SELECT status FROM matches WHERE id = ${matchId}
      `;
      assert.equal(matchRow[0]?.status, 'ended');

      const resultRows = await database<{
        match_id: string;
        winner_id: string | null;
        loser_id: string | null;
        outcome_reason: string;
      }[]>`
        SELECT match_id, winner_id, loser_id, outcome_reason
        FROM match_results
        WHERE match_id = ${matchId}
      `;
      assert.equal(resultRows.length, 1);
      assert.equal(resultRows[0].winner_id, null);
      assert.equal(resultRows[0].loser_id, null);
      assert.equal(resultRows[0].outcome_reason, 'void_server_crash');
    } finally {
      clientASocket?.disconnect();
      if (server !== null) await server.stop();
      await database`DELETE FROM matches WHERE id = ${matchId}`;
      await database`DELETE FROM players WHERE id IN (${playerAId}, ${playerBId})`;
    }
  });

  it('proves process server boots, exposes healthy status, and handles process termination cleanly', { timeout: 15_000 }, async () => {
    await runMigrations(database, path.join(process.cwd(), 'db', 'migrations'));

    const port = await getFreePort();
    const origin = `http://127.0.0.1:${port}`;
    const proc = spawn(process.execPath, ['server.ts'], {
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
        REQUIRE_MATCH_TICKETS: 'true',
      },
      stdio: 'ignore',
    });

    try {
      await waitFor(async () => {
        try {
          const response = await fetch(`${origin}/health`);
          return response.ok && (await response.text()) === 'ok';
        } catch {
          return false;
        }
      }, `server on ${origin} to become healthy`, 10_000);

      const detailsResponse = await fetch(`${origin}/health/details`);
      assert.equal(detailsResponse.status, 200);
      const details = (await detailsResponse.json()) as {
        databaseMode: string;
        databaseHealth: string;
        migrationsReady: boolean;
      };
      assert.equal(details.databaseMode, 'postgres');
      assert.equal(details.databaseHealth, 'healthy');
      assert.equal(details.migrationsReady, true);
    } finally {
      proc.kill('SIGINT');
      const exitCode = await new Promise<number | null>((resolve) => {
        proc.once('exit', (code) => resolve(code));
      });
      assert.ok(exitCode === 0 || exitCode === 130 || exitCode === 143 || exitCode === null);
    }
  });
});
