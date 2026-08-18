# Shape Showdown production multiplayer deployment

Label: `wayfinder:map`

## Destination

A decision-complete architecture and phased delivery plan for launching Shape Showdown with durable identity, matchmaking, lobbies, reconnect, analytics, and multiple isolated two-player matches, then extending the same control plane to dynamically provision regional authoritative game servers without a rewrite.

## Notes

- This map covers production architecture and deployment preparation. It does not authorize source-code changes.
- The client is one static Vite application used by Discord Activities and direct web guests.
- Discord identity and guest identity enter separate trust flows, then normalize into one server-issued player and session model.
- Matchmaking, lobby membership, match assignments, results, and analytics events must survive control-service restarts.
- Live authoritative simulation remains owned by exactly one match runtime. Do not write 60 Hz state to the product database.
- The first deployment may run the control plane and many isolated two-player match runtimes in one service and one region.
- The later deployment must allocate whole matches to regional game-server containers on Railway through a Discord-safe allocation pattern (ticket 03: prefer C or A; Edgegap/Fly discarded).
- Discord compatibility with dynamic regional WSS endpoints is a proof gate, not an assumption.
- Cost decisions must include compute, database, bandwidth, static egress requirements, operational labor, and the cost after any temporary credit expires.
- Heroku is excluded by product-owner preference.
- Historical PAM code is evidence for useful control-plane patterns, not a template to copy wholesale.
- Every session working this map should use the `why`, `domain-modeling`, and `poteto-mode` skills where relevant.

## Decisions so far

- [Define the player and match reliability contract](issues/01-define-reliability-contract.md) — Connection + process recovery with limits: ≤1–2s checkpoint rewind, 15s restore or void, 60s seat lease + pause modal, 3/90s disconnect budget → forfeit, identity+resume ticket, full snapshot reclaim, alloc retry-once then cancel, immediate result finalization, replay/analytics discontinuity markers.
- [Measure the runtime and network budget](issues/02-measure-runtime-and-network-budget.md) — Local Bun 1v1: ~10 MB RSS delta/match, ~10 ms CPU/wall-sec, ~8.2 KB gameState JSON, ~150 KB/s/player UTF-8 planning bound; Discord Activity RTT and production reconnect rate still unmeasured.
- [Prove Discord regional connectivity](issues/03-prove-discord-regional-connectivity.md) — **Closed.** A/B/C allowed (one-machine connectivity). D **denied** for Discord Activities (unmapped dynamic host cannot Socket.IO via `discordsays.com`). Prefer C (or A) for later regional alloc; do not use raw provider host:port join URLs inside Activities. Geo RTT still needs real multi-region hosts.
- [Choose the launch host and database](issues/04-choose-launch-host-and-database.md) — **Closed (done*):** Cloudflare Pages + Railway Virginia + Railway Postgres. Staging proved soak, idle/play metrics, deploy reconnect, rollback. **Waived/deferred:** Postgres backup restore (plan), 24h idle cost sample, Discord-mapped RTT (→09), small-N>1 (→06). Bandwidth remains first cost pressure (~ticket 02 / staging ~500–600 KB/s on-wire per match).
- [Define the durable control-plane model](issues/05-define-durable-control-plane-model.md) — **Closed.** Postgres owns players, sessions, 10s queue/lobby leases, matches, 60s seat tickets, results, and 1-2s checkpoints. Match runtime memory owns 60 Hz simulation, sockets, and pause budgets.
- [Define the isolated match-runtime boundary](issues/06-define-isolated-match-runtime-boundary.md) — **Closed.** Split singleton GameManager into MatchRegistry (factory + routing), MatchRunner (isolated 1v1 lifecycle + 60 Hz loop), MatchPersistence (checkpoint + result writer). Constructor injection, explicit dispose teardown, SIGTERM drain, control-plane-owned 15s void timer, checkpoint resumption. Engine unchanged.
- [Define the analytics event and retention policy](issues/07-define-analytics-policy.md) — **Closed.** Lifecycle, reliability, and shop events appended to Postgres `analytics_events`. 30-day raw retention with daily pruning, 180-day match results, 1-year daily rollups. Asynchronous export to Neon triggered on >10% CPU, >500k events/day, or >10 GB table size.
- [Choose the regional allocation model](issues/08-choose-regional-allocation-model.md) — **Closed.** Fixed Regional Railway Services (multi-match in-process) using Discord Option A mappings. Single Virginia region at launch; European service added post-launch with `/region-eu`. Per-match containers and warm pools discarded.
- [Define the release and operations contract](issues/09-define-release-and-operations-contract.md) — **Closed.** Isolated staging/prod lanes, `/health` database ping gate, 180s graceful match drain with checkpoint flush, additive SQL migrations, Sentry error alerts, Railway spend caps, daily snapshot backup risk accepted.
- [Publish the decision-complete production architecture](issues/10-publish-decision-complete-architecture.md) — **Closed.** Published [`production-architecture.md`](production-architecture.md) with the launch topology, ownership boundary, checkpoint and reconnect contract, artifact and release workflow, observability, cost envelope, regional path, migration triggers, accepted risks, and phased implementation plan.

## Open evidence and implementation work

- Ticket 10 fixes a versioned full-runtime checkpoint envelope with a one-second target cadence and two retained rows. Phase 2 must prove the ≤1–2s rewind and 15s restore budgets under real host measurements.
- Production Discord Activity RTT on stable non-tunnel hosts and reconnect rate under real players (ticket 04 staging evidence + post-reliability instrumentation). Geo differentiation across regions still unmeasured.
- Ticket 10 defines evidence triggers for extracting matchmaking coordination into Redis or another dedicated system. Start with database-backed leases unless measured queue latency, lock waits, or database CPU cross the release thresholds.
- Ticket 10 defines the control-plane replication trigger. Regional match workers do not by themselves require a replicated control plane. Launch requires one Railway replica while matches stay in-process.
- Linux-container RSS floor on Railway — **measured in ticket 04** (~157 MB cold idle staging); packing math can use that floor going forward.
- Whether measured Railway gameplay egress makes a fixed-transfer VPS cheaper after labor (revisit Railway vs Lightsail/DO). Staging on-wire ~500–600 KB/s per active match informs that revisit. Ticket 10 requires two consecutive billing periods before changing hosts.

## Out of scope

- Gameplay, art, balance, and responsive-layout changes.
- N-player simulation and spectator-mode implementation. The architecture must avoid preventing them, but this effort plans the two-player production path.
- Monetization, wallet, wagering, and PAM operator workflows.
- Building a general-purpose platform for multiple games.
- Selecting infrastructure because a temporary student credit makes an otherwise poor long-term fit look free.
