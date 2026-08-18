# Choose the launch host and database

Type: research
Status: closed
Blocked by: 01, 02

## Question

Which US launch combination offers the best measured value for the control service, in-process match runtimes, and Postgres? Historical compare included Railway, Lightsail, Fly.io, and Azure student credit. **Decision:** Cloudflare Pages + Railway Virginia + Railway Postgres. Edgegap/Fly are discarded for launch and for later regional allocation (ticket 08).

## Decision (provisional)

Select this launch topology:

| Layer | Selection |
| --- | --- |
| Static client | Cloudflare Pages |
| Control/game service | Railway US East Metal, Virginia |
| Database | Railway Postgres, colocated in Virginia |
| Database networking | Railway private network |
| Staging tier | Railway Hobby |
| Public-production budget | Assume Railway Pro’s $20 minimum |
| Regional runtimes | Deferred to ticket 08 as Railway-centered capacity (Edgegap/Fly discarded) |

### Discord mappings

Finite, stable mappings only (ticket 03). Raw dynamic provider hostnames remain prohibited for Discord clients (Option D deny). Edgegap/Fly are out of the launch and regional plans.

| Activity path | Target |
| --- | --- |
| `/` | Cloudflare Pages production hostname |
| `/socket.io` | Railway game-service hostname |
| `/api` | Railway game-service hostname when introduced |

#### Client URL Resolution & CORS Contract
- **Discord Activity Client:** Connects to `window.location.origin` so traffic routes through Discord proxy mappings (`discordsays.com`).
- **Direct Web Client (Pages):** Connects to `gameServerUrl` from `game-config.json` (pointing directly to Railway).
- **Railway CORS Allowlist:** Express and Socket.IO on Railway allow origins matching `https://*.pages.dev` and `https://*.discordsays.com`. `http://localhost:*` is blocked in production unless a developer-only environment secret (`DEV_SECRET` / `ALLOW_LOCALHOST=true`) is explicitly configured in Railway.

### Why Railway

Railway is selected for launch because it provides:

- A Virginia region
- Documented Socket.IO support
- Generated HTTPS domains
- Isolated development, staging, and production environments
- Private service-to-Postgres networking
- Health-gated deployments
- Configurable SIGTERM drain and deployment overlap
- Application rollback to retained deployments

Railway is **not** selected because it is proven cheapest at scale. It is selected because it appears to offer the best launch balance between operational effort, Bun/Socket.IO fit, and iteration speed.

### Why Cloudflare Pages

The client is already a distinct static artifact. Pages:

- Charges $0 for static asset requests under its current policy
- Keeps client downloads off Railway’s metered egress
- Allows UI releases without replacing the authoritative process
- Provides preview and production deployments

Pages does **not** reduce Socket.IO gameplay traffic. That remains Railway egress.

### Measured cost implication (from ticket 02)

Ticket 02 measured a conservative uncompressed fanout of approximately **300 KB/s per match** (~277 KB/s fanout upper bound in the harness writeup).

Planning ceiling (not a bill forecast):

| Active match-hours | Gameplay egress ceiling | Railway egress (order-of-magnitude) |
| --- | --- | --- |
| 100 | ~100 GB | ~$5 |
| 500 | ~500 GB | ~$25 |
| 1,000 | ~1 TB | ~$50 |

Socket.IO compression and narrower public snapshots may reduce this materially.

**Conclusion:** bandwidth is the first measured cost pressure. Incremental match CPU and memory are currently much smaller.

### Why the alternatives lost

| Alternative | Reason it lost for launch |
| --- | --- |
| DigitalOcean App Platform + managed Postgres | Strongest runner-up at roughly $25–27 base; database is genuinely managed, but long-duration Socket.IO behavior still needs proof |
| Lightsail + managed Postgres | Roughly $22–27 with excellent included transfer, but requires OS, proxy, deployment, and monitoring administration |
| Fly + Fly Managed Postgres | Lost for launch (~$47 central stack). **Not retained** for ticket 08 regional work; Edgegap/Fly discarded in favor of Pages + Railway only |
| Azure/DigitalOcean student credit | Useful for experiments, but temporary credit cannot determine the post-credit architecture |

Railway should be **reconsidered** if measured gameplay egress makes a fixed-transfer VPS materially cheaper after including the labor of operating it.

### Accepted limitations

- Railway Postgres is not a fully managed database service.
- One Railway application replica is required while live matches remain in-process.
- Railway rollback restores application code and configuration; it does not reverse database migrations.
- Platform drain settings do not implement stop-admitting, checkpointing, or match restoration for us (tickets 01 / 06 / 09 own those product behaviors).
- Pages and Railway releases require protocol-version compatibility because they deploy independently.
- PgBouncer is not included initially. A bounded Bun connection pool is sufficient until measured connection pressure proves otherwise.

### Remaining staging evidence (historical checklist)

Originally keep open until recorded:

1. Linux Bun idle RSS on Railway — **done**
2. One-match and small N-match CPU, memory, and compressed egress — **done (N=1)**; small-N>1 blocked on ticket 06
3. A 30–60 minute Socket.IO soak — **done** (also resolves WS 15‑min docs contradiction: stayed up)
4. Direct-browser and Discord-mapped RTT to Virginia — **direct done**; Discord-mapped → **ticket 09**
5. Twenty-four-hour idle application and Postgres cost — **accepted gap** (not waited); use ongoing `railway usage` / workspace billing under ticket 09 ops
6. Deploy while clients connected (health / SIGTERM / reconnect / stable hostname) — **done**
7. One Railway application rollback — **done**
8. One Postgres backup restore into a non-production environment — **waived**: current plan does not expose volume/PITR backups (owner decision 2026-08-17). Re-run when plan includes backups; track under ticket 09 release gates if needed.

Full checkpoint restoration against the 15-second reliability budget remains ticket 06/09 work because the isolated match-runtime boundary is not implemented yet.

## Closure verdict

**Closed (with accepted gaps).** Launch topology stands: **Cloudflare Pages + Railway Virginia + Railway Postgres**.

Staging proved Socket.IO fit, idle/play resource ballpark, soak longevity, deploy reconnect, and app rollback. No host-change blocker found.

**Accepted gaps (the “done*”):**
- Postgres **backup restore** — unavailable on current plan; not a reason to reopen host selection
- **24h idle cost** snapshot — not collected; monitor usage in ticket 09
- **Discord-mapped** Virginia RTT — ticket 09 (permanent mappings)
- **Small-N>1** packing — ticket 06

First public production release and permanent Discord mappings remain **ticket 09**. Pages Production → Railway staging wiring fix also remains **ticket 09**.

## Staging evidence log (2026-08-17)

### Surfaces

| Surface | Value |
| --- | --- |
| Pages client | `https://shape-showdown.pages.dev/` |
| Railway game hostname | `https://shape-showdown-staging.up.railway.app` |
| Active deployment (pre-redeploy probe) | `b7991419-ee46-4b1d-86f2-8a96565be382` (SUCCESS, commit `d3109c4`) |
| Region / replicas | `us-east4-eqdc4a`, 1 replica; drain 30s; overlap 30s; health `/health` |

### Completed

| Item | Result |
| --- | --- |
| Pages → Railway Socket.IO connect | Pass (earlier handoff; socket id observed) |
| Two-tab `playing` | Pass (stable match on Pages; observer client saw live match) |
| `/health` | `ok` HTTP 200 |
| Direct workstation RTT (CLI/fetch, n=20) | Health p50 **24.9 ms** / p95 **30.1 ms**; Socket.IO polling p50 **24.8 ms** / p95 **28.4 ms**. Artifact: `measure-railway-staging-rtt.result.json` |
| Direct-browser RTT (Pages client → Railway) | Stable during match; earlier samples ~22 ms ping / ~45 ms rtt on observer client |
| Baseline metrics (1h window, during live play) | CPU avg **0.007** / current **0.060** vCPU (limit 2); memory avg **96 MB** / current **282 MB** (limit ~1024 MB); public egress current **~15.8 MB** / max **~18.2 MB** in window |
| Idle Linux RSS (Railway staging) | **Pass.** After restart + 90s quiet: platform memory **current ≈ 157 MB** (max ≈ 157 MB in 2m window; avg ≈ 112 MB includes restart ramp). CPU ~0, egress current 0. Post-soak settle before restart was ~284 MB. Artifact: `measure-railway-staging-idle-rss.result.json`. Note: Railway metrics container memory, not `/proc` VmRSS (SSH needs a local key). |
| 30–60 min Socket.IO soak | **Pass.** `2026-08-17T03:10:19Z` → `03:45:19Z` (**35 min**). Held 1/2 seats. disconnects 2, connectErrors 0, reconnects 1 (deploy), reconnectFailed 0. Stayed up past 15 minutes (no silent WS drop). Artifact: `soak-railway-staging-socketio.result.json`. |
| One-match CPU / mem / egress (N=1) | **Pass (N=1 only).** Timed 300s 1v1 on staging `2026-08-17T14:14:31Z`→`14:19:31Z`, both clients `playing`. **CPU** avg **0.044** vCPU / max **0.074** (limit 2). **Memory** current/max **~350 MB** (pre-match quiet ~56 MB same morning; cold-idle floor ~157 MB). **UTF-8 gameState** fanout **~455 KB/s** (~228 KB/s/player, ~28 msg/s, max msg ~8.3 KB) — planning bound before framing. **Railway public TX** during match buckets **~500–600 KB/s** (~0.015–0.018 GB per 30s); on-wire ≈ UTF-8 bound (`perMessageDeflate` on, no large platform-visible shrink). **Small-N>1:** not measurable on one replica (max 1 match/process; ticket 06). Artifact: `measure-railway-staging-one-match.result.json`. |

### In progress / remaining

| Item | Status |
| --- | --- |
| Deploy while clients connected | **Pass (staging evidence).** Redeploy `7311d276-05c8-4f4d-9469-018542635583` from prior `b7991419…`. New deployment reached SUCCESS with `/health` = `ok`. Hostname unchanged: `shape-showdown-staging.up.railway.app`. Connected soak client: `transport close` at `03:13:16Z` → `reconnect_attempt 1` → `reconnect 1` → new socket id `FdOH22ObhBEpCuXlAAAB`. Overlap/drain settings were 30s/30s. App logs did not print an explicit `SIGTERM` string; client drop + reconnect after health-gated SUCCESS is the observed contract. |
| Application rollback | **Pass.** Dashboard rollback created deployment `8b86b294-6654-4301-bc97-f8b79b5edf7d` (`reason: rollback`, commit `d3109c4`, SUCCESS). Prior active redeploy `7311d276…` → REMOVED. `/health` = `ok` HTTP 200. Hostname unchanged: `shape-showdown-staging.up.railway.app`. Verified `2026-08-17T16:45Z` UTC. |
| Postgres backup restore (non-prod) | **Waived (plan).** Volume/PITR backups not available on current plan; owner closed ticket 04 without this proof (2026-08-17). Revisit when plan includes backups (ticket 09 ops gate if desired). |
| 24h idle app + Postgres cost | **Accepted gap.** Not collected as a dedicated 24h sample; monitor via `railway usage` / workspace billing under ticket 09. |
| Discord-mapped RTT to Virginia | Deferred to ticket 09 mappings; do not claim verified. |
| Small-N>1 match packing | **Blocked** on ticket 06 (one match per process today). |

### Notes

- Railway root `GET /` returning `Cannot GET /` is expected (game service only).
- Do not hardcode Railway URL into repo `public/game-config.json`; Pages build injection remains correct.
- **Env naming trap (deferred to ticket 09):** Pages Production currently points at Railway staging (`shape-showdown.pages.dev` → `shape-showdown-staging.up.railway.app`). Owner confusion recorded in `09-define-release-and-operations-contract.md`. Safe for staging evidence; fix wiring before real players.
