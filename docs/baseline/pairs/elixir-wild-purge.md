# Elixir into Wild Purge Paired Powerup Evidence

Generated from the **Elixir into Wild Purge** (`elixir-pulse` -> `vortex-step`) natural shop roll replay suite across **Valid** (Elixir -> visible poison -> Wild Purge) and **Reverse-Negative Control** (attempt Wild Purge before Elixir) sequences in both **Buyer-Recipient** and **Mirror Match** role modes.

## Configuration

- 15 matched seeds per treatment: `910000 + i * 17` (`i = 0..14`)
- 120-second cap per match (7,200 ticks)
- Observation mode: `player-limited`
- Shop pool: standard unmutated 14-item catalog roll pool
- Prices: actual catalog prices (`elixir-pulse`: 55, `vortex-step`: 70)
- Sequence contract: Mandatory order. Elixir must infect opponent, poison must be visible on board, then Wild Purge payoff activates.

## Results Summary

### 1. Buyer-Recipient Mode (`P1` Buyer, `P2` Recipient)

| Sequence | Mode | Matches | Elixir Purchases (`P1`) | Wild Purge Purchases (`P1`) | Buyer Survival (`P1`) | Recipient Survival (`P2`) | Pooled Survival | Avg Buyer Score | Avg Recipient Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Valid** (Elixir -> Purge) | Garbage Off | 15 | 15 | 15 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 39,982 | 40,085 |
| | Garbage On | 15 | 15 | 15 | **86.7%** (13/15) | **73.3%** (11/15) | **80.0%** | 30,450 | 30,189 |
| **Reverse-Negative Control** | Garbage Off | 15 | 15 | 30 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 39,898 | 40,017 |
| | Garbage On | 15 | 15 | 30 | **86.7%** (13/15) | **86.7%** (13/15) | **86.7%** | 33,558 | 34,229 |

### 2. Mirror Match Mode (Both `P1` and `P2` Buy)

| Sequence | Mode | Matches | Elixir Purchases | Wild Purge Purchases | `P1` Survival | `P2` Survival | Pooled Survival | Avg `P1` Score | Avg `P2` Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Valid** (Elixir -> Purge) | Garbage Off | 15 | 30 | 30 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 39,806 | 39,895 |
| | Garbage On | 15 | 30 | 30 | **73.3%** (11/15) | **66.7%** (10/15) | **70.0%** | 29,266 | 28,740 |
| **Reverse-Negative Control** | Garbage Off | 15 | 30 | 60 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 39,762 | 39,706 |
| | Garbage On | 15 | 30 | 60 | **60.0%** (9/15) | **93.3%** (14/15) | **76.7%** | 34,239 | 34,976 |

## Key Findings

1. **Mandatory Sequence Execution**: In the valid sequence, Elixir infects the opponent board with poison, and as soon as poison generations become visible in the player-limited opponent observation, Wild Purge (`vortex-step`) is purchased and successfully activates.
2. **Reverse Control Behavior**: In the reverse-negative sequence, Wild Purge is attempted first; once poison is delivered by Elixir, Wild Purge completes its purge telegraph without consuming prerequisite seeds prematurely.

## Replay Artifacts

- [Valid Buyer-Recipient Replays](../../fixtures/replays/pairs/elixir-wild-purge/valid/)
- [Valid Mirror Replays](../../fixtures/replays/pairs/elixir-wild-purge/valid-mirror/)
- [Reverse-Negative Buyer-Recipient Replays](../../fixtures/replays/pairs/elixir-wild-purge/reverse-negative/)
- [Reverse-Negative Mirror Replays](../../fixtures/replays/pairs/elixir-wild-purge/reverse-negative-mirror/)
