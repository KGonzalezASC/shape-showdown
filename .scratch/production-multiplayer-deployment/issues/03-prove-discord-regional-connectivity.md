# Prove Discord connectivity to regional match endpoints

Type: prototype
Status: closed
Blocked by: none

## Question

Can a production Discord Activity connect through approved URL mappings to a dynamically assigned regional WSS endpoint? Compare finite preconfigured regional origins, stable regional paths, a distributed WebSocket gateway, and provider-issued dynamic hostnames and ports. Record which options preserve regional latency and satisfy Discord's networking rules.

## Option A — Finite preconfigured regional origins

### Verdict

**PASS (connectivity / Discord allowlist).** A Discord Activity can use a finite set of preconfigured URL-mapping targets. Socket.IO polling handshakes succeed against each mapped regional prefix through `*.discordsays.com`. Switching regions is choosing another pre-registered mapping; no dynamic hostname is required.

**Regional latency:** Not demonstrated on a single machine. East and west RTTs are similar because both tunnels terminate on the same PC. Option A remains viable for Discord compliance; geo RTT must be re-measured when real multi-region hosts exist.

### Shape under test

| Role | Local port | Public host |
| --- | --- | --- |
| Root UI / east match | `3000` | `sterling-webster-rail-manager.trycloudflare.com` |
| West match | `3001` | `bond-fuji-cigarettes-previous.trycloudflare.com` |

Discord URL Mappings used:

| Prefix | Target |
| --- | --- |
| `/` | `sterling-webster-rail-manager.trycloudflare.com` |
| `/region-east` | `sterling-webster-rail-manager.trycloudflare.com` |
| `/region-west` | `bond-fuji-cigarettes-previous.trycloudflare.com` |

Harness: `.scratch/production-multiplayer-deployment/measure-option-a-rtt.mts`  
Evidence: `.scratch/production-multiplayer-deployment/measure-option-a-rtt.result.json`

### Results

| Check | Result |
| --- | --- |
| East direct Socket.IO | **PASS** 5/5 |
| West direct Socket.IO | **PASS** 5/5 |
| East via Discord proxy `/region-east` | **PASS** 5/5 |
| West via Discord proxy `/region-west` | **PASS** 5/5 |

### RTT samples (ms)

| Target | ok | min | p50 | mean | max |
| --- | --- | --- | --- | --- | --- |
| east-direct | 5/5 | 49.7 | 54.1 | 122.1 | 395.6 |
| west-direct | 5/5 | 49.7 | 56.2 | 113.7 | 352.8 |
| east-via-discord-proxy | 5/5 | 58.8 | 62.2 | 91.4 | 208.8 |
| west-via-discord-proxy | 5/5 | 55.2 | 64.0 | 64.7 | 79.7 |

## Option B — Stable regional paths (single origin)

### Verdict

**PASS (path routing on one public origin).** One Cloudflare host fronts a path router. `/region/east/...` and `/region/west/...` strip the prefix and forward to separate local Bun match processes. Socket.IO polling handshakes succeed for both paths through the single origin.

**Discord proxy closeout:** Deferred (moved on to Option C). Direct single-origin path routing already **PASS**.

### Shape under test

| Layer | Detail |
| --- | --- |
| Discord mapping | Prefix `/` only → single root host |
| Path router | Bun on `:3002` (`.scratch/.../option-b-path-router.mts`) |
| East backend | Bun `:3000` via `/region/east/*` |
| West backend | Bun `:3001` via `/region/west/*` |
| Live root host (at B measure time) | `applying-follow-surfaces-transmit.trycloudflare.com` |

Harness: `.scratch/production-multiplayer-deployment/measure-option-b-rtt.mts`  
Evidence: `.scratch/production-multiplayer-deployment/measure-option-b-rtt.result.json`

### Results

| Check | Result |
| --- | --- |
| Local path router health / east / west Socket.IO | **PASS** |
| Root UI health via public tunnel | **PASS** 5/5 |
| East path via public tunnel | **PASS** 5/5 |
| West path via public tunnel | **PASS** 5/5 |
| East/west via `discordsays.com` paths | Deferred (stale Discord Target when measured) |

### RTT samples (ms) — direct single origin

| Target | ok | min | p50 | mean | max |
| --- | --- | --- | --- | --- | --- |
| root-ui-health-direct | 5/5 | 53.4 | 65.2 | 468.0 | 2082.3 |
| east-path-direct | 5/5 | 53.3 | 68.3 | 68.5 | 91.9 |
| west-path-direct | 5/5 | 53.0 | 64.7 | 67.3 | 82.1 |

### Ops notes

- Option B does not need Discord `/region-*` Target rows; region is a path on the one approved origin.
- Path router proxies HTTP/polling for the probe. WebSocket upgrade is not proxied in this scratch router.

## Option C — Distributed WebSocket gateway

### Verdict

**PASS (gateway allocation routing on one public origin).** Clients use a single gateway host and a normal `/socket.io` path. The gateway chooses east/west from an allocation hint (`region` or `matchId` query — stand-in for resume-ticket ownership) and returns `x-option-c-region` / `x-option-c-backend` proving which runtime received the handshake. Regional hosts are not client-facing.

**Discord proxy closeout:** Owner updated root Target to the live gateway host during Option D work. Direct gateway evidence remains the C connectivity proof; Discord proxy rows for C were stale before that update.

**Gateway hop:** Present. Direct gateway Socket.IO p50 ≈ 57–60 ms on this machine (similar to B path p50; no extra multi-hop WAN in this lab).

### Shape under test

| Layer | Detail |
| --- | --- |
| Discord mapping | Prefix `/` only → gateway host |
| Gateway | Bun on `:3003` (`.scratch/.../option-c-gateway.mts`) |
| East runtime | Bun `:3000` |
| West runtime | Bun `:3001` |
| Live root host | `ray-cruise-officially-rhode.trycloudflare.com` |

Harness: `.scratch/production-multiplayer-deployment/measure-option-c-rtt.mts`  
Evidence: `.scratch/production-multiplayer-deployment/measure-option-c-rtt.result.json`

Required Discord URL Mapping (only row):

| Prefix | Target |
| --- | --- |
| `/` | `ray-cruise-officially-rhode.trycloudflare.com` |

### Results

| Check | Result |
| --- | --- |
| Local gateway east alloc → `:3000` | **PASS** |
| Local gateway west alloc → `:3001` | **PASS** |
| Public gateway health | **PASS** 5/5 |
| Public `/socket.io` + `region=east` | **PASS** 5/5 (`x-option-c-region: east`) |
| Public `/socket.io` + `region=west` | **PASS** 5/5 (`x-option-c-region: west`) |
| Public `/socket.io` + `matchId=…` sticky assign | **PASS** 5/5 |

### RTT samples (ms) — direct gateway

| Target | ok | min | p50 | mean | max |
| --- | --- | --- | --- | --- | --- |
| gateway-health-direct | 5/5 | 45.0 | 50.9 | 110.1 | 352.1 |
| socket-east-alloc-direct | 5/5 | 47.2 | 56.7 | 73.1 | 144.2 |
| socket-west-alloc-direct | 5/5 | 47.2 | 60.3 | 84.0 | 163.6 |
| socket-matchId-sticky-a-direct | 5/5 | 44.5 | 59.2 | 74.1 | 149.8 |
| socket-matchId-sticky-b-direct | 5/5 | 44.8 | 62.7 | 66.7 | 116.5 |

### Ops notes

- Client never opens a regional hostname; only the gateway origin is Discord-mapped.
- Allocation hint today is query `region` / `matchId`. Production should replace that with resume-ticket → ownership lookup inside the gateway (still proxy-only; not a second sim authority).
- Scratch gateway proxies Engine.IO polling only (no WS upgrade), same as the Option B probe router.

## Option D — Provider-issued dynamic hostnames and ports

### Verdict

**DENY for Discord Activities (without pre-registration).** A fresh provider-style hostname can accept Socket.IO directly, but the Discord Activity proxy cannot reach that host when it was unknown at URL-mapping config time. Unmapped `discordsays.com` paths return the Activity HTML shell, not an Engine.IO handshake. Inventing `/.proxy/<external-host>/...` does not create an allowlisted route.

**Implication:** Edgegap/Fly-style join tickets that embed a brand-new `host:port` cannot be used as the Activity's Socket.IO URL unless that host is already covered by a Discord URL Mapping (finite list like A, path on one origin like B, or gateway like C). True dynamic D is rejected by Discord's sandbox.

**Untested variant:** Discord parameter matching such as `/dyn/{sub}` → `{sub}.provider.example` might allow a *constrained* hostname pattern. That is still pre-registered policy, not open-ended D. Not probed in this ticket.

### Shape under test

| Role | Host |
| --- | --- |
| Mapped Activity/gateway origin (control) | `ray-cruise-officially-rhode.trycloudflare.com` |
| Unmapped dynamic "match box" | `container-expires-latitude-looking.trycloudflare.com` → local `:3000` |

Harness: `.scratch/production-multiplayer-deployment/measure-option-d-rtt.mts`  
Evidence: `.scratch/production-multiplayer-deployment/measure-option-d-rtt.result.json`

### Results

| Check | Result |
| --- | --- |
| Dynamic host direct Socket.IO | **PASS** 5/5 (endpoint is real) |
| Mapped gateway control Socket.IO | **PASS** 5/5 |
| `discordsays.com/provider-dynamic/...` (unmapped path) | **No Socket.IO** (HTML shell; 0/5 handshakes) |
| `discordsays.com/.proxy/<dynamic-host>/...` | **No Socket.IO** (HTML shell; 0/5 handshakes) |

Probe verdict field: `DENY_FOR_DISCORD_ACTIVITY`.

### RTT samples (ms)

| Target | socket pass | p50 |
| --- | --- | --- |
| dynamic-host-direct-socket | 5/5 | ~65.7 |
| mapped-gateway-control-socket | 5/5 | ~66.5 |
| discordsays unmapped / alias attempts | 0/5 | — |

## Ticket 03 recommendation

| Option | Discord Activity | Notes |
| --- | --- | --- |
| A Finite regional origins | **Allowed** | Multiple mapped Targets; portal churn per region |
| B Stable regional paths | **Allowed** | One mapped origin; path fan-out on your edge |
| C Gateway | **Allowed** | One mapped origin; sticky alloc to hidden runtimes; best fit for resume-ticket reclaim |
| D Dynamic provider host:port | **Rejected** | Unknown hosts cannot be opened from the Activity sandbox |

**Launch (colocated):** One Discord-mapped origin (B or C with a single backend) is enough.

**Later regional allocation:** Prefer **C** (stable gateway + ownership lookup) or **A** (small fixed regional allowlist). Do not design join tickets around raw provider hostnames for Discord clients. Web/itch guests outside Discord may still use direct endpoints if product policy allows.

**Regional latency:** One-machine lab cannot prove geo RTT preservation. Re-measure A/B/C against real multi-region hosts before locking latency SLOs. Gateway (C) adds a hop that must be re-checked on WAN.

**Activity RTT samples collected:** Option A via `discordsays.com` ~62–64 ms p50; B/C direct public ~50–68 ms p50 on this PC. Production Discord proxy RTT for B/C should be re-sampled after stable non-tunnel hosts exist.

## Prior session foundation

Single-origin Activity play session, Option A multi-host allowlist, Option B path routing, Option C sticky gateway, and Option D deny are now evidenced under `.scratch/production-multiplayer-deployment/`.
