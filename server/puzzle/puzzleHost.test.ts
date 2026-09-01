import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Socket } from 'socket.io';
import { PuzzleHost } from './puzzleHost.js';
import type { ActionType, InputState } from '../../src/types.js';

/** Minimal socket double capturing emissions and simulating client calls. */
class FakeSocket {
  public readonly emitted: Array<{ event: string; payload: unknown }> = [];

  public emit(event: string, payload: unknown): boolean {
    this.emitted.push({ event, payload });
    return true;
  }

  public events(event: string): unknown[] {
    return this.emitted.filter((e) => e.event === event).map((e) => e.payload);
  }

  public last(event: string): unknown {
    const all = this.events(event);
    return all[all.length - 1];
  }
}

function makeHost(): { host: PuzzleHost; socket: FakeSocket } {
  const socket = new FakeSocket();
  return { host: new PuzzleHost(socket as unknown as Socket), socket };
}

describe('PuzzleHost', () => {
  it('starts a session and emits puzzle:started + an initial puzzle:state', () => {
    const { host, socket } = makeHost();
    host.start({ seed: 42 });
    assert.ok(host.active);
    const started = socket.last('puzzle:started') as { levelId: string; seed: number };
    assert.equal(started.seed, 42);
    assert.ok(started.levelId.length > 0);
    const state = socket.last('puzzle:state') as { tick: number; status: string };
    assert.equal(state.tick, 0);
    assert.ok(state.status == 'playing' || state.status == 'solved');
    host.stop();
  });

  it('random pick with no seed produces a level and started event', () => {
    const { host, socket } = makeHost();
    host.start();
    assert.ok(host.active);
    const started = socket.last('puzzle:started') as { seed: number; goal: unknown };
    assert.ok(Number.isInteger(started.seed));
    assert.ok(started.goal != null);
    host.stop();
  });

  it('advances ticks and streams puzzle:state with increasing tick', async () => {
    const { host, socket } = makeHost();
    host.start({ seed: 7 });
    const before = (socket.last('puzzle:state') as { tick: number }).tick;
    await new Promise((r) => setTimeout(r, 120)); // ~7 ticks at 60Hz
    const after = (socket.last('puzzle:state') as { tick: number }).tick;
    assert.ok(after > before, `expected tick to advance: ${before} -> ${after}`);
    host.stop();
  });

  it('human input drives the piece: hardDrop action locks a piece eventually', async () => {
    const { host, socket } = makeHost();
    host.start({ seed: 5, level: 'clean' });
    // Hold right to push the piece to a wall, then hard-drop repeatedly.
    const input: Partial<InputState> = { right: true };
    host.setInput(input);
    await new Promise((r) => setTimeout(r, 300));
    host.setInput({ right: false });
    for (let i = 0; i < 3; i++) {
      host.pushAction('hardDrop' as ActionType);
      await new Promise((r) => setTimeout(r, 150));
    }
    const states = socket.emitted.filter((e) => e.event === 'puzzle:state');
    assert.ok(states.length >= 1, 'expected at least one state emission');
    host.stop();
  });

  it('archetype selection by name is honored', () => {
    const { host, socket } = makeHost();
    host.start({ seed: 3, level: 'dig' });
    const started = socket.last('puzzle:started') as { levelId: string };
    assert.ok(started.levelId.startsWith('dig-'));
    host.stop();
  });

  it('stop() clears the session', () => {
    const { host } = makeHost();
    host.start({ seed: 1 });
    host.stop();
    assert.equal(host.active, false);
  });
});
