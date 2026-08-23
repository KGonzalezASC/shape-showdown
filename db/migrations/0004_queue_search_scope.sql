ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS search_scope VARCHAR(16) NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS guild_id VARCHAR(64);

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS search_scope VARCHAR(16) NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS guild_id VARCHAR(64);

ALTER TABLE queue_entries DROP CONSTRAINT IF EXISTS chk_queue_entries_search_scope;
ALTER TABLE queue_entries
  ADD CONSTRAINT chk_queue_entries_search_scope
  CHECK (search_scope IN ('global', 'guild', 'discord_only'));

ALTER TABLE queue_entries DROP CONSTRAINT IF EXISTS chk_queue_entries_guild_required;
ALTER TABLE queue_entries
  ADD CONSTRAINT chk_queue_entries_guild_required
  CHECK (search_scope <> 'guild' OR guild_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_queue_entries_searching_guild
  ON queue_entries (guild_id, created_at, id)
  WHERE status = 'searching' AND search_scope = 'guild';

CREATE INDEX IF NOT EXISTS idx_queue_entries_searching_discord_only
  ON queue_entries (created_at, id)
  WHERE status = 'searching' AND search_scope = 'discord_only';

CREATE INDEX IF NOT EXISTS idx_queue_entries_searching_global
  ON queue_entries (created_at, id)
  WHERE status = 'searching' AND search_scope = 'global';
