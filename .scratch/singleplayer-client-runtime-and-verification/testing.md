# Verification plan

[Back to overview](overview.md)

## Rule

Use the smallest existing check for each phase. Do not create or mutate tests unless the user explicitly opts in. Existing tests remain specifications and stay read-only.

## Static checks

Run these only when their phase reaches implementation:

```text
bun run lint
bun test <smallest existing relevant file>
bun run build:client
git diff --check
```

Do not run the full suite unless the user requests it. The repository guardrails require scoped checks.

## Determinism proof

For a fixed published puzzle and command trace, compare these outputs across Bun and the browser worker:

- terminal status
- simulation tick
- pieces used
- lines cleared
- score
- final board hash
- RNG channel state hash
- trace hash

The comparison must use the same `puzzleRuntimeVersion` and `contentHash`. A mismatch blocks the next phase.

## Static delivery proof

Record these values from the production client build:

- base application bytes before entering puzzles
- puzzle UI chunk bytes
- worker chunk bytes
- manifest bytes
- compressed and decoded pack bytes
- pack parse time on desktop and a representative phone
- worker memory after load, during play, after finish, and after route exit

Set budgets from the first measured baseline. The first budget proposal must include enough margin for one additional puzzle collection. Do not invent a per-level chunk system before the one-pack measurement.

## No-Railway proof

Capture the browser network log from puzzle picker entry through terminal result.

Allowed requests:

- Cloudflare Pages document and asset requests
- Discord Activity mapped static asset requests to Pages

Forbidden activity:

- any request to the Railway game hostname
- any `/api` request during casual play
- any Socket.IO handshake or WebSocket
- any `puzzle:*` socket event

Repeat with the Railway game service stopped. The casual puzzle must still complete.

## Browser coverage

Use the responsive-design verification matrix:

- desktop direct web
- iPad or tablet width and height
- phone portrait and a short landscape viewport
- Discord desktop Activity
- Discord Android Activity

Verify keyboard, touch controls, hold policy, pause behavior, retry, terminal result, and route exit.

## Staging validation proof

For one authored level, capture:

- authenticated author access
- draft export and re-import hash
- RulesBot validation status
- worker and Bun replay parity
- job duration
- peak CPU and memory
- rejection of a concurrent job
- cleanup after success, failure, timeout, and redeploy

Run one multiplayer staging match during validation. If match tick delay or Socket.IO latency crosses the existing staging budget, isolate the validator in a separate staging service.

## Ranked verification proof

This section applies only if Phase 9 ships.

Measure representative short, median, and maximum-length traces. Record replay time, peak memory, upload size, and decoded command count.

Reject:

- an altered outcome
- a command outside the legal action set
- commands out of canonical order
- a trace past tick, command, compressed-size, or decoded-size limits
- unknown content
- unsupported runtime versions
- expired or reused grants

Retry the same submission after a lost response. The verifier must return the same verdict without accepting the grant twice.

## Release evidence

The final report separates these numbers:

- casual play Railway usage, which must be zero
- static Pages delivery bytes
- staging developer validation usage
- optional production verification usage per submitted attempt
- multiplayer Railway usage

Do not merge these categories into one average. They answer different product and cost questions.

