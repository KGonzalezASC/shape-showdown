# Internal fixtures (not part of the production client)

This tree holds QA / developer assets that must **not** ship with `dist/client`.

| Path | Purpose |
|------|---------|
| `replays/` | RulesBot suites, demo replays, live match recordings (`*.replay`) |
| `mockups/` | Standalone HTML visual studies (poison, flowfields, piece styles) |

## How assets reach a browser

- **Production game client** (`bun run build:client`) only copies `public/` → `dist/client`. Keep `public/` product-only (`game-config.json`, poison sheet, etc.).
- **Replay viewer** (`bun run build:replay`) uses `fixtures/` as its Vite `publicDir`, so `/replays/...` works for internal tooling under `dist/replay-viewer`.

## Regenerating replays

Scripts under `scripts/generate-*-replays.mts` and `scripts/generate-demo-replay.mts` write here. The server only saves replays to disk when `REPLAYS_DIR` is explicitly set in the environment (e.g. `REPLAYS_DIR=fixtures/replays`).
