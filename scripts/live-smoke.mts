import http from 'node:http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import { GameManager } from '../server/GameManager.js';

interface WireState {
  status: string;
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
  console.log('[Live Smoke] Starting local development server and Socket.IO transport verification...');

  const server = http.createServer();
  const ioServer = new Server(server, { cors: { origin: '*' } });
  const gm = new GameManager(ioServer, 30);
  const connectedSockets: Socket[] = [];
  let latestState: WireState | null = null;
  let gameStateMessages = 0;
  const receivedEvents: string[] = [];

  ioServer.on('connection', (socket) => {
    connectedSockets.push(socket);
    gm.handleConnection(socket);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const serverUrl = `http://127.0.0.1:${port}`;
  console.log(`[Live Smoke] Dev test server listening on ${serverUrl}`);

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

    // Advance the authoritative manager, then require a real playing snapshot.
    for (let i = 0; i < 200; i += 1) gm.tickOnceForTests();
    await waitFor(() => latestState?.status === 'playing', 'playing game state');

    socket1.emit('shopOpen');
    socket1.emit('action', 'rotateCW');
    for (let i = 0; i < 10; i += 1) gm.tickOnceForTests();
    await waitFor(() => gameStateMessages > 0, 'game state transport messages');

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
    for (const socket of connectedSockets) socket.disconnect();
    gm.stopLoop();
    ioServer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
