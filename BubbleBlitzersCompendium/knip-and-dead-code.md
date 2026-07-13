# Knip & dead-code scanning

`[STATUS: ACTIVE]` `[TOOLING]`

This project uses **[Knip](https://knip.dev)** to find unused files, exports, dependencies, and types. [react-doctor](https://react.doctor) (already in devDependencies) runs Knip internally for its "dead code" warnings — without a config file, those warnings are often **false positives**.

---

## What is `knip.json`?

**Knip** is a static analysis tool for JavaScript/TypeScript repos. It walks from **entry files** (things that actually run) through imports and reports what is never reached.

**`knip.json`** (project root) is Knip's configuration. It tells Knip how *this* repo is laid out so it does not treat normal multi-app setups as "unused":

| Setting | Role in Shape Showdown |
|---------|------------------------|
| `entry` | Starting points: `server.ts`, replay viewer (`src/replay.tsx`), engine tests |
| `project` | Files in scope: `src/**`, `server/**` |
| `ignore` | Paths Knip should skip entirely (e.g. `scripts/**` — manual dev tooling) |
| `vite.config` | Both Vite configs so Knip discovers `src/main.tsx` and the replay bundle |
| `ignoreIssues` | Known intentional patterns (see below) |
| `ignoreDependencies` | Packages used indirectly (Tailwind via `@tailwindcss/vite`, CLI-only tools) |

Without this file, Knip assumes a single client entry (`main.tsx`) and flags:

- `src/replay.tsx` / `ReplayApp.tsx` — separate replay viewer build (`vite.replay.config.mjs`, `npm run build:replay`)
- `scripts/*.mjs` — asset/dev scripts, not imported by the app
- `server/tetris/engine.test.ts` — Node test entry, not imported by `server.ts`
- Many re-exports in `src/types.ts` — shared constants barrel used by the server bundle, not every symbol by the client

Those are **not** dead code; Knip just did not know the entry graph.

---

## Commands

| Command | Purpose |
|---------|---------|
| `bun run knip` | Run Knip directly (uses `knip.json`) |
| `bun run lint:dead-code` | Alias for the same |
| `bunx react-doctor --offline` | Broader React health scan; reuses Knip for dead-code section |

Type-checking is separate: `bun run lint` (`tsc --noEmit`).

---

## Intentional suppressions in `knip.json`

**`src/types.ts` exports** — Re-exports tuning constants from `constants.ts` for a single import path shared with the server. The client only imports a subset; trimming exports requires checking server imports first.

**`server/loadConfig.ts` types** — `ServerConfig` is used inside the module; it is not imported elsewhere but documents the config shape.

**`server/tetris/engine.ts` exports** — Some helpers are test-only or reserved for future shop/engine work. Prefer wiring tests to import them before deleting.

**`scripts/**`** — One-off generators (poison sprites, T-spin preset hunts). Kept in repo for developers; not part of runtime bundles. They sit outside Knip's `project` glob, so they are not scanned unless you add them to `entry`.

**`esbuild` (direct devDependency)** — Listed in `ignoreDependencies` because Vite already pulls esbuild transitively; the top-level package is a leftover from an older dev-server bundling flow (`AGENTS.md` still mentions it). Safe to remove from `package.json` if you want a stricter Knip run without that ignore.

---

## When to update `knip.json`

Add or change config when you:

1. **Add a new entry point** — e.g. a second Vite app, a new `server/*.ts` bootstrap, or a test file Knip should trace.
2. **Add dev scripts under `scripts/`** — leave them ignored unless you want Knip to enforce they stay referenced.
3. **See a false positive** — prefer a narrow `ignoreIssues` rule for that file/rule over blanket `ignore`.
4. **Remove real dead code** — delete the file/export first; only then remove any `ignoreIssues` entry that masked it.

---

## See also

- [knip.json](../knip.json) — live config
- [AGENTS.md](../AGENTS.md) — run commands overview
- [codebase-navigation.md](./codebase-navigation.md) — where replay viewer and server entry live
