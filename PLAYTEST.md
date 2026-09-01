# Shape Showdown — local two-seat playtest

This page covers the local two-seat playtest. Use it whenever someone says **run a playtest** or **test locally**. It is not `bun run test`, and it is not two tabs on the same origin.

Repo: `C:\Users\Keithythefrog\source\BubbleBlitzers`

## Choose the local path

For a solo curated puzzle, use the in-memory boot profile. It does not use `DATABASE_URL`, does not run migrations, and does not need Docker or Postgres:

```powershell
cd C:\Users\Keithythefrog\source\BubbleBlitzers
bun run dev:solo
```

Open `http://localhost:3000/#puzzles`, choose a puzzle, and start it. The server's `/health/details` response should report `databaseMode: "in-memory"`.

For a two-seat multiplayer playtest, keep using the Docker/Postgres path below and `bun run dev`. That path still needs match tickets and the control-plane database.

## What “playtest” means

1. Docker is open and **Postgres is running** so a match can form.
2. The game server is serving **port 3000**.
3. **Helium** (not Chrome) opens two separate profiles:
   - Profile 1: `http://localhost:3000`
   - Profile 2: `http://127.0.0.1:3000`
4. Click **Play Game** on both so they queue into one match.

`localhost` and `127.0.0.1` must stay different hosts. Separate Helium profiles (separate `--user-data-dir`) keep guest sessions from colliding.

## Browser

Jacob uses **Helium** (imput Chromium fork), not Google Chrome.

- Executable: `C:\Users\Keithythefrog\AppData\Local\imput\Helium\Application\chrome.exe`
- Process name still shows as `chrome`.
- Playtest profiles (do not reuse the daily Helium profile):
  - `C:\Users\Keithythefrog\source\BubbleBlitzers\.scratch\playtest-profiles\p1`
  - `C:\Users\Keithythefrog\source\BubbleBlitzers\.scratch\playtest-profiles\p2`

Launch example:

```powershell
$helium = "C:\Users\Keithythefrog\AppData\Local\imput\Helium\Application\chrome.exe"
$root = "C:\Users\Keithythefrog\source\BubbleBlitzers\.scratch\playtest-profiles"
New-Item -ItemType Directory -Force -Path "$root\p1","$root\p2" | Out-Null
Start-Process $helium -ArgumentList "--user-data-dir=$root\p1","--no-first-run","--new-window","http://localhost:3000"
Start-Process $helium -ArgumentList "--user-data-dir=$root\p2","--no-first-run","--new-window","http://127.0.0.1:3000"
```

## Docker backend (Postgres)

Container name: `shape-showdown-postgres`  
Image: `postgres:17-alpine`  
Port: `5432`

```powershell
docker ps -a --filter "name=shape-showdown-postgres"
docker start shape-showdown-postgres   # if it is Exited
docker exec shape-showdown-postgres pg_isready -U postgres
```

Wait until `pg_isready` says it is accepting connections before starting the game server.

## Game server

From the repo:

```powershell
cd C:\Users\Keithythefrog\source\BubbleBlitzers
bun run dev
```

Ready when the log includes:

`Shape Showdown server [dev (Vite middleware)] on http://0.0.0.0:3000`

Landing: `/`  
Game: `/game/` or click **Play Game** (`#game`)

If port 3000 is already serving, do not start a second server.

## In-match

Status chrome goes: waiting for another player → match starting → match live.

Stop once both seats have joined and a match has formed. Do **not** autoplay with injected keypresses. Playing the match is not part of this playtest.

## Do not

- Two tabs on `localhost` (same origin, shared session)
- Google Chrome (Helium only)
- `bun run test` unless someone explicitly wants the unit suite
- Invent a compose file; this repo’s local DB is the existing `shape-showdown-postgres` container
- Injected keypresses / autoplay. Opening the two seats and confirming the match is enough


## Fast checklist

1. `docker start shape-showdown-postgres` if needed, then `pg_isready`
2. `bun run dev` if 3000 is down
3. Helium profile p1 → `http://localhost:3000`
4. Helium profile p2 → `http://127.0.0.1:3000`
5. Play Game on both, confirm a match forms. Do not send keypresses.
