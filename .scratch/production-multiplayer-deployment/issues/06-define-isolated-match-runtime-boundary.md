# Define the isolated match-runtime boundary

Type: prototype
Status: closed
Blocked by: 01, 02, 05

## Question

What interface lets the existing authoritative GameManager run many isolated matches safely inside one launch process and later run one or more matches inside regional containers? Prove match ownership, lifecycle, resource cleanup, protocol versioning, join-ticket validation, graceful drain, and authoritative snapshot resumption without rewriting the deterministic engine.

## Answer

### 1. Multi-Match Isolation (Three Services)

The singleton `GameManager` splits into three focused classes using the Registry & Factory pattern, the State pattern, and explicit disposable teardown:

- **`MatchRegistry`** — Owns a `Map<string, MatchRunner>` of all active matches in the process. Creates new `MatchRunner` instances via a factory method. Routes incoming Socket.IO events to the correct runner by `matchId`. Tracks a `isDraining` flag for graceful shutdown.
- **`MatchRunner`** — Encapsulates exactly one 1v1 match. Owns its own `matchId`, `matchSeed`, `gameState`, 60 Hz `setInterval` loop, RNG channels, and replay recorder. Broadcasts state updates only to its Socket.IO room (`match:<matchId>`). Receives dependencies (IO server, persistence adapter, replay recorder) through constructor injection.
- **`MatchPersistence`** — Writes checkpoints and final results to Postgres. Injected into `MatchRunner` at construction. Tests substitute a mock writer.

### 2. Match Lifecycle States

Each `MatchRunner` enforces strict sequential transitions:

1. **`ALLOCATING`**: Created by `MatchRegistry`. Waiting for both players to connect via join tickets.
2. **`COUNTDOWN`**: Both seats filled. Running the 3-second starting countdown.
3. **`PLAYING`**: Authoritative 60 Hz simulation ticking.
   - **`PAUSED` (sub-state)**: Activated when a player drops socket connection. 60-second seat lease starts. Opponent sees pause modal. Disconnect budget tracked (max 3 pauses or 90 total seconds per player).
4. **`FINISHED`**: Terminal event reached (top-out, forfeit, or void). Final results written to Postgres via `MatchPersistence`.
5. **`DISPOSED`**: All resources released.

### 3. Explicit Resource Teardown

When a match reaches `FINISHED`, `MatchRunner.dispose()` executes immediately:

1. Stop the 60 Hz `setInterval` timer.
2. Eject all sockets from the Socket.IO room.
3. Clear internal maps (`playerSlots`, `rngChannelsByPlayer`, `gameState`).
4. Call the `MatchRegistry` removal callback to delete this runner from the active matches map.

This guarantees garbage collection can reclaim all match memory.

### 4. Join Ticket Validation & Seat Binding

Clients connect with `{ matchId, playerId, ticket, protocolVersion }` in the Socket.IO `auth` payload:

1. Socket.IO middleware verifies `protocolVersion === PROTOCOL_VERSION` (exported integer from shared types). Mismatch rejects connection immediately with error `'PROTOCOL_VERSION_MISMATCH'`.
2. Middleware looks up `matchRegistry.get(matchId)`.
3. Calls `matchRunner.authenticateSocket(socket, playerId, ticket)`.
4. Validates `ticket_hash` against Postgres `match_tickets` row. Rejects if expired, revoked, or wrong player.
5. Assigns socket to Seat A or Seat B. Adds socket to room `match:<matchId>`.
6. On reconnect (tab refresh): closes stale socket, rebinds seat to new `socket.id`, emits full authoritative snapshot, unpauses match.

**Invariants:**
- Only Player A and Player B are accepted. Third-party sockets are rejected.
- A single seat holds at most one active socket. Reconnecting replaces the old socket.
- No game data is sent before ticket validation succeeds.

### 5. Graceful Server Drain

When Railway sends `SIGTERM`:

1. `MatchRegistry.isDraining = true`. New match allocations are rejected.
2. All active `MatchRunner` instances flush an immediate checkpoint to `match_checkpoints` in Postgres.
3. The server waits for active matches to finish naturally or shuts down once checkpoints are persisted.

### 6. Checkpoint Resumption & SQL Pruning

When writing checkpoints every 1 to 2 seconds, `MatchPersistence` executes an atomic SQL write that prunes older snapshots:

```sql
WITH inserted AS (
    INSERT INTO match_checkpoints (match_id, sim_tick, state_blob, created_at)
    VALUES ($1, $2, $3, NOW())
    RETURNING id, match_id
)
DELETE FROM match_checkpoints
WHERE match_id = $1
  AND id NOT IN (
      SELECT id FROM match_checkpoints
      WHERE match_id = $1
      ORDER BY id DESC
      LIMIT 2
  );
```

When a replacement server boots to recover a crashed match:

1. Queries Postgres for the newest `match_checkpoints` row for the match.
2. Deserializes `state_blob` into `GameState`, including board matrices, falling pieces, hold queues, garbage state, and current tick number.
3. Fast-forwards `MutableRng` using `match_seed` to match the exact tick.
4. Match starts in `PAUSED` state awaiting client reconnection.
5. Once both players reconnect (within 15 seconds), full authoritative snapshot is broadcast and the 60 Hz loop resumes.

**15-second void timer:** The control plane (not the replacement worker) owns this timer. When it detects the game server process died, it starts a 15-second countdown. If the replacement worker does not report ready within that window, the control plane writes `status = 'voided'` with reason `'void_server_crash'` to `match_results`.

### 7. Runtime-Only State (Not in Postgres)

The following states are runtime-only and not stored as Postgres columns:

- **`PAUSED` sub-state:** Changes every few seconds during disconnects. Tracked inside `MatchRunner` memory and serialized into checkpoint `state_blob`.
- **`isDraining` flag:** Server-level flag on `MatchRegistry`, not a per-match property.
- **Disconnect budget counters:** Tracked per-player inside `MatchRunner` memory. Serialized into checkpoint `state_blob` so they survive process recovery.

### 8. Engine Preservation

The deterministic simulation engine (`tetris/engine.ts`, `tetris/matchStep.ts`) requires zero rewrites. `MatchRunner` consumes the same `stepPlayer` and `matchStep` functions. The only change is that each `MatchRunner` instance holds its own `GameState` instead of one global singleton.
