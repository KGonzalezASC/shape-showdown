# Shape Showdown — Core Architecture & Protocol Specification

> **Canonical System Specification.** This document defines the active architecture, game rules, network contracts, and simulation invariants for **Shape Showdown** (1v1 server-authoritative Tetris). For local setup and contributor commands, consult [`AGENTS.md`](./AGENTS.md).

---

## 1. System Overview

**Shape Showdown** is a **two-player, server-authoritative** real-time browser game featuring parallel falling-piece fields. Each player controls an independent playfield while competing in real-time over Socket.IO.

* **Simulation Rate:** 60 Hz fixed server tick loop (`server/GameManager.ts`).
* **Identity:** Socket ID (`socket.id`), up to 2 players per server instance.
* **Match States:** `waiting` → `countdown` → `playing` → `ended`. Matches continue until a player tops out or disconnects; there is no wall-clock timeout. First top-out ends the match immediately.

---

## 2. Playfield & Piece Invariants

* **Board Dimensions:** 
  * **Visible Field:** 10 columns × 18 rows (`src/constants.ts`).
  * **Simulation Matrix:** 10 columns × 20 rows (includes 2 hidden spawn rows at the top).
* **Piece Generation:** Standard SRS (Super Rotation System) 7-Bag generator driven by a shared, seeded [`MutableRng`](file:///c:/Users/Keithythefrog/source/BubbleBlitzers/src/rng.ts).
* **Lock Delay:** Extended placement rule — successful movement or rotation resets the lock timer up to `LOCK_RESET_CAP` (default: 10 resets per piece).
* **Hold Storage:** Single piece hold buffer with swap cooldown until piece lock. Storage toxin/freeze items can temporarily lock or poison hold operations.

---

## 3. Server-Authoritative Netcode & Protocol

### Network Loop
Clients send discrete actions and continuous held inputs. The server applies movement, gravity, locks, line clears, garbage arrival, and shop effects inside [`server/tetris/engine.ts`](file:///c:/Users/Keithythefrog/source/BubbleBlitzers/server/tetris/engine.ts) via `stepPlayer()`.

### Socket Events

#### Client → Server
* **`inputState`**: Held continuous inputs (`left`, `right`, `softDrop`).
* **`action`**: Discrete single-frame actions (`rotateCW`, `rotateCCW`, `hardDrop`, `hold`, `buyShopOffer`).

#### Server → Client
* **`gameState`**: Full authoritative match snapshot (`GameState`).
* **`matchEvent`**: Real-time event notifications (`lineClear`, `attackSent`, `garbageReceived`, `topOut`, `shopOpened`).

---

## 4. Versus & Garbage Mechanics

### Attack Table Baseline
Garbage is generated when a player locks a piece and clears lines:

| Action | Lines Sent |
| :--- | :--- |
| **Single** | 0 |
| **Double** | 1 |
| **Triple** | 2 |
| **Tetris** | 4 |
| **T-Spin Single** | 2 |
| **T-Spin Double** | 4 |
| **T-Spin Triple** | 6 |
| **Back-to-Back (B2B)** | +1 bonus to Tetris / T-Spins |
| **Combos** | Scaled incoming attack bonus |
| **Perfect Clear** | +10 bonus lines |

### Delivery & Cancellation
1. **Garbage Cancellation:** Outgoing attacks first offset and cancel incoming pending garbage in the player's queue.
2. **Garbage Arrival:** Uncancelled attacks are enqueued to the opponent with a short arrival delay before rising from the bottom.
3. **Hole Distribution:** Garbage lines spawn with standardized hole positions to allow counter-play.

---

## 5. Shop & Powerup Integration

* **Shop Activation:** Clearing lines generates shop energy/offers.
* **Phase Machine:** Player shops cycle through `waiting` → `ready` → `cycling` → `expired` phases.
* **Authoritative Execution:** Purchases are validated server-side by `applyShopPurchase` in [`server/shop.ts`](file:///c:/Users/Keithythefrog/source/BubbleBlitzers/server/shop.ts) against phase, cost, and target constraints.
* **Powerup Semantics:** Field effects (e.g., Elixir, Curtain, Bomber, Magnet, Satellite, Tectonic Shift, Wildcard +4) emit semantic `ActiveFieldEffect` kinds on the wire; the client maps them to visual styles via `effectStyles.ts`.

---

## 6. Replays & Determinism

* **Seeded RNG:** The match seed drives piece generation, shop offer draws, and variant selections.
* **Replay Recording:** Matches store initial seed, initial configuration, and timestamped input streams.
* **Reconstruction:** The replay engine reconstructs matches deterministically by stepping `stepPlayer()` with the recorded input stream.

---

## Reference Map

* **Server Entry:** [`server.ts`](file:///c:/Users/Keithythefrog/source/BubbleBlitzers/server.ts)
* **Match Lifecycle:** [`server/GameManager.ts`](file:///c:/Users/Keithythefrog/source/BubbleBlitzers/server/GameManager.ts)
* **Simulation Core:** [`server/tetris/engine.ts`](file:///c:/Users/Keithythefrog/source/BubbleBlitzers/server/tetris/engine.ts)
* **Shop Catalog & Handlers:** [`server/shop.ts`](file:///c:/Users/Keithythefrog/source/BubbleBlitzers/server/shop.ts) & [`src/shop/shopCatalog.ts`](file:///c:/Users/Keithythefrog/source/BubbleBlitzers/src/shop/shopCatalog.ts)
* **Board Model Seam:** [`src/board/boardVisualModel.ts`](file:///c:/Users/Keithythefrog/source/BubbleBlitzers/src/board/boardVisualModel.ts)
