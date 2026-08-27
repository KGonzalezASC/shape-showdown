# Handoff: make replay storage durable

## Mission

Design and implement a replay-retention path for Shape Showdown. The current server captures replay data, but the deployment plan does not say where it is durably stored or how it survives a Railway restart or redeploy.

This handoff is for the next smart agent. Grill the owner one decision at a time before locking the storage design, then produce a small PRD/ADR and implement the approved scope.

## Decided

- Launch topology remains **Cloudflare Pages + Railway Virginia game service + Railway Postgres**. Do not reopen Edgegap or Fly.
- **Storage Isolation Rule**: `main` (the staging environment) must NEVER connect to production object storage (e.g. Cloudflare R2 / S3). Staging must use local disk or an isolated test bucket/sandbox.
- Matches have **no wall-clock timeout**. A match continues until a player tops out or disconnects.
- Full replay capture is desired for now. Do not silently truncate a replay merely to fit a memory budget.
- Replay checkpoints use `replayKeyframeIntervalTicks: 30`.
- Replay capture must not affect authoritative gameplay, winner selection, or reconnect behavior.
- The Railway memory limit is approximately **1 GB**. This is a safety limit, not a replay-storage design.

## Current implementation facts

- `server/GameManager.ts` keeps the active replay in `activeReplay`.
- A replay contains:
  - initial state
  - every recorded input frame
  - match events
  - full player keyframes
- Keyframes are currently recorded every 30 simulation ticks.
- On match end, `saveReplay()` writes one JSON file:
  - `REPLAYS_DIR`, when configured
  - otherwise `process.cwd()/fixtures/replays`
- The write is synchronous and local to the server filesystem.
- There is no replay database table, object-storage bucket, Railway Volume, replay API, or access-control path in the current deployment plan.
- `fixtures/replays` is internal tooling storage. Cloudflare Pages does not make Railway replay files public.

## Wayfinder context

- Ticket 04 selects Railway but does not define durable replay storage.
- Ticket 07 says routine analytics belong in Postgres and explicitly excludes per-tick state from routine analytics.
- Ticket 06 owns the isolated match-runtime boundary and future snapshot resumption.
- Ticket 09 owns release, drain, rollback, backup, and production operations.
- The current tickets do not answer whether replays are:
  - internal QA artifacts
  - player-visible match history
  - incident/reliability evidence
  - authoritative restore material

## Evidence and risk

- Railway staging measured approximately **157 MB** after a cold restart and quiet idle.
- Post-soak memory reached roughly **284–380 MB** before restart.
- The process now allows matches to run indefinitely, so replay memory can grow indefinitely unless replay capture is streamed or bounded.
- The 30-tick checkpoint cadence reduces growth but does not create a hard bound.
- A replay-storage failure must not change the match result or stop the authoritative simulation.

## Questions the next agent must resolve

1. What is the replay’s product purpose: QA only, player history, moderation/anti-cheat evidence, or crash recovery?
2. Must a replay survive:
   - process restart
   - Railway redeploy
   - Railway service replacement
   - regional runtime failure?
3. What is the retention period and deletion policy?
4. Is replay data allowed to contain socket IDs, player inputs, and full board state?
5. Which storage class is acceptable:
   - Railway Volume
   - Postgres large objects/JSON
   - Cloudflare R2 or another object store
   - a temporary local artifact only?
6. What should happen when storage is unavailable:
   - continue match and mark replay incomplete
   - retry asynchronously
   - keep a bounded emergency buffer
   - fail only after the match ends?
7. Who may read or download a replay, and how is it authenticated?
8. Should old local `.replay` files be migrated, ignored, or deleted?

## Preferred design constraints

- Keep the deterministic simulation and replay format separate from the storage adapter.
- Stream or append replay data during a long match if durability is required; do not retain every full keyframe in RAM solely because the file is written at the end.
- Use an atomic completion marker or temporary object so an interrupted write is never presented as a complete replay.
- Keep a replay manifest with match ID, seed, schema/version, start/end timestamps, outcome, storage key, and completion status.
- Make replay persistence asynchronous and failure-isolated from the 60 Hz game loop.
- Preserve enough data for exact replay verification, not merely a video-like visual trace.
- Add metrics for replay bytes, write latency, failures, incomplete artifacts, and memory retained by active replay capture.
- Do not put per-tick replay state into routine analytics tables without an explicit decision overriding ticket 07.

## Required deliverables

1. A short PRD or ADR recording the owner’s answers and selected storage.
2. Updated ticket 07/09 documentation and ticket 04 staging evidence requirements if affected.
3. A storage interface with a local development implementation.
4. Production configuration and secret handling for the selected backend.
5. Tests proving:
   - exact replay data remains reproducible
   - storage failure cannot alter match outcome
   - incomplete writes are not reported as complete
   - long matches do not retain unbounded replay data in process memory, if streaming is selected
6. A staging exercise proving replay creation, retrieval, restart/redeploy behavior, retention, and cleanup.
7. A clear answer in plain language: “After a match ends, the replay is stored in ___, retained for ___, and can be retrieved by ___.”

## Do not do

- Do not reintroduce a match timeout just to cap replay size.
- Do not silently drop old keyframes or inputs while claiming the replay is exact.
- Do not assume Railway local disk is durable without a measured/configured persistence mechanism.
- Do not store player-facing replay data in Postgres merely because Postgres already exists; compare costs, limits, backup behavior, and retrieval needs first.
- Do not deploy a new external storage service before the owner approves its retention, privacy, and cost model.
