# Shape Showdown — agent / contributor context

**Repository:** descendant of [BubbleBlitzersJS](https://github.com/AVLitskevich/BubbleBlitzersJS). **Product name:** Shape Showdown.

Use this file as shared context when working in this repo on any machine or with any AI assistant. It is the **canonical project overview** for humans and agents.

> **Deeper guides:** see [`BubbleBlitzersCompendium/`](./BubbleBlitzersCompendium/README.md) for task-oriented docs on codebase navigation, online/production networking, Socket.IO gameplay, responsive layouts, and swapping the UI framework.

**Source-of-truth order:** runtime code and tests define behavior; this file defines the current architecture and invariants; active compendium guides explain workflows; historical plans and design docs provide background only. When documentation conflicts with code, update the documentation rather than inventing a second implementation.

## What this is

**Shape Showdown** is a **two-player, server-authoritative** browser game: parallel falling-piece fields (each player has their own 10×20 visible board, 10×22 simulation board with two hidden spawn rows, active piece, garbage queue, and shop). Real-time sync via **Socket.IO**. Max **2** players per server instance; identity is **socket.id** (no accounts).

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
  tetris/
    engine.ts                  # Deep tick module: stepPlayer, lock, garbage, poison, tectonic
    pieces.ts                  # SRS kicks; re-exports shared SHAPES
src/
  App.tsx                      # Shell, keyboard, overlays
  constants.ts                 # Board sizes, speeds, shop costs, attack tables
  types.ts                     # GameState, PlayerState, semantic ActiveFieldEffect
  rng.ts                       # Seeded MutableRng (sim + shop rolls)
  tetris/shapes.ts             # Shared tetromino SHAPES for server + client
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
    boardVisualModel.ts        # Visible 10×20 semantic board model
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
public/
  game-config.json
```

## How to run

| Command | Purpose |
|---------|---------|
| `bun install` | Install deps |
| `bun run dev` | Full stack via Bun (`server.ts` + Vite middleware). Default **http://localhost:3000** |
| `bun run build` | Client + replay viewer + server bundle |
| `bun run start` | Production server (`dist-server/server.mjs`) |
| `bun run start:serve-client` | Production + serve `./dist` |
| `bun run lint` | `tsc --noEmit` |
| `bun run test` | Interface harnesses (`engine`, `shop`, `GameManager`, poison) |
| `bun run clean` | Remove build artifacts |

**Two clients locally:** two browsers/tabs on the same origin.

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

## Game design rules (server truth)

- **Movement / actions:** Client sends `inputState` and discrete `action`; server applies DAS/ARR, gravity, locks, and garbage in **`engine.ts`**.
- **Shop:** Line clears roll offers; client opens/purchases; server validates phase, highlight index, cost, and gates.
- **Poison / specials:** Elixir, Wild Purge, Magnet, Snag, Sticky, Satellite, Bomber, Curtain, Retrim, Bounty Tax, Wildcard +4, Tectonic Shift — owned by shop handlers + engine tick.
- **Match states:** `waiting` → `countdown` → `playing` → `ended` (top-out or timer). First top-out ends the match immediately.

## UI conventions

- **Responsive:** Root uses `h-dvh`; playfield shell scales fields to fit.
- **Effect pills:** Semantic kinds styled by the client adapter.
- **Snapshots:** Match chrome is equality-gated; playfield publishes only when `PublicPlayerState` changes.

## Copying this knowledge elsewhere

- Keep **`AGENTS.md`** in repo root and commit it so clones and other machines get the same context.
- For fastest local spin-up commands, see **`AGENT_QUICKSTART.md`**.

## Non-goals / gaps (be explicit when changing)

- No user authentication; no rooms beyond single 2-player lobby.
- Wire protocol still carries full `GameState`; playfield UI already uses `PublicPlayerState` locally.
- `PlayerState.isReady` is unused if present in older notes.
