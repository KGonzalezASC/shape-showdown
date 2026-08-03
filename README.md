# Shape Showdown

**Shape Showdown** is a two-player, server-authoritative browser game descended from **[BubbleBlitzersJS](https://github.com/AVLitskevich/BubbleBlitzersJS)**. It is a competitive falling-shape puzzle with a 10×18 visible arena, a 10×20 simulation board with two hidden spawn rows, a tactical shop, and field-changing powerups.

**This repo on GitHub:** [KGonzalezASC/shape-showdown](https://github.com/KGonzalezASC/shape-showdown)

Contributor and agent context: [AGENTS.md](./AGENTS.md).

---

## Run locally

**Prerequisites:** Bun

1. Install dependencies: `bun install`
2. Optional: copy `.env.example` to `.env` if you use env overrides (see AGENTS.md).
3. Run the full stack (Vite + game server): `bun run dev`
   Default: **http://localhost:3000**

### Local client + local server (separate processes)

1. Start the game server: `bun run dev:server`
2. In a second terminal, start the client pointed at that server: `bun run dev:local`

The client uses Vite’s default port (e.g. 5173) and connects to `http://localhost:3000` for Socket.IO.

### npm equivalent

The scripts also work through npm if Bun is unavailable:

- `npm install`
- `npm run dev` (or `npm run dev:server` / `npm run dev:local` as above)
