import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Socket } from 'socket.io';
import { makePlayer, makeRng } from '../../src/puzzle/runtime/engine.js';
import { ClientPacketDecoder } from '../../src/protocol/ClientPacketDecoder.js';
import { readPacketHeader } from '../../src/protocol/encodeMatchPacket.js';
import { PACKET_KIND_DELTA, PACKET_KIND_KEYFRAME } from '../../src/protocol/version.js';
import type { GameState } from '../../src/types.js';
import { MatchPacketSync } from './MatchPacketSync.js';

describe('MatchPacketSync', () => {
  it('publishes each terminal restart timer update to the client decoder', () => {
    const local = makePlayer('local', makeRng(21));
    const opponent = makePlayer('opponent', makeRng(22));
    const gameState: GameState = {
      players: { local, opponent },
      status: 'ended',
      countdown: 0,
      winnerId: 'local',
      restartTimer: 5,
      tick: 1,
      seed: 21,
    };
    const packets: ArrayBuffer[] = [];
    const socket = {
      emit(event: string, packet: ArrayBuffer) {
        if (event === 'gamePacket') packets.push(packet);
      },
    } as unknown as Socket;
    const sync = new MatchPacketSync({
      netcastEveryNTicks: 1,
      lobbyNetcastEveryNTicks: 1,
    });
    const decoder = new ClientPacketDecoder();
    decoder.setMyId('local');

    sync.sendImmediate(gameState, new Map([['local', socket]]));
    const first = decoder.decode(packets.shift()!);
    assert.equal(first?.chrome.restartTimer, 5);

    gameState.restartTimer = 4;
    gameState.tick += 1;
    sync.onTick(gameState, new Map([['local', socket]]), []);
    const second = decoder.decode(packets.shift()!);
    assert.equal(second?.chrome.restartTimer, 4);
  });

  it('does not create a sequence gap when an empty delta is skipped', () => {
    const local = makePlayer('local', makeRng(21));
    const opponent = makePlayer('opponent', makeRng(22));
    local.landingForecastTicksRemaining = undefined;
    opponent.landingForecastTicksRemaining = undefined;
    const gameState: GameState = {
      players: { local, opponent },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 1,
      seed: 21,
    };
    const packets: ArrayBuffer[] = [];
    const socket = {
      emit(event: string, packet: ArrayBuffer) {
        if (event === 'gamePacket') packets.push(packet);
      },
    } as unknown as Socket;
    const sockets = new Map([['local', socket]]);
    const sync = new MatchPacketSync({
      netcastEveryNTicks: 1,
      lobbyNetcastEveryNTicks: 1,
    });
    const decoder = new ClientPacketDecoder();
    decoder.setMyId('local');

    sync.sendImmediate(gameState, sockets);
    assert.ok(decoder.decode(packets.shift()!));

    // Next tick with unchanged state sends nothing
    sync.onTick(gameState, sockets, []);
    assert.equal(packets.length, 0);

    gameState.tick += 1;
    sync.onTick(gameState, sockets, []);
    assert.equal(packets.length, 0);

    gameState.tick += 1;
    local.activePiece!.x += 1;
    sync.onTick(gameState, sockets, []);

    assert.ok(decoder.decode(packets.shift()!));
    assert.equal(decoder.shouldRequestKeyframe(), false);
  });

  it('sends keyframe on initial emission or status change, and delta on subsequent sendImmediate flushes', () => {
    const local = makePlayer('local', makeRng(21));
    const opponent = makePlayer('opponent', makeRng(22));
    local.landingForecastTicksRemaining = undefined;
    opponent.landingForecastTicksRemaining = undefined;
    const gameState: GameState = {
      players: { local, opponent },
      status: 'playing',
      countdown: 0,
      winnerId: null,
      tick: 10,
      seed: 21,
    };
    const packets: ArrayBuffer[] = [];
    const socket = {
      emit(event: string, packet: ArrayBuffer) {
        if (event === 'gamePacket') packets.push(packet);
      },
    } as unknown as Socket;
    const sockets = new Map([['local', socket]]);
    const sync = new MatchPacketSync({
      netcastEveryNTicks: 2,
      lobbyNetcastEveryNTicks: 12,
    });
    const decoder = new ClientPacketDecoder();
    decoder.setMyId('local');

    // 1. Initial emission: no baseline exists -> must send keyframe
    sync.sendImmediate(gameState, sockets);
    assert.equal(packets.length, 1);
    const firstPacket = packets.shift()!;
    const firstHeader = readPacketHeader(firstPacket);
    assert.equal(firstHeader.kind, PACKET_KIND_KEYFRAME);
    const decodedFirst = decoder.decode(firstPacket);
    assert.ok(decodedFirst);

    // 2. Unchanged state immediate flush -> 0 packets
    sync.sendImmediate(gameState, sockets);
    assert.equal(packets.length, 0);

    // 3. Piece lock / board change immediate flush -> must send delta, not full keyframe
    gameState.tick += 1;
    local.board[0][0] = 'I';
    local.activePiece!.y += 1;
    sync.sendImmediate(gameState, sockets);
    assert.equal(packets.length, 1);
    const deltaPacket = packets.shift()!;
    const deltaHeader = readPacketHeader(deltaPacket);
    assert.equal(deltaHeader.kind, PACKET_KIND_DELTA);
    assert.ok(deltaPacket.byteLength < firstPacket.byteLength / 2);

    const decodedDelta = decoder.decode(deltaPacket);
    assert.ok(decodedDelta);
    assert.equal(decodedDelta.myPlayer.board[0][0], 'I');
    assert.equal(decoder.shouldRequestKeyframe(), false);

    // 4. Status change to ended -> sends keyframe
    gameState.status = 'ended';
    gameState.winnerId = 'local';
    sync.sendImmediate(gameState, sockets);
    assert.equal(packets.length, 1);
    const endPacket = packets.shift()!;
    const endHeader = readPacketHeader(endPacket);
    assert.equal(endHeader.kind, PACKET_KIND_KEYFRAME);
    const decodedEnd = decoder.decode(endPacket);
    assert.equal(decodedEnd?.chrome.status, 'ended');
    assert.equal(decodedEnd?.chrome.winnerId, 'local');
  });
});
