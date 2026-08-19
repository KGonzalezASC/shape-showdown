import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDiscordIdentityVerifier,
  DiscordIdentityError,
} from './discordIdentity.js';

describe('Discord Activity identity verification', () => {
  it('exchanges a valid Activity code and returns only normalized profile data', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const verify = createDiscordIdentityVerifier({
      clientId: 'application-id',
      clientSecret: 'application-secret',
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init });
        if (String(url).includes('/oauth2/token')) {
          return new Response(JSON.stringify({
            access_token: 'provider-access-token',
            token_type: 'Bearer',
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          id: '123456789012345678',
          username: 'shape-player',
          global_name: 'Shape Player',
          avatar: 'avatar_hash',
        }), { status: 200 });
      },
    });

    const profile = await verify('one-use-activity-code');

    assert.deepEqual(profile, {
      discordUserId: '123456789012345678',
      displayName: 'Shape Player',
      avatarUrl: 'https://cdn.discordapp.com/avatars/123456789012345678/avatar_hash.png',
    });
    assert.equal(requests.length, 2);
    assert.match(String(requests[0]?.init?.body), /grant_type=authorization_code/);
    assert.match(String(requests[0]?.init?.body), /code=one-use-activity-code/);
    assert.equal(
      (requests[1]?.init?.headers as Record<string, string>).authorization,
      'Bearer provider-access-token',
    );
  });

  it('fails closed when Discord rejects an expired, tampered, or wrong-application code', async () => {
    const verify = createDiscordIdentityVerifier({
      clientId: 'application-id',
      clientSecret: 'application-secret',
      fetchImpl: async () => new Response('{}', { status: 400 }),
    });

    await assert.rejects(
      verify('expired-or-tampered-code'),
      (error: unknown) =>
        error instanceof DiscordIdentityError
        && error.code === 'DISCORD_ASSERTION_INVALID',
    );
  });

  it('rejects missing identity claims instead of inventing a player', async () => {
    let callCount = 0;
    const verify = createDiscordIdentityVerifier({
      clientId: 'application-id',
      clientSecret: 'application-secret',
      fetchImpl: async () => {
        callCount += 1;
        return callCount === 1
          ? new Response(JSON.stringify({ access_token: 'provider-access-token' }), { status: 200 })
          : new Response(JSON.stringify({ username: 'missing-id' }), { status: 200 });
      },
    });

    await assert.rejects(
      verify('valid-code-but-invalid-profile'),
      (error: unknown) =>
        error instanceof DiscordIdentityError
        && error.code === 'DISCORD_ASSERTION_INVALID',
    );
  });

  it('rejects an invalid provider token response as unavailable', async () => {
    const verify = createDiscordIdentityVerifier({
      clientId: 'application-id',
      clientSecret: 'application-secret',
      fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }),
    });

    await assert.rejects(
      verify('valid-code'),
      (error: unknown) =>
        error instanceof DiscordIdentityError
        && error.code === 'DISCORD_PROVIDER_UNAVAILABLE',
    );
  });
});
