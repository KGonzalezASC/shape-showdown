# Measure the runtime and network budget

Type: task
Status: closed
Blocked by: none

## Question

What are the measured Bun memory floor, CPU and event-loop cost per active match, encoded bytes per player-second, reconnect rate, and client-measured RTT from a real Discord Activity? Produce the capacity and bandwidth inputs needed to compare a single service, warm regional pools, and per-match provisioning.

## Answer

Local Bun harness on Windows measured **one live 1v1 match** (today’s architecture: one `GameManager` per process). Evidence: [`measure-runtime-budget.result.json`](../measure-runtime-budget.result.json) from [`measure-runtime-budget.mts`](../measure-runtime-budget.mts) (`bun .scratch/production-multiplayer-deployment/measure-runtime-budget.mts`, 2026-08-15, Bun 1.3.11).

### Measured (local, single match)

| Input | Value | Notes |
|---|---|---|
| Process RSS floor (idle server, 0 players) | **~270 MB** | Windows Bun baseline dominates; use **delta**, not absolute floor, for packing math |
| RSS delta idle → playing 1v1 | **~8.6 MB** | Observed match incremental RSS |
| Heap used while playing | **~5.5–6.5 MB** | Sim state is small vs OS RSS |
| CPU while playing (light input) | **~9.2 ms CPU / wall-sec** | Process-wide; ~1% of one core |
| Event-loop lag while playing | p50 **~6 ms**, p95 **~9 ms**, max **~22 ms** | Contaminated by Windows timer granularity; not a pure sim cost |
| Netcast receive rate (observed) | **~17 msg/s / client** | Default target is 30 Hz (`NETCAST_HZ`); window included non-cascade play |
| Avg `gameState` UTF-8 JSON | **~8.2 KB / message** | Full `GameState` on the wire |
| Bytes / player-second (UTF-8 received) | **~139 KB/s** | Before WebSocket framing; `perMessageDeflate` may shrink |
| Fanout upper bound / match-second | **~277 KB/s** | Sum of both clients’ received UTF-8 |

### Capacity sketch (planning only)

- Rough CPU packing: **~100 matches / core** before 1.0 CPU-sec/sec if costs stay linear (unproven for multi-match-in-process).
- Rough RSS headroom: **~60 matches / 512 MB** using the **8.6 MB delta** (also unproven for shared process).
- **Caveat:** product today is **1 match/process**. Do not treat packing sketches as launch SLOs until ticket 06 defines the isolated multi-match boundary and this harness is re-run with N colocated matches.

### Reliability-contract implications (from ticket 01)

- Checkpointing for ≤1–2s rewind is **CPU/memory-cheap relative to netcast**: an ~8 KB state clone is on the same order as one netcast payload; the expensive part is **write frequency + restore path**, not holding one snapshot.
- Bandwidth, not CPU, is the first scaling pressure for many concurrent matches on one box if full JSON netcast stays at ~8 KB × tens of Hz.

### Explicitly unmeasured (still required for regional / host comparison)

| Input | Status |
|---|---|
| Client RTT from a **real Discord Activity** | **Unmeasured** — needs field probe; natural home is ticket 03 |
| Production **reconnect rate** | **Unmeasured** — no production traffic; instrument `disconnect_start` / `reconnect` after reliability ship |
| Seat-reclaim + snapshot resync cost | **Unmeasured** — reclaim not implemented yet |
| Multi-match-in-one-process scaling curve | **Unmeasured** — blocked on ticket 06 boundary |

### Planning inputs to use downstream (until Discord RTT arrives)

1. **Per-match bandwidth planning number:** **~150 KB/s / player** UTF-8 equivalent (~300 KB/s / match fanout) as a conservative local bound; re-measure with deflate and PublicPlayerState narrowing later.
2. **Per-match CPU planning number:** **~10 ms CPU / wall-sec** on this host class for one active 1v1 with light input.
3. **Per-match RSS delta planning number:** **~10 MB** (round up from 8.6).
4. **Process floor:** budget **~270 MB RSS** for the first Bun process on Windows-like hosts; expect different floors on Linux containers — **re-measure on the chosen launch host OS** in ticket 04.
5. **Discord RTT / Activity path:** do **not** pick regional providers until ticket 03 supplies Activity-measured RTT and endpoint rules.
