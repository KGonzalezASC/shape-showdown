# Define the durable control-plane model

Type: grilling
Status: closed
Blocked by: 01

## Question

What are the canonical entities, identities, states, leases, transitions, and invariants for players, Discord identities, guests, sessions, queue entries, lobbies, match assignments, join tickets, match results, and reconnect attempts? Decide what Postgres owns and what a live match runtime alone owns.

## Answer

### 1. Ownership Boundary: Postgres vs Match Runtime Memory

- **Postgres owns:**
  - `players`: User accounts (Discord ID or guest UUID), display names, and moderation status.
  - `sessions`: Active browser logins, bearer token hashes, IP addresses, and expiration timestamps.
  - `queue_entries`: Matchmaking pool entries with 10-second heartbeat leases.
  - `lobbies` and `lobby_members`: Private 2-player custom rooms with short activity leases.
  - `matches`: Match assignments, allocated game server URLs, random seeds, protocol versions, and lifecycles.
  - `match_tickets`: 60-second cryptographic passes for seat assignment and reconnects.
  - `match_results`: Finalized outcomes, scores, statistics, and termination reasons.
  - `match_checkpoints`: Periodic snapshot blobs saved every 1 to 2 seconds for server crash recovery.
- **Match Runtime memory owns:**
  - Active 60 Hz simulation boards, falling blocks, and garbage queues.
  - Ephemeral Socket.IO connection IDs (`socket.id`).
  - Active pause clocks and disconnection attempt counters (maximum 3 pauses or 90 seconds total per player).

### 2. Entity Schemas & Tables

#### `players`
- `id` (UUID, Primary Key): Canonical player identity across the game.
- `display_name` (VARCHAR(32)): Player name displayed in match.
- `auth_provider` (VARCHAR(16)): `'discord'` or `'guest'`.
- `discord_user_id` (VARCHAR(64), UNIQUE, Nullable): Verified Discord snowflake ID.
- `avatar_url` (TEXT, Nullable): Profile picture URL.
- `status` (VARCHAR(16)): `'active'` or `'suspended'` for moderation.
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE).

#### `sessions`
- `id` (UUID, Primary Key).
- `player_id` (UUID, Foreign Key to `players.id`).
- `token_hash` (VARCHAR(64), UNIQUE): SHA-256 hash of client auth token.
- `ip_address` (INET, Nullable): Client IP for disconnect tracing and guest rate limiting.
- `user_agent` (TEXT, Nullable).
- `expires_at` (TIMESTAMP WITH TIME ZONE): Expiration timestamp.
- `created_at`, `last_seen_at` (TIMESTAMP WITH TIME ZONE).

#### `queue_entries`
- `id` (UUID, Primary Key).
- `player_id` (UUID, Foreign Key to `players.id`, UNIQUE).
- `session_id` (UUID, Foreign Key to `sessions.id`).
- `status` (VARCHAR(16)): `'searching'`, `'matched'`, or `'cancelled'`.
- `matched_match_id` (UUID, Nullable, References `matches.id`).
- `created_at` (TIMESTAMP WITH TIME ZONE): Used for first-in first-out (FIFO) pairing.
- `expires_at` (TIMESTAMP WITH TIME ZONE): Heartbeat expiration (current time + 10s).

#### `lobbies` & `lobby_members`
- `lobbies`: `id` (UUID), `code` (VARCHAR(8), UNIQUE), `host_player_id` (UUID), `discord_guild_id` (VARCHAR(64), Nullable), `discord_channel_id` (VARCHAR(64), Nullable), `status` (`'waiting'`, `'ready'`, `'launching'`, `'closed'`), `max_players` (fixed at 2), `created_at`, `expires_at`.
- `lobby_members`: `lobby_id` (UUID), `player_id` (UUID), `is_host` (BOOLEAN), `is_ready` (BOOLEAN), `expires_at` (TIMESTAMP, 10s lease).

#### `matches`
- `id` (UUID, Primary Key).
- `correlation_id` (UUID): Links error logs, browser disconnects, and analytics events for debugging.
- `player_a_id` (UUID, Foreign Key to `players.id`).
- `player_b_id` (UUID, Foreign Key to `players.id`).
- `status` (VARCHAR(16)): `'allocating'`, `'countdown'`, `'playing'`, `'ended'`, `'voided'`, `'cancelled'`.
- `game_server_url` (TEXT): WebSocket endpoint compliant with ticket 03 gateway rules.
- `match_seed` (BIGINT): Deterministic seed for piece sequences and shop rolls.
- `protocol_version` (INT): Wire protocol version to reject mismatched clients.
- `created_at`, `started_at`, `ended_at` (TIMESTAMP WITH TIME ZONE).

#### `match_tickets`
- `id` (UUID, Primary Key).
- `match_id` (UUID, Foreign Key to `matches.id`).
- `player_id` (UUID, Foreign Key to `players.id`).
- `ticket_hash` (VARCHAR(64)): SHA-256 hash of secret ticket.
- `seat` (VARCHAR(1)): `'A'` or `'B'`.
- `expires_at` (TIMESTAMP WITH TIME ZONE): 60-second lease window.
- `revoked` (BOOLEAN): Revoked on forfeit or void.

#### `match_results`
- `match_id` (UUID, Primary Key, References `matches.id`).
- `winner_id` (UUID, Nullable): Null on void, draw, or cancelled.
- `loser_id` (UUID, Nullable).
- `outcome_reason` (VARCHAR(32)): `'top_out'`, `'forfeit_disconnect'`, `'forfeit_resignation'`, `'void_server_crash'`, `'void_dual_disconnect'`, `'cancelled_alloc_fail'`.
- `player_a_stats`, `player_b_stats` (JSONB): Scores, lines, attacks, APM, max combo.
- `duration_seconds` (INT).
- `finalized_at` (TIMESTAMP WITH TIME ZONE).

#### `match_checkpoints`
- `id` (BIGSERIAL, Primary Key).
- `match_id` (UUID, Foreign Key to `matches.id`).
- `sim_tick` (INT): Exact simulation frame.
- `state_blob` (BYTEA): Compressed game state snapshot.
- `created_at` (TIMESTAMP WITH TIME ZONE): Saved every 1 to 2 seconds. Pruned to retain 2 most recent rows.

### 3. Lifecycles, Transitions, and Invariants

1. **Authentication & Bans:**
   - Discord OAuth checks `discord_user_id`. If `status = 'suspended'`, login is rejected.
   - Guests receive a random UUID player record. Banning revokes the session token. IP rate limits prevent rapid guest creation.
2. **Matchmaking & Lobbies:**
   - Clients send a heartbeat ping every 3 seconds to keep leases alive.
   - Ghost entries expire after 10 seconds without manual cleanup.
   - Pairing two players, creating a `matches` row, and issuing tickets occurs in one atomic SQL transaction.
3. **Connection & Seat Reclaim:**
   - Seat lease lasts 60 seconds after a socket disconnection.
   - Player refreshes browser, presents session token to receive a refreshed ticket, and reconnects to game server.
   - Game server validates ticket, restores authoritative snapshot, and unpauses match.
4. **Crash Recovery & Finalization:**
   - If a game server process dies, replacement worker loads latest checkpoint from `match_checkpoints` within 15 seconds.
   - If recovery exceeds 15 seconds, match transitions to `'voided'` with reason `'void_server_crash'`.
   - Disconnect budget (3 pauses or 90s total) triggers immediate forfeit win for the connected opponent.
   - All outcomes write to `match_results` immediately.
5. **Rematch Flow:**
   - Completed match records and seeds are immutable.
   - When players select rematch, the system inserts a brand new row in `matches` with a new `match_seed`.
   - Both players receive fresh join tickets to enter the new game.

### 4. Discord Scoping & Cross-Play Rules

1. **Discord Server-Bound Lobbies:** When launched inside a Discord voice or text channel, the lobby binds to `discord_channel_id`. Other players launching the Activity in that same channel join the lobby automatically without typing a room code.
2. **Global Public Matchmaking:** The `queue_entries` pool is global. Discord players and Web Guests match together in the same queue.
3. **Cross-Platform Private Rooms:** A Web Guest can join a Discord player's private room by entering the 8-character room `code`.
