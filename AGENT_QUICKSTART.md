# Shape Showdown Agent Quickstart

Use this when an agent needs to spin up the project fast for local 2-player testing.

## Fast path (Bun preferred)

Open two terminals at repo root.

Terminal A (Socket.IO game server):

```bash
bun install
bun run dev:server
```

Terminal B (Vite client pointed at local server):

```bash
bun run dev:local
```

Open the client URL shown by Vite (usually `http://localhost:5173`).

For 2 players, open the same URL in a second browser window/tab (or another browser/incognito).

## NPM equivalent

Terminal A:

```bash
npm install
npm run dev:server
```

Terminal B:

```bash
npm run dev:local
```

## Expected good logs

- Server: `Shape Showdown server [production] on http://0.0.0.0:3000`
- Client: `[Socket] Using VITE_GAME_SERVER_URL from env: http://localhost:3000`

## Common failure and fix

If client logs show fallback to `http://localhost:5173` and Socket timeout, the wrong script was used.

Use `dev:local` (not plain `dev:client`) so `VITE_GAME_SERVER_URL` is set.

## Notes for agents

- Do not run full build for local smoke tests.
- `dev:server` runs backend only (Socket.IO + game loop), no static client serving.
- `dev:local` runs frontend only and targets local backend.
