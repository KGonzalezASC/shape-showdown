# Handoff — Single-Player Puzzle Mode (branch `feature/single-player-puzzles`)

> Next-session focus: build the **playable puzzle mode** (server-side session + socket plumbing + client UI + landing-page button). Read this file first, then `AGENTS.md`.

## Goal (user's words)
"Include a puzzle button in the landing page (no queue, no second seat) and for now pick 1 random puzzle we have" — then "use option 3: server-side session that interfaces with client, build it out."

## Where things stand

### Done this session
- **Verified branch contents** (user asked to clarify): branch has the complete **server-side puzzle engine** (`server/puzzle/`: `puzzleTypes.ts`, `puzzleGenerator.ts`, `puzzleSession.ts`, `puzzleSolution.ts`, `puzzle.test.ts`) but **zero client UI** — the client still only has landing → queue → 2-player match. There is no solo queue, no level select, no route. That's why no single-player entry exists on the landing page.
- **Server is running**: `bun run dev` on http://localhost:3000 (health 200, Postgres container `shape-showdown-postgres` up, accepting connections). Started via `nohup bun run dev > /tmp/shape-server.log 2>&1 &`.
- **Helium browser opened** at `http://localhost:3000/game/` with playtest profile p1 (`.scratch/playtest-profiles/p1`). Helium path: `C:\Users\Keithythefrog\AppData\Local\imput\Helium\Application\chrome.exe`. Launch via `cmd.exe /c start "" <exe> --user-data-dir=<profile> --no-first-run --new-window <url>` (PowerShell Start-Process also works; bash `nohup` + `cmd.exe /c start` both confirmed working on this box).
- Verified: `bun run lint` clean, `bun run test` 380 pass / 0 fail.
- User approved **option 3**: server-side puzzle session that interfaces with the client (reuse the existing snapshot/netcast pipeline, add a socket "puzzle" mode). NOT in-browser WASM.

### Chosen design (user-approved option 3)
Server-authoritative single-player: server runs `PuzzleSession` per player, streams snapshots over the existing socket pipeline (1-player "match"), client renders with existing `GameField`/`PlayfieldShell` and sends `inputState`/`action` like a normal match. Landing page gets a **Puzzles** button (no queue, no second seat). For now: **pick 1 random puzzle** from the generated set.

## Key files (read before coding)
- `server/puzzle/puzzleSession.ts` — `PuzzleSession` class: `input(InputState)`, `action(ActionType)`, `advance(ticks) -> PuzzleSessionReport`, `getPlayerState()`, `getReport()`. Constructor takes `{ level, driver, maxTicks }`. Driver is the InputDriver seam — for a human player you need a driver that reads queued client input instead of a bot.
- `server/puzzle/puzzleTypes.ts` — `PuzzleLevel`, `PuzzleGoal`, `HazardKind`, `TimelineEvent`.
- `server/puzzle/puzzleGenerator.ts` — `generatePuzzleLevel({ id, seed, goal, ... })`.
- `server/GameManager.ts` — 60 Hz loop + netcast pattern to mirror for a 1-player session channel.
- `src/hooks/useGameSocket.ts` — client socket; URL resolution cascade (game-config.json → env → origin). Socket.IO path normal, `/socketio` in Discord.
- `src/App.tsx` — game shell; `src/appRoute.ts` — SPA route (`'landing' | 'game'`, hash-based `#game`); add `'puzzles'` route here.
- `src/components/PlayfieldShell.tsx`, `src/components/GameField.tsx` — existing field rendering to reuse for puzzle view.
- Landing page entry: `index.html` → `src/landing.tsx` (per AGENTS.md routes section).
- `public/game-config.json` — runtime server URL for the client.

## Implementation plan (agreed)
1. **Server**: add a puzzle session registry keyed by player/session id in `gameServer.ts` (or a new `server/puzzle/PuzzleHost.ts`): socket events `puzzle:start {levelSeed?}`, `puzzle:input`, `puzzle:action`, `puzzle:state` (reuse snapshot serialization), `puzzle:end`. Run the session on the existing 60 Hz loop or its own timer. Pick **1 random level** via `generatePuzzleLevel` with a random seed when the client doesn't request a specific one.
2. **Client**: `src/appRoute.ts` add `'puzzles'` route (hash `#puzzles`); landing page (`src/landing.tsx`) gets a **Puzzles** button that sets that route (no queue call); new `src/components/PuzzleScreen.tsx` reusing `PlayfieldShell`/`GameField` to render the streamed player state, sending `inputState`/`action` over the same socket pattern as `useGameSocket`.
3. **Random pick**: server picks 1 random level (random seed) on `puzzle:start` when no seed given.

## Gotchas / context
- Branch: `feature/single-player-puzzles`. Tests: `bun run test` (380 pass). Lint: `bun run lint` (tsc). **`bun run lint` was clean at last full run** — some `str_replace` calls mid-session may have left a stray truncated edit in `src/App.tsx`-adjacent files (a heredoc got mangled); **run `bun run lint` first thing next session and fix any truncated file before building.** The edits that were in flight: adding a Puzzles button to `src/landing.tsx` and a `'puzzles'` route in `src/appRoute.ts` — neither was committed; check `git status` / `git diff` to see what landed.
- Windows box, bash shell. Use POSIX syntax. Helium is the preferred browser (PLAYTEST.md). Playtest profile dirs already exist under `.scratch/playtest-profiles/`.
- Server log: `/tmp/shape-server.log`. Postgres container: `shape-showdown-postgres` (docker start if exited).
- The old 2-player playtest flow (two Helium profiles, localhost vs 127.0.0.1) is NOT needed for puzzle mode — single seat only.
- `PuzzleSession` currently drives input via an `InputDriver` (bot). For a human, add a thin driver that drains a queue filled from socket events, or bypass the driver and write `inputState`/`actionQueue` directly before each `advance(1)` — the session exposes both paths.

## Suggested skills for next session
- `implement` (or `tdd`) for the socket + UI build
- `codebase-design` before wiring the session-host seam
- `communicate-clearly` when reporting back to the user
- `handoff` again to refresh this doc after the build lands
