# Phase 3: Generate immutable published packs

[Back to overview](overview.md)

## Goal

Turn validated curated content into static files that Cloudflare Pages can cache and the browser can verify before use.

## Changes

- Add `scripts/build-puzzle-packs.mts` as the only publisher from curated source to player-safe files.
- Add `src/puzzle/publishedPuzzleCodec.ts` for canonical serialization, hashing, and strict decoding.
- Update `package.json` so `build:client` runs Vite first, then generates puzzle packs into the completed `dist/client` tree.

Vite currently uses `emptyOutDir: true`, so it would delete files generated before the build. The pack generator must run after `vite build`, or emit through a Vite build hook with the same final ordering. Do not disable clean output as a shortcut.

The generator writes a small manifest and content-addressed pack files under the completed client build output. It fails if a puzzle lacks a passing validation artifact for the exact `PublishedPuzzlePayloadV1.contentHash`. It copies public baseline metrics beside the payload only after the artifact hash matches, so validation output never changes the content identity that it validates.

Start with one pack for the current catalog. Split by collection only after measured compressed size or parse time crosses the budget in [verification](testing.md). Do not create one request per puzzle by default.

## Data structures

- `PublishedPuzzlePackV1` contains a collection id and `PublishedPuzzleV1[]`. Its byte hash uses the pack domain prefix, not the puzzle content prefix.
- `PublishedPuzzleManifestV1.packs` records each file URL, SHA-256, byte length, and puzzle ids.

## Verification

Static evidence:

- Run the complete Vite and pack build twice and compare pack byte identity.
- Confirm that the Vite step cannot erase the generated manifest or packs.
- Inspect the output and confirm that it contains no RulesBot code, candidate profiles, solution commands, filesystem paths, or staging-only notes.

Runtime evidence:

- Serve the production client build and fetch the manifest and pack through their final relative URLs.
- Corrupt one byte in a temporary copy and prove that the decoder rejects the hash.

The generator is the Build the Lever artifact for content publication.
