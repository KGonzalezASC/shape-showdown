# Spec — Backend split for solo local play (no Docker)

Branch context: `feature/single-player-puzzles` @ `317e14e`.
Status: **spec only** (no implementation in this pass).

## Problem

Local solo puzzle play currently implies Docker Desktop + `shape-showdown-postgres`, because `bun run dev` loads `.env` `DATABASE_URL`, opens Postgres, and runs migrations before serving.

That is the wrong dependency for puzzles:

- `PuzzleHost` / catalog / session are in-memory and never touch SQL.
- Socket auth already short-circuits for `auth.purpose === 'puzzle'`.
- The monoserver already supports `database === null` → `databaseMode: 'in-memory'`.

So the pain is **boot/env coupling**, not missing puzzle persistence.

Two-seat playtest still needs Postgres (match tickets, allocation, persistence). That path should keep Docker.

## Goal

Make solo puzzle local play a one-command, no-Docker path, while leaving multiplayer local playtest and production Postgres unchanged.

## Non-goals

- Replacing Railway Postgres for multiplayer/production
- Adding SQLite / dual database backends
- Online attempt verification or daily calendar
- Splitting Cloudflare/Railway deploy topology in this wave
- Rewriting `PuzzleHost` or the curated catalog

## Current seams (evidence)

| Seam | Behavior today |
| --- | --- |
| `createDatabase()` | Returns `null` when `DATABASE_URL` is missing/blank |
| `resolveRuntimePolicy` (dev) | `requirePostgres: false`; production forbids in-memory |
| `startGameServer` | Skips migrations, control-plane router, ticket middleware when DB null |
| Puzzle sockets | Wired on every connection; early-return when `purpose=puzzle` |
| Local `.env` | Sets `DATABASE_URL` → every `bun run dev` becomes Postgres-backed |

## Options

### A. Solo boot profile (recommended Wave 1)

Add an explicit solo/dev entry that starts the existing server **without** a database:

- Script such as `bun run dev:solo` (name bikeshed OK) that clears/overrides `DATABASE_URL` for that process (or sets a dedicated `SOLO_MODE=true` that `createDatabase` honors by returning null).
- Same HTTP + Vite + Socket.IO process; MatchRegistry stays unloaded/no-op without DB.
- Document in `PLAYTEST.md` / `AGENTS.md`:
  - Solo puzzles → `dev:solo`, no Docker
  - Two-seat playtest → Docker Postgres + `bun run dev` as today

**Why this first:** smallest change that deletes the Docker requirement for the path Jacob actually cares about. Uses the already-tested in-memory boot path.

Principles that drove this: Laziness Protocol (prefer env/script over new process), Subtract Before You Add, Boundary Discipline (DB stays a control-plane concern), Experience First (solo play should not open Docker).

### B. Separate solo entrypoint (Wave 2, only if A is insufficient)

Introduce a slim `solo` server entry that wires Vite + Socket.IO + `PuzzleHost` and never imports control-plane stores.

Use if Wave 1 still pulls unwanted multiplayer side effects, or if boot time / failure modes stay noisy.

### C. Full service split (later / out of scope)

Separate deployable multiplayer game service vs solo/static+puzzle service. Useful for cost/isolation later; not needed to unblock local solo.

## Recommended plan

1. **Wave 1 — Solo boot profile**
   - `dev:solo` (or equivalent) that forces in-memory DB for the process
   - Optional hard guard: refuse to start solo mode if somehow migrations still run
   - Docs: dual local paths (solo vs two-seat)
   - Verification:
     - Docker stopped / Postgres unreachable
     - `bun run dev:solo` starts; `/health/details` reports `in-memory`
     - Landing → Puzzles → catalog start → terminal result
     - Existing `bun test server/puzzle/` + lint stay green
     - Two-seat `PLAYTEST.md` path still documented as Docker-required

2. **Wave 2 — Slim entrypoint** only if Wave 1 leaves real coupling (imports crashing, ticket middleware interfering, etc.)

3. **Wave 3 — Deploy split** only when product needs independent scaling/cost for solo vs multiplayer

## Acceptance criteria (Wave 1)

- Solo local puzzle play works with Docker Desktop quit / Postgres container stopped
- Multiplayer local playtest docs and commands unchanged in meaning
- Production still requires Postgres (`requirePostgres: true`)
- No new database engine introduced
- One short doc section that makes the two local paths impossible to confuse

## Open product call (only if needed)

Whether solo mode should **hard-ignore** a present `DATABASE_URL` (safer DX: can't accidentally require Docker) vs requiring an unset URL. Recommendation: hard-ignore under an explicit solo script/flag so `.env` can stay intact for multiplayer work.

## Suggested verification commands

```bash
bun run dev:solo
# with Postgres down:
# curl /health/details → databaseMode in-memory
bun test server/puzzle/
bun run lint
```

## Next action after approval

Implement Wave 1 only: script + small boot/policy hook + docs. Do not start Wave 2 unless Wave 1 fails a real coupling check.
