import { io, type Socket } from 'socket.io-client';
import { GAME_PROTOCOL_VERSION } from '../src/protocol/version.js';
import { readPacketHeader } from '../src/protocol/encodeMatchPacket.js';
import { toArrayBuffer } from '../src/protocol/binary.js';
import type { MatchAssignment } from '../src/types.js';

const base = process.env.GAME_SERVER_URL?.trim() || 'http://localhost:3000';

async function guest(name: string) {
  const res = await fetch(`${base}/api/players/guest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ displayName: name }),
  });
  const body: unknown = await res.json();
  if (!res.ok || !isRecord(body) || !isRecord(body.player) || !isRecord(body.session)) {
    throw new Error(`guest bootstrap failed: ${res.status}`);
  }
  return {
    playerId: String(body.player.id),
    token: String(body.session.token),
  };
}

async function queue(token: string): Promise<void> {
  const res = await fetch(`${base}/api/queue`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`queue failed: ${res.status} ${await res.text()}`);
  }
}

async function waitAssignment(token: string): Promise<MatchAssignment> {
  for (let i = 0; i < 150; i += 1) {
    const res = await fetch(`${base}/api/match-assignment`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 200) {
      const body: unknown = await res.json();
      if (!isMatchAssignment(body)) throw new Error('invalid assignment');
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('assignment timeout');
}

function connectClient(assignment: MatchAssignment, label: string): Promise<Socket> {
  const packets = { count: 0 };
  return new Promise((resolve, reject) => {
    const socket = io(base, {
      auth: {
        ...assignment,
        clientProtocolVersion: GAME_PROTOCOL_VERSION,
      },
      transports: ['websocket'],
      reconnection: false,
    });
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`${label} timeout waiting for gamePacket`));
    }, 15_000);
    socket.on('connect', () => console.log(`[${label}] connected`));
    socket.on('connect_error', (error: Error) => {
      clearTimeout(timeout);
      reject(new Error(`${label} connect_error: ${error.message}`));
    });
    socket.on('gamePacket', (buffer: unknown) => {
      packets.count += 1;
      const header = readPacketHeader(toArrayBuffer(buffer));
      if (packets.count <= 5) {
        console.log(
          `[${label}] packet #${packets.count} kind=${header.kind} tick=${header.tick} bytes=${buffer.byteLength}`,
        );
      }
      if (packets.count === 1) {
        clearTimeout(timeout);
        resolve(socket);
      }
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

const p1 = await guest('Binary A');
const p2 = await guest('Binary B');
await queue(p1.token);
await new Promise((resolve) => setTimeout(resolve, 300));
await queue(p2.token);
const [a1, a2] = await Promise.all([
  waitAssignment(p1.token),
  waitAssignment(p2.token),
]);
console.log(`Matched ${a1.matchId} seats ${a1.seat}/${a2.seat} protocol=${a1.protocolVersion}`);

const [s1, s2] = await Promise.all([
  connectClient(a1, 'A'),
  connectClient(a2, 'B'),
]);
await new Promise((resolve) => setTimeout(resolve, 3000));
s1.emit('action', 'hardDrop');
await new Promise((resolve) => setTimeout(resolve, 2000));
s1.disconnect();
s2.disconnect();
console.log('SUCCESS: binary two-player smoke passed');
