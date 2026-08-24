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
      '0003_ticket_consumption_state',
      '0004_queue_search_scope',
      '0005_recent_opponent_avoidance',
      '0006_search_attempt_lifecycle',
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
    assert.match(
      migrations[2]?.sql ?? '',
      /ADD COLUMN IF NOT EXISTS consumed_at/,
    );
    assert.match(
      migrations[3]?.sql ?? '',
      /ADD COLUMN IF NOT EXISTS search_scope/,
    );
    assert.match(
      migrations[3]?.sql ?? '',
      /chk_queue_entries_guild_required/,
    );
    assert.match(
      migrations[4]?.sql ?? '',
      /ADD COLUMN IF NOT EXISTS avoid_player_id/,
    );
    assert.match(
      migrations[4]?.sql ?? '',
      /ADD COLUMN IF NOT EXISTS is_repeat_pairing/,
    );
    assert.match(
      migrations[5]?.sql ?? '',
      /CREATE TABLE IF NOT EXISTS search_attempts/,
    );
  });
});
