# Shape Showdown — PostgreSQL query catalog and delegation map

This document catalogs the production SQL query shapes, their execution frequency, concurrency semantics, required indexes, and the planning ticket delegating their implementation.

The SQL below matches the entity names and columns decided in [Ticket 05](issues/05-define-durable-control-plane-model.md). Parameters are bound values, not interpolated strings. PostgreSQL still needs representative staging data and `EXPLAIN (ANALYZE, BUFFERS)` before launch to prove the actual plan and latency.

## Performance rules

1. Keep the hot predicates indexable (means ensuring that your most frequently executed query filters can directly utilize database indexes.
Hot Predicates: The filter conditions (WHERE, ON, or HAVING clauses) executed most frequently or on critical performance paths.
Indexable (SARGable): Expressions written so that the database engine can traverse an index rather than scanning the entire table.) 
Compare columns directly with a parameter or `CURRENT_TIMESTAMP`; do not wrap indexed timestamp columns in `DATE_TRUNC`, casts, or functions in `WHERE`.
2. Use partial indexes for short-lived state such as searching queue rows. This avoids indexing rows that the hot query can never claim.
3. Bound cleanup work. A daily `DELETE` of millions of rows creates long locks and table bloat. Delete a small batch, commit, and repeat.
4. Make state-changing reads one statement or one transaction. A `SELECT` followed by a separate `DELETE` without a lock is the database version of a C# `ToList()` followed by a later `Remove()`, so another worker can change the rows in between.
5. Do not add an index for every column. Every insert must update every index. The launch queries below keep indexes that support a listed lookup, retention job, or ordering requirement.

### Required constraints and indexes

Primary keys and unique constraints already create their own indexes. The migration should include these constraints:

```sql
-- Existing unique constraints, shown here as requirements rather than
-- duplicate CREATE INDEX statements.
players (discord_user_id) WHERE discord_user_id IS NOT NULL
sessions (token_hash)
lobbies (code)
lobby_members (lobby_id, player_id)
match_tickets (ticket_hash)
match_results (match_id)
daily_metrics (date)
```

Add these non-unique indexes:

```sql
-- FIFO claim and bounded expired-row cleanup.
CREATE INDEX idx_queue_entries_searching_fifo
ON queue_entries (created_at, id)
WHERE status = 'searching';

CREATE INDEX idx_queue_entries_searching_expiry
ON queue_entries (expires_at, id)
WHERE status = 'searching';

-- Lobby capacity checks and member heartbeats.
CREATE INDEX idx_lobby_members_lobby_active
ON lobby_members (lobby_id, expires_at, player_id);

CREATE INDEX idx_lobby_members_player
ON lobby_members (player_id, lobby_id);

-- Latest checkpoint lookup and pruning.
CREATE INDEX idx_match_checkpoints_match_tick
ON match_checkpoints (match_id, sim_tick DESC, id DESC);

-- Player history, one index for each side of the OR predicate.
CREATE INDEX idx_match_results_winner_history
ON match_results (winner_id, finalized_at DESC, match_id DESC);

CREATE INDEX idx_match_results_loser_history
ON match_results (loser_id, finalized_at DESC, match_id DESC);

-- Retention cleanup and the daily rollup's half-open time range.
CREATE INDEX idx_match_results_finalized_at
ON match_results (finalized_at, match_id);

CREATE INDEX idx_analytics_events_created_at
ON analytics_events (created_at, id);
```

Ticket 07's standalone `event_name` and `match_id` analytics indexes are not used by the queries in this catalog. Keep either one only when a real dashboard or support query needs that lookup. An index that is never read still slows every analytics insert.

### LINQ lens used in this document

The C# snippets are performance analogies, not a second implementation. A LINQ provider can translate `Where`, `OrderBy`, and `Take` into SQL, but standard LINQ has no portable equivalent for PostgreSQL row locks or `SKIP LOCKED`.

```csharp
// Good shape: filter first, use the indexed order, then take a small set.
var recent = db.MatchResults
    .Where(r => r.WinnerId == playerId)
    .OrderByDescending(r => r.FinalizedAt)
    .ThenByDescending(r => r.MatchId)
    .Take(20);

// Risky shape: load a large set into C# and sort or filter there.
var all = db.MatchResults.ToList()
    .Where(r => r.WinnerId == playerId)
    .OrderByDescending(r => r.FinalizedAt)
    .Take(20);
```

The first shape lets PostgreSQL use an index and stop after enough rows. The second transfers and materializes the whole table before doing useful work.

---

## Summary Matrix: Queries by Domain & Ticket

| Domain | Queries | Frequency / Trigger | Ticket Owner |
|---|---|---|---|
| **Player Identity & Auth** | `upsert_discord_player`, `create_guest_player`, `create_session`, `validate_session` | On login & API calls | [Ticket 05](issues/05-define-durable-control-plane-model.md) |
| **Matchmaking & Leases** | `upsert_queue_entry`, `heartbeat_queue_entry`, `claim_queue_pair`, `purge_expired_queue_entries`, `remove_queue_entry` | High (1-3s polling) | [Ticket 05](issues/05-define-durable-control-plane-model.md) |
| **Private Lobbies** | `create_lobby`, `join_lobby`, `heartbeat_lobby`, `delete_lobby` | On room create/join | [Ticket 05](issues/05-define-durable-control-plane-model.md) |
| **Matches & Join Tickets** | `create_match`, `issue_join_ticket`, `validate_join_ticket`, `consume_join_ticket`, `update_match_status` | On match start/reclaim | [Ticket 05](issues/05-define-durable-control-plane-model.md) & [Ticket 06](issues/06-define-isolated-match-runtime-boundary.md) |
| **Checkpoints & Recovery** | `write_checkpoint_with_prune`, `get_latest_checkpoint`, `cleanup_match_checkpoints` | 1–2s per match & on restore | [Ticket 06](issues/06-define-isolated-match-runtime-boundary.md) |
| **Results & Match History** | `insert_match_result`, `get_player_match_history` | On match end & profile view | [Ticket 05](issues/05-define-durable-control-plane-model.md) & [Ticket 07](issues/07-define-analytics-policy.md) |
| **Analytics & Daily Rollups** | `append_analytics_event`, `prune_raw_analytics`, `prune_expired_match_results`, `generate_daily_metrics_rollup` | On events & daily cron | [Ticket 07](issues/07-define-analytics-policy.md) |
| **Health & Operations** | `health_ping`, `get_applied_migrations`, `record_migration` | Every 5s & on deploy boot | [Ticket 09](issues/09-define-release-and-operations-contract.md) |

---

## 1. Player Identity & Authentication

**Delegated to:** [Ticket 05: Define durable control-plane model](issues/05-define-durable-control-plane-model.md)

### `upsert_discord_player`
Normalizes incoming Discord OAuth profiles into our internal player table.
```sql
INSERT INTO players (
  discord_user_id, display_name, avatar_url, auth_provider, status
)
VALUES ($1, $2, $3, 'discord', 'active')
ON CONFLICT (discord_user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = CURRENT_TIMESTAMP
RETURNING id, display_name, avatar_url, status, created_at;
```

### `create_guest_player`
Issues an anonymous player ID for direct web visitors.
```sql
INSERT INTO players (display_name, auth_provider, status)
VALUES ($1, 'guest', 'active')
RETURNING id, display_name, status, created_at;
```

### `create_session`
Stores an active browser authentication session.
```sql
INSERT INTO sessions (player_id, token_hash, ip_address, expires_at)
VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '30 days')
RETURNING id, expires_at;
```

The application hashes the random bearer token before sending `$2`. It keeps the raw token only long enough to return it to the client. The database never stores or returns the raw token.

### `validate_session`
Authenticates incoming HTTP and WebSocket requests.
```sql
SELECT s.id AS session_id, s.player_id, s.expires_at, p.display_name, p.discord_user_id
FROM sessions s
JOIN players p ON s.player_id = p.id
WHERE s.token_hash = $1
  AND s.expires_at > CURRENT_TIMESTAMP
  AND p.status = 'active';
```

`sessions(token_hash)` is unique, so PostgreSQL can find one session before checking the expiration and player status. This read intentionally does not update `last_seen_at`; updating a row on every request would turn authentication into a write hotspot.

---

## 2. Matchmaking Queue & Leases

**Delegated to:** [Ticket 05: Define durable control-plane model](issues/05-define-durable-control-plane-model.md)

### `upsert_queue_entry`
Enters a player into the matchmaking queue with a 10-second expiration lease.
```sql
INSERT INTO queue_entries (player_id, session_id, status, expires_at)
VALUES ($1, $2, 'searching', CURRENT_TIMESTAMP + INTERVAL '10 seconds')
ON CONFLICT (player_id) DO UPDATE SET
  session_id = EXCLUDED.session_id,
  status = 'searching',
  matched_match_id = NULL,
  expires_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds'
WHERE queue_entries.status <> 'matched'
   OR queue_entries.expires_at <= CURRENT_TIMESTAMP
RETURNING id, player_id, status, expires_at;
```

### `heartbeat_queue_entry`
Refreshes the player's lease while waiting in the matchmaking screen.
```sql
UPDATE queue_entries
SET expires_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds'
WHERE player_id = $1
  AND status = 'searching'
  AND expires_at > CURRENT_TIMESTAMP
RETURNING id, expires_at;
```

### `claim_queue_pair` (Atomic Match Pairer)
Finds exactly two waiting players, locks their rows to prevent race conditions, and removes them from the queue in one statement. The `HAVING` condition matters. Without it, a nearly empty queue would delete one player and leave them without a match.
```sql
WITH candidates AS MATERIALIZED (
  SELECT id, player_id, session_id
  FROM queue_entries
  WHERE status = 'searching'
    AND expires_at > CURRENT_TIMESTAMP
  ORDER BY created_at ASC, id ASC
  LIMIT 2
  FOR UPDATE SKIP LOCKED
),
pair AS (
  SELECT id
  FROM candidates
  WHERE (SELECT COUNT(*) FROM candidates) = 2
)
DELETE FROM queue_entries q
USING pair
WHERE q.id = pair.id
RETURNING q.id, q.player_id, q.session_id;
```

The queue is global as decided in Ticket 05. Regional server selection happens after the control plane has a pair, so this query must not filter on a nonexistent `region` column.

The caller must keep `claim_queue_pair`, `create_match`, and both `issue_join_ticket` calls in one transaction. If allocation fails, rolling back restores both queue rows.

In C# terms, this is closer to a database-side `Take(2)` plus a row lock than to:

```csharp
var players = db.QueueEntries
    .Where(q => q.Status == "searching" && q.ExpiresAt > now)
    .OrderBy(q => q.CreatedAt)
    .Take(2)
    .ToList();
```

That LINQ query only reads a list. Two pairers can read the same two rows before either one deletes them. `FOR UPDATE SKIP LOCKED` makes one pairer skip rows already claimed by another pairer.

### `purge_expired_queue_entries`
Removes stale searching rows in small batches. Run this janitor independently of the pairer.
```sql
WITH expired AS (
  SELECT id
  FROM queue_entries
  WHERE status = 'searching'
    AND expires_at <= CURRENT_TIMESTAMP
  ORDER BY expires_at ASC, id ASC
  LIMIT $1
)
DELETE FROM queue_entries q
USING expired
WHERE q.id = expired.id
RETURNING q.id;
```

Repeat until the returned row count is zero, committing each batch. `$1` can start at 500 or 1,000 and should be measured on staging.

### `remove_queue_entry`
Removes a player who cancels matchmaking.
```sql
DELETE FROM queue_entries
WHERE player_id = $1
  AND status = 'searching'
RETURNING id;
```

---

## 3. Private Custom Lobbies

**Delegated to:** [Ticket 05: Define durable control-plane model](issues/05-define-durable-control-plane-model.md)

### `create_lobby`
Creates a private invite code with a 15-minute lease.
```sql
WITH new_lobby AS (
  INSERT INTO lobbies (code, host_player_id, status, max_players, expires_at)
  VALUES ($1, $2, 'waiting', 2, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
  RETURNING id, code, host_player_id, expires_at
),
host_member AS (
  INSERT INTO lobby_members (
    lobby_id, player_id, is_host, is_ready, expires_at
  )
  SELECT id, host_player_id, TRUE, FALSE,
         CURRENT_TIMESTAMP + INTERVAL '10 seconds'
  FROM new_lobby
  RETURNING lobby_id
)
SELECT l.code, l.host_player_id, l.expires_at
FROM new_lobby l;
```

Run this as one statement or as two statements in one transaction. The lobby and its host membership must not be visible separately.

### `join_lobby`
Atomically assigns a guest player to an open lobby. Locking the lobby row serializes the capacity check, so two guests cannot both observe one free seat and occupy it.
```sql
WITH target AS MATERIALIZED (
  SELECT id, code, host_player_id
  FROM lobbies
  WHERE code = $2
    AND status = 'waiting'
    AND expires_at > CURRENT_TIMESTAMP
  FOR UPDATE
),
joined AS (
  INSERT INTO lobby_members (
    lobby_id, player_id, is_host, is_ready, expires_at
  )
  SELECT t.id, $1, FALSE, FALSE,
         CURRENT_TIMESTAMP + INTERVAL '10 seconds'
  FROM target t
  WHERE (
    SELECT COUNT(*)
    FROM lobby_members lm
    WHERE lm.lobby_id = t.id
      AND lm.expires_at > CURRENT_TIMESTAMP
  ) < 2
  ON CONFLICT (lobby_id, player_id) DO UPDATE
  SET expires_at = EXCLUDED.expires_at
  RETURNING lobby_id, player_id
)
SELECT t.code, t.host_player_id, j.player_id
FROM target t
JOIN joined j ON j.lobby_id = t.id;
```

### `heartbeat_lobby`
Keeps a lobby alive while a current member configures options. A non-member cannot extend the lease.
```sql
WITH refreshed_member AS (
  UPDATE lobby_members lm
  SET expires_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds'
  FROM lobbies l
  WHERE lm.lobby_id = l.id
    AND l.code = $1
    AND l.status IN ('waiting', 'ready', 'launching')
    AND lm.player_id = $2
  RETURNING lm.lobby_id
)
UPDATE lobbies l
SET expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes'
FROM refreshed_member rm
WHERE l.id = rm.lobby_id
RETURNING l.code, l.expires_at;
```

### `delete_lobby`
Closes a lobby when its host starts the match or leaves. `lobby_members` should use `ON DELETE CASCADE` for `lobby_id`.
```sql
DELETE FROM lobbies
WHERE code = $1
  AND host_player_id = $2
RETURNING id, code;
```

---

## 4. Match Lifecycle & Join Tickets

**Delegated to:** [Ticket 05](issues/05-define-durable-control-plane-model.md) & [Ticket 06: Define isolated match runtime boundary](issues/06-define-isolated-match-runtime-boundary.md)

### `create_match`
Records a newly matched 1v1 encounter.
```sql
INSERT INTO matches (
  id, correlation_id, match_seed, player_a_id, player_b_id,
  game_server_url, protocol_version, status
)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'allocating')
RETURNING id, correlation_id, match_seed, game_server_url, protocol_version, status;
```

### `issue_join_ticket`
Generates a 60-second cryptographically random ticket for connecting to the game server.
```sql
INSERT INTO match_tickets (
  match_id, player_id, ticket_hash, seat, expires_at, revoked
)
VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '60 seconds', FALSE)
RETURNING id, match_id, player_id, seat, expires_at;
```

`$3` is the SHA-256 hash of the random ticket. The application sends the raw random ticket to the client separately; it is never returned by SQL.

### `validate_join_ticket`
Verifies a player's seat ticket when they establish a WebSocket connection.
```sql
SELECT t.id, t.match_id, t.player_id, t.seat,
       m.status, m.game_server_url, m.protocol_version
FROM match_tickets t
JOIN matches m ON t.match_id = m.id
WHERE t.ticket_hash = $1
  AND t.revoked = FALSE
  AND t.expires_at > CURRENT_TIMESTAMP
  AND m.status IN ('allocating', 'countdown', 'playing');
```

### `consume_join_ticket`
Validates and deletes a ticket after successful socket connection. Combining the checks with the delete prevents two concurrent socket handshakes from consuming the same ticket.
```sql
DELETE FROM match_tickets t
USING matches m
WHERE t.match_id = m.id
  AND t.ticket_hash = $1
  AND t.revoked = FALSE
  AND t.expires_at > CURRENT_TIMESTAMP
  AND m.status IN ('allocating', 'countdown', 'playing')
RETURNING t.id, t.match_id, t.player_id, t.seat;
```

### `update_match_status`
Updates a match status only when the caller supplies the status it expects. A zero-row result means another worker already moved the match, so a stale writer cannot overwrite it.
```sql
UPDATE matches
SET status = $3,
    started_at = CASE
      WHEN $3 = 'playing' AND started_at IS NULL
      THEN CURRENT_TIMESTAMP
      ELSE started_at
    END,
    ended_at = CASE
      WHEN $3 IN ('ended', 'voided', 'cancelled')
      THEN COALESCE(ended_at, CURRENT_TIMESTAMP)
      ELSE ended_at
    END
WHERE id = $1
  AND status = $2
RETURNING id, status, started_at, ended_at;
```

---

## 5. Checkpoints & Crash Recovery

**Delegated to:** [Ticket 06: Define isolated match runtime boundary](issues/06-define-isolated-match-runtime-boundary.md)

### `write_checkpoint_with_prune`
Writes a new 1-to-2 second snapshot blob and keeps the two newest rows in a single statement. The ranking input explicitly includes the newly inserted row. A data-modifying CTE does not make its inserted row visible through a sibling scan of `match_checkpoints`.
```sql
WITH inserted AS (
  INSERT INTO match_checkpoints (match_id, sim_tick, state_blob)
  VALUES ($1, $2, $3)
  RETURNING id, match_id, sim_tick
),
ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY match_id
           ORDER BY sim_tick DESC, id DESC
         ) AS rn
  FROM (
    SELECT id, match_id, sim_tick
    FROM match_checkpoints
    WHERE match_id = $1

    UNION ALL

    SELECT id, match_id, sim_tick
    FROM inserted
  ) all_checkpoints
),
deleted AS (
  DELETE FROM match_checkpoints c
  USING ranked r
  WHERE c.id = r.id
    AND r.rn > 2
  RETURNING c.id
)
SELECT id, match_id, sim_tick
FROM inserted;
```

`MatchRunner` is the single writer for a match. If more than one worker can write the same match, take a per-match advisory transaction lock before this statement.

### `get_latest_checkpoint`
Restores a match after a server process restarts.
```sql
SELECT id, match_id, sim_tick, state_blob, created_at
FROM match_checkpoints
WHERE match_id = $1
ORDER BY sim_tick DESC, id DESC
LIMIT 1;
```

### `cleanup_match_checkpoints`
Purges remaining snapshots when a match terminates cleanly.
```sql
DELETE FROM match_checkpoints
WHERE match_id = $1
RETURNING id;
```

The composite checkpoint index makes the latest-row query an ordered index walk that can stop after one row. In C# terms, this is the difference between `OrderByDescending(...).First()` on an indexed query and loading every checkpoint into memory before choosing the first item.

---

## 6. Match Results & Player History

**Delegated to:** [Ticket 05](issues/05-define-durable-control-plane-model.md) & [Ticket 07: Define analytics policy](issues/07-define-analytics-policy.md)

### `insert_match_result`
Persists the final match outcome immediately upon completion.
```sql
INSERT INTO match_results (
  match_id, winner_id, loser_id, outcome_reason, duration_seconds,
  player_a_stats, player_b_stats
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (match_id) DO NOTHING
RETURNING match_id, finalized_at;
```

`match_results(match_id)` makes retries idempotent. If `RETURNING` yields no row, the caller can read the already-finalized result instead of inserting a duplicate.

### `get_player_match_history`
Retrieves a player's recent match results for their profile.
```sql
WITH recent_results AS (
  (
    SELECT r.match_id, r.winner_id, r.loser_id, r.outcome_reason,
           r.duration_seconds, r.player_a_stats, r.player_b_stats,
           r.finalized_at
    FROM match_results r
    WHERE r.winner_id = $1
    ORDER BY r.finalized_at DESC, r.match_id DESC
    LIMIT 20
  )
  UNION ALL
  (
    SELECT r.match_id, r.winner_id, r.loser_id, r.outcome_reason,
           r.duration_seconds, r.player_a_stats, r.player_b_stats,
           r.finalized_at
    FROM match_results r
    WHERE r.loser_id = $1
    ORDER BY r.finalized_at DESC, r.match_id DESC
    LIMIT 20
  )
)
SELECT r.match_id, r.outcome_reason, r.duration_seconds,
       r.player_a_stats, r.player_b_stats, r.finalized_at,
  p_win.display_name AS winner_name,
  p_lose.display_name AS loser_name
FROM recent_results r
LEFT JOIN players p_win ON r.winner_id = p_win.id
LEFT JOIN players p_lose ON r.loser_id = p_lose.id
ORDER BY r.finalized_at DESC, r.match_id DESC
LIMIT 20;
```

The two branches use the separate winner and loser indexes and read at most 40 rows before the final sort. The original `winner_id = $1 OR loser_id = $1` can still be correct, but it gives the planner an `OR` to combine and can scan more rows before applying the limit.

The C# shape is:

```csharp
var recent = db.MatchResults
    .Where(r => r.WinnerId == playerId)
    .OrderByDescending(r => r.FinalizedAt)
    .Take(20)
    .Concat(db.MatchResults
        .Where(r => r.LoserId == playerId)
        .OrderByDescending(r => r.FinalizedAt)
        .Take(20))
    .OrderByDescending(r => r.FinalizedAt)
    .Take(20);
```

Do not call `ToList()` before these filters or limits. The database must do the filtering and top-N work.

---

## 7. Analytics & Data Retention

**Delegated to:** [Ticket 07: Define analytics policy](issues/07-define-analytics-policy.md)

### `append_analytics_event`
Appends a telemetry event asynchronously.
```sql
INSERT INTO analytics_events (event_name, player_id, match_id, properties)
VALUES ($1, $2, $3, $4);
```

This is intentionally a fire-and-forget insert with no `RETURNING` payload. The event writer should use a prepared statement and a bounded connection pool. Do not write per-tick state or keystrokes here.

### `prune_raw_analytics` (Daily Scheduled Task)
Deletes raw telemetry older than 30 days in small batches. Repeat the statement until it returns zero rows, committing each batch.
```sql
WITH doomed AS (
  SELECT id
  FROM analytics_events
  WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
  ORDER BY created_at ASC, id ASC
  LIMIT $1
)
DELETE FROM analytics_events e
USING doomed
WHERE e.id = doomed.id
RETURNING e.id;
```

### `prune_expired_match_results` (Daily Scheduled Task)
Deletes match history rows older than 180 days in small batches.
```sql
WITH doomed AS (
  SELECT match_id
  FROM match_results
  WHERE finalized_at < CURRENT_TIMESTAMP - INTERVAL '180 days'
  ORDER BY finalized_at ASC, match_id ASC
  LIMIT $1
)
DELETE FROM match_results r
USING doomed
WHERE r.match_id = doomed.match_id
RETURNING r.match_id;
```

### `generate_daily_metrics_rollup`
Compiles the previous UTC calendar day into the long-term `daily_metrics` table. The half-open timestamp range keeps the `created_at` index usable and avoids counting a boundary event twice.
```sql
WITH bounds AS (
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 1 AS day
),
rollup AS (
  SELECT
    b.day,
    COUNT(e.id) FILTER (WHERE e.event_name = 'match_start') AS matches_started,
    COUNT(e.id) FILTER (WHERE e.event_name = 'match_end') AS matches_completed,
    COUNT(DISTINCT e.player_id)
      FILTER (WHERE e.player_id IS NOT NULL) AS unique_players,
    AVG(NULLIF(e.properties->>'duration_s', '')::numeric)
      FILTER (WHERE e.event_name = 'match_end') AS avg_duration_seconds
  FROM bounds b
  LEFT JOIN analytics_events e
    ON e.created_at >= (b.day::timestamp AT TIME ZONE 'UTC')
   AND e.created_at < ((b.day + 1)::timestamp AT TIME ZONE 'UTC')
  GROUP BY b.day
)
INSERT INTO daily_metrics (
  date, matches_started, matches_completed, unique_players, avg_duration_seconds
)
SELECT day, matches_started, matches_completed, unique_players, avg_duration_seconds
FROM rollup
ON CONFLICT (date) DO UPDATE SET
  matches_started = EXCLUDED.matches_started,
  matches_completed = EXCLUDED.matches_completed,
  unique_players = EXCLUDED.unique_players,
  avg_duration_seconds = EXCLUDED.avg_duration_seconds;
```

`unique_players` counts non-null `analytics_events.player_id` values. The event writer must populate that column for every player-scoped event. `match_start` events that only put both players inside JSON properties will not count those players.

The C# analogy is:

```csharp
var yesterday = events
    .Where(e => e.CreatedAt >= utcStart && e.CreatedAt < utcEnd)
    .GroupBy(e => e.CreatedAt.Date)
    .Select(g => new {
        Started = g.Count(e => e.EventName == "match_start"),
        Completed = g.Count(e => e.EventName == "match_end")
    });
```

The important part is the range filter on the raw `CreatedAt` property. Applying `.Where(e => e.CreatedAt.Date == yesterday)` is easier to write but often makes the database calculate a function for every row instead of seeking into the timestamp index.

---

## 8. Health, Operations & Migrations

**Delegated to:** [Ticket 09: Define release and operations contract](issues/09-define-release-and-operations-contract.md)

### `health_ping`
Lightweight query executed by `/health` to verify database responsiveness.
```sql
SELECT 1;
```

### `create_migrations_table`
Initializes migration history tracking.
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### `get_applied_migrations`
Lists already-executed migration scripts on startup.
```sql
SELECT version FROM schema_migrations ORDER BY applied_at ASC;
```

### `record_migration`
Marks a migration script as executed.
```sql
INSERT INTO schema_migrations (version) VALUES ($1);
```
