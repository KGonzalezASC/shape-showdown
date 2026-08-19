# Handoff: Lane A — protocol and ticket contract

## Mission

Finish the Phase 3 protocol boundary so stale tickets, wrong-seat attempts,
third sockets, and protocol mismatches fail predictably without exposing
match state or inventing a result.

This lane is the dependency-critical lane for recovery UX and the final
browser acceptance matrix. It must remain independent of Discord identity
implementation: both guest and Discord clients consume the same assignment,
session, ticket, and error contract.

The source of truth is [`production-architecture.md`](./production-architecture.md),
especially “Join tickets and seat binding”, “Reconnect and failure
guarantees”, and “Phase 3: client recovery and protocol”.

## Current baseline

Already present:

- `MatchAssignment` carries `matchId`, durable `playerId`, seat, ticket,
  match seed, and protocol version.
- HTTP assignment lookup authenticates the durable session.
- Socket middleware validates and consumes match-scoped tickets.
- `MatchRegistry` routes ticket sockets by `matchId`.
- A seat replacement closes the prior socket and emits a full snapshot.
- The client refreshes a ticket after a stale/consumed ticket error.
- Recovery polling is bounded and uses exponential backoff.
- Guest session and match-recovery tests exist.

These are implementation facts, not proof that every rejection path has a
stable client-visible contract.

## Decided

- The server remains authoritative for identity, seat binding, match status,
  winner, forfeit, and void.
- A ticket is single-use; a reconnect obtains a new ticket.
- A stale or consumed ticket may trigger one bounded fresh-ticket recovery
  attempt; the same ticket must never be retried indefinitely.
- Wrong player, wrong seat, third socket, and incompatible protocol are
  rejected at the connection boundary.
- Protocol mismatch is terminal for that attempt and gives reload/update
  guidance.
- A server/runtime fault produces a void, never a client-selected winner.
- Error payloads must not contain raw bearer tickets, session tokens, or
  private Discord identifiers.

## Proposed stable failure contract

Use a machine-readable error code with a safe human message. The exact
transport may be Socket.IO `connect_error`, a server `error` event, or an
HTTP JSON response, but the code must remain stable across transports.

| Code | Meaning | Client action |
|---|---|---|
| `MATCH_TICKET_REQUIRED` | Ticket auth is missing where required | Terminal connection error |
| `MATCH_TICKET_REJECTED` | Ticket is expired, revoked, wrong-player, or wrong-match | Reject attempt; refresh only when the client has a valid own assignment |
| `MATCH_TICKET_CONSUMED` | Ticket was already used | Request a fresh assignment ticket |
| `MATCH_SEAT_REJECTED` | Seat is invalid, occupied, or does not match the runtime | Reject visibly; never bind another seat |
| `MATCH_THIRD_SOCKET` | A third active socket attempted to join a two-seat match | Reject visibly; do not alter either seat |
| `PROTOCOL_VERSION_MISMATCH` | Client/server protocol versions are incompatible | Stop retrying and show reload/update guidance |
| `MATCH_RUNTIME_UNAVAILABLE` | Runtime is draining, restoring, or unavailable | Enter bounded recovery or show retry guidance |
| `MATCH_VOIDED` | The authoritative match ended with no winner | Show server-void state; never infer a winner |

Do not expose whether another player, ticket, or match exists beyond what the
caller is authorized to know. If the server needs finer internal logging,
keep that detail in structured server logs rather than the client payload.

## Proposed work order

1. Inventory every server rejection and Socket.IO error emission.
2. Assign each rejection to the stable code table above.
3. Make the client distinguish retryable stale/consumed tickets from terminal
   protocol, seat, third-socket, and runtime errors.
4. Verify that a fresh ticket carries the same durable player, match, and seat.
5. Add contract tests for both one-match and two-match scenarios.
6. Run the client recovery tests and the database-backed control-plane tests.

## Acceptance criteria

- A valid assignment binds exactly one expected durable player and seat.
- Reusing a consumed ticket is rejected and causes a fresh-ticket request,
  not an automatic retry of the old ticket.
- A ticket from match A cannot bind to match B.
- Wrong-player and wrong-seat attempts are rejected before game state is sent.
- A third socket cannot displace either legitimate seat.
- Protocol mismatch stops reconnect looping and gives reload guidance.
- Runtime drain/unavailable errors do not become wins or losses.
- A void result is represented as no winner.
- Error messages and logs contain no raw tickets, bearer tokens, or socket IDs.
- The two isolated 1v1 demo still passes without cross-match state leakage.

## Tests to add or verify

- Socket-level stale-ticket and consumed-ticket recovery.
- Wrong-player and wrong-seat ticket attempts.
- Third-socket rejection while both seats are active.
- Protocol mismatch with a reconnect-loop assertion.
- Ticket from one `matchId` presented to another runtime.
- Full snapshot received after successful replacement binding.
- Server void received without a fabricated winner.

Run at minimum:

```text
bun run lint
bun run test:manager
bun run test:control-plane
bun test src/hooks/matchRecovery.test.ts src/hooks/useGameSocket.test.ts
```

## Files to inspect first

- `server/gameServer.ts`
- `server/matchRuntime/MatchRegistry.ts`
- `server/matchRuntime/MatchRunner.ts`
- `server/GameManager.ts`
- `server/controlPlane/routes.ts`
- `server/controlPlane/matchStore.ts`
- `src/hooks/useGameSocket.ts`
- `src/hooks/matchRecovery.ts`
- `src/types.ts`
- `src/App.tsx`

## Lane boundaries

- Do not implement Discord authentication here.
- Do not redesign the deterministic engine or match rules.
- Do not add the pause/void/forfeit visual treatment here; expose stable
  authoritative states for Lane C.
- Do not make analytics payloads depend on raw tickets.
- Do not change the assignment shape in a way that would block Lane B.

## Unknowns to resolve

1. Which exact Socket.IO error transport is stable across current and
   production versions?
2. Should wrong-player and wrong-seat use separate public codes or one
   intentionally opaque rejection code?
3. Which protocol version source is authoritative during a rolling deploy?
4. How should a restored-but-not-ready runtime identify `MATCH_RUNTIME_UNAVAILABLE`
   versus `MATCH_VOIDED`?
