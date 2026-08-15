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
- The later deployment must allocate whole matches to regional game-server containers through a provider-neutral allocation contract.
- Discord compatibility with dynamic regional WSS endpoints is a proof gate, not an assumption.
- Cost decisions must include compute, database, bandwidth, static egress requirements, operational labor, and the cost after any temporary credit expires.
- Heroku is excluded by product-owner preference.
- Historical PAM code is evidence for useful control-plane patterns, not a template to copy wholesale.
- Every session working this map should use the `why`, `domain-modeling`, and `poteto-mode` skills where relevant.

## Decisions so far

- [Define the player and match reliability contract](issues/01-define-reliability-contract.md) — Connection + process recovery with limits: ≤1–2s checkpoint rewind, 15s restore or void, 60s seat lease + pause modal, 3/90s disconnect budget → forfeit, identity+resume ticket, full snapshot reclaim, alloc retry-once then cancel, immediate result finalization, replay/analytics discontinuity markers.
- [Measure the runtime and network budget](issues/02-measure-runtime-and-network-budget.md) — Local Bun 1v1: ~10 MB RSS delta/match, ~10 ms CPU/wall-sec, ~8.2 KB gameState JSON, ~150 KB/s/player UTF-8 planning bound; Discord Activity RTT and production reconnect rate still unmeasured.

## Not yet specified

- Checkpoint payload shape and write cadence needed to hit the ≤1–2s rewind and 15s restore budgets under real host measurements (feeds ticket 06; cost order suggested by ticket 02 netcast-sized snapshots).
- Discord Activity client RTT and reconnect rate under real players (ticket 03 + post-reliability instrumentation).
- Whether regional capacity should use per-match allocation, warm regional pools, or a hybrid. This depends on startup latency, match traffic, provider behavior, and measured demand.
- Whether analytics remain in the product Postgres database or export to an analytical store. This depends on event volume, query load, retention, and privacy decisions.
- The scale threshold for extracting matchmaking coordination into Redis or another dedicated system. Start with database-backed leases unless measurement proves otherwise.
- The scale threshold for more than one control-service replica. Regional match workers do not by themselves require a replicated control plane.
- Linux-container RSS floor on the eventual launch host (re-measure; Windows Bun ~270 MB floor is not portable).

## Out of scope

- Gameplay, art, balance, and responsive-layout changes.
- N-player simulation and spectator-mode implementation. The architecture must avoid preventing them, but this effort plans the two-player production path.
- Monetization, wallet, wagering, and PAM operator workflows.
- Building a general-purpose platform for multiple games.
- Selecting infrastructure because a temporary student credit makes an otherwise poor long-term fit look free.
