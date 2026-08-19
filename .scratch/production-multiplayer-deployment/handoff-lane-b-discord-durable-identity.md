# Handoff: Lane B — Discord durable identity bootstrap

## Mission

Add the trusted Discord Activity identity flow needed for Phase 3 remount
recovery. A Discord user must resolve to the same server-owned player and
session after an Activity reload or remount, then reclaim the same match seat
through the existing match-assignment and ticket flow.

This lane is separate from guest bootstrap. It must preserve the normalized
player/session contract so Lane A and the recovery client do not need a
Discord-specific socket protocol.

The source of truth is [`production-architecture.md`](./production-architecture.md),
“Phase 3: client recovery and protocol”, plus ticket 03’s Discord routing
constraints and ticket 05’s durable player/session model.

## Current baseline

Completed:

- Guest player creation and durable guest sessions.
- Guest session persistence and recovery.
- Server-side `upsertDiscordPlayer` storage seam in
  `server/controlPlane/playerStore.ts`.
- Discord CORS origin handling.
- Relative Discord paths and direct `game-config.json` resolution.
- Match-scoped replacement tickets and seat rebinding.

Not completed:

- A trusted Discord Activity assertion/bootstrap endpoint.
- Server verification of Discord identity before creating or reusing a
  Discord player.
- Discord session issuance using the normalized session model.
- Client Activity bootstrap and remount recovery.
- End-to-end proof that the same Discord user reclaims the same seat.

Implementation now covers the local/server contract:

- `server/controlPlane/discordIdentity.ts` exchanges the official Embedded App
  SDK authorization code with Discord and validates the `/users/@me` identity.
- `POST /api/players/discord` upserts the verified provider identity and issues
  the normalized server session; it never accepts a browser-supplied user ID.
- `src/discordActivity.ts` and `useGameSocket` select Discord bootstrap only in
  a configured Discord Activity context. Direct web clients remain on guest
  bootstrap, and Discord failures do not silently create guests.
- Unit and database-backed integration tests cover provider rejection,
  malformed identity claims, repeated bootstrap, and different identities.

Still requiring real Activity credentials and mapped-origin browser evidence:
the Discord SDK handshake, production token exchange, remount in an active
match, and the final privacy/consent review.

The browser must never be allowed to choose or assert its own trusted
`discordUserId`.

## Decided

- Discord identity is verified by the server, not trusted from a raw client
  field.
- The durable internal player ID is the server-owned `players.id`.
- `discord_user_id` is the provider identity key used to upsert that player.
- Discord and guest users both receive a server-issued session and use the
  same authenticated queue, assignment, and ticket APIs afterward.
- An Activity remount creates a new socket but must reclaim the durable player’s
  existing match assignment and seat.
- Invalid, expired, or unverifiable Discord identity must fail closed.
- Discord identity data, assertions, and bearer tokens must not appear in
  diagnostics, analytics, or replay payloads.
- Direct web guests must continue using the guest flow without requiring
  Discord.

## Proposed flow

1. The Activity obtains the platform-provided identity/assertion using the
   approved Discord Activity integration.
2. The client sends that assertion to a dedicated control-plane bootstrap
   endpoint over the mapped Discord origin.
3. The server verifies the assertion’s signature, audience/application,
   expiry, and required identity claims.
4. The server upserts the Discord player through `PlayerStore`.
5. The server creates or returns a server-issued session in the same shape as
   guest bootstrap:

   ```text
   player.id
   session.token
   session.expiresAt
   ```

6. The client requests `/api/match-assignment` with that session.
7. If an active match exists, the control plane issues a fresh match-scoped
   ticket for the same durable player and seat.
8. The client connects with the existing assignment protocol and receives the
   authoritative snapshot.

The exact Discord assertion and verification mechanism must be selected from
the current official Activity integration, not invented from a client-supplied
user ID.

## Proposed work order

1. Confirm the Activity launch/authentication contract and available server-side
   verification credentials.
2. Define the bootstrap request/response and failure reasons without exposing
   provider tokens.
3. Implement the server verification adapter around `PlayerStore`.
4. Add the client bootstrap adapter while preserving the guest path.
5. Reuse the existing assignment and ticket recovery flow.
6. Test first launch, Activity remount, active-match reclaim, and invalid
   assertion handling.
7. Run the Discord-mapped browser verification after the direct control-plane
   tests pass.

## Acceptance criteria

- The first valid Activity launch creates or upserts one internal player.
- A remount by the same Discord user resolves to the same internal player ID.
- A remount during `queued` preserves the intended queue identity.
- A remount during `playing` obtains a fresh ticket and reclaims the original
  match and seat.
- The opponent remains in the same match and receives no duplicate player.
- A different Discord user cannot claim the first user’s session or seat.
- Invalid, expired, tampered, and wrong-application assertions are rejected.
- Discord bootstrap never falls back silently to a new guest identity.
- Guest bootstrap remains unchanged and continues to work on direct web origins.
- No raw Discord assertion, Discord user ID, or bearer token appears in
  diagnostics, analytics, replay data, or logs.
- Discord-relative paths continue to resolve through the mapped Activity origin.

## Tests to add or verify

- Server verification accepts a valid test assertion and rejects invalid
  signatures, expiry, audience, and missing identity claims.
- Repeated bootstrap for one Discord identity returns the same player ID.
- Two different Discord identities produce two different player IDs.
- Active-match assignment after remount returns the same `matchId` and seat.
- A stale or invalid Discord session cannot obtain another player’s assignment.
- Guest bootstrap remains independent of Discord configuration.
- Browser verification uses the real mapped Discord Activity origin once stable
  mappings and credentials are available.

Run at minimum:

```text
bun run lint
bun run test:control-plane
bun test src/hooks/matchRecovery.test.ts src/hooks/useGameSocket.test.ts
```

## Dependencies and parallel work

Lane B depends on the existing player/session model and the stable assignment
shape. It may proceed in parallel with Lane A.

Lane B must not:

- wait for Lane C’s pause/void/forfeit UI;
- duplicate ticket validation or socket recovery;
- change the `MatchAssignment` shape without coordinating with Lane A;
- require analytics or replay work before identity bootstrap can be tested.

Lane A must expose a stable session-neutral contract so this lane can plug in
without a Discord-specific reconnect branch.

## Files to inspect first

- `server/controlPlane/playerStore.ts`
- `server/controlPlane/routes.ts`
- `server/controlPlane/database.ts`
- `server/gameServer.ts`
- `src/hooks/useGameSocket.ts`
- `src/types.ts`
- `public/game-config.json`
- `AGENTS.md`
- `.scratch/production-multiplayer-deployment/issues/03-prove-discord-regional-connectivity.md`
- `.scratch/production-multiplayer-deployment/issues/05-define-durable-control-plane-model.md`
- `.scratch/production-multiplayer-deployment/issues/09-define-release-and-operations-contract.md`

## Unknowns to resolve before implementation

1. Which Discord Activity SDK/context provides the verifiable identity
   assertion in the current launch configuration?
2. Where does server-side verification obtain the application secret or public
   key, and how is it rotated?
3. Does the Activity need a refreshable application session separate from the
   game session?
4. What should happen when Discord identity verification succeeds but the
   control plane is temporarily unavailable?
5. Which mapped relative paths are available in staging and production?
6. What privacy/consent wording is required before storing the provider-linked
   internal player record?

## Do not do

- Do not accept `discordUserId` as proof of identity from the browser.
- Do not put Discord provider tokens in `localStorage`.
- Do not use `socket.id` as the Discord player identity.
- Do not create a second match, seat, or socket protocol for Discord.
- Do not make direct web guests depend on Discord SDK availability.
- Do not reopen the approved Discord routing topology from ticket 03.
