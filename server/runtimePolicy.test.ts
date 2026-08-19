import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveGuestPlayerId } from './controlPlane/playerStore.js';
import { resolveRuntimePolicy } from './runtimePolicy.js';

describe('runtime policy', () => {
  it('requires Postgres and match tickets in production', () => {
    assert.deepEqual(
      resolveRuntimePolicy({
        mode: 'production',
        hasDatabase: true,
        env: {},
      }),
      {
        requirePostgres: true,
        requireMatchTickets: true,
        allowLegacySocketBootstrap: false,
      },
    );
  });

  it('rejects production in-memory and legacy overrides', () => {
    assert.throws(
      () =>
        resolveRuntimePolicy({
          mode: 'production',
          hasDatabase: false,
          env: { ALLOW_IN_MEMORY_DATABASE: 'true' },
        }),
      /ALLOW_IN_MEMORY_DATABASE=true is forbidden in production/,
    );
    assert.throws(
      () =>
        resolveRuntimePolicy({
          mode: 'production',
          hasDatabase: true,
          env: { ALLOW_LEGACY_SOCKET_BOOTSTRAP: 'true' },
        }),
      /ALLOW_LEGACY_SOCKET_BOOTSTRAP=true is forbidden in production/,
    );
  });

  it('keeps legacy sockets available for development without a database', () => {
    assert.deepEqual(
      resolveRuntimePolicy({
        mode: 'development',
        hasDatabase: false,
        env: {},
      }),
      {
        requirePostgres: false,
        requireMatchTickets: false,
        allowLegacySocketBootstrap: true,
      },
    );
  });

  it('requires tickets for development databases by default', () => {
    assert.deepEqual(
      resolveRuntimePolicy({
        mode: 'development',
        hasDatabase: true,
        env: {},
      }),
      {
        requirePostgres: false,
        requireMatchTickets: true,
        allowLegacySocketBootstrap: false,
      },
    );
  });

  it('allows an explicit development legacy override unless tickets are required', () => {
    assert.equal(
      resolveRuntimePolicy({
        mode: 'development',
        hasDatabase: true,
        env: { ALLOW_LEGACY_SOCKET_BOOTSTRAP: 'true' },
      }).allowLegacySocketBootstrap,
      true,
    );
    assert.deepEqual(
      resolveRuntimePolicy({
        mode: 'development',
        hasDatabase: true,
        env: {
          ALLOW_LEGACY_SOCKET_BOOTSTRAP: 'true',
          REQUIRE_MATCH_TICKETS: 'true',
        },
      }),
      {
        requirePostgres: false,
        requireMatchTickets: true,
        allowLegacySocketBootstrap: false,
      },
    );
  });
});

describe('deterministic guest identity', () => {
  it('derives a stable UUIDv4-shaped identity from a key', () => {
    const first = deriveGuestPlayerId('guest-bootstrap-1');
    const second = deriveGuestPlayerId('guest-bootstrap-1');
    const different = deriveGuestPlayerId('guest-bootstrap-2');

    assert.equal(first, second);
    assert.notEqual(first, different);
    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
