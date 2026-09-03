# Phase 8: Add staging validation and shadow replay

[Back to overview](overview.md)

## Goal

Use staging for developer-triggered RulesBot validation and for checking that browser traces replay identically. Keep the work finite and visibly non-authoritative.

## Changes

- Add `server/puzzle/validation/stagingPuzzleValidator.ts` with one-at-a-time concurrency, a parent-enforced deadline, request limits, and explicit resource counters.
- Update `scripts/validate-puzzle-baselines.mts` so the CLI and staging entry call the same validation function.
- Add a protected staging route to submit a draft or `PuzzleAttemptEnvelopeV1` and return a diagnostic report.

Run RulesBot work in a killable child process outside the Socket.IO event loop. The parent parses a size-limited request, starts at most one child, kills it at the deadline, and owns temporary-file and process cleanup. The Railway replica memory limit remains the final containment boundary. Reject every concurrent job with a retryable busy result. Do not create an in-memory queue.

The UI must label every staging verdict as development evidence. Staging cannot write an accepted production score.

## Data structures

- `StagingValidationJob` is `queued`, `running`, `passed`, `failed`, `timed-out`, or `cancelled`.
- `StagingValidationReport` records the content hash, runtime version, candidate outcomes, replay parity, duration, and peak memory.

## Verification

Static evidence:

- Confirm that the validator imports RulesBot only in server or internal build code.
- Confirm that one parent module owns deadlines, concurrency, process termination, and cleanup.

Runtime evidence:

- Trigger a validation while staging has no match. Record CPU, memory, duration, and cleanup.
- Trigger a second job and confirm immediate bounded rejection.
- Run one staging multiplayer match while validation is active. If game ticks or Socket.IO latency breach the staging budget, move validation to a separate staging service.
- Redeploy during a job and confirm that the job fails clearly without publishing partial content.

Railway service limits cap damage. They do not reserve capacity or remove usage charges.
