# Engineering Shape Showdown: Architecture, Deterministic Simulation, and Multi-Agent Development

**Author:** Keith Gonzalez  
**Repository:** [KGonzalezASC/shape-showdown](https://github.com/KGonzalezASC/shape-showdown)  
**Date:** August 2026  

---

### Abstract

This paper documents the technical architecture, development lifecycle, and distribution pivot of Shape Showdown, a server-authoritative falling-shape puzzle game. Originally forked from BubbleBlitzersJS in April 2026, the project underwent a structural overhaul across five months. I rebuilt the rendering pipeline from DOM elements to a dedicated 2D canvas running a Voronoi tissue field simulation, isolated the game physics behind a deterministic simulation seam, designed a four-step heuristic AI bot solver with visibility-aware frontier risk analysis, and created a dual-pane replay diagnostic suite. The development was conducted using a multi-agent workflow spanning 259 logged sessions across OpenAI Codex, Antigravity, OpenCode, Cursor CLI, and Cursor IDE. Later in development, the project pivoted toward Discord Activities and Cloudflare Pages. This required a durable PostgreSQL control plane, state recovery with a 60-second seat lease, and binary delta wire compression that cut per-seat egress bandwidth by 49%. This report analyzes the technical trade-offs, economics, and architectural decisions made throughout the project.

---

### 1. Origins and the initial state

In April 2026, I began developing Shape Showdown by forking AVLitskevich's open-source BubbleBlitzersJS repository (`abb23db`). The upstream codebase provided a working concept for a real-time multiplayer puzzle game, but suffered from severe architectural limitations:

1. **Client-side execution and security exposure.** Unlike compiled Unity WebGL bundles, the original game ran directly in browser JavaScript with loosely coupled client state. Any player could modify local memory or intercept unvalidated WebSocket packets to manipulate board grids, piece queues, and garbage counters.
2. **DOM layout overhead on mobile devices.** Playfields, tetromino pieces, and shop cards were rendered as nested DOM `div` nodes. Under active piece gravity and rapid garbage injections, mobile browsers experienced frame drops and layout reflows.
3. **Fragile deployment pipelines.** Early deployment relied on Node.js Docker containers on a shared Linux VPS. Container startup overhead and memory footprints made rapid rollouts slow and expensive.

```
[BubbleBlitzersJS Upstream] 
       │ (Fork: abb23db)
       ▼
[Client Hardening & Security Audit] ──► [Move to Bun Native Binary (7deb9e5)]
       │
       ▼
[Mobile Touch Normalization] ────────► [DOM Layout Cleanup (4da639e)]
```

My initial work focused on stabilizing this baseline. In commit `7deb9e5`, I replaced the Node and Docker toolchain with Bun, compiling the server into a single native binary managed by systemd (`2d1bbdb`). This dropped server memory usage to under 45 MB and cut deploy cycles from minutes to seconds. Next, I normalized mobile touch events and view scaling (`4da639e`, `96b8386`), converting mobile buttons from selectable text to proper touch targets with independent layout rails.

---

### 2. Rendering pipeline and visual identity

To give Shape Showdown a distinct identity and eliminate layout thrashing, I migrated the board renderer from DOM nodes to an HTML5 2D Canvas in commit `d9aeae9`. 

The new rendering engine treats the board as an organic tissue matrix. Instead of flat rectangles, locked blocks and active shapes are visualized through a dynamic Voronoi cell system. Each cell's boundary morphs based on neighbor adjacency and active field effects:

* **Tissue matrix flowfield.** Cells subtly shift during soft drops and piece translations (`6d169c5`, `c781858`), locking into crisp grid alignments upon placement (`51542d0`).
* **Continuous poison propagation.** The poison mechanic renders as an animated viscous fluid spreading across infected mino cells (`e9ad096`), calculating liquid boundaries on each render tick without affecting underlying board state.
* **Landing forecasts and impact dissolves.** Hard-drop impacts trigger a temporary forecast dissolution animation (`5484ac8`, `4176117`), which was separated from network state synchronization (`823510b`) to prevent visual latency over jittery connections.

The playfield dimensions were standardized to a 10-column by 18-row visible arena backed by a 10x20 simulation grid (`3ef9bf3`, `dcf2609`). The two hidden rows allow pieces to spawn, rotate, and buffer without clipping through the ceiling.

---

### 3. Deterministic simulation and the solver engine

A central requirement for competitive fairness and automated testing was absolute determinism. In August 2026, I isolated the simulation engine behind a strict observation seam (`8264e3c`, `e22f114`).

```
┌─────────────────────────────────────────────────────────┐
│              Deterministic Game State                   │
│  - 10x20 Grid (2 hidden spawn rows)                     │
│  - Fixed-tick 60Hz physics clock                        │
│  - Garbage queue (48-tick single, 18-tick multi delay)  │
└───────────────────────────┬─────────────────────────────┘
                            │
               [Player-Limited Observation Seam]
               (Eliminates absolute clock leak)
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│                 Heuristic Bot Solver                     │
│  1. Candidate Placement Enumeration (Rotations & Wells)  │
│  2. Urgency-Weighted Garbage Cancellation                │
│  3. Visibility-Aware Cavity Depth Penalty                │
│  4. Curtain Unknown-Frontier Risk Scoring                │
└──────────────────────────────────────────────────────────┘
```

#### Eliminating observation leakage
Early AI bot implementations suffered from clock leakage, evaluating moves using wall-clock timestamps rather than internal game ticks. In commit `2b94868`, I sealed the observation boundary. Bots can only query state that a human player can see on the current tick.

#### The four-step heuristic solver
The solver evaluates every legal candidate placement on a tick and assigns a composite score based on four stages:

1. **Topological scoring.** Evaluates line clears, stack height, bumpiness, deep spires, and accessible wells (`b572825`).
2. **Urgency-weighted garbage cancellation.** Analyzes pending incoming lines. Commit `d5a1131` introduced asymmetric garbage delays: single line clears take 48 ticks to arrive, whereas multi-line clears arrive in 18 ticks. The bot calculates whether to clear lines immediately to cancel damage or build a larger attack (`f19624c`).
3. **Visibility-aware cavity depth.** Measures buried holes beneath the stack frontier. Rather than treating all holes equally, the solver computes column-wise access costs (`78df978`).
4. **Curtain frontier risk.** When the opponent activates the Curtain powerup, obscuring upper rows, the bot shifts from aggressive stacking to safe, low-variance placements along the known stack floor (`31cc660`).

#### Empirical pricing and powerup balancing
Using automated headless test runners (`fe64dca`, `ba0bf93`), I executed thousands of simulated matches across 50 distinct random seeds to establish win-rate deltas for each powerup item. By running 3-arm compound treatment trials (`a1c5c64`, `ce73ee1`), I mapped win-rate improvements directly to shop gold prices in `docs/POWERUP_PRICING_CURVE.md`:

| Powerup | Base Win-Rate Delta | Garbage Delay Impact | Gold Cost | Primary Tactical Function |
|---|---|---|---|---|
| Bomber | +14.2% | Instant explosion | 60g | Clears targeted bottom rows |
| Curtain | +18.7% | Blind duration 8s | 80g | Obscures opponent stack |
| Magnet | +9.4% | Pulls active piece | 45g | Disrupts opponent placement |
| Poison | +12.1% | Spreads 1 cell/tick | 55g | Locks corrupted cells |
| Retrim | +11.8% | Lowers highest peak | 50g | Recovers dangerous spires |
| Bounty Tax | +6.5% | Steals 25% earnings | 35g | Economic harassment |
| Satellite | +8.9% | Radar line scan | 40g | Reveals hidden blocks |
| Tectonic Shift | +16.3% | Column realignment | 75g | Scrambles stack balance |

---

### 4. Replay analytics and solver diagnostics

To debug solver anomalies and evaluate game feel, I built a diagnostic replay suite directly into the application shell (`b4fee00`, `70a1767`).

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Dual-Pane Diagnostic Shell                        │
├──────────────────────────────────┬─────────────────────────────────────┤
│      Real-Time Playfield         │         Diagnostic Inspector        │
│                                  │                                     │
│  [ Canvas Board Playback ]       │  ► BotDecisionTrace Details         │
│  - Voronoi Cell Grid             │  ► Sub-Score Contribution Ledger    │
│  - Active Field Effect Gauges    │    - heightScore: -14.2             │
│  - Timeline Powerup Bands        │    - cavityPenalty: -32.0           │
│                                  │    - dropDepthBonus: +8.5           │
│                                  │  ► Misstep Taxonomy Tag:            │
│                                  │    [ BuriedCavity @ Tick 412 ]      │
├──────────────────────────────────┴─────────────────────────────────────┤
│  Emergent Hotspot Heatmap & Small Multiples Seed Matrix                │
└────────────────────────────────────────────────────────────────────────┘
```

The diagnostic architecture consists of five core components:

* **BotDecisionTrace.** On every piece lock, the solver writes a structured snapshot recording the chosen candidate, evaluated alternatives, individual heuristic sub-scores, and misstep tags.
* **Sub-score contribution ledger.** Breaks down candidate evaluations into signed numerical deltas (`lineClearScore`, `spiresScore`, `cavityPenalty`, `dropDepthBonus`), allowing immediate inspection of why a bot preferred one placement over another.
* **Misstep taxonomy.** Categorizes solver errors automatically into tags like `BuriedCavity`, `MisjudgedGarbageUrgency`, `HighFrontierRisk`, and `MissedGarbageCancel`.
* **Dual-pane diagnostic shell.** A fixed-height split interface pairing canvas playback on the left with scrollable candidate inspectors and misstep timelines on the right (`05c9b03`).
* **Emergent hotspot heatmap and seed matrix.** Aggregates misstep frequencies across benchmark seeds, letting me pinpoint systemic placement flaws without manual replay inspection.

---

### 5. Multi-agent engineering workflow

Developing Shape Showdown relied on a coordinated multi-agent workflow. Across the five-month timeline, I conducted 259 recorded AI development sessions.

```
Total Engineering Sessions by Tool (April - August 2026):
Codex:        ████████████████████████████████████████ 151 (58.3%)
Antigravity:  ████████████████ 60 (23.2%)
OpenCode:     ████████ 29 (11.2%)
Cursor IDE:   ███ 11 (4.2%)
Cursor CLI:   ██ 8 (3.1%)
```

Each tool served a distinct engineering role:

1. **OpenCode (29 sessions).** Handled early exploration, exploratory subagents, repository cloning, initial mobile layout measurements, and deployment configuration spikes.
2. **Cursor IDE and CLI (19 sessions).** Used for quick UI tweaks, component styling, and resume generation.
3. **OpenAI Codex (151 sessions).** The primary workhorse for algorithmic implementation. Handled solver heuristics, garbage queue math, Voronoi cell calculations, replay data structures, and baseline benchmark generation.
4. **Antigravity (60 sessions).** Focused on systemic architecture, state recovery engines, multi-environment build systems, database CTE queries, and cross-platform networking layers.

```
Monthly Engineering Activity:
2026-04: ██ 18 sessions
2026-05: █ 4 sessions
2026-06: █ 9 sessions
2026-07: ███ 30 sessions
2026-08: ████████████████████████ 188 sessions
```

August 2026 represented the peak sprint, transitioning the engine from an isolated prototype into a launch-grade multiplayer platform.

---

### 6. Backend architecture choices, economics, and trade-offs

Designing the backend for Shape Showdown required balancing low latency, operational hosting costs, and resilience against connection drops. A competitive 60Hz puzzle game cannot tolerate database write stalls on every tick, nor can a startup afford high server compute and egress bills.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Edge CDN Layer                                │
│  Cloudflare Pages: Static Assets, Client Bundle, _redirects             │
│  - Cost: $0/month bandwidth                                             │
│  - Benefit: Global edge caching, isolates compute from asset delivery   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                         WSS Handshake & REST Auth
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Authoritative Game Server                           │
│  Bun Native Runtime + Express + Socket.IO (Railway Container)           │
│  - In-Memory 60Hz Simulation Loop (0 DB writes during live play)         │
│  - Binary Delta Packet Sync (cuts wire egress 49%)                      │
│  - Memory: <45 MB per instance                                          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                        Asynchronous WAL Checkpoints
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Durable PostgreSQL Control Plane                    │
│  Postgres 16 (Railway Managed DB via 'postgres' driver)                 │
│  - Single CTE Coalesced Checkpointing (commit 08f8e8c)                  │
│  - Player Profiles, Sessions, Lobbies, Match Results (JSONB)            │
│  - Match State Blobs (BYTEA) for 60s Reconnection Recovery             │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Runtime: Bun over Node.js
I migrated from Node.js and Docker to Bun (`7deb9e5`, `2d1bbdb`). 

* **Benefits:** Bun compiles directly to a standalone binary (`bun build --compile`) without bundling the full Node runtime. Cold startup dropped from several seconds to under 15 milliseconds, and baseline memory consumption fell from ~150 MB to under 45 MB per process. Bun also natively executes TypeScript, eliminating transpilation steps during local development and testing.
* **Cost savings:** Lower memory usage allowed the game server to run within Railway's smallest container tiers without risking out-of-memory crashes during player spikes.

#### Database: PostgreSQL over SQLite or Redis
For the durable control plane, I chose PostgreSQL via the lightweight `postgres` driver (`porsager/postgres`) over SQLite or standalone Redis (`server/controlPlane/database.ts`).

* **Why not SQLite?** SQLite works well on single-host virtual machines with persistent NVMe disks. However, modern deployment platforms like Railway use containerized instances with ephemeral local filesystems. When a container restarts or scales, local SQLite files vanish unless tied to network storage volumes, which introduce high latency. A managed PostgreSQL instance provides durable persistence across container restarts and zero-downtime deploys.
* **Why not Redis?** While Redis is fast for pub/sub and in-memory caches, it adds operational overhead for structured relational data. Shape Showdown requires relational constraints across players, sessions, active lobbies, match tickets, and post-match JSONB statistical records (`db/migrations/0001_control_plane.sql`). PostgreSQL fulfills both transactional metadata needs and state blob persistence in a single managed service.
* **Why the 'postgres' driver?** I avoided heavy ORMs like Prisma or TypeORM. The `postgres` library has zero dependencies, uses native ES6 tagged template literals to prevent SQL injection, and offers faster query execution with lower garbage collection pauses.
* **Asynchronous checkpointing with single CTE queries.** Real-time 60Hz tick loops run entirely in server RAM. The server only commits serialized state blobs (`BYTEA`) to PostgreSQL periodically and on key match phase transitions. In commit `08f8e8c`, I rewritten checkpoint queries into single Common Table Expression (CTE) operations that coalesce writes, eliminating connection pool contention under load.

#### Network protocol: Binary delta encoding over JSON
The original Socket.IO implementation broadcasted full board state objects as JSON strings on every change. Over a 3-minute competitive match, JSON serialization created significant egress traffic.

In commit `dcab797`, I designed a custom binary packet sync protocol (`server/sync/MatchPacketSync.ts`). The server sends only coordinate deltas and absolute wire ticks rather than full state trees. This cut per-seat network egress by 49%. Because Railway bills for outbound network bandwidth, halving packet sizes directly halved real-time operational costs.

#### Static hosting: Cloudflare Pages edge isolation
Rather than having the game server serve client HTML, JavaScript bundles, audio assets, and fonts, I decoupled client hosting entirely. The frontend is deployed to Cloudflare Pages, using `_redirects` rules for route management.

* **Benefits:** Cloudflare absorbs all static asset traffic through its global CDN at zero bandwidth cost. The Railway backend container only processes WebSocket connections and lightweight REST authentication calls, protecting server CPU and RAM for match simulation.

---

### 7. The Discord pivot, durable control plane, and network optimization

Late in development, I pivoted the distribution model from a standalone VPS web app to an integrated Discord Activity hosted on Cloudflare Pages and Railway (`docs/DISCORD_PIVOT_AND_ARCHITECTURE_VISION.md`).

#### Durable state recovery
Discord Activity environments frequently drop WebSocket connections when users switch channels or minimize windows. To prevent match losses, commit `b2a2d95` introduced a durable control plane. 

When a socket drops, the server retains the player's seat lease for 60 seconds (`bd12512`). The client reconnects using an authentication token, recovers the full authoritative board state from the PostgreSQL `match_checkpoints` table, and resumes play without desynchronization.

#### Matchmaking search scopes
In commit `f9ae7fd`, I implemented three distinct matchmaking pools:
* **Guild pool.** Restricts matches to members of the same Discord server.
* **Discord-only pool.** Matches players across all active Discord servers.
* **Global pool.** Bridges web portal players with Discord Activity sessions.

---

### 8. Legal risk mitigation and trademark protection

To prepare for commercial distribution and public listing, I conducted a legal audit in commit `ca6691f` (`docs/LEGAL_RISK_CHECKLIST.md`).

All code references, variable names, and documentation referencing "Tetris", "tetromino", or trademarked naming conventions were refactored to neutral domain language:
* `TetrisEngine` became `PuzzleEngine` / `ShapeEngine`.
* "Tetromino" piece descriptors were renamed to canonical shape keys (`I`, `O`, `T`, `S`, `Z`, `J`, `L`).
* Implemented formal Terms of Service (`docs/TERMS_OF_SERVICE.md`) and Privacy Policy (`docs/PRIVACY_POLICY.md`) in commit `67da84f`, meeting Discord's Developer Terms of Service and Cloudflare routing requirements.

---

### 9. Project status and retrospective

Shape Showdown is no longer live. The startup that operated and hosted the game has closed, and the production Railway instances have been spun down. However, the codebase stands as a complete implementation of server-authoritative multiplayer puzzle architecture.

#### Key architectural lessons

1. **Determinism must precede AI heuristics.** Attempting to tune bot heuristics before locking down deterministic tick physics created phantom bugs. Once the simulation seam was isolated, solver calibration became straightforward.
2. **Egress optimization is an early architecture concern.** Real-time 60Hz state broadcasts quickly generate unsustainable network bills. Moving to delta encoding and binary packets should be implemented before public load testing.
3. **Specialized AI agents outperform general prompts.** Routing algorithmic solver problems to Codex and control-plane recovery tasks to Antigravity produced cleaner code than relying on a single generalist agent.
4. **Decouple compute from static distribution.** Offloading client bundles to Cloudflare Pages while keeping backend simulation in Bun and PostgreSQL keeps operating expenses near zero until player concurrency scales.

---

### References

* AVLitskevich. (2024). *BubbleBlitzersJS: Real-time falling blocks multiplayer prototype*. GitHub. https://github.com/AVLitskevich/BubbleBlitzersJS
* Cloudflare. (2025). *Cloudflare Pages Direct Upload and Runtime Redirection Reference*. Cloudflare Docs.
* Discord Inc. (2025). *Embedded App SDK and Activity Developer Documentation*. Discord Developer Portal.
* Gonzalez, K. (2026). *Shape Showdown Repository and Development Logs*. GitHub. https://github.com/KGonzalezASC/shape-showdown
* Porsager, R. (2024). *Postgres: The Fastest Full-Featured PostgreSQL Client for Node.js and Bun*. GitHub. https://github.com/porsager/postgres
* Ries, A., & Trout, J. (1981). *Positioning: The Battle for Your Mind*. Warner Books.
