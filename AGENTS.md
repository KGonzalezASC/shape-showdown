# Shape Showdown — agent / contributor context

**Repository:** descendant of [BubbleBlitzersJS](https://github.com/AVLitskevich/BubbleBlitzersJS). **Product name:** Shape Showdown.

Use this file as shared context when working in this repo on any machine or with any AI assistant. It is the **canonical project overview** for humans and agents.

> **Deeper guides:** see [`BubbleBlitzersCompendium/`](./BubbleBlitzersCompendium/README.md) for task-oriented docs on codebase navigation, online/production networking, Socket.IO gameplay, responsive layouts, and swapping the UI framework.

**Source-of-truth order:** runtime code and tests define behavior; this file defines the current architecture and invariants; active compendium guides explain workflows; historical plans and design docs provide background only. When documentation conflicts with code, update the documentation rather than inventing a second implementation.

## What this is

**Shape Showdown** is a **two-player, server-authoritative** browser game: parallel falling-piece fields (each player has their own 10×18 visible board, 10×20 simulation board with two hidden spawn rows, active piece, garbage queue, and shop). Real-time sync via **Socket.IO**. Max **2** players per server instance; durable guest/session identity owns a seat, while `socket.id` is only an ephemeral connection handle.

## Stack

| Layer | Technology |
|-------|------------|
| Client | React 19, Vite 6, TypeScript, Tailwind v4 (`@tailwindcss/vite`), Motion, Lucide |
| Server | Bun/Node, Express, Socket.IO, TypeScript |
| Shared types/constants | `src/types.ts` / `src/constants.ts`; shop catalog + seeded RNG shared across tiers |

## Repository layout (important paths)

```
server.ts                      # HTTP + Socket.IO entry; Vite middleware in bun dev
server/
  GameManager.ts               # Match flow, connections, 60 Hz loop, netcast, replay
  shop.ts                      # Purchase handler registry (authoritative shop effects)
  loadConfig.ts                # Reads config/server.json (+ env overrides)
  puzzleEngine/
    engine.ts                  # Deep tick module: stepPlayer, lock, garbage, poison, tectonic
    pieces.ts                  # Wall kicks; re-exports shared SHAPES
src/
  App.tsx                      # Shell, keyboard, overlays
  constants.ts                 # Board sizes, speeds, shop costs, attack tables
  types.ts                     # GameState, PlayerState, semantic ActiveFieldEffect
  rng.ts                       # Seeded MutableRng (sim + shop rolls)
  replayCodec.ts               # Shared .replay encode (gzip) + sniff decode for server & viewer
  puzzleEngine/shapes.ts       # Shared piece SHAPES for server + client
  shop/
    shopCatalog.ts             # Canonical item catalog (cost, target, purchasable)
    shopRoll.ts                # Weighted offer draw (injected RNG)
    playerShop.ts              # Phase machine: waiting/ready/cycling/expired
    fieldEffects.ts            # pushFieldEffect (semantic pills)
    effectStyles.ts            # Client adapter: kind → Tailwind
  state/
    gameStateStore.ts          # Chrome + public playfield snapshots
    publicSnapshots.ts         # PublicPlayerState seam for React
  board/
    boardVisualModel.ts        # Visible 10×18 semantic board model
    BoardCanvasOverlay.tsx     # Canvas effects layered over the board
  hooks/useGameSocket.ts       # Socket + game-config.json origin
  components/
    GameField.tsx              # Board render + effect pills
    PlayfieldShell.tsx         # Layout + shop rail wiring
docs/
  SHOP_POWERUPS.md             # Shop item specs
config/
  server.json
  client.json
public/                        # Production client static only (copied into dist/client)
  game-config.json
  poison/                      # In-game poison sheet (CSS)
fixtures/                      # QA / internal only — NOT copied into dist/client
  README.md
  replays/                     # RulesBot suites + match recordings
  mockups/                     # Standalone HTML visual studies
```

## How to run

| Command | Purpose |
|---------|---------|
| `bun install` | Install deps |
| `bun run dev` | Full stack via Bun (`server.ts` + Vite middleware). Default **http://localhost:3000** |
| `bun run build` | Production client + server bundle |
| `bun run build:internal` | Same as `build`, plus replay viewer under `dist/replay-viewer` |
| `bun run build:replay` | Internal replay viewer only (serves `fixtures/`) |
| `bun run start` | Production server (`dist-server/server.mjs`) |
| `bun run start:serve-client` | Production + serve `./dist` |
| `bun run lint` | `tsc --noEmit` |
| `bun run test:board` | Board model, canvas sizing, and painter tests |
| `bun run test:engine` | Puzzle engine movement, locking, hold, and timing tests |
| `bun run test:poison` | Poison spread and poison-related special tests |
| `bun run test:shop` | Shop catalog, rolls, phases, and purchase handlers |
| `bun run test:manager` | GameManager lifecycle tests |
| `bun run test:name-drop` | Name-drop planner and playback tests |
| `bun run test` | Fast unit and deterministic suite; does not require Postgres |
| `bun run test:integration` | Postgres-backed integration suite; uses `TEST_DATABASE_URL` |
| `bun run test:all` | Runs the unit suite, then the integration suite when its test database is configured |
| `bun run validate:puzzles` | Emit curated-puzzle validation artifacts under `fixtures/puzzle-validation/` (RulesBot/server only) |
| `bun run clean` | Remove build artifacts |

**Local playtest (two seats):** see [PLAYTEST.md](./PLAYTEST.md). Helium, two profiles, localhost vs 127.0.0.1, Docker Postgres. Not two tabs on the same origin.

**Integration test database:** set `TEST_DATABASE_URL` to a disposable Postgres database before
running `bun run test:integration`. Integration tests ignore the normal `DATABASE_URL`, so a
stopped development database cannot turn the default test command red.

### Targeted verification policy

Use the smallest relevant verification command for each change. `bun run test` is the default deterministic suite. Run `bun run test:integration` for database-backed changes. `bun run test:all` is the release check.

| Changed area | Verification |
|---|---|
| Markdown, docs, or comments | No tests; run `git diff --check` when useful |
| Board model or canvas rendering | `bun run test:board` |
| Puzzle engine | `bun run test:engine`; add `bun run test:poison` or `bun run test:shop` when those seams are touched |
| Curated puzzle baseline / validation artifact | `bun test server/puzzle/`; `bun run validate:puzzles`; `bun run lint` |
| Shop catalog, handlers, or rolls | `bun run test:shop`; add `bun run test:poison` for poison effects |
| GameManager or socket contract | `bun run test:manager`; use the full suite for broad protocol changes |
| Name-drop planner or playback | `bun run test:name-drop` |
| UI, layout, or socket-client changes without a matching harness | `bun run lint`, then browser/manual verification for visual or network behavior |
| Control-plane SQL, migrations, queue allocation, sessions, or match tickets | `bun run test:integration`; `bun run test` for related pure logic |
| Shared constants, shared types, RNG, or broad simulation behavior | `bun run test` |

For pre-merge or release verification, run `bun run lint` and `bun run test:all`. Set `TEST_DATABASE_URL` first so the integration tier runs rather than reporting that it was not configured.

## Module seams (design)

- **`stepPlayer`** — deep simulation tick interface; prefer testing through it.
- **`shopCatalog` + `applyShopPurchase`** — one source of truth for costs/targets; registry of purchase handlers; client affordability is UI-only.
- **`MutableRng` (`src/rng.ts`)** — match seed drives piece bags **and** shop rolls / poison variants (replay-friendly).
- **`ActiveFieldEffect.kind`** — semantic only on the wire; Tailwind lives in `effectStyles.ts`.
- **`PublicPlayerState`** — React playfield consumes the narrowed snapshot; drills may still read raw `GameState`.

## Configuration (prefer files over env)

| File | Role |
|------|------|
| `config/server.json` | `port`, `host`, `serveClient` |
| `config/client.json` | Vite `base` |
| `public/game-config.json` | Runtime `gameServerUrl` for Socket.IO |

**Socket URL resolution** (client): in localhost Vite development, use the page origin; otherwise `game-config.json` (`gameServerUrl`, then port/host), then `VITE_GAME_SERVER_URL` (then port/host), then `window.location.origin`.

**Discord Activity identity**: the client uses the official Embedded App SDK
authorization-code flow only when `VITE_DISCORD_CLIENT_ID` is present and the
page is running on a Discord Activity origin. The server exchanges that
short-lived code using `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and the
optional `DISCORD_REDIRECT_URI`, then fetches `/users/@me` before upserting the
provider identity. The browser never supplies `discordUserId`; direct web
guests continue using the guest bootstrap.

## Game design rules (server truth)

- **Movement / actions:** Client sends `inputState` and discrete `action`; server applies DAS/ARR, gravity, locks, and garbage in **`puzzleEngine/engine.ts`**.
- **Shop:** Line clears roll offers; client opens/purchases; server validates phase, highlight index, cost, and gates.
- **Poison / specials:** Elixir, Wild Purge, Magnet, Snag, Sticky, Satellite, Bomber, Curtain, Retrim, Bounty Tax, Wildcard +4, Tectonic Shift — owned by shop handlers + engine tick.
- **Match states:** `waiting` → `countdown` → `playing` → `ended` (top-out, disconnect, server void, or restart flow). Matches have no wall-clock timeout; the first top-out ends the match immediately.

## UI conventions

- **Client routes:** `/` serves the landing page (`index.html` → `src/landing.tsx`); `/game/` serves the game (`game/index.html` → `src/main.tsx`). Legacy `/landing` URLs redirect to `/` via `public/_redirects`.

- **Responsive:** Root uses `h-dvh`; playfield shell scales fields to fit.
- **Effect pills:** Semantic kinds styled by the client adapter.
- **Snapshots:** Match chrome is equality-gated; playfield publishes only when `PublicPlayerState` changes.

### Board Visual & Frame Design Rules
- **Canonical Style:** Style E (Watching Shrine Amalgam) is the single canonical board design.
- **Seeded Procedural Generation:** Frame cut line breaks, watcher face count (1 to max 3), embedded face placements, subtle red sparks (3 total with 0.55–0.7 opacity), and uneven grid line overshoots are deterministically generated driven by match seed (`MutableRng`).
- **Extended Grid Mesh & Void Cell Dithering:** All interior grid lines (10 columns, 18 rows) extend past the board frame boundary into the surrounding outer void (1-bit pixel grid extension lines that connect flush with the interior 10×18 canvas grid lines), creating a full extended grid matrix while preserving the exact 10×18 playable grid area. Any grid cell drawn in the outer void past the 10×18 main field is rendered with a subtle 1-bit stipple dither texture.
- **Perimeter & Frame Cut Lines:** Board frame cut lines feature a thick primary white line (3px) on the frame boundary and a staggered thin hairline contour (1.5px) positioned on the OUTSIDE of the thick line (extending into the outer void). Never place decorative lines or overlays inside the playable grid canvas.
- **Outer Edge Cut-Through:** The outermost thin hairline perimeter line must have clean pixel gap breaks that cut directly into the surrounding dark void (never wrap the frame in a continuous unbroken box-shadow or solid outer border ring).
- **Embedded Creature Faces/Eyes:** Creature faces/watching eyes (1 to max 3 per board) must be physically embedded on and directly connected to the broken cut line gaps of the board frame (bridging the line segment ends), never floating detached or disconnected.
- **Subtle Red Sparks:** Red spark accents must be subtle with reduced opacity (0.55–0.7 with soft glow) placed across 3 perimeter gap positions.
- **Clean Boundary Lines:** Bottom frame lines must use clean, crisp white line segments with pixel gap breaks (no dripping teeth, spikes, or tentacles).
- **Voronoi shape cells:** Cells must remain smooth, clean, glowing filled polygons without interior hatching lines or striping overlays.

## Environments & Deployment Topology

| Tier | Git Branch | Railway Environment & Service | Cloudflare Pages Target | Database |
|---|---|---|---|---|
| **Staging** | `main` | `staging` (`shape-showdown-staging.up.railway.app`) | Preview deployments (`main.shape-showdown.pages.dev`) | Staging Railway Postgres |
| **Production** | `production` | `production` (`shape-showdown-production.up.railway.app`) | Production root (`shape-showdown.pages.dev`) | Production Railway Postgres |

- **Branch workflow**: Active development and integration PRs land on `main`. Promoting to production requires fast-forwarding or merging `main` into the `production` branch (`git checkout production && git merge main --ff-only && git push origin production`).
- **Storage Isolation Rule**: `main` (the staging environment) must NEVER connect to production object storage (e.g. Cloudflare R2 / S3). Staging must use local disk or an isolated non-production storage sandbox.
- **Discord Activity routing**: Point production Discord URL mappings to Railway (`/socketio` prefix mapped to target `https://shape-showdown-production.up.railway.app/socket.io`, `/api` mapped to `https://shape-showdown-production.up.railway.app/api`, `/health` mapped to `https://shape-showdown-production.up.railway.app/health`) and `/` to `https://shape-showdown.pages.dev`.
- **DISCORD ACTIVITIES DO NOT ACCEPT SYMBOLS LIKE "." IN PREFIX**: Discord's URL Mapping validator rejects prefixes containing `.`. Use alphanumeric prefixes like `/socketio` on the Discord mapping prefix, and point the target to the server path `/socket.io`. The client automatically selects `path: '/socketio'` in Discord context.
- **Activity is one document:** Discord Android closes the Activity if the iframe navigates to another HTML page or reloads (`disallowed page`). Landing and game switch in-document via `#game` (`src/appRoute.ts`, `src/RootApp.tsx`). See `.scratch/discord-activity-spa-lifecycle.md`.

## Hosting / ticket jargon (plain language)

When explaining Wayfinder / production-deployment tickets (especially ticket 04 staging evidence), agents must use **communicate-clearly** (and **teach** if the owner asks to really understand). Do not dump cloud acronyms. Say what to click or measure on Railway/Pages in everyday words first, then the formal name.

Active plan docs live under `.scratch/production-multiplayer-deployment/` (map + issues). Launch pick is provisional: **Cloudflare Pages** (UI) + **Railway Virginia** (game) + **Railway Postgres**.

### Ticket 04 evidence terms

| Formal name | Plain meaning |
| --- | --- |
| **Idle Linux RSS** | How much **RAM** the Bun game process uses on Railway when **nobody is playing**. RSS ≈ “resident memory” the OS sees. We want the quiet baseline on Railway’s Linux box (not your Windows PC). Check Railway **Metrics → Memory** with no connected clients. |
| **One-match / small-N CPU, memory, egress** | While **1 match** (2 players) is running, and optionally a few matches if we ever allow more processes: how hard the CPU works, how much RAM it uses, and how much **network data leaves** Railway (egress = outbound traffic you pay for). “Compressed” means after Socket.IO compression, closer to real bills. |
| **Socket.IO soak** | Leave players (or a soak script) **connected for 30–60 minutes** and log disconnects/reconnects/errors. Proves the connection doesn’t silently die (Railway docs disagree on WebSocket lifetime). |
| **Direct-browser RTT** | Ping time from a normal browser to Railway (e.g. from Pages). RTT = round trip; lower is snappier. |
| **Discord-mapped RTT** | Same measurement **inside a Discord Activity**, traffic going through Discord’s allowlisted proxy. Often deferred until ticket 09 mappings exist. |
| **24h idle cost** | Leave staging up overnight with little/no play; read Railway usage/billing for app + Postgres. “What does it cost to exist?” |
| **Deploy while connected** | Click/redeploy while someone is in a match. New version must pass **`/health`**, old process gets shut down (**SIGTERM** = polite kill), clients **reconnect**, public URL stays the same. |
| **Application rollback** | In Railway Deployments, roll back to a **previous successful build** (undo a bad deploy without waiting on a new git push). |
| **Postgres backup restore** | Save a DB snapshot, restore it into a **non-prod** database copy, prove we can recover data. |

### Related hosting nouns

| Noun | Plain meaning |
| --- | --- |
| **Pages** | Where the static website (React UI) is hosted. |
| **Railway service** | The always-on Bun game server process. |
| **Environment (staging vs production)** | Separate Railway “lanes” with their own vars/DB. Staging is for experiments; production is for real players (once wired). |
| **Feature Flags** | Railway runtime switches / % rollouts (not the same as PR preview environments). |

## Copying this knowledge elsewhere

- Keep **`AGENTS.md`** in repo root and commit it so clones and other machines get the same context.
- For fastest local spin-up commands, see **`AGENT_QUICKSTART.md`**.

## Non-goals / gaps (be explicit when changing)

- No user authentication; no rooms beyond single 2-player lobby.
- Wire protocol still carries full `GameState`; playfield UI already uses `PublicPlayerState` locally.
- `PlayerState.isReady` is unused if present in older notes.
