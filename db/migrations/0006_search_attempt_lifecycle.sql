CREATE TABLE IF NOT EXISTS search_attempts (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL CHECK (
    status IN ('searching', 'matched', 'cancelled', 'expired')
  ),
  requested_scope VARCHAR(16) NOT NULL CHECK (
    requested_scope IN ('global', 'guild', 'discord_only')
  ),
  effective_scope VARCHAR(16) NOT NULL CHECK (
    effective_scope IN ('global', 'guild', 'discord_only')
  ),
  guild_id VARCHAR(64),
  pool_key VARCHAR(256) NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1 CHECK (generation > 0),
  pool_entered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  matched_match_id UUID REFERENCES matches (id) ON DELETE SET NULL,
  terminal_reason VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (effective_scope <> 'guild' OR guild_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_attempts_one_searching_per_player
  ON search_attempts (player_id)
  WHERE status = 'searching';

CREATE INDEX IF NOT EXISTS idx_search_attempts_status_pool
  ON search_attempts (status, pool_key, pool_entered_at, id);

CREATE TABLE IF NOT EXISTS search_avoidances (
  search_attempt_id UUID NOT NULL REFERENCES search_attempts (id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  reason VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (search_attempt_id, opponent_id)
);

ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS search_attempt_id UUID REFERENCES search_attempts (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS generation INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pool_entered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_queue_entries_attempt_generation
  ON queue_entries (search_attempt_id, generation)
  WHERE status = 'searching';

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS player_a_search_attempt_id UUID REFERENCES search_attempts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS player_b_search_attempt_id UUID REFERENCES search_attempts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS terminal_reason VARCHAR(64);

ALTER TABLE match_results
  DROP CONSTRAINT IF EXISTS match_results_outcome_reason_check;

ALTER TABLE match_results
  ADD CONSTRAINT match_results_outcome_reason_check CHECK (
    outcome_reason IN (
      'top_out',
      'forfeit_disconnect',
      'forfeit_resignation',
      'void_server_crash',
      'void_rendezvous_timeout',
      'void_dual_disconnect',
      'cancelled_alloc_fail'
    )
  );
