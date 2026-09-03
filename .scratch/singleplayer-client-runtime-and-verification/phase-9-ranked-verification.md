# Phase 9: Measure and add ranked verification only if required

[Back to overview](overview.md)

## Goal

Make a measured hosting decision for production result verification. Skip this phase if the product has no leaderboard, reward, or shared record that needs server trust.

## Changes

- Add `scripts/measure-puzzle-verification.mts` to replay representative traces and report CPU time, wall time, peak memory, and accepted trace size.
- Add `server/puzzle/verification/verifyPuzzleAttempt.ts` as a pure verifier over known published content and an explicit versioned runtime registry.
- Add a production API route only after measurements choose an in-process bounded handler or a separate `puzzle-verifier` service.

Start with sparse JSON plus normal HTTP compression. Do not add a binary protocol until trace measurements show that JSON misses the upload budget.

The hosting decision follows evidence:

- Keep verification in the production API only if bounded concurrency cannot affect multiplayer tick latency under the measured worst case.
- Use a separate production verifier service if replay CPU or memory can interfere with matches.
- A request-driven Railway service may use Serverless mode if cold-start retries are acceptable. Railway notes that the first wake request can return `502`, so the client must submit idempotently and retry the same grant.
- Do not route production authority through staging.

## Data structures

- `PuzzleRuntimeRegistry` maps each accepted runtime version to the exact immutable replay implementation.
- `PuzzleAttemptGrantV1` binds one ranked attempt to puzzle content and runtime versions.
- `PuzzleAttemptEnvelopeV1` carries the sparse commands and claimed outcome.
- `PuzzleVerificationVerdictV1` returns the authoritative outcome and stable reason.

## Verification

Static evidence:

- Parse and limit the compressed request at the HTTP boundary. Enforce separate compressed and decoded size limits.
- Confirm that the verifier has no Socket.IO, matchmaking, or persistent 60 Hz timer dependency.

Runtime evidence:

- Replay valid, altered, oversized, duplicate-grant, unknown-content, version-mismatch, non-contiguous order, unsafe tick, and post-terminal submissions.
- Replay one prior-version trace through its registered prior implementation and reject the same label when that implementation is absent.
- Measure p50 and p95 replay time, peak memory, and multiplayer event-loop delay under the chosen concurrency.
- Kill the request after grant consumption and retry. Confirm one idempotent final verdict.
- Verify direct web and Discord-mapped submission paths.

The verifier proves legal deterministic outcomes. It does not claim bot detection.
