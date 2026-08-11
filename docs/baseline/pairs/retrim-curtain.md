# Re-Trim & Curtain Paired Powerup Evidence (Post-Rework)

Generated from the **Re-Trim & Curtain** (`retrim` <-> `curtain`) replay suite following the **Re-Trim Rework**:
- **Swap Line Cap**: Opponent swap cutoff is capped at **Row 5** (allowing a maximum of 5 offensive swap line raises).
- **Curtain Self-Defense Buff**: Every Re-Trim purchase grants the buyer permanent **+1 Curtain Defense** (+1 visible glassy frost row per level against opponent Curtains).
- Evaluated across **Forward** (Re-Trim -> Curtain) and **Reverse** (Curtain -> Re-Trim) sequences in both **Buyer-Recipient** and **Mirror Match** role modes.

## Configuration

- 15 matched seeds per treatment: `910000 + i * 17` (`i = 0..14`)
- 120-second cap per match (7,200 ticks)
- Observation mode: `player-limited`
- Shop pool: standard unmutated 14-item catalog roll pool
- Prices: actual catalog prices (`retrim`: 120, `curtain`: 140)

## Results Summary

### 1. Buyer-Recipient Mode (`P1` Buyer, `P2` Recipient)

| Sequence | Mode | Matches | Setup Purchases (`P1`) | Payoff Purchases (`P1`) | Buyer Survival (`P1`) | Recipient Survival (`P2`) | Pooled Survival | Avg Buyer Score | Avg Recipient Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Forward** (Re-Trim -> Curtain) | Garbage Off | 15 | 15 | 15 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 39,736 | 39,049 |
| | Garbage On | 15 | 15 | 15 | **86.7%** (13/15) | **33.3%** (5/15) | **60.0%** | 12,471 | 11,408 |
| **Reverse** (Curtain -> Re-Trim) | Garbage Off | 15 | 15 | 15 | **100.0%** (15/15) | **93.3%** (14/15) | **96.7%** | 37,693 | 36,582 |
| | Garbage On | 15 | 15 | 13 | **73.3%** (11/15) | **40.0%** (6/15) | **56.7%** | 10,628 | 10,003 |

### 2. Mirror Match Mode (Both `P1` and `P2` Buy)

| Sequence | Mode | Matches | Setup Purchases | Payoff Purchases | `P1` Survival | `P2` Survival | Pooled Survival | Avg `P1` Score | Avg `P2` Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Forward** (Re-Trim -> Curtain) | Garbage Off | 15 | 30 | 30 | **100.0%** (15/15) | **100.0%** (15/15) | **100.0%** | 38,148 | 38,370 |
| | Garbage On | 15 | 28 | 28 | **66.7%** (10/15) | **33.3%** (5/15) | **50.0%** | 5,820 | 5,282 |
| **Reverse** (Curtain -> Re-Trim) | Garbage Off | 15 | 30 | 30 | **100.0%** (15/15) | **93.3%** (14/15) | **96.7%** | 36,170 | 36,168 |
| | Garbage On | 15 | 27 | 24 | **53.3%** (8/15) | **53.3%** (8/15) | **53.3%** | 7,797 | 7,598 |

## Key Findings & Rework Impact

1. **Fair Playability & Survival Increase**: Under the old uncapped system, Re-Trim pushed the swap line to Row 0, creating a 100% total darkness trap where recipient survival dropped to **6.7%**. With the **Row 5 cap + glassy frost defense**, recipient survival increases to **33.3% – 40.0%**, maintaining strong offensive pressure while allowing skillful play.
2. **Sustained Re-Trim Utility**: Even after the opponent's swap line reaches the Row 5 cap, Re-Trim remains valuable to purchase because every buy grants permanent **+1 Curtain Defense**, adding +1 visible glassy frost row against incoming opponent Curtains.

## Replay Artifacts

- [Forward Buyer-Recipient Replays](../../fixtures/replays/pairs/retrim-curtain/forward/)
- [Forward Mirror Replays](../../fixtures/replays/pairs/retrim-curtain/forward-mirror/)
- [Reverse Buyer-Recipient Replays](../../fixtures/replays/pairs/retrim-curtain/reverse/)
- [Reverse Mirror Replays](../../fixtures/replays/pairs/retrim-curtain/reverse-mirror/)
