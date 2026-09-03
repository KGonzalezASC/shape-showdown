# Phase 2: Extract the browser-safe runtime

[Back to overview](overview.md)

## Goal

Create one deterministic puzzle runtime that both the browser worker and a server verifier can call without Socket.IO, RulesBot, filesystem, wall-clock, or input-driver dependencies.

## Changes

- Add `src/puzzle/runtime/PuzzleRuntime.ts` to own one puzzle attempt and expose a pure tick transition plus snapshot and finish operations.
- `enableShop` is removed from `PuzzleRuntimeConfig` and unconditionally `false`. Curated solo puzzles have no shop, purchases, or funds.
- Export `stableSeedForPuzzle(id)` and align `PuzzleSession` with `PuzzleRuntime` so both derive the exact same seed from puzzle ID. This guarantees seed parity between the server wrapper and client/verifier standalone runtime.
- Isolate wall-clock helpers (`initialSeed`, `replayDateLabel`) in server-only `server/puzzleEngine/engine.ts`. `src/puzzle/runtime/` contains zero wall-clock calls (`Date.now()`, `new Date()`) and is strictly deterministic by inspection.
- Add `src/puzzle/runtime/puzzleCommands.ts` to define canonical command ordering and trace limits.
- Adapt `server/puzzle/puzzleSession.ts` into a temporary server wrapper over the shared runtime. Keep `PuzzleHost` behavior unchanged during this phase.

The core transition is `advancePuzzle(state, commandsForTick, rngChannels) -> { state, events, result }`. Human input adaptation, RulesBot observation, timers, and transport stay outside it.

Move only code required by both hosts. Keep RulesBot observation and candidate selection in `server/testHarness` and `server/puzzle`.

## Data structures

- `PuzzleRuntimeState` owns the mutable engine state, RNG channels, timeline cursor, piece-lock count, and terminal status (`enableShop: false`).
- `PuzzleRuntimeCommand` is the validated internal form of `PuzzleCommandV1`, with a full input state or one allowed action.
- `PuzzleRuntimeResult` contains the authoritative final metrics.

## Verification

Static evidence:

- Check that the shared runtime dependency graph contains browser-safe modules only.
- Confirm zero wall-clock references (`Date.now()`, `new Date()`) in `src/puzzle/runtime/`.
- Run the smallest existing puzzle and engine checks that cover the moved code (`bun run lint`).

Runtime evidence:

- Feed a saved command sequence through the server wrapper and the shared runtime.
- Direct test coverage in `src/puzzle/runtime/PuzzleRuntime.test.ts`: verify `enableShop=false` invariant and assert identical seed and simulation metrics between `PuzzleSession` and standalone `PuzzleRuntime`.
- Compare every terminal metric and a final-state hash.

Stop if the two paths diverge. Do not patch the result comparison or existing fixtures to hide a difference.

