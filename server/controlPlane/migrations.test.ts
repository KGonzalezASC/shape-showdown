import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadMigrationFiles } from './migrations.js';

describe('control-plane migrations', () => {
  it('loads migrations in version order from the source directory', async () => {
    const directory = path.join(process.cwd(), 'db', 'migrations');
    const migrations = await loadMigrationFiles(directory);

    assert.deepEqual(migrations.map((migration) => migration.version), [
      '0001_control_plane',
      '0002_concurrent_join_tickets',
    ]);
    assert.match(migrations[0]?.sql ?? '', /CREATE TABLE IF NOT EXISTS players/);
    assert.match(
      migrations[0]?.sql ?? '',
      /CREATE TABLE IF NOT EXISTS match_checkpoints/,
    );
    assert.match(
      migrations[1]?.sql ?? '',
      /DROP CONSTRAINT IF EXISTS match_tickets_match_id_seat_key/,
    );
  });
});
