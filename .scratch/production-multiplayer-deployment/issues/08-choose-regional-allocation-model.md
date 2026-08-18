# Choose the regional allocation model

Type: research
Status: closed
Blocked by: 02, 03, 05, 06

## Question

After launch on Cloudflare Pages + Railway, which **Railway-centered** capacity model should allocate regional authoritative matches? Compare fixed regional Railway services, warm regional pools, per-match process allocation on Railway, and hybrid shapes using placement through Discord-safe patterns (ticket 03: prefer gateway **C** or finite mapped origins **A**; path routing **B** remains allowed). Judge startup time, Discord endpoint compatibility, lifecycle, reconnect, bandwidth, idle cost, occupied match-minutes, failure handling, and operational effort.

## Answer

### 1. Selected Model: Fixed Regional Railway Services (Model 1)

We select **Fixed Regional Railway Services** running the multi-match `MatchRegistry` defined in ticket 06, routed through Discord-safe **Option A** (Finite Mapped Origins).

- **Launch (Single Region):** One Railway service in Virginia (US-East) colocated with Railway Postgres. Discord mappings: `/` (Pages), `/socket.io` (Railway), `/api` (Railway).
- **Post-Launch Expansion:** Deploy an additional fixed Railway service in Europe. Add `/region-eu` to the Discord Developer Portal only when Europe goes live.

### 2. Comparison of the 4 Capacity Models

| Model | Match Startup Delay | Discord Compliance | Idle Cost | Operational Effort | Verdict |
|---|---|---|---|---|---|
| **1. Fixed Regional Services** | **0.0s (Instant)** | **PASS (Option A / B)** | Low (~$1.50/mo per region) | Low (Standard service deploy) | **SELECTED** |
| **2. Per-Match Containers** | 15–30s (Boot delay) | **FAIL (Option D Deny)** | High (Per-match provisioning) | High (Custom orchestrator) | **DISCARDED** |
| **3. Warm Regional Pools** | 0.5–2s | **FAIL (Dynamic hostnames)** | High (Idle container pool) | Medium (Pool manager needed) | **DISCARDED** |
| **4. Hybrid (Fixed + Autoscale)**| 0.0s baseline | **PASS (Option A / C)** | Dynamic | Medium | **FUTURE TRIGGER** |

### 3. Why the Alternatives Lost

- **Per-Match Containers:** Railway takes 15 to 30 seconds to boot a new container. Dynamic container hostnames violate Discord's URL mapping rules (Option D deny from ticket 03).
- **Warm Pools:** Keeping pools of idle containers consumes unnecessary RAM baselines (~157 MB floor measured in ticket 04).
- **Edgegap & Fly.io:** Discarded per ticket 04 decision to keep all backend services on Railway.

### 4. Regional Placement & Routing Architecture

1. **Central Coordination:** Matchmaking and Postgres live in Virginia. The control plane matches players based on shared geographic preference.
2. **Discord Activity Routing (Option A):** Discord clients route via mapped prefixes (`/socket.io` for US-East, `/region-eu` for Europe).
3. **Direct Web Routing:** Cloudflare Pages clients connect directly to the assigned regional Railway domain (`game-us-east.up.railway.app` or `game-eu.up.railway.app`).
4. **Fallback Invariant:** If a regional worker becomes unavailable, the control plane automatically falls back to US-East without failing match creation.
