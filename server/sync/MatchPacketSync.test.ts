import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Socket } from 'socket.io';
import { makePlayer, makeRng } from '../tetris/engine.js';
import { ClientPacketDecoder } from '../../src/protocol/ClientPacketDecoder.js';
import type { GameState } from '../../src/types.js';
import { MatchPacketSync } from './MatchPacketSync.js';

describe('MatchPacketSync', () => {
  it('does not create a sequence gap when an empty delta is skipped', () => {
    const local = makePlayer('local', makeRng(21));
    const opponent = makePlayer('opponent', makeRng(22));
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

    sync.onTick(gameState, sockets, []);
    assert.ok(decoder.decode(packets.shift()!));

    gameState.tick += 1;
    sync.onTick(gameState, sockets, []);
    assert.equal(packets.length, 0);

    gameState.tick += 1;
    local.activePiece!.x += 1;
    sync.onTick(gameState, sockets, []);

    assert.ok(decoder.decode(packets.shift()!));
    assert.equal(decoder.shouldRequestKeyframe(), false);
  });
});
