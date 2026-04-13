# Shape Showdown

Fork of **[BubbleBlitzersJS](https://github.com/AVLitskevich/BubbleBlitzersJS)** — a two-player, server-authoritative browser game (Socket.IO). This fork keeps the same connection/match shell while evolving gameplay toward **Tetris vs Tetris**; see [TETRIS_VS_TETRIS_PLAN.md](./TETRIS_VS_TETRIS_PLAN.md) and [FORK.md](./FORK.md) (upstream vs `origin` remotes).

**This repo on GitHub:** [KGonzalezASC/shape-showdown](https://github.com/KGonzalezASC/shape-showdown)

Contributor and agent context: [AGENTS.md](./AGENTS.md).

---

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Optional: copy `.env.example` to `.env` if you use env overrides (see AGENTS.md).
3. Run the full stack (Vite + game server): `npm run dev`  
   Default: **http://localhost:3000**

### Local client + local server (separate processes)

1. Start the game server: `npm run dev:server`
2. In a second terminal, start the client pointed at that server: `npm run dev:local`

The client uses Vite’s default port (e.g. 5173) and connects to `http://localhost:3000` for Socket.IO.

### Bun

- `bun install`
- `bun run dev` (or `bun run dev:server` / `bun run dev:local` as above)
