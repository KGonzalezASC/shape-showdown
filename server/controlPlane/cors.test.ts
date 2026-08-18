import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCorsOrigins } from './cors.js';

describe('control-plane CORS origins', () => {
  it('allows the mapped Pages and Discord origins in production', () => {
    const origins = resolveCorsOrigins('production');

    assert.notEqual(origins, '*');
    assert.ok(origins instanceof Array);
    assert.ok(origins.some((origin) => origin instanceof RegExp && origin.test('https://shape-showdown.pages.dev')));
    assert.ok(
      origins.some((origin) =>
        origin instanceof RegExp && origin.test('https://123456.discordsays.com'),
      ),
    );
  });

  it('does not allow localhost in production unless explicitly enabled', () => {
    const originalValue = process.env.ALLOW_LOCALHOST;
    delete process.env.ALLOW_LOCALHOST;

    try {
      const origins = resolveCorsOrigins('production');
      assert.ok(origins instanceof Array);
      assert.ok(
        origins.every(
          (origin) => !(origin instanceof RegExp && origin.test('http://localhost:3000')),
        ),
      );
    } finally {
      if (originalValue === undefined) delete process.env.ALLOW_LOCALHOST;
      else process.env.ALLOW_LOCALHOST = originalValue;
    }
  });

  it('allows localhost only when explicitly enabled', () => {
    const originalValue = process.env.ALLOW_LOCALHOST;
    process.env.ALLOW_LOCALHOST = 'true';

    try {
      const origins = resolveCorsOrigins('production');
      assert.ok(origins instanceof Array);
      assert.ok(
        origins.some(
          (origin) => origin instanceof RegExp && origin.test('http://localhost:3000'),
        ),
      );
    } finally {
      if (originalValue === undefined) delete process.env.ALLOW_LOCALHOST;
      else process.env.ALLOW_LOCALHOST = originalValue;
    }
  });
});
