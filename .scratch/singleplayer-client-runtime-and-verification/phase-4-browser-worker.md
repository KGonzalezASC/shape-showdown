# Phase 4: Run attempts in a browser worker

[Back to overview](overview.md)

## Goal

Run the 60 Hz deterministic simulation on the player's device without blocking React and without importing any network client.

## Changes

- Add `src/puzzle/runtime/puzzleRuntime.worker.ts` as the worker entry.
- Add `src/puzzle/runtime/PuzzleRuntimeClient.ts` as the typed browser adapter.
- Add `src/puzzle/runtime/puzzleWorkerProtocol.ts` for validated worker messages.

The worker loads one decoded `PublishedPuzzleV1`, advances simulation ticks, records sparse commands, and posts coalesced presentation snapshots. UI messages that arrive after a tick starts are assigned to the next tick. The worker applies commands in contiguous within-tick order before it advances that tick.

When the document becomes hidden or loses focus, the adapter queues one all-false input state for the next tick, advances that tick, then pauses. Resume starts with all inputs false. The worker never catches up hidden-tab ticks in one burst.

Copy the final snapshot and result to React before terminating the worker. Terminate the worker on route exit, attempt cancellation, and fatal decode errors.

## Data structures

- `PuzzleWorkerRequest` is `load`, `input`, `action`, `pause`, `resume`, `restart`, or `dispose`.
- `PuzzleWorkerEvent` is `ready`, `snapshot`, `finished`, or `error`.
- `PuzzleCommandV1[]` records full held-input changes and allowed actions with safe-integer tick and contiguous within-tick order.

## Verification

Static evidence:

- Build the client and confirm that Vite emits a separate hashed worker asset.
- Inspect the worker dependency graph and built chunk for Node and server-only imports.

Runtime evidence:

- Run a known command trace in the worker and in Bun. Compare the final-state hash and outcome.
- Leave and re-enter the route. Confirm that the old worker no longer posts messages and a new attempt starts with clean state.
- Background and restore the page while a movement key is held. Confirm the all-false boundary, no stuck key, and no catch-up burst.
