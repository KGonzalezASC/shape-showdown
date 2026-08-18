# Shape Showdown production architecture and delivery plan

Status: decision complete
Ticket: [10: Publish the decision-complete production architecture](issues/10-publish-decision-complete-architecture.md)
Date: 2026-08-18

## Decision in one sentence

Launch one authoritative Virginia service on Railway with Railway Postgres, publish the React client from Cloudflare Pages, and keep the control plane durable while each two-player match runs in an isolated in-process `MatchRunner` that can later move as a whole to a fixed regional Railway service.

This document is the final synthesis of tickets 01 through 09. Runtime code and tests remain the source of truth once implementation starts. The SQL shapes and indexes that back the control plane live in [`database-queries-catalog.md`](database-queries-catalog.md).

## Decided

### Launch topology

| Layer | Launch decision | Responsibility |
|---|---|---|
| Static client | Cloudflare Pages production | Serves `dist/client` and the environment-specific `game-config.json` |
| Control plane and game service | One Railway Pro service in US East, Virginia | HTTP APIs, Socket.IO, matchmaking coordination, and colocated match runtimes |
| Database | Railway Postgres in Virginia | Durable identity, leases, assignments, tickets, checkpoints, results, migrations, and launch analytics |
| Database network | Railway private network | Database traffic stays inside Railway |
| Replicas | One application replica at launch | Required while live matches are in process memory |
| Staging | Separate Railway Hobby environment and database | Deployment, reconnect, load, and migration verification |

Cloudflare Pages keeps static downloads off Railway. It does not reduce live Socket.IO egress. The staging measurements show that gameplay bandwidth is the first cost pressure, not incremental simulation CPU.

The launch server is a single Railway service, but it is not a single match owner. `MatchRegistry` owns a collection of isolated `MatchRunner` instances. A match never shares mutable simulation state with another match.

### Client connection paths

The client has two supported trust paths.

1. **Discord Activity.** The client uses relative HTTP and Socket.IO paths. Discord URL Mappings send those paths to pre-registered targets. The Activity never opens a provider-issued hostname or port from a match ticket.
2. **Direct web guest.** The Pages build fetches `game-config.json` and uses its `gameServerUrl` to connect directly to the assigned Railway service.

The launch mapping is:

| Path | Launch target |
|---|---|
| `/` | Cloudflare Pages |
| `/socket.io` | Virginia Railway game service |
| `/api` | Virginia Railway control service when the API is introduced |

Production CORS allows the Pages origins and `*.discordsays.com`. Localhost is allowed only in an explicitly configured developer environment. The production client must not depend on a committed Railway URL. Pages injects the environment-specific value into `game-config.json` during its build or deploy step.

### Ownership boundary

Postgres owns facts that must survive a process restart:

- `players` and normalized Discord or guest identity
- `sessions` and hashed bearer tokens
- `queue_entries` with 10-second search leases
- `lobbies` and `lobby_members` with short activity leases
- `matches`, assignment, seed, protocol version, and lifecycle
- `match_tickets` with 60-second seat leases
- `match_checkpoints`, retaining the two newest snapshots
- `match_results`, finalized once and never rewritten
- `analytics_events` and `daily_metrics`
- migration history in `schema_migrations`

The live match runtime owns ephemeral facts:

- the 60 Hz boards, pieces, garbage, shops, and effects
- current Socket.IO connections and `socket.id` values
- pause clocks and disconnect-budget counters
- the active replay segment
- the registry drain flag

The runtime may serialize its state into a checkpoint. It does not write per-tick simulation state or keystrokes to Postgres.

### Runtime boundary

The current singleton `GameManager` will be split without changing the deterministic engine:

- `MatchRegistry` creates, stores, routes, drains, and disposes match runners.
- `MatchRunner` owns exactly one match, its state, timer, sockets, RNG channels, replay, and lifecycle.
- `MatchPersistence` writes checkpoints, results, and recovery metadata through an injected database interface.

The runner uses the existing `stepPlayer` and `matchStep` engine functions. A runner cannot send a state update to another runner's Socket.IO room. Disposal stops the timer, removes sockets, releases match-owned references, and removes the runner from the registry.

The lifecycle is:

```text
ALLOCATING -> COUNTDOWN -> PLAYING <-> PAUSED -> FINISHED -> DISPOSED
```

`PAUSED` is runtime state. Postgres continues to hold the durable match status and seat assignment. `FINISHED` includes normal completion, player forfeit, server void, and allocation cancellation.

### Matchmaking and assignment

The queue is global at launch. Discord players and direct web guests can be paired together. Queue rows expire after 10 seconds without a heartbeat.

The pairer must claim exactly two rows with `FOR UPDATE SKIP LOCKED`. It then creates the match and both tickets in the same transaction. The SQL and required indexes are specified in [`database-queries-catalog.md`](database-queries-catalog.md). A one-row claim is never removed from the queue as a side effect of an unsuccessful pair.

Allocation has one automatic retry. If the retry fails, the control plane marks the match `cancelled` with `cancelled_alloc_fail`; neither player wins.

At launch, every match is assigned to the Virginia service. The match record stores a stable service endpoint or mapped route, not an unregistered provider hostname.

### Join tickets and seat binding

The client presents `matchId`, durable `playerId`, a short-lived ticket, and `protocolVersion` in the Socket.IO authentication payload.

The server must validate the protocol version and ticket before sending game data. Ticket validation checks the hash, match, player, seat, expiry, revocation flag, and match status. A successful connection consumes the one-time ticket atomically.

Reconnect is a new seat binding, not an attempt to restore the old `socket.id`:

1. The client presents its durable session and match identity to the control plane.
2. The control plane issues a replacement match-scoped ticket while the seat lease remains valid.
3. The runtime validates and consumes that ticket.
4. The new socket replaces the stale socket for that seat.
5. The runner sends a full authoritative snapshot.
6. The match resumes only after the required seats have reclaimed.

One seat has at most one active socket. A third player and a ticket for the wrong seat are rejected. No game state is sent before validation succeeds.

### Reconnect and failure guarantees

These are player-visible promises:

| Failure | Guaranteed result |
|---|---|
| Refresh, remount, or transient socket loss | Hold the seat for about 60 seconds and show the opponent a pause modal |
| Healthy runtime reconnect | Rebind the seat and send a full authoritative snapshot |
| Match-runtime process death | Restore from the newest checkpoint, with at most about 1 to 2 seconds of accepted rewind |
| Restore not ready within 15 seconds | Void the match. No player is declared the winner |
| Three disconnect episodes or 90 seconds total paused time | Forfeit the missing player |
| Both seats expire while paused | Void the match |
| Allocation failure | Retry once, then cancel without a winner |
| Control-service restart while the runtime remains healthy | Keep the match alive; reconnect only if the game socket actually drops |
| Protocol or simulation incompatibility | Treat it as a runtime fault and void rather than guessing at state compatibility |

Results finalize immediately on the terminal event. `insert_match_result` is idempotent on `match_id`, so a retry cannot create a second result. Replays mark disconnect, reconnect, restore, and discontinuity events. Analytics records the same lifecycle markers using pseudonymous internal player IDs.

### Checkpoint contract

The first implementation uses a one-second target cadence and retains two rows per match. A write that arrives later than two seconds is a reliability fault and emits an alert. Controlled shutdown also flushes an immediate checkpoint.

The compressed `state_blob` contains a versioned full-runtime envelope:

- `matchId`, `protocolVersion`, `simulationVersion`, and `matchSeed`
- authoritative `simTick` and match phase
- both complete player states, including boards, active and held pieces, queues, garbage, shop state, and field effects
- every mutable RNG channel state for both stable player slots
- pause start times and disconnect-budget counters
- match start time and replay segment marker

The envelope has a decoder version check. An unknown or incompatible checkpoint version causes a controlled void, not a partial restore.

`write_checkpoint_with_prune` inserts the new row and prunes older rows atomically. `get_latest_checkpoint` orders by `sim_tick DESC, id DESC`. `MatchPersistence` is the only writer for a match unless a later deployment adds a per-match advisory lock.

The control plane owns the 15-second restore deadline. The replacement runtime reports `restore_start`, `restore_ok`, or `match_voided_runtime`; it does not extend its own deadline.

## Build and artifact contract

The client and server deploy independently, so both sides use an explicit protocol version.

| Artifact | Producer | Destination | Contract |
|---|---|---|---|
| `dist/client/**` | `bun run build:client` | Cloudflare Pages | Static React/Vite client, landing entry, assets, and injected `game-config.json` |
| `dist-server/server.mjs` | `bun run build:server` | Railway | Production Bun HTTP, Socket.IO, control-plane, and match-runtime process |
| SQL migration files | Planned migration runner | Railway Postgres | Additive schema changes recorded in `schema_migrations` |
| `dist/replay-viewer/**` | `bun run build:replay` or `build:internal` | Internal QA only | Never included in the public client artifact |

`bun run build` remains the production client and server build. `bun run start` starts the bundled Railway server. The migration command must finish before the server begins accepting traffic. `/health` must return 503 when the database ping or required migration state is unavailable.

Release compatibility follows this order:

1. Add tables or nullable/defaulted columns.
2. Deploy a server that can read old and new data.
3. Deploy the client and begin using the new fields.
4. Remove old behavior only after the compatibility window has passed.

Database rollback is not part of application rollback. Railway can restore the prior application build, but migrations move forward and are not undone by the deployment UI.

## Deployment workflow

### Staging

Every server or protocol change goes through the isolated Railway staging lane and staging Postgres. The minimum staging run is:

1. Build the client and server artifacts.
2. Run additive migrations.
3. Confirm `/health` returns `200` and the database ping finishes within two seconds.
4. Connect two clients and complete a match.
5. Exercise refresh, socket reconnect, ticket rejection, and full snapshot reclaim.
6. Kill or redeploy the runtime and prove checkpoint restore or the 15-second void path.
7. Run a 30 to 60 minute Socket.IO soak.
8. Inspect structured logs, Sentry events, CPU, memory, database latency, and public egress.
9. Roll back the application build and confirm the stable hostname and database compatibility.

The existing staging evidence proved the Railway health gate, one-match resource ballpark, a 35-minute soak, deploy reconnect, and application rollback. It did not prove checkpoint restoration because the isolated runtime has not been implemented yet.

### Production

Production uses separate Railway environment variables and a separate Postgres database. The release order is:

1. Apply additive migrations.
2. Deploy the server and wait for the health gate.
3. Confirm stop-admitting and drain behavior with a connected test match.
4. Promote the Pages client with production `game-config.json`.
5. Verify direct web and Discord-mapped Socket.IO connections.
6. Run the two-player smoke match.
7. Record the release version, migration versions, deployment ID, and evidence artifacts.

On `SIGTERM`, the server marks the registry as draining, rejects new allocations, flushes checkpoints, and allows active matches up to the configured 180-second Railway grace window. A player disconnect during drain causes an immediate checkpoint so the next process can resume the match. A hard termination still follows the 15-second restore or void contract.

## Observability and operations

### Logs

Server logs are structured JSON with:

```text
timestamp, level, service, release, region, event, correlation_id, match_id
```

Player IDs may appear only as internal pseudonymous IDs where needed for diagnosis. Raw Discord IDs, bearer tokens, IP addresses, and ticket values do not enter analytics or normal logs.

Required reliability events include:

```text
disconnect_start
reconnect_success
forfeit_abandon
restore_start
restore_ok
match_voided_runtime
alloc_fail
alloc_retry
match_cancel_alloc
```

### Metrics and alerts

Railway metrics cover CPU, container memory, and public egress. Application metrics add:

- active matches and connected seats by region
- queue age and pair-claim latency
- connection errors, reconnect success rate, and pause-budget forfeits
- checkpoint age, write latency, and write failures
- restore duration and runtime void count
- match allocation retry and cancellation count
- Socket.IO handshake rejects by reason and protocol version
- database pool usage and query latency for the catalog's hot queries

Initial alerts:

- `/health` fails or exceeds two seconds
- checkpoint age exceeds two seconds for an active match
- restore approaches 15 seconds
- any unexpected runtime void or allocation cancellation
- reconnect failures or protocol mismatch spikes
- database pool exhaustion, lock waits, or migration failure
- Railway spend or egress exceeds the current budget plan

Sentry covers frontend and backend exceptions, grouped by release. Railway remains the source for container CPU, memory, egress, deployment state, and billing.

### Backups and recovery risk

Daily Postgres snapshots are the launch backup plan. Point-in-time recovery and a verified backup restore are not available on the selected plan, so the accepted data-loss window is up to 24 hours after catastrophic database loss. This risk applies to durable history and analytics. It does not make a live match authoritative because live simulation is in the runtime and match results finalize before disposal.

## Cost envelope

The working launch budget is:

- Railway Pro production minimum: `$20/month` before usage
- Railway Postgres and application usage: measured from Railway billing, not assumed to be free
- Cloudflare Pages static hosting: `$0` under the policy recorded in ticket 04
- Staging: Railway Hobby, tracked separately from public-production cost
- Additional regional service: added only with a measured traffic need and its own spend review

Planning bandwidth remains approximately 300 KB/s of Railway fanout per active match before future protocol narrowing. That is roughly 1.08 GB per active match-hour, or about 100 GB per 100 active match-hours. The staging one-match sample observed roughly 500 to 600 KB/s on-wire, so billing measurements take precedence over the local JSON estimate.

The cost review compares application compute, Postgres, gameplay egress, static traffic, and operator time. Reconsider Railway in favor of a fixed-transfer VPS only when measured two-month usage plus reasonable operations labor makes the alternative cheaper. Temporary student credits do not change the architecture decision.

The launch process floor is about 157 MB on Railway staging after a quiet restart. The one-match sample reached about 350 MB. These values are planning inputs, not a capacity promise. Multi-match packing requires the load test in Phase 5.

## Regional allocation path

### Launch

Virginia is the only live region. Matchmaking and Postgres remain there. The control plane writes the assigned service route into `matches.game_server_url`, and the client receives a Discord-safe mapped route or a direct Pages configuration value.

### Europe expansion

The first regional expansion adds one fixed Railway Europe service running the same `MatchRegistry` and `MatchRunner` build. The control plane still owns matchmaking and assignment in Virginia. It chooses a region from player preference and measured placement policy, then issues tickets for that match.

Discord uses finite pre-registered mappings. Add `/region-eu` only when the Europe service is live and its permanent mapping has been tested. Direct web guests may use the regional Railway endpoint from `game-config.json`. Discord tickets never expose a raw dynamic provider hostname.

If a region is unavailable before a match starts, allocation falls back to Virginia. If an active regional runtime dies, the replacement service attempts checkpoint restore. The launch contract has no cross-region live migration. Failure to restore within 15 seconds voids the match.

Option C, a stable gateway with ownership lookup, is the later routing choice if the number of Discord mappings becomes operationally expensive or a gateway is needed to hide service endpoints. Option A remains the selected first regional path because ticket 08 closed on fixed services plus finite mappings.

## Migration triggers

These triggers change the architecture only after evidence, not because a provider feature exists.

| Trigger | Migration |
|---|---|
| Queue claim latency or lock waits stay above the release SLO at peak, or Postgres queue polling consumes a material share of database CPU | Move queue claiming and lease coordination to Redis or another dedicated coordinator. Keep Postgres as the durable record until the new path has reconciliation tests. |
| A second control-service replica is required for availability or queue throughput | Extract coordination first. Do not run multiple independent pairers against the current database-only contract without a tested lock and reconciliation design. |
| Analytics queries exceed 10% of Postgres CPU, events exceed 500,000/day, or `analytics_events` exceeds 10 GB | Export asynchronously to Neon and keep only the launch retention window in Railway Postgres. |
| Multi-match load tests show the Virginia service cannot meet CPU, memory, event-loop, or egress budgets | Add capacity as another fixed regional service or increase Railway resources. Re-run the packing test before enabling more matches per process. |
| Discord mapping churn blocks a new region or makes route changes unsafe | Adopt Option C's stable gateway and ownership lookup. The gateway remains a router, not a second simulation authority. |
| Measured Railway gameplay egress plus operator time exceeds a fixed-transfer host for two consecutive billing periods | Re-run the host comparison with current traffic and migration labor. Do not move based on the original local estimate alone. |
| Discord-mapped RTT or reconnect rate misses the agreed player SLO after real-player measurement | Adjust region placement or routing, then revisit Option A versus Option C. The current one-machine tunnel samples are not geo evidence. |

## Accepted risks and open evidence

The architecture is decided. These items remain accepted launch risks or post-implementation measurements:

- Discord Activity RTT to a stable production Virginia endpoint is not yet measured.
- Production reconnect rate and seat-reclaim latency are not yet measured.
- Multi-match-in-one-process capacity is not yet measured. The current implementation still has one `GameManager` per process.
- The wire protocol still sends full `GameState`; narrowing to `PublicPlayerState` is a later bandwidth optimization.
- Railway Postgres has no verified backup restore or PITR on the selected plan.
- The dedicated 24-hour idle cost sample was waived. Billing and usage remain an operational check.
- One application replica is required at launch. The control plane is not designed for active-active replicas.
- There is no cross-region live migration at launch.
- A Railway platform failure can void a match after the defined recovery window even when the player did nothing wrong.
- Guest identity has less account recovery than Discord identity. This is a product limitation, not a reason to store more personal data.

None of these risks changes the launch topology. They define the verification work and the conditions for the next architecture review.

## Phased implementation plan

### Phase 0: freeze the contract

Deliver:

- this architecture document and the linked query catalog
- a versioned checkpoint envelope definition
- protocol compatibility rules and failure reason names
- production and staging environment variable inventories

Exit when:

- tickets 01 through 10 link to the same ownership, timeout, and routing terms
- the team accepts the listed risks and migration triggers

### Phase 1: durable control plane

Deliver:

- additive SQL migrations for ticket 05 and ticket 07 entities
- bounded Postgres pool and parameterized query modules from the catalog
- player/session creation and validation
- queue and lobby leases, atomic pair claim, and assignment transactions
- match tickets, status transitions, result finalization, and migration history
- `/health` database ping with a two-second timeout
- CORS and runtime configuration for Pages and Discord mappings

Exit when:

- migrations run on an empty and populated staging database
- queue, lobby, ticket, and result tests cover retries and concurrent claims
- a failed health check prevents the server from accepting traffic

### Phase 2: isolated match runtime

Deliver:

- `MatchRegistry`, `MatchRunner`, and `MatchPersistence`
- per-match rooms, timers, RNG channels, replay segments, and disposal
- checkpoint serialization, one-second writes, two-row pruning, and restore
- join-ticket middleware and seat replacement
- SIGTERM drain, stop-admitting, immediate checkpoint flush, and 15-second restore ownership

Exit when:

- two or more matches run in one process without state or room cross-talk
- a killed runtime restores from a checkpoint within 15 seconds
- an incompatible checkpoint or protocol version voids safely
- the engine tests still pass without engine rewrites

### Phase 3: client recovery and protocol

Deliver:

- durable player/session bootstrap for Discord and guests
- match-scoped ticket refresh and reconnect flow
- pause modal, reconnect status, full snapshot replacement, and void/forfeit messaging
- protocol-version mismatch handling with reload guidance
- relative Discord paths and direct `game-config.json` resolution
- reliability analytics and replay discontinuity markers

Exit when:

- refresh and Discord remount reclaim the correct seat
- a stale ticket, wrong player, and third socket are rejected
- a healthy-runtime reconnect does not reset the opponent's match
- the client shows a server void rather than inventing a winner

### Phase 4: production release

Deliver:

- isolated Railway staging and production environments
- Pages preview and production wiring
- migration-before-listen deployment
- structured logs, Sentry, Railway metrics, spend limits, and daily snapshots
- release smoke and rollback runbooks
- permanent Discord mappings for the launch routes

Exit when all six ticket 09 gates pass:

1. production Pages wiring
2. database-backed `/health`
3. 180-second drain configuration
4. additive migrations
5. secret and production CORS audit
6. active spend cap

### Phase 5: measure and expand

Deliver:

- colocated-match load test with CPU, memory, event-loop, database, and egress measurements
- real Discord Activity RTT and reconnect evidence
- billing review using active match-hours
- fixed Europe service and `/region-eu` mapping when the placement trigger is met
- analytics export only if ticket 07 thresholds are crossed

Exit when the measured capacity and cost report either keeps the launch topology or records one of the migration decisions above. No regional or control-plane scale change is considered complete without a new staging soak and rollback test.

## Completion

Ticket 10 closes the architecture decision. The next implementation ticket should begin with Phase 1 migrations and database access seams, followed by the Phase 2 runtime split. The existing deterministic gameplay engine remains unchanged until a failing runtime-boundary test proves that a seam requires an engine change.
