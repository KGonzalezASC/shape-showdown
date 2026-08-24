/** Probe a deployed game server for its expected GAME_PROTOCOL_VERSION.
 *  v2 handshake must yield PROTOCOL_VERSION_MISMATCH; v3 must pass the
 *  version gate and fail later on the dummy ticket. */
import { io } from 'socket.io-client';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: bun run .scratch/probe-railway-version.mts <url> [<url>...]');
  process.exit(1);
}

function probe(url: string, clientProtocolVersion: number): Promise<string> {
  return new Promise((resolve) => {
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 10_000,
      auth: {
        ticket: 'version-probe-dummy',
        matchId: 'version-probe',
        playerId: 'version-probe',
        seat: 'A',
        matchSeed: 1,
        protocolVersion: 3,
        clientProtocolVersion,
      },
    });
    const done = (code: string) => {
      socket.removeAllListeners();
      socket.disconnect();
      resolve(code);
    };
    socket.on('connect', () => done('CONNECTED'));
    socket.on('connect_error', (error: Error & { data?: { code?: string } }) =>
      done(error.data?.code ?? error.message));
    setTimeout(() => done('TIMEOUT'), 12_000);
  });
}

for (const url of targets) {
  const v2 = await probe(url, 2);
  const v3 = await probe(url, 3);
  console.log(`${url}`);
  console.log(`  clientProtocolVersion=2 -> ${v2}`);
  console.log(`  clientProtocolVersion=3 -> ${v3}`);
  console.log(
    `  verdict: ${v2 === 'PROTOCOL_VERSION_MISMATCH' && v3 !== 'PROTOCOL_VERSION_MISMATCH'
      ? 'RUNS PROTOCOL v3 (latest)'
      : 'NOT on protocol v3'}`,
  );
}
