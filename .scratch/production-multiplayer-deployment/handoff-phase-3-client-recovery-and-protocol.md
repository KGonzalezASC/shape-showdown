# Handoff: Phase 3 client recovery and protocol hardening

## Mission

Complete Phase 3 of the Shape Showdown delivery plan: make client identity, match-scoped reconnect, protocol compatibility, and recovery messaging reliable across refreshes, remounts, socket loss, server restart, and server voids.

This is a separate handoff from automated process-restart testing. The Phase 2 runtime must remain the server authority; Phase 3 makes the client correctly reclaim and explain that authority.

The relevant source-of-truth section is [`production-architecture.md`](./production-architecture.md), “Phase 3: client recovery and protocol”.

## Phase 3 contract

The architecture document defines these deliverables:

- durable player/session bootstrap for Discord and guests
- match-scoped ticket refresh and reconnect flow
- pause modal, reconnect status, full snapshot replacement, and void/forfeit messaging
- protocol-version mismatch handling with reload guidance
- relative Discord paths and direct `game-config.json` resolution
- reliability analytics and replay discontinuity markers

The phase exits when:

- refresh and Discord remount reclaim the correct seat
- stale ticket, wrong player, and third socket are rejected
- healthy-runtime reconnect does not reset the opponent’s match
- the client shows a server void rather than inventing a winner

## Current implementation facts

Already present in the current branch:

- `src/hooks/useGameSocket.ts`
  - guest session creation and local session storage
  - assignment polling
  - ticket-authenticated Socket.IO connection
  - match diagnostics
  - reconnect polling after unexpected disconnect
  - replacement socket handoff that closes the old socket only after the new socket binds
- `src/hooks/matchRecovery.ts`
  - exponential-backoff assignment polling with a deadline
- `src/hooks/matchRecovery.test.ts`
  - backoff and deadline tests
- `src/types.ts`
  - match connection phases
  - ticket state
  - connection diagnostics
  - match assignment data
- `src/state/GameStateProvider.tsx`
  - server health and match diagnostic contexts
- `src/components/ServerDiagnosticsPanel.tsx`
  - development-only visibility for database mode/health, match ID, durable player, seat, protocol, and ticket state
- `AGENTS.md`
  - documents the socket URL resolution order and the durable/runtime ownership boundary
- The manual restart demo proved that two clients can reclaim the same match and seats after a server restart.

These facts are evidence of implementation, not proof that every Phase 3 exit criterion is complete. Verify behavior in code and tests before marking an item done.

## Decided

- Durable player identity is the player/session identity, not `socket.id`.
- A reconnect presents a new match-scoped ticket and rebinds the durable seat.
- The server remains authoritative; the client never declares a winner from local disconnect state.
- A healthy-runtime reconnect receives a full authoritative snapshot.
- A server restore timeout or incompatible checkpoint produces a server-void outcome.
- Protocol version is explicit in the assignment and Socket.IO authentication payload.
- Local development may use localhost origins; production CORS and Discord routing remain configuration-driven.
- The deterministic engine and server match rules are out of scope for Phase 3 unless a client contract test exposes a real server defect.

## Proposed work order

### 1. Map the current client state machine

The connection phase and the authoritative match status are separate state
machines. A client can be `reconnecting` while the last authoritative match
status is `playing`, or be `connected` while the match status is `ended`.
Do not collapse those two axes into one enum.

#### Connection and recovery phases

This table records the current branch behavior. “Guard” means the mechanism
that prevents a stale effect, duplicate socket, or duplicate poll from
changing the current client.

| Phase | Entry trigger | Client action | Exit transitions | Guard and opponent impact |
|---|---|---|---|---|
| `idle` | Provider effect mounts or remounts | Clears the local snapshot, player ID, match event, health, and diagnostics | `acquiring-session`; cleanup leaves no active client effect | `cancelled` plus `AbortController` cleanup prevents a remount’s old async work from publishing |
| `acquiring-session` | Initial bootstrap begins | Reuses `localStorage` session, or calls `POST /api/players/guest` with the durable bootstrap key; then requests `/api/match-assignment` | Assignment → `assigned`; no assignment → `queued`; HTTP 401 → `session-invalid`; control-plane/other failure → `error` | The session identifies the player; `socket.id` is not used for reclaim |
| `queued` | Assignment returns 204 and `POST /api/queue` succeeds or returns the existing-entry 409 | Polls assignment every 500 ms and heartbeats the queue every 4 seconds | Assignment → `assigned`; HTTP 401 → `session-invalid`; other failure → `error`; unmount → cancelled | The current hook has one bootstrap poll; queue polling has no initial-match deadline |
| `assigned` | HTTP assignment response or legacy socket `matchAssignment` event | Stores match ID, seat, protocol, and ticket metadata; creates a ticket-authenticated socket | `connecting` | Assignment shape is validated; the current client does not yet compare a recovered assignment against an expected prior match ID |
| `connecting` | Ticket socket is created | Presents the assignment in Socket.IO auth | Socket `connect` → `connected`; stale/consumed ticket `connect_error` → `reconnecting`; other `connect_error` → `error`; disconnect → `reconnecting` when still current | A stale/consumed ticket is manually disconnected before fresh-ticket recovery; replacement sockets become active before the old socket is closed |
| `connected` | Socket `connect` and server binding | Receives `playerIdentity`, then authoritative `gameState` and `matchEvent` messages; full `gameState` messages replace the local snapshot | Current socket disconnect → `reconnecting`; authoritative `gameState.status = ended` suppresses reconnect recovery | `activeSocket` ignores events from replaced sockets; the server keeps the opponent in the same runtime and sends the replacement client a full snapshot |
| `reconnecting` | Current socket disconnect or stale/consumed ticket rejection | Polls `/api/match-assignment` with 250 ms, 500 ms, 1 s, 2 s, then max 4 s delays for up to 60 seconds | New assignment → `assigned`; HTTP 401 → `session-invalid`; deadline/other failure → `error` | `recoveryInFlight` prevents duplicate recovery polls; the server pauses the match and protects the disconnected seat while recovery is pending |
| `session-invalid` | Assignment, queue, or heartbeat returns HTTP 401 | Stops the current bootstrap/recovery attempt and shows “Guest session expired” | User resets client session and reloads → `acquiring-session` | This is terminal for the current bearer session; it does not silently create a new identity and abandon a reclaimable match |
| `error` | Bootstrap failure, recovery timeout, or non-retryable socket error | Stops the current client flow and exposes the diagnostic message | No automatic state-machine transition; refresh/remount starts at `idle` | Non-retryable errors need explicit protocol/void UX; transport errors may still be retried internally by Socket.IO unless the socket is explicitly closed |

#### Authoritative match states

These states arrive in `gameState.status`; they are not connection phases.

| Match state | Server meaning | Client/opponent behavior | Phase 3 requirement |
|---|---|---|---|
| `waiting` | Fewer than two active seats or a rematch lobby | Show the lobby/waiting state; no winner exists | Refresh must reclaim the same durable seat if the match is still assigned |
| `countdown` | Both seats are bound and the server is starting the round | Show countdown; input is not authoritative yet | A reconnect must receive the current authoritative countdown rather than restart it locally |
| `playing` | The server is simulating the match | Apply input through the active socket and render server snapshots | A healthy reconnect must pause/rebind without resetting either player |
| `ended` with a winner | Top-out or disconnect forfeit finalized the result | Show the winner from `winnerId`; do not infer it from socket state | Disconnect forfeit must remain distinct from a server void |
| `ended` with no winner | Restore timeout or incompatible checkpoint voided the match | Current UI still falls through to “Opponent won the match” | Add an explicit server-void outcome so the client shows “Match voided — no winner” |
| `pause` present on a non-ended state | The server has paused the match while one or more seats are reclaimed | Current UI mainly shows connection diagnostics; it does not yet render the authoritative pause owner distinctly | Add a pause/reclaim presentation driven by server state, not local socket guesses |

#### Formal transition invariants

The implementation and tests should preserve these invariants:

1. A cleanup, React StrictMode remount, or stale async response cannot publish
   state after its effect has been cancelled.
2. At most one recovery poll runs for a client effect.
3. A replacement ticket must match the durable player and original seat before
   the socket can bind.
4. The old socket is closed only after the replacement socket has connected and
   the server has accepted the replacement binding.
5. A recovered `gameState` is a full server snapshot; the client does not merge
   stale board state into it.
6. A server void never becomes a client-invented winner.

The remaining verification cases are therefore explicit: fresh guest bootstrap,
refresh during `queued`, refresh during `playing`, React remount under
StrictMode, stale ticket rejection, wrong-player/seat rejection, a third socket,
healthy-runtime reconnect, disconnect forfeit, and server-void recovery.

### 2. Make refresh/remount recovery deterministic

Test both isolated origins:

- `http://localhost:3000`
- `http://127.0.0.1:3000`

For each client:

1. Create or reuse a durable guest session.
2. Join a match.
3. Refresh or remount the app.
4. Obtain a replacement ticket.
5. Rebind the original seat.
6. Confirm the opponent remains in the same match.

Ensure an old socket is closed only after the replacement socket is authenticated and bound. Ensure one client cannot consume another player’s assignment.

### 3. Finish recovery UX

The client should show concrete, distinct states:

- searching for an opponent
- match assigned / connecting
- reconnecting after socket loss
- match paused while a seat is reclaimed
- server void with no winner
- disconnect forfeit with the correct winner
- protocol mismatch with a reload/update instruction
- control-plane/database unavailable with a retry path

Do not use “backend offline” when the database is healthy but the socket is merely reconnecting. Keep development diagnostics useful without exposing bearer tokens or full ticket values.

### 4. Verify protocol mismatch behavior

Add a client-facing test for an unsupported protocol version or a server `connect_error` carrying the mismatch reason. The expected result is a stable error state with reload guidance, not an infinite reconnect loop or a locally fabricated match result.

Confirm that:

- the client sends the protocol version from the assignment
- stale assignments cannot bind to a different match
- wrong player/seat/ticket errors are terminal for that attempt
- retry logic refreshes the ticket rather than retrying the same expired ticket forever

### 5. Add reliability and discontinuity seams

Identify the existing server events/logs for:

- disconnect
- reconnect
- restore start/success
- server void
- forfeit
- protocol mismatch

Add the smallest client-side analytics/replay-discontinuity seam needed by the architecture. It must be asynchronous and failure-isolated; analytics failure cannot block rendering, reconnect, or authoritative gameplay.

Do not put per-tick state or raw bearer tickets into analytics.

### 6. Run browser and automated verification

Automated checks should cover:

- assignment bootstrap and queue polling
- remount/refresh reclaim
- exponential-backoff deadline behavior
- stale ticket refresh
- protocol mismatch
- server void and disconnect-forfeit messaging
- no duplicate socket handlers after remount

Manual verification should use one browser-controlled client plus one separate-origin preview client, not two T3 instances:

1. Start Postgres and the dev server.
2. Open `localhost:3000` and `127.0.0.1:3000`.
3. Confirm the diagnostics panel shows Postgres healthy, the same DB match, distinct seats, and consumed tickets.
4. Refresh one client during `playing`.
5. Confirm both clients return to the same match.
6. Stop/restart the server using the Phase 2 recovery harness.
7. Confirm the client shows reconnecting, then resumes from the authoritative snapshot.
8. Force a restore timeout or server void and confirm no winner is invented.

## Acceptance criteria

- Refresh and React remount reclaim the same durable seat.
- Socket loss uses bounded ticket-refresh polling and stops after the defined deadline.
- A successful reconnect does not reset or duplicate the opponent’s match.
- Stale, wrong-player, wrong-seat, and third-socket attempts are rejected visibly and safely.
- Full authoritative snapshots replace stale client playfield state after reconnect.
- Server void, disconnect forfeit, and protocol mismatch are visibly distinct.
- Protocol mismatch does not loop forever.
- Discord-relative paths and direct `game-config.json` resolution remain intact.
- Analytics/replay discontinuity writes are non-authoritative and failure-isolated.
- `bun run lint` passes.
- Relevant tests pass, followed by `bun run test` for the complete phase.

## Files to inspect first

- `src/hooks/useGameSocket.ts`
- `src/hooks/matchRecovery.ts`
- `src/hooks/matchRecovery.test.ts`
- `src/state/GameStateProvider.tsx`
- `src/components/ServerDiagnosticsPanel.tsx`
- `src/App.tsx`
- `src/types.ts`
- `server/GameManager.ts`
- `server/matchRuntime/MatchRunner.ts`
- `server/controlPlane/routes.ts`
- `server/controlPlane/matchStore.ts`
- `server/observability/logger.ts`
- `AGENTS.md`
- `production-architecture.md`, especially “Join tickets and seat binding”, “Reconnect and failure guarantees”, and “Phase 3: client recovery and protocol”

## Unknowns to resolve in code

1. Is Discord Activity bootstrap already implemented, or is only the direct guest path complete?
2. Where should pause/void/forfeit messaging live so it is driven by authoritative state without coupling the playfield to raw `GameState`?
3. Which protocol mismatch error shape is stable enough to expose to the client?
4. Which reliability events already have a server event/log seam, and which need a new shared event?
5. What replay discontinuity format does the existing replay model require?
6. Does the client’s assignment polling need cancellation keyed by session and match ID to prevent stale responses winning a race?
7. Which browser harness is available for repeatable remount/refresh tests without making Browser MCP a test dependency?

## Do not do

- Do not restore socket IDs as durable identity.
- Do not let the client decide a winner when the server is unavailable.
- Do not retry an expired ticket indefinitely.
- Do not expose full ticket values, bearer tokens, raw Discord IDs, or socket IDs in diagnostics or analytics.
- Do not add per-tick HTTP or database traffic.
- Do not change the engine or server-authoritative match rules to solve a presentation problem.
- Do not reopen the launch topology decision of Cloudflare Pages + Railway Virginia + Railway Postgres.
- Do not combine this work with replay storage design; that has a separate handoff.
