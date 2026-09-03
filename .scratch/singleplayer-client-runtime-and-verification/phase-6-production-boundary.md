# Phase 6: Enforce the production no-session boundary

[Back to overview](overview.md)

## Goal

Make the no-Railway promise enforceable on the server. A stale or modified client must not create a production puzzle session through the old socket protocol.

## Changes

- Update `server/gameServer.ts` so the final production policy rejects `auth.purpose === 'puzzle'` before constructing `PuzzleHost` or wiring puzzle events.
- Update `server/runtimePolicy.ts` with an explicit development-only legacy puzzle host policy during migration.

Do not change multiplayer ticket validation, seat binding, allocation, or `MatchRegistry` behavior.

Do not enable the final rejection until Phase 10 completes the measured old-client overlap. Keep the legacy host behind a time-bounded compatibility policy during that overlap, then leave it available only in an explicitly selected development profile.

Keep existing tests read-only. Any later test retirement needs the user's explicit specification approval.

## Data structures

- `RuntimePolicy.allowLegacyPuzzleHost` is true only in an explicitly selected development profile.
- Production socket rejection uses a stable `PUZZLE_SOCKET_DISABLED` code.

## Verification

Static evidence:

- Type-check the server policy change.
- Inspect the production branch and confirm there is one policy decision, not repeated environment checks.

Runtime evidence:

- After the Phase 10 overlap, start the production server and attempt a `purpose: 'puzzle'` Socket.IO connection. Confirm rejection before a `PuzzleHost` exists.
- Complete a normal two-player Socket.IO smoke path and confirm that matchmaking behavior is unchanged.
- Complete a casual puzzle from the Pages build while the Railway server is stopped.
