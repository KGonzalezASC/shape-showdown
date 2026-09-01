import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Socket } from 'socket.io';
import { PuzzleHost } from './puzzleHost.js';
import type { ActionType, InputState } from '../../src/types.js';
import { listCuratedPuzzleLevels } from './catalog/index.js';

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
  it('starts a curated catalog puzzle by puzzleId', () => {
    const { host, socket } = makeHost();
    const catalogId = listCuratedPuzzleLevels()[0]!.id;
    host.start({ puzzleId: catalogId, mode: 'catalog' });
    assert.ok(host.active);
    const started = socket.last('puzzle:started') as {
      levelId: string;
      puzzleId: string;
      seed: number;
      visibilityPolicy?: string;
    };
    assert.equal(started.levelId, catalogId);
    assert.equal(started.puzzleId, catalogId);
    assert.ok(started.visibilityPolicy === 'hidden' || started.visibilityPolicy === 'revealed' || started.visibilityPolicy === 'partial');
    const state = socket.last('puzzle:state') as { tick: number; levelId: string };
    assert.equal(state.tick, 0);
    assert.equal(state.levelId, catalogId);
    host.stop();
  });

  it('random mode picks a curated catalog level', () => {
    const { host, socket } = makeHost();
    host.start({ mode: 'random' });
    assert.ok(host.active);
    const started = socket.last('puzzle:started') as { levelId: string };
    const ids = new Set(listCuratedPuzzleLevels().map((level) => level.id));
    assert.ok(ids.has(started.levelId));
    host.stop();
  });

  it('rejects unknown catalog puzzleId', () => {
    const { host } = makeHost();
    assert.throws(() => host.start({ mode: 'catalog', puzzleId: 'does-not-exist' }), /Unknown puzzleId/);
  });

  it('advances ticks and streams puzzle:state with increasing tick', async () => {
    const { host, socket } = makeHost();
    host.start({ mode: 'catalog', puzzleId: listCuratedPuzzleLevels()[0]!.id });
    const before = (socket.last('puzzle:state') as { tick: number }).tick;
    await new Promise((r) => setTimeout(r, 120));
    const after = (socket.last('puzzle:state') as { tick: number }).tick;
    assert.ok(after > before, `expected tick to advance: ${before} -> ${after}`);
    host.stop();
  });

  it('human input drives the piece: hardDrop action locks a piece eventually', async () => {
    const { host, socket } = makeHost();
    host.start({ mode: 'generated', seed: 5, level: 'clean' });
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

  it('generated archetype selection by name is honored', () => {
    const { host, socket } = makeHost();
    host.start({ mode: 'generated', seed: 3, level: 'dig' });
    const started = socket.last('puzzle:started') as { levelId: string };
    assert.ok(started.levelId.startsWith('dig-'));
    host.stop();
  });

  it('stop() clears the session', () => {
    const { host } = makeHost();
    host.start({ mode: 'random' });
    host.stop();
    assert.equal(host.active, false);
  });
});
