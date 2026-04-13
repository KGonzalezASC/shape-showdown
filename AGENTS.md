# Shape Showdown — agent / contributor context

**Repository:** fork of [BubbleBlitzersJS](https://github.com/AVLitskevich/BubbleBlitzersJS) (see [FORK.md](./FORK.md)). **Product name:** Shape Showdown.

Use this file as shared context when working in this repo on any machine or with any AI assistant. It is the **canonical project overview** for humans and agents.

## What this is

**Shape Showdown** (fork lineage: **Bubble Blitzers**) is a **two-player, server-authoritative** browser game: parallel breakout-style fields (each player has their own paddle, ball, and bubble grid). Real-time sync via **Socket.IO**. Max **2** players per server instance; identity is **socket.id** (no accounts).

## Stack

| Layer | Technology |
|-------|------------|
| Client | React 19, Vite 6, TypeScript, Tailwind v4 (`@tailwindcss/vite`), Motion, Lucide |
| Server | Node, Express, Socket.IO, TypeScript |
| Shared types/constants | `src/types.ts` re-exports from `src/constants.ts`; server imports from `../src/types.js` paths in compiled output |

## Repository layout (important paths)

```
server.ts                 # HTTP + Socket.IO entry; dev loads Vite middleware dynamically
server/
  GameManager.ts          # Match flow, connections, 60 Hz loop, player state
  Physics.ts              # Ball motion, collisions, score on pop / penalty on drop
  loadConfig.ts           # Reads config/server.json (+ env overrides)
src/
  App.tsx                 # Shell, header, keyboard, overlays
  main.tsx
  constants.ts            # GAME_WIDTH/HEIGHT, speeds, scoring, durations
  types.ts                # GameState, PlayerState, Bubble, etc.
  hooks/useGameSocket.ts  # Socket + fetch public/game-config.json for API origin
  components/
    GameField.tsx         # Canvas + field floating score text
    GameFieldsLayout.tsx  # ResizeObserver scale-to-fit in viewport
config/
  server.json             # Server port, host, serveClient
  client.json             # Vite baseUrl (asset base path)
public/
  game-config.json        # Runtime: gameServerUrl for Socket.IO (copied to dist/)
vite.config.mjs
```

## How to run

| Command | Purpose |
|---------|---------|
| `npm install` | Install deps (client build tools are devDependencies) |
| `npm run dev` | **Local full stack**: esbuild bundles `server.ts` → `.dev-server.mjs`, then `node` runs it with **Vite middleware** (no separate Vite CLI). Default **http://localhost:3000** |
| `npm run build` | `build:client` → `dist/`, `build:server` → `dist-server/server.mjs` |
| `npm start` | Production server only: `NODE_ENV=production node dist-server/server.mjs` (needs prior `build:server`; serve `dist/` elsewhere unless `serveClient` is true) |
| `npm run start:serve-client` | Same as start but **`SERVE_CLIENT=true`** env overrides config to also serve `./dist` |
| `npm run lint` | `tsc --noEmit` |
| `npm run clean` | `rimraf dist dist-server .dev-server.mjs` |

**Two clients locally:** open two browsers/tabs on the same origin (e.g. two windows to `http://localhost:3000`).

**Why not `tsx server.ts` on Windows:** tsx + Vite config loading hit `ERR_INVALID_URL_SCHEME`; dev uses **esbuild** to bundle the server then `node`. Production server bundle is `dist-server/server.mjs`.

## Configuration (prefer files over env)

| File | Role |
|------|------|
| `config/server.json` | `port`, `host`, `serveClient`. Read from **process.cwd()** at runtime. |
| `config/client.json` | `baseUrl` for Vite `base` (e.g. subpath deploy). Edit → **rebuild client**. |
| `public/game-config.json` | `gameServerUrl` (empty = fallbacks). **Runtime** in browser; ends up in `dist/`; can edit on static host **without** rebuilding JS. |

**Optional env overrides** (see `.env.example`): `PORT`, `SERVE_CLIENT`, `VITE_*` — mainly for PaaS or legacy builds.

**Socket URL resolution** (client): `game-config.json` → `VITE_GAME_SERVER_URL` → `window.location.origin`.

**Deploy server:** ship `dist-server/server.mjs`, `package.json` (dependencies: express, socket.io, dotenv), `config/server.json`, and run `npm ci --omit=dev` (or full install). **Deploy client:** upload entire `dist/` including `game-config.json`.

## Game design rules (server truth)

- **Movement:** Client sends `paddleInput` (-1 / 0 / 1); server applies `PADDLE_SPEED` each tick.
- **Shoot:** `shootBall`; server validates `canShoot`, `playing`, etc.
- **Physics:** All ball/bubble/paddle collision and **score** changes run in **`Physics.ts`** / **`GameManager`**. Client diffs state for **UI-only** effects (flying text) and uses **`structuredClone`** on each `gameState` because Socket.IO may reuse object references.
- **Match states:** `waiting` → `countdown` → `playing` → `ended` (timer or clear all bubbles). No auto-reset from `ended` without reconnect or new logic.

## UI conventions

- **Responsive:** Root uses `h-dvh`, `GameFieldsLayout` scales the two fields to fit.
- **Floating score feedback:** CSS keyframes in `index.css` (`animate-score-float-*`); header floats offset so they don’t cover the numeric score.

## Node / engine notes

- `@vitejs/plugin-react` may warn on Node &lt; 20.19; upgrading Node avoids engine warnings.

## Copying this knowledge elsewhere

- Keep **`AGENTS.md`** in repo root and commit it so clones and other machines get the same context.
- For fastest local spin-up commands, see **`AGENT_QUICKSTART.md`**.
- For Cursor: you can add a rule that says “read `AGENTS.md` for project context” or paste sections into project instructions.
- For other agents: attach or `@` this file at session start.

## Non-goals / gaps (be explicit when changing)

- No user authentication; no rooms beyond single 2-player lobby.
- `ended` state does not automatically return to `playing` (UI may say “waiting for server reset”).
- `PlayerState.isReady` exists in types but is unused.

## Explicit AI Instructions / Rules

- **Strict Planning Rule:** Do not start writing code until the user explicitly says that planning is finished and you can write code. If the user announces a switch from code editing mode back to planning, you must strictly stay in planning mode and refrain from writing code.
