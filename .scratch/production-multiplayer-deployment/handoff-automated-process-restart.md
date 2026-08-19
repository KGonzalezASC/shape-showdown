# Handoff: automate process restart and graceful drain recovery

## Mission

Turn the successful local recovery demonstration into a repeatable automated integration test for Shape Showdown.

The test must prove that a two-player match survives a controlled server shutdown and restart without changing its durable match identity, seat bindings, or authoritative state. It must also cover the safe failure path when restore cannot complete.

This handoff is for the next agent. Work from the current runtime and tests; do not reconstruct the architecture from this conversation.

## Current baseline

- Latest relevant commit: `3729216` (`Integrate durable multiplayer recovery and client UX fixes`).
- Local stack: Bun server on port 3000, Docker PostgreSQL, Socket.IO clients.
- Current runtime modules:
  - `server/matchRuntime/MatchRegistry.ts`
  - `server/matchRuntime/MatchRunner.ts`
  - `server/controlPlane/matchPersistence.ts`
  - `server/GameManager.ts`
- Current durable tables include `matches`, `match_tickets`, `match_checkpoints`, and `match_results`.
- `GameManager.stopAndFlush()` stops the loop, clears the disconnect timer, enqueues a checkpoint, and waits for pending persistence work.
- `MatchRunner` restores the newest checkpoint and owns the 15-second restore/void deadline.
- `server.ts` handles `SIGINT` and `SIGTERM` by stopping the server through the graceful shutdown path.

## Manual evidence already completed

The local test used two isolated clients:

- Browser MCP client at `http://localhost:3000`
- T3 preview client at `http://127.0.0.1:3000`

The valid graceful-shutdown run used match `8f799329-cea7-4301-b802-a9eea116c98b`:

1. Both clients were ticket-authenticated and bound to the same match.
2. The match was `playing`; the last pre-shutdown checkpoint was around simulation tick 1800.
3. SIGTERM was sent to the actual process owning port 3000.
4. Port 3000 stopped listening.
5. PostgreSQL retained the match as `playing` and retained its checkpoint.
6. The server restarted.
7. Both clients reclaimed the same durable match and seats A/B.
8. The match continued and checkpoints advanced beyond the restored tick.
9. No duplicate match result or second active match was created.

Important: an earlier match (`210902c7-2139-49d7-bc1d-7457f8fbd8d5`) naturally top-out at tick 3000 while the first shutdown signal targeted the wrong process. Do not use that run as graceful-shutdown evidence.

## Decided

- Postgres is the source of durable match identity, status, seat assignment, checkpoints, and final results.
- The in-process runner is authoritative during live simulation.
- Controlled shutdown flushes a checkpoint and does not invent a winner merely because the process is stopping.
- A replacement runtime restores from the newest compatible checkpoint.
- Restore has a 15-second deadline. Failure to reclaim the required seats or decode a compatible checkpoint voids the match with `void_server_crash`.
- Result insertion is idempotent by `match_id`.
- A test must use match-scoped tickets and durable player IDs. It must not use `socket.id` as player identity.
- The deterministic engine is out of scope. Test through `GameManager`, `MatchRunner`, `MatchRegistry`, and the persistence seam.

## Proposed implementation

Prefer a process-level integration harness over another manual browser script:

1. Start a temporary PostgreSQL-backed server with an isolated database/schema or deterministic cleanup namespace.
2. Create two guest sessions and enqueue both players through the HTTP API.
3. Wait for allocation and obtain both match assignments.
4. Connect two Socket.IO clients with the returned tickets.
5. Wait for `playing` and at least one durable checkpoint.
6. Record:
   - match ID
   - match seed
   - both durable player IDs
   - seats
   - checkpoint tick
   - current status
7. Request graceful shutdown through the process signal path.
8. Assert the process exits, the match remains durable, and a checkpoint at or after the shutdown flush exists.
9. Start a replacement process against the same database.
10. Re-request replacement tickets, reconnect both clients, and assert:
    - same match ID
    - same player IDs
    - same seats
    - compatible seed/protocol
    - restored tick is not ahead of the pre-shutdown authoritative tick
    - match returns to `playing`
11. Assert there is exactly one active match for the scenario and zero results until the match actually ends.
12. Add a second test that supplies an incompatible/corrupt checkpoint or withholds a required reconnect and proves the match is finalized once as `void_server_crash`.

If process spawning is too platform-dependent for the repository test runner, keep the persistence/runner test fully automated and add a thin process smoke test for the signal boundary. Do not replace the recovery assertion with a test that only calls `stop()` in the same process.

## Acceptance criteria

- The automated test can run with the repository’s Bun test tooling on a clean local Docker PostgreSQL instance.
- It does not depend on Browser MCP, T3 preview, a human clicking controls, or hard-coded existing UUIDs.
- It proves controlled shutdown and restart, not merely client reconnect while the original runtime is alive.
- It proves both clients reclaim their original seats.
- It proves checkpoint flushing and restore.
- It proves no duplicate active match, ticket set, or result is created.
- It proves the incompatible-checkpoint or restore-timeout path finalizes exactly once as a server void.
- Repeated runs clean up their players, queue entries, matches, tickets, checkpoints, and results.
- Existing targeted tests continue to pass:
  - `bun run test:manager`
  - the relevant control-plane integration test
  - `bun run lint`

## Files to inspect first

- `server.ts` — signal handlers and server stop path
- `server/gameServer.ts` — registry wiring, allocation loop, and shutdown order
- `server/matchRuntime/MatchRegistry.ts`
- `server/matchRuntime/MatchRunner.ts`
- `server/GameManager.ts`
- `server/GameManager.test.ts`
- `server/controlPlane/matchPersistence.ts`
- `server/controlPlane/matchStore.ts`
- `server/controlPlane/routes.ts`
- `package.json` — existing Bun test scripts
- `.scratch/production-multiplayer-deployment/production-architecture.md`, especially “Checkpoint contract”, “Deployment workflow”, and “Phase 2: isolated match runtime”

## Unknowns to resolve in code

1. What is the least flaky way in this repository to spawn, signal, and await a Bun server process on Windows and CI?
2. Should the integration test use a dedicated test database, a transaction, or unique test-owned rows?
3. Does the current shutdown order drain allocation before stopping registry runners in every path?
4. Does a controlled shutdown need an explicit durable status such as `paused`, or is retaining `playing` with a checkpoint the intended contract?
5. Which exact checkpoint envelope failure should be used for the incompatible-version test?
6. Are consumed tickets deleted/revoked by the current schema or only absent from the query surface? Assert the actual contract rather than assuming ticket retention.

## Do not do

- Do not force-kill the process and label it graceful shutdown.
- Do not alter match outcomes to make the test pass.
- Do not add per-tick database writes.
- Do not make the test depend on the existing local database contents.
- Do not weaken the 15-second void contract.
- Do not refactor the deterministic engine as part of this test.
- Do not commit generated build artifacts, local database dumps, secrets, or browser evidence.
