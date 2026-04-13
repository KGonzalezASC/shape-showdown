# Bubble Blitzers -> Tetris (1v1) Migration Plan

## Sources (Top-Level)

- Base project fork source: `https://github.com/AVLitskevich/BubbleBlitzersJS`
- Tetris Guideline reference: `https://tetris.wiki/Tetris_Guideline`
- Additional Guideline notes: `https://harddrop.com/wiki/Tetris_Guideline`
- Versus/garbage context: `https://tetris.wiki/Puyo_Puyo_Tetris#Garbage_mechanics`
- Supplemental background (likely optional): `https://github.com/jherskow/nand2tetris/tree/master`

## Decision Locked In

- Versus mode target for now: **Tetris vs Tetris garbage rules** (not mixed Puyo/Tetris timing).
- Keep existing networking harness (Express + Socket.IO + 2-player lobby) and replace game simulation/protocol.
- **Lock delay reset (MVP):** **Extended placement** — successful **horizontal moves and rotations** reset the lock timer, with a **cap of 15** combined move/rotation resets per piece, after which the piece locks even if delay time remains. Matches **Puyo Puyo Tetris** behavior (not pure infinity, not step-only reset). Reference: `https://harddrop.com/wiki/Puyo_Puyo_Tetris_movement_intricacies`

## Goals

1. Reuse the current connection and match lifecycle structure.
2. Replace breakout gameplay with server-authoritative Tetris Guideline style systems.
3. Implement 1v1 garbage with cancel/offset behavior.
4. Upgrade replay system so Tetris matches can be replayed accurately.

## Non-Goals (Initial Version)

- PPT mixed-mode garbage timing (queued send on non-clear lock).
- 3+ player rooms, ranked ladders, or accounts.
- Netcode optimization beyond current full-state broadcast approach.

## Current Assets to Reuse

- Server boot + Socket.IO setup in `server.ts`.
- 2-player lobby constraints and status flow in `server/GameManager.ts`.
- Runtime config loading in `server/loadConfig.ts`.
- Client socket bootstrap + server URL resolution in `src/hooks/useGameSocket.ts`.
- Replay viewer shell and timeline controls in `src/ReplayApp.tsx`.

## High-Level Architecture Changes

### 1) Shared Types and Constants

- Replace breakout-specific types in `src/types.ts` with Tetris domain models:
  - Board matrix (10x20 visible + hidden spawn rows).
  - Active piece, rotation state, spawn position.
  - Hold piece, next queue, bag state/seed.
  - Combo, B2B, pending garbage, outgoing attack events.
  - Match outcome (top out, disconnect, draw policy if timer mode is added).
- Replace breakout constants in `src/constants.ts` with Tetris constants:
  - Gravity/level table, lock delay, **lock reset = move reset with cap 15** (per Decision Locked In), DAS/ARR defaults.
  - Garbage table (line clears, T-Spin, B2B, combo, perfect clear).
  - Tick rate and timings used by server simulation.

### 2) Server Simulation Layer

- Replace breakout `server/Physics.ts` with Tetris engine modules (new `server/tetris/` folder):
  - Piece definitions and SRS kick data.
  - Collision and movement/rotation validation.
  - Gravity, lock-delay, and piece locking (extended placement lock: move/rotate resets timer, max 15 resets per piece).
  - Line clear detection and board compaction.
  - Attack generation and garbage application.
  - Top-out detection and win resolution.
- Keep game loop in `GameManager`, but delegate per-player updates to new Tetris engine.

### 3) Socket Event Contract (Tetris)

Client -> Server events:

- `inputState`: held directional/drop booleans (`left`, `right`, `softDrop`).
- `action`: discrete actions (`rotateCW`, `rotateCCW`, `hardDrop`, `hold`).

Server -> Client events:

- `gameState`: authoritative match state snapshot.
- `matchEvent` (optional feed): `lineClear`, `attackSent`, `garbageReceived`, `topOut`.
- `error`: unchanged for invalid state/game-full messages.

## Garbage System (TvT Baseline)

### Attack Table (initial default)

- Single: 0
- Double: 1
- Triple: 2
- Tetris: 4
- T-Spin Single: 2
- T-Spin Double: 4
- T-Spin Triple: 6
- B2B bonus: +1
- Combo bonus: config-driven table
- Perfect Clear bonus: config-driven (default candidate: +10)

### Delivery Rules

1. Generate attack when a piece locks and clears lines.
2. Apply cancel/offset against defender pending garbage first.
3. Enqueue remaining garbage to opponent with short arrival delay.
4. Apply garbage rows with one hole per row (hole randomization strategy configurable).

## Replay System Upgrade

- Introduce replay format `version: 2`.
- Store:
  - Initial game state and RNG seed.
  - Input/action stream per player with tick timestamps.
  - Sparse keyframes every N ticks for efficient scrubbing.
  - Match events (line clears, attacks, garbage applications, top out).
- Update `src/ReplayApp.tsx` to reconstruct from nearest keyframe + subsequent events/inputs.

## Delivery Phases

### Phase 0 - Foundation

- Add Tetris constants/types.
- Create empty engine scaffolding and unit-friendly helper boundaries.

### Phase 1 - Single-Player Engine Correctness

- 7-bag generation, spawn, movement, SRS rotation, lock.
- Line clears, hold, next queue, top-out.

### Phase 2 - 1v1 Match Integration

- Wire engine into `GameManager` for two concurrent boards.
- Replace breakout socket handlers with Tetris handlers.

### Phase 3 - Garbage and Versus Resolution

- Implement attack table, combo/B2B, perfect clear bonus.
- Implement cancel/offset and delayed garbage arrival.
- End-match on top-out or disconnect.

### Phase 4 - Client Playfield/UI Migration

- Replace canvas breakout renderer with Tetris board renderer.
- Add hold/next UI and garbage meter.
- Replace controls/help text with Tetris bindings.

### Phase 5 - Replay v2

- Server writes v2 replay files.
- Viewer reads and scrubs v2 accurately.

### Phase 6 - Verification and Tuning

- Validate server-authoritative behavior under packet jitter.
- Tune garbage constants and timing for feel.
- Validate two-browser local play and replay parity.

## Acceptance Criteria (MVP)

- Two players can join and play complete 1v1 Tetris matches.
- Server is authoritative for all piece and board state.
- Garbage sends/cancels correctly in TvT.
- Match ends correctly on top-out and disconnect.
- Replay file can be loaded and scrubbed with state consistency.

## Reference Notes

- Guideline behavior references:
  - `https://tetris.wiki/Tetris_Guideline`
  - `https://harddrop.com/wiki/Tetris_Guideline`
- Garbage context reference:
  - `https://tetris.wiki/Puyo_Puyo_Tetris#Garbage_mechanics`
- PPT Tetris movement / lock reset cap (15):
  - `https://harddrop.com/wiki/Puyo_Puyo_Tetris_movement_intricacies`
