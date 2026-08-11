# Elixir into Wildcard +4 Paired Powerup Evidence

Generated from the **Elixir into Wildcard +4** (`elixir-pulse` -> `wildcard-four`) natural shop roll replay suite across **Valid** (Elixir -> visible poison -> Wildcard +4) and **Reverse-Negative Control** (attempt Wildcard +4 before Elixir) sequences in both **Buyer-Recipient** and **Mirror Match** role modes.

## Configuration

- 15 matched seeds per treatment: `910000 + i * 17` (`i = 0..14`)
- 120-second cap per match (7,200 ticks)
- Observation mode: `player-limited`
- Shop pool: standard unmutated 14-item catalog roll pool
- Prices: actual catalog prices (`elixir-pulse`: 55, `wildcard-four`: 75)
- Sequence contract: Mandatory order. Elixir must poison opponent, poison must be visible, then Wildcard +4 converts the largest connected poison component into a custom active piece.

## Results Summary

### 1. Buyer-Recipient Mode (`P1` Buyer, `P2` Recipient)

| Sequence | Mode | Matches | Elixir Purchases (`P1`) | Wildcard +4 Purchases (`P1`) | Rejected Attempts | Buyer Survival (`P1`) | Recipient Survival (`P2`) | Pooled Survival | Avg Buyer Score | Avg Recipient Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Valid** (Elixir -> Wildcard+4) | Garbage Off | 15 | 15 | 10 | 9,182 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 40,023 | 39,980 |
| | Garbage On | 15 | 15 | 11 | 7,480 | **60.0%** (9/15) | **73.3%** (11/15) | **66.7%** | 29,375 | 29,613 |
| **Reverse-Negative Control** | Garbage Off | 15 | 15 | 11 | 9,548 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 40,019 | 39,895 |
| | Garbage On | 15 | 15 | 13 | 7,490 | **66.7%** (10/15) | **73.3%** (11/15) | **70.0%** | 29,660 | 29,797 |

### 2. Mirror Match Mode (Both `P1` and `P2` Buy)

| Sequence | Mode | Matches | Elixir Purchases | Wildcard +4 Purchases | Rejected Attempts | `P1` Survival | `P2` Survival | Pooled Survival | Avg `P1` Score | Avg `P2` Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Valid** (Elixir -> Wildcard+4) | Garbage Off | 15 | 30 | 22 | 15,466 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 39,926 | 39,833 |
| | Garbage On | 15 | 30 | 25 | 7,964 | **46.7%** (7/15) | **66.7%** (10/15) | **56.7%** | 20,274 | 20,482 |
| **Reverse-Negative Control** | Garbage Off | 15 | 30 | 24 | 17,073 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 39,807 | 39,651 |
| | Garbage On | 15 | 30 | 26 | 12,512 | **40.0%** (6/15) | **80.0%** (12/15) | **60.0%** | 22,276 | 22,824 |

## Key Findings & Negative Control Verification

1. **Strict Prerequisite Gating**: `wildcard-four` includes a `canPurchase` handler (`opponentHasPoison`) that strictly checks for active poison on the opponent's field.
2. **Reverse Control Enforcement**: In the reverse-negative control sequence, attempting to purchase Wildcard +4 before opponent poison exists results in **7,490–17,073 rejected purchase attempts**. The purchase attempts return `accepted: false`, cost 0, and consume no synergy seeds prematurely.
3. **Poison Activation Payoff**: Once Elixir infects the opponent's board with poison, Wildcard +4 becomes purchasable, converting the largest connected poison component (up to 6 cells) into a custom piece.

## Replay Artifacts

- [Valid Buyer-Recipient Replays](../../fixtures/replays/pairs/elixir-wildcard-four/valid/)
- [Valid Mirror Replays](../../fixtures/replays/pairs/elixir-wildcard-four/valid-mirror/)
- [Reverse-Negative Buyer-Recipient Replays](../../fixtures/replays/pairs/elixir-wildcard-four/reverse-negative/)
- [Reverse-Negative Mirror Replays](../../fixtures/replays/pairs/elixir-wildcard-four/reverse-negative-mirror/)
