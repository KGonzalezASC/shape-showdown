# Handoff: Lane C — recovery UX and authoritative outcomes

## Mission

Make recovery and terminal match outcomes unmistakable to players. The client
must explain whether it is searching, connecting, reclaiming a seat, paused,
forfeited, voided, or blocked by protocol incompatibility.

This lane presents server truth. It must not infer a winner from local socket
state or alter the server-authoritative match rules.

The source of truth is [`production-architecture.md`](./production-architecture.md),
“Reconnect and failure guarantees” and “Phase 3: client recovery and protocol”.

## Current baseline

Already present:

- `MatchEndReason` distinguishes top-out, disconnect-forfeit, server-void, and
  allocation cancellation.
- `GameState.pause` carries the authoritative paused seat and start time.
- `gameStateStore` publishes `endReason`, pause owner, and pause start time.
- `App.tsx` renders searching, assigned/connecting, reconnecting, paused,
  protocol-mismatch, server-void, and disconnect-forfeit states.
- `/api/matches/:matchId/outcome` lets a reconnecting client distinguish a
  void from a disconnect forfeit after runtime loss.
- Full authoritative snapshots are applied on ticket binding.

These are implementation facts. Verify each path from a real server event to
the visible UI before marking the lane complete.

## Decided

- The server owns `winnerId`, `endReason`, pause, forfeit, and void.
- `server-void` always displays no winner.
- `disconnect-forfeit` may display a technical winner.
- A pause modal is driven by `GameState.pause`, not merely by local socket
  connectivity.
- Reconnect status and database/control-plane failure are different messages.
- A protocol mismatch is terminal for the current attempt and offers reload or
  update guidance.
- The playfield becomes inert while authoritative pause or terminal recovery
  UI is active.

## Required user-visible states

| Situation | Required message | Must not say |
|---|---|---|
| No assignment yet | Searching for an opponent | Backend offline |
| Assignment received | Match assigned — connecting | Waiting for server reset |
| Socket loss during a live match | Reconnecting to the match | Opponent won |
| One seat is being reclaimed | Match paused; identify whether self or opponent is reconnecting | Match ended |
| Disconnect budget expires | Opponent disconnected; technical victory for the remaining player | Server void |
| Runtime restore timeout or incompatible checkpoint | Match voided — no winner | Opponent won |
| Protocol mismatch | Update required; reload to receive the current protocol | Reconnecting forever |
| Database/control plane unavailable | Service unavailable with a retry path | Match forfeited |

## Proposed work order

1. Trace each authoritative event through `GameStateProvider`,
   `gameStateStore`, and `App`.
2. Verify that `endReason` and pause survive a full snapshot replacement.
3. Verify modal precedence: server void/terminal state must not be hidden by a
   generic reconnect overlay.
4. Verify the opponent’s view for pause, forfeit, and void independently.
5. Add focused UI/state tests or a browser harness for each outcome.
6. Confirm analytics and replay markers are emitted without becoming a
   rendering dependency.

## Acceptance criteria

- Refresh during `playing` shows pause, then returns both clients to the same
  match after seat reclaim.
- A reconnect receives the authoritative board, scores, tick, pause, and
  outcome fields rather than merging stale local state.
- The reconnecting player and opponent see appropriate pause copy.
- A disconnect forfeit identifies the correct winner.
- A server void displays no winner in both clients.
- Protocol mismatch stops retrying and offers reload/update guidance.
- Database outage has a retry path and does not fabricate a match result.
- Terminal outcome UI takes precedence over generic connection UI.
- Controls are inert while the match is authoritatively paused or terminal.
- Copy does not expose bearer tokens, raw Discord IDs, or socket IDs.

## Verification scenarios

- Guest searching → assignment → countdown → playing.
- Refresh self during `playing`.
- Opponent disconnects, then reconnects before the seat lease expires.
- Disconnect budget expires and produces a technical victory.
- Server restart restores the match and both clients reclaim seats.
- Restore timeout produces a void with no winner.
- Corrupt/incompatible checkpoint produces a void with no winner.
- Protocol version mismatch produces a stable reload state.
- Control-plane/database outage produces a retryable service state.

## Files to inspect first

- `src/App.tsx`
- `src/state/gameStateStore.ts`
- `src/state/GameStateProvider.tsx`
- `src/types.ts`
- `src/hooks/useGameSocket.ts`
- `src/components/MatchChrome.tsx`
- `server/GameManager.ts`
- `server/matchRuntime/MatchRunner.ts`
- `server/controlPlane/routes.ts`

## Dependencies and boundaries

- Lane A supplies stable protocol/error codes.
- Lane B supplies Discord sessions, but Lane C must work with guests first.
- Lane D consumes the lifecycle events produced here; analytics failure must
  never block this lane.
- Lane E verifies this lane and should not redefine its behavior during a test.

Do not change the deterministic engine, winner rules, ticket ownership, or
Discord verification in this lane.

## Unknowns to resolve

1. Should the server-void screen offer only reload, or also return to queue?
2. Should a paused opponent see the elapsed lease time or only status text?
3. Which retry action is safe after control-plane recovery without creating a
   duplicate queue entry?
4. Does the current screen-reader announcement order distinguish pause,
   reconnect, forfeit, and void clearly?
