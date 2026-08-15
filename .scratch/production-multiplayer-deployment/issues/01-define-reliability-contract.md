# Define the player and match reliability contract

Type: grilling
Status: closed
Blocked by: none

## Question

What exact behavior must players observe after a transient socket loss, page refresh, control-service restart, match-runtime restart, deploy, or regional allocation failure? Define seat leases, resume-token lifetime, snapshot resynchronization, abandonment, result finalization, and the boundary between connection recovery and full match recovery.

## Answer

Launch promises **connection recovery** and **match survival across match-runtime process death**, with hard limits. Server/process faults never crown a winner; player abandonment can.

### Failure classes

| Failure | Player-visible outcome |
|---|---|
| Transient socket loss, refresh, Discord remount | Seat held; opponent sees pause modal; reclaim via durable player identity + match resume/join ticket; full authoritative snapshot on reclaim |
| Match-runtime crash, deploy kill, container death | New runtime restores from last checkpoint (≤ ~1–2s rewind). If not ready within ~15s → **void** |
| Incompatible deploy / protocol or sim version skew | Treat as runtime fault → **void** |
| Control-service restart while match runtime healthy | Match continues; clients reattach. Pause/forfeit rules apply only if the game socket actually drops |
| Allocation failure at start | Auto-retry **once**, then **cancel** (no win/loss) |
| Player missing past seat lease or disconnect budget | **Forfeit** that player |
| Both seats expire while paused | **Void** (no winner) |

### Connection recovery (healthy match runtime)

- Seat lease: **~60 seconds**
- Waiting player: match **pauses**; modal **“Opponent disconnected — waiting to reconnect…”**
- Reclaim credentials: durable player/session identity **plus** short-lived match-scoped resume/join ticket (TTL = seat lease; dies on forfeit/void)
- New `socket.id` after refresh is fine
- On reclaim: **full authoritative snapshot** replaces local client state
- Per-match disconnect budget: **3 pause episodes or 90s total paused disconnect time**, whichever first → **forfeit** that player

### Match / process recovery

- Authoritative sim may live in memory, but must be **checkpointed** often enough that restore loses at most ~**1–2 seconds** of play
- Restore wall-clock budget: ~**15 seconds**, then **void**
- Boundary: connection recovery = same runtime, seat reclaim + snapshot; process recovery = new runtime + checkpoint load, then same reclaim/snapshot path

### Results, replays, analytics

- Results **finalize immediately** on the terminal event: normal end, forfeit, or void. No grace rewrite; no launch ops overturn path
- Replays must mark disconnect, restore, and discontinuity points; **stitch segments when possible**
- Analytics must be cross-checkable with those markers (at least: `disconnect_start` / `reconnect` / `forfeit_abandon`, `restore_start` / `restore_ok` / `match_voided_runtime`, `alloc_fail` / `alloc_retry` / `match_cancel_alloc`)

### Explicit non-promises

- Unlimited stall via repeated disconnects (budget enforces)
- Lossless restore (1–2s rewind is accepted)
- Indefinite wait for a dead runtime (15s then void)
- Control-plane bounce killing a healthy match
