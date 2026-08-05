import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyDevSmokeScenario, isDevSmokeEnabled } from './smokeControl.js';
import { GameManager } from '../GameManager.js';
import type { Server } from 'socket.io';

function createFakeIo() {
  return {
    emit: () => true,
    on: () => undefined,
  } as unknown as Server;
}

describe('Dev Smoke Control Safety', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('disables dev smoke controls in production mode', () => {
    process.env.NODE_ENV = 'production';
    assert.equal(isDevSmokeEnabled(), false);

    const gm = new GameManager(createFakeIo(), 60);
    gm.stopLoop();

    const applied = applyDevSmokeScenario(gm, { soloDummy: true });
    assert.equal(applied, false);
  });
});
