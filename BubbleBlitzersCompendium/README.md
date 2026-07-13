# BubbleBlitzers Compendium — Shape Showdown developer docs

`[STATUS: ACTIVE]` `[CLIENT]` `[SERVER]` `[NETCODE]`

A task-oriented field guide to the **Shape Showdown** codebase (fork lineage: **Bubble Blitzers**). It is intentionally lighter than a full architecture manual — each guide answers one practical question and links to the exact files and line numbers you need.

> [!NOTE]
> The canonical one-page overview lives in [AGENTS.md](../AGENTS.md). This compendium goes deeper on the topics people actually get stuck on. Where the two disagree, trust the code (and tell the team).

---

## What this is

**Shape Showdown** is a **two-player, server-authoritative Tetris-vs-Tetris** browser game. Two players each get their own 10×20 board; the **server** runs the entire simulation at 60 Hz and streams authoritative state to both clients. Players attack each other by clearing lines (sending garbage) and by buying **shop powerups** that sabotage the opponent's field.

- **Identity** is the raw `socket.id` — no accounts, no rooms.
- **Max 2 players** per server instance; a 3rd connection is rejected with `"Game is full"`.
- The client is a **dumb renderer**: it sends inputs, receives `GameState` JSON, and draws it.

> [!IMPORTANT]
> The product started life as a *breakout/bubble* game and parts of [AGENTS.md](../AGENTS.md) still use that vocabulary (paddle / ball / bubble). The **live game is Tetris** — pieces, SRS kicks, garbage lines, hold/swap, and a shop layer. This compendium documents the current Tetris reality.

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
| `npm install` (or `bun install`) | Install deps |
| `npm run dev` | **Full stack local**: `bun server.ts` runs Express + Socket.IO on **http://localhost:3000** with Vite mounted as middleware. Open two tabs to play both sides. |
| `npm run build` | `build:client` → `dist/`, `build:replay`, `build:server` → `dist-server/server.mjs` |
| `npm run build:server:bin` | Compile the standalone Linux server binary used in production |
| `npm start` | Production server only (`NODE_ENV=production`, serves `dist-server/server.mjs`) |
| `npm run lint` | `tsc --noEmit` |
| `npm run knip` | Dead-code scan (uses `knip.json`) |

---

## Repository map

```text
server.ts                 # HTTP + Socket.IO entry; mounts Vite middleware in dev
server/
  GameManager.ts          # Connections, 60 Hz loop, match flow, shopPurchase handling
  loadConfig.ts           # Reads config/server.json (+ PORT / SERVE_CLIENT env overrides)
  tetris/
    engine.ts             # stepPlayer(): the per-player simulation tick
    pieces.ts             # Tetromino shapes + SRS data
    engine.test.ts        # Engine unit tests
src/
  main.tsx                # React mount
  App.tsx                 # Shell: state, keyboard, shop reducer, both layouts
  constants.ts            # Tuning numbers (board size, costs, durations, gravity)
  types.ts                # GameState, PlayerState, ShopItem, MatchEvent… (+ const re-exports)
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
- [FORK.md](../FORK.md) — fork lineage from upstream BubbleBlitzersJS.
