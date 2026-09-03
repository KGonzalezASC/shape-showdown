# Phase 5: Move the puzzle UI off Socket.IO

[Back to overview](overview.md)

## Goal

Keep the current puzzle experience while replacing the live socket host with the local worker adapter.

## Changes

- Update `src/components/PuzzleScreen.tsx` to load the manifest and pack, own `PuzzleRuntimeClient`, and render worker snapshots.
- Update `src/RootApp.tsx` to lazy-load `PuzzleScreen` only when the route is `puzzles`.
- Update `src/state/puzzleProgressStorage.ts` only if versioned content hashes must join the local progress key.

Remove `socket.io-client`, `resolveGameServerUrl`, `puzzle:*` event names, connection state, and reconnect behavior from `PuzzleScreen`. Keep multiplayer Socket.IO code unchanged.

Add explicit loading, corrupt-content, incompatible-version, and retry states. A failed static pack fetch can retry Pages. It must never fall back to a Railway puzzle socket.

## Data structures

- `PuzzleContentLoadState` is `idle`, `loading`, `ready`, `incompatible`, or `failed`.
- `PuzzleViewAttemptState` owns the local runtime client, presentation snapshot, final result, and content hash.

## Verification

Static evidence:

- Type-check the route and UI changes.
- Inspect the Vite manifest and prove that the puzzle UI and worker are lazy chunks.

Runtime evidence:

- Verify landing, picker, gameplay, retry, terminal result, and back navigation in a direct browser.
- Repeat desktop, tablet, and phone layouts under the responsive-design skill.
- Repeat the puzzle path in a Discord Activity. Confirm that all static files resolve through the Pages mapping.
- Inspect the browser network log. No Railway hostname or WebSocket may appear from puzzle entry through completion.

