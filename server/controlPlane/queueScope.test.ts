import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isScopedEnqueueEnabled, validateQueueScopeRequest } from './queueScope.js';

const discordContext = (scopedEnqueueEnabled = true) => ({
  discordUserId: '123456789012345678' as string | null,
  scopedEnqueueEnabled,
});

describe('validateQueueScopeRequest', () => {
  it('defaults absent and empty bodies to global', () => {
    for (const body of [undefined, {}, null, 'nope']) {
      const result = validateQueueScopeRequest(body, discordContext());
      assert.equal(result.reason, null);
      assert.deepEqual(result.scope, { searchScope: 'global', guildId: null });
    }
  });

  it('coerces guests to global regardless of requested scope', () => {
    const guest = { discordUserId: null, scopedEnqueueEnabled: true };
    assert.deepEqual(
      validateQueueScopeRequest({ searchScope: 'guild', guildId: '42' }, guest),
      { scope: { searchScope: 'global', guildId: null }, reason: null },
    );
    assert.deepEqual(
      validateQueueScopeRequest({ searchScope: 'discord_only' }, guest),
      { scope: { searchScope: 'global', guildId: null }, reason: null },
    );
  });

  it('coerces every request to global when scoped enqueue is disabled', () => {
    const disabled = discordContext(false);
    assert.deepEqual(
      validateQueueScopeRequest({ searchScope: 'guild', guildId: '42' }, disabled),
      { scope: { searchScope: 'global', guildId: null }, reason: null },
    );
  });

  it('accepts a valid guild scope with a numeric snowflake id', () => {
    const result = validateQueueScopeRequest(
      { searchScope: 'guild', guildId: '881748843313772655' },
      discordContext(),
    );
    assert.equal(result.reason, null);
    assert.deepEqual(result.scope, {
      searchScope: 'guild',
      guildId: '881748843313772655',
    });
  });

  it('rejects guild scope without a well-formed guild id and falls back to global', () => {
    for (const body of [
      { searchScope: 'guild' },
      { searchScope: 'guild', guildId: '' },
      { searchScope: 'guild', guildId: 'abc' },
      { searchScope: 'guild', guildId: '-42' },
      { searchScope: 'guild', guildId: 12345 },
      { searchScope: 'guild', guildId: '9'.repeat(65) },
    ]) {
      const result = validateQueueScopeRequest(body, discordContext());
      assert.match(result.reason ?? '', /guild/i);
      assert.deepEqual(result.scope, { searchScope: 'global', guildId: null });
    }
  });

  it('accepts discord_only and drops any supplied guild id', () => {
    const result = validateQueueScopeRequest(
      { searchScope: 'discord_only', guildId: '42' },
      discordContext(),
    );
    assert.equal(result.reason, null);
    assert.deepEqual(result.scope, { searchScope: 'discord_only', guildId: null });
  });

  it('rejects unknown scope values instead of coercing them', () => {
    for (const scope of ['everyone', 'GLOBAL', 'server', 5]) {
      const result = validateQueueScopeRequest({ searchScope: scope }, discordContext());
      assert.notEqual(result.reason, null);
      assert.equal(result.scope.searchScope, 'global');
    }
  });
});

describe('isScopedEnqueueEnabled', () => {
  it('is enabled by default and only disabled by explicit falsy values', () => {
    assert.equal(isScopedEnqueueEnabled(undefined), true);
    assert.equal(isScopedEnqueueEnabled('true'), true);
    assert.equal(isScopedEnqueueEnabled(''), true);
    assert.equal(isScopedEnqueueEnabled('false'), false);
    assert.equal(isScopedEnqueueEnabled('0'), false);
    assert.equal(isScopedEnqueueEnabled(' off '), false);
  });
});
