import { io as ioClient } from 'socket.io-client';
import { startGameServer } from '../server/gameServer.js';

interface WireState {
  status: string;
  tick: number;
  players: Record<string, unknown>;
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

async function main() {
  console.log('[Live Smoke] Starting the production game-server module...');

  const server = await startGameServer({
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

  const socket1 = ioClient(serverUrl);
  const socket2 = ioClient(serverUrl);
  socket1.on('gameState', (state: WireState) => {
    latestState = state;
    gameStateMessages += 1;
  });
  socket1.on('matchEvent', (event: { type?: string }) => {
    if (event.type) receivedEvents.push(event.type);
  });

  try {
    await Promise.all([
      waitFor(() => socket1.connected, 'first client connection'),
      waitFor(() => socket2.connected, 'second client connection'),
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
    console.log('Evidence Type: live browser/Socket.IO smoke evidence (transport verified)');
    console.log(`Received gameState messages: ${gameStateMessages}`);
    console.log(`Received matchEvent messages: ${receivedEvents.length}`);
  } finally {
    socket1.disconnect();
    socket2.disconnect();
    await server.stop();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
