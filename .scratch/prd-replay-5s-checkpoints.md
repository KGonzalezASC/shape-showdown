# Spec: 5-second replay keyframes with exact per-tick playback

## Problem Statement

The live match keeps a second copy of both players in `activeReplay` every 0.5 seconds. A 5-minute match holds about 5 MB of those photocopies on the game process. The match is already determined by seed, starting state, and the input tape. The photocopies are for scrubbing the replay viewer, which today paints the nearest stored snapshot and does not re-run the engine.

I want Railway RAM and later replay-file size to drop, without a timeline that snaps to a stale board. Exact boards at every tick can be rebuilt on the replay viewer. That CPU is free. Railway RAM and egress are not.

## Solution

Record full player snapshots every 5 seconds (300 ticks at 60 Hz), plus tick 0 and the terminal tick. Keep the full input and shop tape. Store each player's RNG channels on those snapshots so the viewer can resume the engine from the last snapshot instead of from kickoff.

The replay viewer no longer displays the nearest snapshot as if it were the current tick. It reconstructs the exact tick from the last snapshot, the input tape, and `matchStep`. Playback caches the last reconstructed tick and steps forward one tick at a time.

Old replays that lack RNG on snapshots still work. They reconstruct from kickoff. They stay exact. Scrubbing them is slower.

## User Stories

1. As a player in a long match, I want the game process to keep far less replay RAM, so a 5-minute or 15-minute match does not hold megabytes of cloned boards.
2. As the person paying Railway, I want replay capture to stop cloning both players twice a second, so idle and in-match memory stay closer to the live boards only.
3. As someone who downloads a replay, I want the file to carry the recipe plus a few snapshots, so egress is hundreds of kilobytes, not several megabytes.
4. As someone watching a replay, I want the board at tick 8012 to match what the server simulated at tick 8012, so the timeline is exact, not "nearest snapshot within 5 seconds."
5. As someone dragging the timeline, I want a jump to land within one 5-second window of engine work, so scrubbing stays snappy.
6. As someone pressing play, I want the viewer to step tick by tick from the last reconstructed state, so play does not rebuild from the snapshot on every frame.
7. As someone opening a current interval-30 fixture, I want it to still play, so existing files are not discarded.
8. As someone opening an old interval-1 fixture, I want it to still play, even if seek is slower because those snapshots have no RNG.
9. As a developer verifying a recorded match, I want `replayMatch` to still reach the same terminal boards and event log from the input tape.
10. As a developer seeking to a mid-match tick in tests, I want `replayToTick` to match a full run from kickoff at that tick, so the snapshot-plus-RNG path cannot silently drift.
11. As a developer reading a replay file, I want `keyframeIntervalTicks` to say 300 on new recordings, so tools know the snapshot cadence.
12. As a developer running GameManager tests, I want changing the interval to still leave authoritative match state untouched.
13. As a developer using reconnect or restore, I want replay capture to keep recording inputs and discontinuities, so a paused match still reconstructs.
14. As a developer looking at shop purchases on the timeline, I want purchase markers to come from the input tape, not from 5-second snapshots, so buys are not rounded to the nearest checkpoint.
15. As a developer looking at effect bands on the timeline, I want spans derived from reconstructed play or from events and expiry ticks, so a 5-second snapshot gap does not stretch or drop a 4-second Curtain.
16. As a developer running bot pair generators, I want those scripts to keep their own snapshot cadence unless I pass a flag, so QA evidence files do not silently change shape in this work.
17. As a developer operating staging, I want `REPLAY_KEYFRAME_INTERVAL_TICKS` to still override the default, so I can record dense snapshots for a bug without a code change.
18. As a developer comparing crash-restore checkpoints to replay snapshots, I want those two systems to stay separate, so changing replay cadence does not change Postgres restore cadence.
19. As a developer when `REPLAYS_DIR` is unset, I want `activeReplay` to still use the sparse cadence while the match runs, so RAM is saved even when nothing is written to disk.
20. As a developer when a match tops out off the 300-tick grid, I want a terminal snapshot at the end tick, so the last board is stored without waiting for the next interval.

## Implementation Decisions

- The replay snapshot cadence default becomes 300 ticks (5 seconds at 60 Hz). Config, shared constant, and loader default all move together. Env override stays.
- Tick 0 is still stored. The tick that ends the match is still stored even when it is not on the 300-tick grid.
- The input tape, shop frames, events, seed, player slots, pricing policy version, initial state, and discontinuities stay as they are. This work does not switch to input-only files.
- A replay snapshot is a resume point, not a display frame. The recorded shape grows by per-player RNG channels (pieces, garbage, shop, effects), cloned at the same time as the players. Crash restore already stores those channels on durable checkpoints. Replay snapshots must do the same or a mid-match resume will roll the wrong pieces, garbage holes, and shop outcomes.
- The reconstruction seam is one function on the existing replay driver. Call it with a replay and a target tick. It picks the latest snapshot at or before that tick that includes RNG. If none exists, it starts from initial state and the seed-derived channels. It applies recorded inputs and shop frames, then `matchStep`, up to the target. Tests treat that function as the seam. Do not fork a second engine in the viewer.
- `replayMatch` keeps proving a full run from kickoff. It does not become the seek path. Seek is the new function. Full run remains the source of truth for "this tape is deterministic."
- The replay viewer asks the driver for the exact tick. It must not paint `keyframes[i]` because the timeline tick landed near that snapshot. Playback keeps one reconstructed cursor and steps it forward while playing. A scrub that jumps backward or far ahead starts again from the chosen snapshot.
- Timeline effect bands cannot keep sampling `activeEffects` only on snapshots. At 5 seconds that misses short effects. Derive bands from reconstructed ticks, or from events plus `expiresAtTick` and the input tape. Purchase markers already come from inputs and stay that way.
- `totalTicks` cannot be "last snapshot tick" alone if a viewer ever sees a tape with no terminal snapshot. Prefer `finalTick` when present. Until that field exists, take the max of last snapshot tick, last event tick, and last input tick, as the driver already does for a full run.
- Do not add `finalTick` unless the max-of-three rule is wrong for a real file. Prefer the existing fields first.
- Durable match checkpoints stay on their own 300-tick interval. Same number, different job. Do not reuse that constant for replay snapshots.
- Gzip, Brotli, chunked streaming of `activeReplay`, and live `gamePacket` netcast are not part of this change.
- Bot generator scripts that already pass their own interval keep it. Live match default is the only cadence this spec changes.

## Testing Decisions

A good test checks observable replay behavior, not how many `structuredClone` calls ran.

- GameManager. Changing the snapshot interval does not change boards, scores, winners, or match events. Sparse capture stores fewer snapshots than interval 1, stores tick 0, stores the end tick, and stores RNG on those snapshots. Interval is recorded as 300 unless the constructor override says otherwise.
- Replay driver. A recorded GameManager tape still matches terminal state and the event log on a full run. `replayToTick(t)` from a 300-tick snapshot plus RNG equals a full run stopped at `t`, including a tick that is not on the grid (for example 301 and 599). A tape with snapshots but no RNG falls back to kickoff and still matches.
- Replay viewer reconstruction. Loading a sparse tape and requesting an off-grid tick shows the reconstructed boards, not the previous snapshot's boards. This can be a driver-level test with the same player objects the viewer would display, if the viewer stays a thin wrapper.
- Prior art. The GameManager test that already compares interval 1 vs 30 without changing match state. The replay driver test that replays a recorded tape to the terminal keyframe. Extend those. Do not add a snapshot-count assertion as the only proof.

## Out of Scope

- Compressing the file on disk.
- Streaming replay chunks during the match so RAM cannot grow with match length.
- Changing live Socket.IO packets or Railway egress of the match itself.
- Relocating bot `decisionTraces` off snapshots. Live match recordings do not write those traces.
- Forcing pair and powerup generator scripts onto 300-tick snapshots.
- Changing Postgres restore checkpoints, even though they are also 300 ticks.
- Input-only files with zero snapshots.
- A wall-clock match timeout to cap replay size.

## Further Notes

A 5-minute match at this cadence is about 61 snapshots. At ~8 KB each that is about 0.5 MB of snapshot state plus the ~120 KB tape, versus ~5 MB of snapshots today. Gzip still helps the file later. It does not shrink `activeReplay` while the match runs.

The viewer pays CPU. Railway does not. That is the intended bill.

If snapshot RNG is omitted, "5-second checkpoints" only save capture RAM. The timeline stays exact only if the viewer always runs from kickoff. Include the RNG or you have not finished the compromise.
