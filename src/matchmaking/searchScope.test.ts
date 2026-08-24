import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  readPreferredMatchScope,
  resolveEffectiveSearchScope,
  writePreferredMatchScope,
} from './searchScope.js';

describe('resolveEffectiveSearchScope', () => {
  it('always searches global for guests', () => {
    for (const preferredScope of [null, 'global', 'guild', 'discord_only', 'bogus']) {
      const result = resolveEffectiveSearchScope({
        provider: 'guest',
        preferredScope,
        guildId: '42',
      });
      assert.deepEqual(result, { searchScope: 'global', guildId: null });
    }
  });

  it('uses the launch guild id when the preference is guild scope', () => {
    assert.deepEqual(
      resolveEffectiveSearchScope({
        provider: 'discord',
        preferredScope: 'guild',
        guildId: '881748843313772655',
      }),
      { searchScope: 'guild', guildId: '881748843313772655' },
    );
  });

  it('uses the launch channel id for DM launches when guild id is absent', () => {
    assert.deepEqual(
      resolveEffectiveSearchScope({
        provider: 'discord',
        preferredScope: 'guild',
        guildId: null,
        channelId: '109283746592817263',
      }),
      { searchScope: 'guild', guildId: '109283746592817263' },
    );
  });

  it('degrades guild scope to discord_only on profile launches where both guild and channel are absent', () => {
    assert.deepEqual(
      resolveEffectiveSearchScope({
        provider: 'discord',
        preferredScope: 'guild',
        guildId: null,
        channelId: null,
      }),
      { searchScope: 'discord_only', guildId: null },
    );
  });

  it('honors discord_only without a guild id', () => {
    assert.deepEqual(
      resolveEffectiveSearchScope({
        provider: 'discord',
        preferredScope: 'discord_only',
        guildId: null,
      }),
      { searchScope: 'discord_only', guildId: null },
    );
  });

  it('defaults unknown and unset preferences to global', () => {
    for (const preferredScope of [null, 'bogus', '', 'GLOBAL']) {
      assert.deepEqual(
        resolveEffectiveSearchScope({ provider: 'discord', preferredScope, guildId: '42' }),
        { searchScope: 'global', guildId: null },
      );
    }
  });
});

describe('preferred match scope storage', () => {
  const memory = new Map<string, string>();
  const globalScope = globalThis as Record<string, unknown>;
  if (typeof globalScope.window === 'undefined') {
    globalScope.window = {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => void memory.set(key, value),
      },
    };
  }

  it('round-trips a scope through storage', () => {
    memory.clear();
    assert.equal(readPreferredMatchScope(), null);

    writePreferredMatchScope('guild');
    assert.equal(readPreferredMatchScope(), 'guild');

    writePreferredMatchScope('global');
    assert.equal(readPreferredMatchScope(), 'global');
  });

  it('treats corrupted values as unset', () => {
    memory.set('shape-showdown.matchScope.v1', 'everyone');
    assert.equal(readPreferredMatchScope(), null);
  });
});
