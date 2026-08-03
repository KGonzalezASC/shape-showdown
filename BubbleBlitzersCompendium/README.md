# BubbleBlitzers Compendium — Shape Showdown developer docs

`[STATUS: ACTIVE]` `[CLIENT]` `[SERVER]` `[NETCODE]`

A task-oriented field guide to the **Shape Showdown** codebase (fork lineage: **Bubble Blitzers**). It is intentionally lighter than a full architecture manual — each guide answers one practical question and links to the relevant files.

> [!NOTE]
> The canonical one-page overview lives in [AGENTS.md](../AGENTS.md). This compendium goes deeper on the topics people actually get stuck on. Runtime code and tests are authoritative; update this guide when it drifts.

---

## What this is

**Shape Showdown** is a **two-player, server-authoritative falling-piece** browser game. Two players each get a 10×18 visible field backed by a 10×20 simulation board with two hidden spawn rows; the **server** runs the entire simulation at 60 Hz and streams authoritative state to both clients. Players attack each other by clearing lines (sending garbage) and by buying **shop powerups** that sabotage the opponent's field.

- **Identity** is the raw `socket.id` — no accounts, no rooms.
- **Max 2 players** per server instance; a 3rd connection is rejected with `"Game is full"`.
- The client sends input intent and receives full `GameState` JSON. `GameStateProvider` stores it, `gameStateStore` derives chrome and `PublicPlayerState` playfield snapshots, and React renders those snapshots.

> [!IMPORTANT]
> The live game uses falling pieces, SRS kicks, garbage lines, hold/swap, and a shop layer. Its playfield is **10×18 visually**, backed by a **10×20 simulation board with two hidden spawn rows**. This compendium documents the current implementation.

---

## Stack

| Layer | Technology |
|-------|------------|
| Client | React 19, Vite 6, TypeScript, Tailwind v4 (`@tailwindcss/vite`), Motion, Lucide |
| Server | Bun / Node, Express, Socket.IO, TypeScript |
| Shared | `src/constants.ts` (tuning numbers) → re-exported by `src/types.ts` (shapes); the server imports from `../src/types.js` |
| Build | Vite (client + replay viewer), `bun build --compile` (server binary) |

---

## How to run

| Command | Purpose |
|---------|---------|
| `bun install` | Install deps |
| `bun run dev` | **Full stack local**: `bun server.ts` runs Express + Socket.IO on **http://localhost:3000** with Vite mounted as middleware. Open two tabs to play both sides. |
| `bun run build` | `build:client` → `dist/`, `build:replay`, `build:server` → `dist-server/server.mjs` |
| `bun run build:server:bin` | Compile the standalone Linux server binary used in production |
| `bun run start` | Production server only (`NODE_ENV=production`, serves `dist-server/server.mjs`) |
| `bun run lint` | `tsc --noEmit` |
| `bun run knip` | Dead-code scan (uses `knip.json`) |

---

## Repository map

```text
server.ts                 # HTTP + Socket.IO entry; mounts Vite middleware in dev
server/
  GameManager.ts          # Connections, 60 Hz loop, match flow, socket handlers
  shop.ts                 # Authoritative purchase validation and effect handlers
  loadConfig.ts           # Reads config/server.json (+ PORT / SERVE_CLIENT env overrides)
  tetris/
    engine.ts             # stepPlayer(): the per-player simulation tick
    pieces.ts             # Tetromino shapes + SRS data
    engine.test.ts        # Engine unit tests
src/
  main.tsx                # React mount
  App.tsx                 # Shell: keyboard, overlays, responsive layout orchestration
  constants.ts            # Tuning numbers (board size, costs, durations, gravity)
  types.ts                # GameState, PlayerState, ShopItem, MatchEvent… (+ const re-exports)
  shop/
    shopCatalog.ts        # Canonical item catalog and purchasability
    playerShop.ts         # Server-side shop phase machine and rolls
  state/
    GameStateProvider.tsx # Socket-to-store bridge and React contexts
    gameStateStore.ts     # Chrome and PublicPlayerState snapshots
    publicSnapshots.ts    # Local UI projection from full GameState
  hooks/useGameSocket.ts  # Socket.IO transport + server-URL resolution
  components/             # GameField (canvas), MobileControls, ShopRail, GameFieldsLayout, …
  ReplayApp.tsx, replay.tsx # Standalone replay viewer
config/
  server.json             # port / host / serveClient / replayKeyframeIntervalTicks
  client.json             # baseUrl → Vite `base`
public/
  game-config.json        # Runtime Socket.IO URL (editable on host without rebuild)
docs/                     # SHOP_POWERUPS.md, legacy deploy plan
```

---

## The guides

| # | I want to… | Guide |
|---|------------|-------|
| 1 | Find my way around and add a feature / mechanic | [codebase-navigation.md](./codebase-navigation.md) |
| 2 | Understand how it talks online (localhost vs production) | [online-and-production.md](./online-and-production.md) |
| 3 | Make gameplay work over Socket.IO | [socketio-gameplay.md](./socketio-gameplay.md) |
| 4 | Design for responsive / mobile layouts | [responsive-layouts.md](./responsive-layouts.md) |
| 5 | Understand the other TS code & swap the UI framework (React→Vue) | [swapping-the-ui-framework.md](./swapping-the-ui-framework.md) |
| 6 | Understand dead-code scans (`knip.json`, react-doctor false positives) | [knip-and-dead-code.md](./knip-and-dead-code.md) |

---

## See Also

- [AGENTS.md](../AGENTS.md) — canonical project overview & run commands.
- [docs/SHOP_POWERUPS.md](../docs/SHOP_POWERUPS.md) — shop item specs (approved work + rejections).
- [TETRIS_VS_TETRIS_PLAN.md](../TETRIS_VS_TETRIS_PLAN.md) — historical migration decisions and sources.
