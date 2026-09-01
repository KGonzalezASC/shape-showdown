# Shape Showdown

**Shape Showdown** is a two-player, server-authoritative browser game descended from **[BubbleBlitzersJS](https://github.com/AVLitskevich/BubbleBlitzersJS)**. It is a competitive falling-shape puzzle with a 10×18 visible arena, a 10×20 simulation board with two hidden spawn rows, a tactical shop, and field-changing powerups.

**This repo on GitHub:** [KGonzalezASC/shape-showdown](https://github.com/KGonzalezASC/shape-showdown)

Contributor and agent context: [AGENTS.md](./AGENTS.md).

> [!NOTE]
> **Project status:** Shape Showdown is no longer live. The startup that operated and hosted the game has closed, so the former production deployment is offline. This repository remains available for development, reference, and future distribution work.

## Project goal

The goal for Shape Showdown is to evolve it from a single-host VPS game into a cross-platform competitive game distributed through **Discord Activities**, **Itch.io**, and dedicated web portals. The authoritative multiplayer server remains a separate backend concern, while each platform provides a client entry point for players.

---

## Run locally

**Prerequisites:** Bun

1. Install dependencies: `bun install`
2. Optional: copy `.env.example` to `.env` if you use env overrides (see AGENTS.md).
3. For solo curated puzzles, run the no-Docker stack: `bun run dev:solo`
4. For the two-seat multiplayer playtest, run the full stack (Vite + game server): `bun run dev` with the Docker/Postgres setup in [PLAYTEST.md](./PLAYTEST.md)
   Default: **http://localhost:3000**

### Local client + local server (separate processes)

1. Start the game server: `bun run dev:server`
2. In a second terminal, start the client pointed at that server: `bun run dev:local`

The client uses Vite’s default port (e.g. 5173) and connects to `http://localhost:3000` for Socket.IO.

### npm equivalent

The scripts also work through npm if Bun is unavailable:

- `npm install`
- `npm run dev` (or `npm run dev:server` / `npm run dev:local` as above)
