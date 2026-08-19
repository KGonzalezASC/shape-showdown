# Handoff: Lane D — reliability analytics and replay discontinuities

## Mission

Make disconnect, reconnect, restore, forfeit, void, and protocol-mismatch
history observable without making telemetry authoritative or putting
per-tick gameplay data into routine analytics.

This lane completes the Phase 3 reliability seam defined by ticket 07 and the
replay contract. It must remain failure-isolated from rendering, reconnect,
match simulation, and result finalization.

## Current baseline

Already present:

- `AnalyticsStore` appends reliability events to Postgres.
- `POST /api/analytics` authenticates the session and validates bounded event
  names/properties.
- Client analytics submission is asynchronous, uses `keepalive`, and catches
  failures.
- Server lifecycle logs cover disconnect, reconnect, forfeit, restore, and
  void paths.
- `ReplayDiscontinuityKind` and `ReplayDiscontinuity` exist in shared types.
- `GameManager` records replay markers for disconnect, reconnect, restore,
  forfeit, void, and protocol mismatch.
- Replay data carries optional discontinuities for compatibility with legacy
  files.

The server-side analytics policy is already closed in
`issues/07-define-analytics-policy.md`. This handoff is implementation and
cross-checking, not a new analytics product design.

## Decided

- Analytics and replay markers are non-authoritative.
- Analytics failure cannot block a socket, render, simulation tick, checkpoint,
  result finalization, or reconnect.
- Use internal player UUIDs and match IDs only; omit raw Discord IDs, provider
  tokens, bearer tickets, socket IDs, IP addresses, and per-tick state.
- Replay discontinuities identify lifecycle gaps; they do not rewrite
  authoritative gameplay.
- The event catalog must remain bounded and versionable.
- Raw analytics retention follows ticket 07: 30 days, with match results and
  rollups retained separately.

## Event contract to reconcile

Align server logs, client analytics, and replay markers around these events:

| Lifecycle event | Analytics expectation | Replay marker |
|---|---|---|
| Socket disconnect | `disconnect_start` with match/player and pause episode | `disconnect_start` |
| Successful reclaim | `reconnect_success` with bounded duration | `reconnect_success` |
| Checkpoint restore | `restore_ok` with restored tick/version | `restore_ok` |
| Disconnect budget exhaustion | `forfeit_abandon` with pause budget summary | `forfeit_abandon` |
| Runtime/protocol void | `match_voided` with safe reason | `match_voided_runtime` |
| Protocol mismatch | `protocol_mismatch` with version/code, no secrets | `protocol_mismatch` |

The current implementation uses names such as `server_void` and
`match_finished` in some client paths. Reconcile names with the ticket 07
catalog before declaring analytics complete; do not silently create multiple
spellings for one event.

## Proposed work order

1. Freeze the event-name and property allowlist against ticket 07.
2. Compare each server log, client event, and replay marker for one lifecycle
   scenario.
3. Make any missing events asynchronous and failure-isolated.
4. Verify markers survive replay creation and remain optional for legacy
   replay files.
5. Add tests for event validation, privacy boundaries, marker ordering, and
   analytics failure.
6. Verify retention/pruning and result/analytics correlation in Postgres.

## Acceptance criteria

- Every required reliability transition has at least one structured server
  record and, where applicable, one replay marker.
- Event names are from the approved bounded catalog.
- A duplicate socket event does not create an unbounded duplicate marker.
- Replay markers preserve chronological tick order.
- Markers are present for normal reconnect, restore success, forfeit, void,
  and protocol mismatch.
- Analytics POST failure leaves gameplay and recovery behavior unchanged.
- Analytics payloads contain no raw bearer ticket, session token, socket ID,
  Discord ID, IP address, board, or per-tick input stream.
- Events can be joined to the correct internal `player_id` and `match_id`.
- Legacy replay files without discontinuities still load.
- Raw analytics retention and result retention match ticket 07.

## Tests to add or verify

- Analytics event allowlist and bounded-property validation.
- Analytics failure injection while the client is rendering and reconnecting.
- Disconnect → reconnect marker ordering.
- Restore → `restore_ok` or void marker ordering.
- Forfeit and server-void marker contents.
- Protocol mismatch marker without sensitive payloads.
- Replay load compatibility for V1/V2 files with and without markers.
- Database correlation of analytics events to the finalized match result.

Run at minimum:

```text
bun run lint
bun run test:manager
bun run test:control-plane
bun test server/replay*.test.ts
```

Use the repository’s actual replay test paths if the final glob differs.

## Files to inspect first

- `server/GameManager.ts`
- `server/observability/logger.ts`
- `server/controlPlane/analyticsStore.ts`
- `server/controlPlane/routes.ts`
- `server/controlPlane/matchResultStore.ts`
- `src/hooks/useGameSocket.ts`
- `src/types.ts`
- `fixtures/replays/`
- `.scratch/production-multiplayer-deployment/issues/07-define-analytics-policy.md`

## Dependencies and boundaries

- Lane A supplies stable protocol and outcome codes.
- Lane C supplies the authoritative user-visible lifecycle semantics.
- Lane E verifies the observable behavior but must not make telemetry a
  prerequisite for a passing match.
- Lane D does not block guest/Discord identity or core reconnect behavior.

Do not add per-tick HTTP/database writes, export to Neon early, store provider
PII, or let analytics decide match outcomes.

## Unknowns to resolve

1. Should `server_void` be renamed to `match_voided` everywhere or mapped at
   one boundary?
2. Which server events are authoritative enough to emit analytics directly,
   and which client events are needed only for connection experience?
3. How should event delivery be deduplicated across a reconnect/remount?
4. Where is the daily pruning job owned in staging and production?
