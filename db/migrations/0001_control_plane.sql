CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY,
  discord_user_id VARCHAR(64) UNIQUE,
  display_name VARCHAR(32) NOT NULL,
  avatar_url TEXT,
  auth_provider VARCHAR(16) NOT NULL CHECK (auth_provider IN ('discord', 'guest')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_player
  ON sessions (player_id, expires_at);

CREATE TABLE IF NOT EXISTS lobbies (
  id UUID PRIMARY KEY,
  code VARCHAR(8) NOT NULL UNIQUE,
  host_player_id UUID NOT NULL REFERENCES players (id),
  discord_guild_id VARCHAR(64),
  discord_channel_id VARCHAR(64),
  status VARCHAR(16) NOT NULL CHECK (status IN ('waiting', 'ready', 'launching', 'closed')),
  max_players SMALLINT NOT NULL DEFAULT 2 CHECK (max_players = 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY,
  correlation_id UUID NOT NULL,
  match_seed BIGINT NOT NULL,
  player_a_id UUID NOT NULL REFERENCES players (id),
  player_b_id UUID NOT NULL REFERENCES players (id),
  game_server_url TEXT NOT NULL,
  protocol_version INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (
    status IN ('allocating', 'countdown', 'playing', 'ended', 'voided', 'cancelled')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  CHECK (player_a_id <> player_b_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_status_created_at
  ON matches (status, created_at);

CREATE TABLE IF NOT EXISTS queue_entries (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL UNIQUE REFERENCES players (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL CHECK (status IN ('searching', 'matched', 'cancelled')),
  matched_match_id UUID REFERENCES matches (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_entries_searching_fifo
  ON queue_entries (created_at, id)
  WHERE status = 'searching';

CREATE INDEX IF NOT EXISTS idx_queue_entries_searching_expiry
  ON queue_entries (expires_at, id)
  WHERE status = 'searching';

CREATE TABLE IF NOT EXISTS lobby_members (
  lobby_id UUID NOT NULL REFERENCES lobbies (id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  is_host BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (lobby_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_lobby_members_lobby_active
  ON lobby_members (lobby_id, expires_at, player_id);

CREATE INDEX IF NOT EXISTS idx_lobby_members_player
  ON lobby_members (player_id, lobby_id);

CREATE TABLE IF NOT EXISTS match_tickets (
  id UUID PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  ticket_hash VARCHAR(64) NOT NULL UNIQUE,
  seat VARCHAR(1) NOT NULL CHECK (seat IN ('A', 'B')),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (match_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_match_tickets_match_player
  ON match_tickets (match_id, player_id, expires_at)
  WHERE revoked = FALSE;

CREATE TABLE IF NOT EXISTS match_checkpoints (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  sim_tick INTEGER NOT NULL CHECK (sim_tick >= 0),
  state_blob BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_checkpoints_match_tick
  ON match_checkpoints (match_id, sim_tick DESC, id DESC);

CREATE TABLE IF NOT EXISTS match_results (
  match_id UUID PRIMARY KEY REFERENCES matches (id) ON DELETE CASCADE,
  winner_id UUID REFERENCES players (id) ON DELETE SET NULL,
  loser_id UUID REFERENCES players (id) ON DELETE SET NULL,
  outcome_reason VARCHAR(32) NOT NULL CHECK (
    outcome_reason IN (
      'top_out',
      'forfeit_disconnect',
      'forfeit_resignation',
      'void_server_crash',
      'void_dual_disconnect',
      'cancelled_alloc_fail'
    )
  ),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
  player_a_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  player_b_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_results_winner_history
  ON match_results (winner_id, finalized_at DESC, match_id DESC);

CREATE INDEX IF NOT EXISTS idx_match_results_loser_history
  ON match_results (loser_id, finalized_at DESC, match_id DESC);

CREATE INDEX IF NOT EXISTS idx_match_results_finalized_at
  ON match_results (finalized_at, match_id);

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event_name VARCHAR(32) NOT NULL,
  player_id UUID REFERENCES players (id) ON DELETE SET NULL,
  match_id UUID REFERENCES matches (id) ON DELETE CASCADE,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events (created_at, id);

CREATE TABLE IF NOT EXISTS daily_metrics (
  date DATE PRIMARY KEY,
  matches_started INTEGER NOT NULL DEFAULT 0,
  matches_completed INTEGER NOT NULL DEFAULT 0,
  unique_players INTEGER NOT NULL DEFAULT 0,
  avg_duration_seconds NUMERIC
);
