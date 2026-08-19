import { randomUUID } from 'node:crypto';
import { io as ioClient } from 'socket.io-client';
import type { MatchAssignment } from '../src/types.js';
import { createDatabase, type Database } from '../server/controlPlane/database.js';
import { startGameServer } from '../server/gameServer.js';

interface WireState {
  status: string;
  tick: number;
  players: Record<string, unknown>;
}

interface GuestSession {
  playerId: string;
  token: string;
}

function waitFor(check: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`[Live Smoke] Timed out waiting for ${label}`));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

async function createGuestSession(origin: string, displayName: string): Promise<GuestSession> {
  const response = await fetch(`${origin}/api/players/guest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `live-smoke-${randomUUID()}`,
    },
    body: JSON.stringify({ displayName }),
  });
  const body: unknown = await response.json();
  if (!response.ok || !isRecord(body)) {
    throw new Error(`[Live Smoke] Guest bootstrap failed with status ${response.status}`);
  }
  const player = body.player;
  const session = body.session;
  if (
    !isRecord(player)
    || typeof player.id !== 'string'
    || !isRecord(session)
    || typeof session.token !== 'string'
  ) {
    throw new Error('[Live Smoke] Guest bootstrap response was invalid');
  }
  return { playerId: player.id, token: session.token };
}

async function enterQueue(origin: string, session: GuestSession): Promise<void> {
  const response = await fetch(`${origin}/api/queue`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`[Live Smoke] Queue entry failed with status ${response.status}`);
  }
}

async function waitForAssignment(
  origin: string,
  session: GuestSession,
  timeoutMs = 10_000,
): Promise<MatchAssignment> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${origin}/api/match-assignment`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    if (response.status === 200) {
      const body: unknown = await response.json();
      if (isMatchAssignment(body)) return body;
      throw new Error('[Live Smoke] Match assignment response was invalid');
    }
    if (response.status !== 204) {
      throw new Error(`[Live Smoke] Assignment request failed with status ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('[Live Smoke] Timed out waiting for a match assignment');
}

function isMatchAssignment(value: unknown): value is MatchAssignment {
  return isRecord(value)
    && typeof value.matchId === 'string'
    && typeof value.playerId === 'string'
    && (value.seat === 'A' || value.seat === 'B')
    && typeof value.ticket === 'string'
    && typeof value.matchSeed === 'number'
    && typeof value.protocolVersion === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main() {
  console.log('[Live Smoke] Starting the production game-server module...');

  const database: Database | null = createDatabase();
  if (database === null) {
    throw new Error('[Live Smoke] DATABASE_URL is required for production smoke');
  }
  let server: Awaited<ReturnType<typeof startGameServer>> | null = null;
  let socket1: ReturnType<typeof ioClient> | null = null;
  let socket2: ReturnType<typeof ioClient> | null = null;
  const playerIds: string[] = [];
  let matchId: string | null = null;

  try {
    server = await startGameServer({
      mode: 'production',
      config: {
        port: 0,
        host: '127.0.0.1',
        serveClient: false,
        replayKeyframeIntervalTicks: 30,
      },
    });
    let latestState: WireState | null = null;
    let gameStateMessages = 0;
    const receivedEvents: string[] = [];
    const serverUrl = server.origin;
    console.log(`[Live Smoke] Game server listening on ${serverUrl}`);

    const health = await fetch(`${serverUrl}/health`);
    if (!health.ok || await health.text() !== 'ok') {
      throw new Error(`[Live Smoke] Health endpoint failed with status ${health.status}`);
    }

    const player1 = await createGuestSession(serverUrl, 'Live Smoke A');
    const player2 = await createGuestSession(serverUrl, 'Live Smoke B');
    playerIds.push(player1.playerId, player2.playerId);
    await Promise.all([enterQueue(serverUrl, player1), enterQueue(serverUrl, player2)]);
    const [assignment1, assignment2] = await Promise.all([
      waitForAssignment(serverUrl, player1),
      waitForAssignment(serverUrl, player2),
    ]);
    if (assignment1.matchId !== assignment2.matchId) {
      throw new Error('[Live Smoke] Players were assigned to different matches');
    }
    matchId = assignment1.matchId;

    socket1 = ioClient(serverUrl, {
      auth: assignment1,
      transports: ['websocket'],
      reconnection: false,
    });
    socket2 = ioClient(serverUrl, {
      auth: assignment2,
      transports: ['websocket'],
      reconnection: false,
    });
    socket1.on('gameState', (state: WireState) => {
      latestState = state;
      gameStateMessages += 1;
    });
    socket1.on('matchEvent', (event: { type?: string }) => {
      if (event.type) receivedEvents.push(event.type);
    });

    await Promise.all([
      waitFor(() => socket1?.connected === true, 'first client connection'),
      waitFor(() => socket2?.connected === true, 'second client connection'),
    ]);
    await waitFor(() => latestState !== null && Object.keys(latestState.players).length === 2, 'two-player game state');
    await waitFor(() => latestState?.status === 'playing', 'playing game state', 6000);

    const playingTick = latestState.tick;
    socket1.emit('shopOpen');
    socket1.emit('action', 'hardDrop');
    await waitFor(() => latestState !== null && latestState.tick > playingTick, 'authoritative tick after player action');

    if (latestState === null || Object.keys(latestState.players).length !== 2) {
      throw new Error('[Live Smoke] Final state did not contain exactly two players');
    }

    console.log('[Live Smoke] Transport verification complete!');
    console.log('Evidence Type: production ticket-authenticated Socket.IO smoke evidence');
    console.log(`Received gameState messages: ${gameStateMessages}`);
    console.log(`Received matchEvent messages: ${receivedEvents.length}`);
  } finally {
    socket1?.disconnect();
    socket2?.disconnect();
    await server?.stop();
    if (matchId !== null) {
      await database`DELETE FROM matches WHERE id = ${matchId}`;
    }
    if (playerIds.length > 0) {
      await database`DELETE FROM players WHERE id IN ${database(playerIds)}`;
    }
    await database.end({ timeout: 1 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
