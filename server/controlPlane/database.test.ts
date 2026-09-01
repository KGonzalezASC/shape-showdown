import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDatabase } from './database.js';

describe('database bootstrap', () => {
  it('can force in-memory mode even when a database URL is present', () => {
    assert.equal(
      createDatabase('postgres://postgres:postgres@127.0.0.1:5432/shape_showdown', {
        forceInMemory: true,
      }),
      null,
    );
  });
});
