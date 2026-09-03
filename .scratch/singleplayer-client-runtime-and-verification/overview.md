# Client-run single-player and bounded verification plan

Status: Phases 1–5 complete. Phases 6–10 remain proposed.

Branch context: `feature/single-player-puzzles` at `4df130e5da830bb2eb5374521858abd323e0c8d9`

## Decision

Production casual puzzles will run in the browser after Cloudflare Pages delivers a lazy-loaded puzzle runtime and immutable puzzle pack. Entering, playing, retrying, and finishing a casual puzzle will make no request to Railway.

Staging will remain a developer environment. It can host level authoring tools, RulesBot validation, and shadow attempt replay. It will not approve production player results.

If Shape Showdown later accepts ranked puzzle results, a production verifier will replay one compact command trace after the attempt. Verification will consume bounded server work. The product must never describe verified play as zero-backend play.

## Why this plan exists

Two different goals were folded into the current socket prototype.

The first goal is static delivery. A developer authors and validates a puzzle before release. The production client downloads the published puzzle content once, then runs it locally. This keeps play responsive and removes the per-player Railway timer, memory, and Socket.IO egress.

The second goal is trust. A server can replay a completed command trace to reject impossible outcomes. This proves that the submitted commands produce the claimed result under a known puzzle and runtime version. It does not prove that a human supplied the commands, and it cannot be free of server work.

The current branch does something else. `PuzzleScreen` opens a long-lived Socket.IO connection. `PuzzleHost` creates a `PuzzleSession`, advances it at 60 Hz, and emits `puzzle:state` every tick. Puzzle sockets skip matchmaking, but the production Railway process still performs the simulation and sends every snapshot.

The earlier [local backend split spec](../spec-backend-split.md) solved the local Docker dependency with `bun run dev:solo`. It explicitly left online verification and deployment topology for later. This plan keeps the useful local boot profile during migration and replaces the production socket model.

## Product modes

| Mode | Where the simulation runs | Railway work while playing | Result trust |
| --- | --- | --- | --- |
| Casual puzzle | Browser worker | None | Local progress only |
| Developer preview | Browser worker | None unless the developer requests validation | Development evidence |
| Staging shadow verification | Staging replay process after an attempt | One bounded replay | Diagnostic only |
| Ranked or daily submission | Browser worker, then production replay | One bounded replay after play | Eligible for a server-accepted result |

Casual puzzle is the default. Ranked verification is a separate product capability with separate UI language and operational limits.

## Answer about unused staging capacity

Staging can run developer-only puzzle validation when nobody is testing multiplayer. That is a sensible use of a quiet environment if the job has one-at-a-time concurrency, a time limit, and a memory limit.

Railway does not reserve a fixed machine for the service. Resource limits are ceilings. Railway bills the CPU, memory, and egress that a process uses. Raising a limit does not buy idle headroom. A validation run consumes metered resources when it runs. Railway documents this model in [Right-size CPU and memory](https://docs.railway.com/guides/right-size-cpu-memory) and [Pricing](https://docs.railway.com/pricing).

Production clients must not send trusted result submissions to staging. Railway environments have separate deployments, networks, variables, databases, and storage. That isolation is the point of staging. See [Isolate staging from production](https://docs.railway.com/guides/isolate-staging-production). A public endpoint can technically cross that line, but the result would depend on an environment that is frequently redeployed and may contain unreleased code.

If a verifier receives production traffic and decides which production results count, treat it as a production service. Name it `puzzle-verifier`, deploy it in the production environment, give it production monitoring, and keep it separate from the multiplayer match loop.

## Scope

This plan includes:

- A browser-safe deterministic puzzle runtime.
- A player-safe published puzzle schema.
- A generated manifest and one or more immutable puzzle pack files hosted by Cloudflare Pages.
- Lazy loading for the puzzle UI, runtime, and content.
- A compact deterministic command trace.
- A staging-only authoring and validation path.
- A shadow verifier in staging for developer evidence.
- An optional production verifier for ranked results.
- A production guard that prevents puzzle sockets from creating live sessions.
- Direct browser and Discord Activity verification.

This plan does not include:

- A leaderboard, rewards, matchmaking, or account-synced puzzle progress.
- A promise to detect bots, macros, or tool-assisted play.
- Shipping RulesBot, hidden solution commands, or validation fixtures to the browser.
- Reading production data from staging.
- Writing drafts directly into production storage.
- Replacing the multiplayer server, Postgres, or Socket.IO match protocol.
- A full offline-install promise across reloads. The first visit still downloads static files from Pages.

## Constraints to preserve

- The deterministic `matchStep` and engine behavior remain the source of gameplay truth.
- A curated puzzle has a complete finite piece sequence, including the first active piece.
- Automatic items and garbage fire after configured piece locks. Absolute ticks remain available only for explicitly timed challenges.
- Curated solo puzzles have no shop, purchases, or funds.
- `allowHold` belongs to the puzzle definition.
- Published content may expose information to a determined player. `visibilityPolicy` controls presentation and is not a security boundary.
- RulesBot publication baselines use `player-limited` observations. Omniscient runs remain diagnostic.
- Staging storage and credentials remain isolated from production.
- Existing tests are read-only. New tests require an explicit user request under the repository guardrails.

## Target boundaries

```text
Authoring source
  -> staging validation
  -> immutable published puzzle pack
  -> Cloudflare Pages
  -> browser puzzle worker
  -> local result
  -> optional compact attempt trace
  -> staging shadow verifier or production verifier
```

The published pack contains only the data needed to simulate and present a puzzle. Validation artifacts, RulesBot profiles, author notes, and hidden command traces remain on the server or in `fixtures/`.

The browser worker owns one active attempt. It stores the puzzle, the mutable simulation state, and a sparse command trace. The React tree receives presentation snapshots and a final result. Leaving the puzzle route terminates the worker and releases attempt memory.

The verifier owns no live session. It loads a known published puzzle by `contentHash`, replays the submitted commands as fast as the CPU allows, returns a verdict, and releases all state.

## Core data contracts

These names are provisional. Their responsibilities are not.

### `PublishedPuzzleManifestV1`

The small Pages-hosted index for published content.

```text
schemaVersion
puzzleRuntimeVersion
releaseId
packs[]: id, url, sha256, byteLength, puzzleIds[]
```

### `PublishedPuzzlePayloadV1` and `PublishedPuzzleV1`

`PublishedPuzzlePayloadV1` is the exact player-safe content used by both the browser worker and the verifier.

```text
id, name, description
initialBoard
finitePieceSequence
goal
allowedMechanics: allowHold
timeline: atTick or afterPieces events
visibilityPolicy
benchmark policy
```

`PublishedPuzzleV1` is `{ payload, contentHash, publicBaseline }`. The hash covers only the canonical payload. It never covers itself or the baseline that validation derives from that hash.

The canonical encoder recursively sorts object keys, preserves array order, encodes text as UTF-8, accepts finite safe integers only, and rejects values that JSON cannot represent. Hash `shape-showdown:puzzle:v1\0` followed by the canonical payload bytes with SHA-256. `parsePublishedPuzzleV1` enforces this integrity asynchronously, recomputing the SHA-256 digest and throwing if `contentHash` does not match. The validation artifact, manifest, browser worker, and verifier all use this one function and this one hash. Validation writes derived public baseline metrics beside the hash after it validates the payload.

The payload has no `shopPolicy` and `enableShop` is absent from `PuzzleRuntimeConfig` (permanently false). It does not accept an endless seeded continuation. Simulation seed is deterministically derived from `payload.id` (`stableSeedForPuzzle`), guaranteeing exact parity between `PuzzleSession` and standalone `PuzzleRuntime`. The current `queuePrefix` and optional `shopPolicy` remain migration inputs only, bridged via `publishedPuzzleAdapter.ts` until Phase 3 pack generation and Phase 7 authoring export. Wall-clock functions (`initialSeed`, `replayDateLabel`) are strictly isolated to server-only engine utilities, leaving the shared runtime completely deterministic by inspection.

### `PuzzleCommandV1`

A sparse discriminated event recorded only when the full held-input state changes or a discrete action occurs.

```text
tick
orderWithinTick
kind: input
left, right, softDrop

or

tick
orderWithinTick
kind: action
action: rotateCW, rotateCCW, hardDrop, or hold
```

Ticks and within-tick order are non-negative safe integers. Commands sort by tick, then by `orderWithinTick`. Order starts at zero and is contiguous within a tick. The initial held-input state is all false.

UI messages received after tick `n` starts are assigned to tick `n + 1`. At the start of a tick, the runtime applies that tick's commands in order, then advances `matchStep` once. No command may appear after the terminal tick. Both the browser worker and the verifier use this rule.

### `PuzzleAttemptEnvelopeV1`

The optional upload for shadow or ranked verification.

```text
schemaVersion
puzzleRuntimeVersion
puzzleId
contentHash
attemptGrantId or null
commands[]
claimedOutcome: status, ticksUsed, piecesUsed, linesCleared, score, finalStateHash
traceHash
```

The verifier never accepts a client-supplied puzzle body. It resolves the known puzzle by `contentHash` and rejects unknown or retired content.

The trace hash uses the canonical attempt fields except `traceHash` and the prefix `shape-showdown:puzzle-trace:v1\0`. Pack-byte hashes use a separate `shape-showdown:puzzle-pack:v1\0` prefix.

### `PuzzleAttemptGrantV1`

An online grant used only when ranked results require replay protection.

```text
grantId
puzzleId
contentHash
puzzleRuntimeVersion
issuedAt
expiresAt
nonce
```

Casual play does not request a grant. A grant prevents replaying an old accepted submission as a new result. It does not prevent automation.

### `PuzzleVerificationVerdictV1`

```text
accepted
reason
authoritativeOutcome
traceHash
verifierVersion
```

Reject reasons are stable codes such as `UNKNOWN_CONTENT`, `VERSION_MISMATCH`, `INVALID_COMMAND`, `TRACE_LIMIT`, `OUTCOME_MISMATCH`, and `GRANT_REPLAYED`.

## Compatibility rules

Create a puzzle-specific `puzzleRuntimeVersion`. Do not reuse the multiplayer `GAME_PROTOCOL_VERSION`. Static puzzle content and Socket.IO matches can change on different schedules.

The manifest names both the content schema and the runtime version. A browser refuses to start a pack it cannot decode. A verifier refuses a trace produced by a runtime version it no longer supports.

Casual local play only needs the runtime shipped with its pack.

If ranked submissions ship, the server uses `PuzzleRuntimeRegistry`. The registry maps each accepted `puzzleRuntimeVersion` to the exact immutable replay implementation for that version. Keep the currently published runtime and one prior implementation during the measured submission overlap. A label without a registered implementation is unsupported and must be rejected.

## Trust limits

Deterministic replay can establish these facts:

- Every submitted input state and action was legal at its assigned simulation tick.
- The known puzzle content and runtime produce the reported board, score, lines, pieces, and terminal result.
- The trace stayed inside command-count, tick-count, and size limits.
- A ranked grant was fresh and used once.

Deterministic replay cannot establish these facts:

- A human chose the actions.
- The player did not inspect the downloaded puzzle file.
- The player did not use a solver, macro, or modified client.
- An offline wall-clock time is honest.

For that reason, verified puzzle metrics should use authoritative simulation ticks, pieces, lines, and score. Do not rank offline attempts by client-reported elapsed wall time.

## Alternatives considered

| Approach | Result | Decision |
| --- | --- | --- |
| Keep `PuzzleHost` on the multiplayer Railway process | Strong live authority, continuous CPU, memory, and egress per solo player | Reject for production casual play |
| Move `PuzzleHost` to a separate solo Railway service | Protects multiplayer contention, still pays backend cost per player | Reject as the default |
| Run puzzles in a browser worker and upload a trace only when needed | No Railway work during play, compact static delivery, bounded optional verification | Select |
| Let staging approve production results | Uses a quiet environment, breaks the staging and production trust boundary | Reject |

## Ordered phases

1. [x] [Freeze the puzzle and attempt contracts](phase-1-contracts.md)
2. [x] [Extract the browser-safe runtime](phase-2-runtime-core.md)
3. [x] [Generate immutable published packs](phase-3-published-packs.md)
4. [x] [Run attempts in a browser worker](phase-4-browser-worker.md)
5. [x] [Move the puzzle UI off Socket.IO](phase-5-ui-migration.md)
6. [Enforce the production no-session boundary](phase-6-production-boundary.md)
7. [Add staging authoring and publication export](phase-7-staging-authoring.md)
8. [Add staging validation and shadow replay](phase-8-staging-validation.md)
9. [Measure and add ranked verification only if required](phase-9-ranked-verification.md)
10. [Roll out, observe, and retire the legacy path](phase-10-rollout.md)

See [verification](testing.md) for the complete evidence matrix.

## Throughput checkpoint

Ten small phases replace one risky rewrite. The pack generator and replay benchmark are the reusable tools. Each phase ends with a source, artifact, or browser check before the next phase starts.

## Implementation guidance

The implementer must use these skills when the phase reaches their scope:

- Use `how` before changing the puzzle engine, Vite build, Socket.IO server, or control-plane router.
- Use `typescript-best-practices` for every TypeScript file.
- Use `use-bun` for scripts and package commands.
- Use `responsive-design` when changing `PuzzleScreen` or its loading and error states.
- Use `interrogate` after the runtime, pack, and verification contracts exist. The review must challenge deterministic ordering, trust claims, and deployment boundaries.
- Use `principle-model-the-domain` for the published schema, command stream, and verdict codes.
- Use `principle-boundary-discipline` at pack parsing, worker messages, and verification requests.
- Use `principle-build-the-lever` for pack generation and replay measurement.
- Use `principle-prove-it-works` for the actual Pages, Discord Activity, and Railway paths.
- Use `show-me-your-work` for the multi-phase decision trail.
- Apply `unslop` to docs and UI copy. Apply `/deslop` to each diff before commit.
- After a PR opens, use the available PR babysitting workflow until its checks and review are resolved.

Do not parallelize implementation before Phase 1 fixes the contracts. Later work can split only where files and mutable state do not overlap.

## Definition of done

The project is done when all of these statements are proven:

- Entering and completing a casual puzzle opens no WebSocket and sends no request to Railway.
- Cloudflare Pages serves the puzzle route, runtime worker, manifest, and immutable pack.
- The first puzzle load stays within measured download, parse, and memory budgets recorded in [verification](testing.md).
- Direct web and Discord Activity clients run the same content hash and produce the same deterministic outcome for the same commands.
- Leaving the puzzle route terminates the worker and releases its mutable state.
- RulesBot and validation artifacts do not appear in the production client output.
- Production rejects the legacy `purpose: 'puzzle'` socket path.
- Staging authoring exports immutable source for review. It never writes production content directly.
- Staging validation is developer-only, bounded to one job, and marked non-authoritative.
- If ranked verification ships, the production verifier replays a sparse trace without entering matchmaking or starting a 60 Hz timer.
