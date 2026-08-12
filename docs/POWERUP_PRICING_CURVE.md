# Powerup Pricing Curve — Replay-Derived Runtime Policy

Status: implemented pricing policy derived from the saved replay corpus. Existing replays were not regenerated.

## Runtime rule

Pricing state is per player, per item, and resets each match.

The first successful purchase opens a 20-second engagement window. Purchases do not extend the timer. The current level closes when either the timer expires or the same-price purchase allowance is exhausted. The next successful purchase uses the next level and opens a fresh window. An expired window advances only one level; inactivity does not repeatedly inflate an untouched item.

Allowance exhaustion and timer expiration are separate causes with the same economic result:

- **Allowance exhausted:** the buyer used every same-price purchase in the active window. The next purchase is one level higher immediately.
- **Timer expired:** the buyer did not use the remaining allowance before 20 seconds elapsed. The next purchase is one level higher when the server normalizes the item state.

Both transitions reset the window and preserve the reason in the authoritative state for UI and replay diagnostics. A successful purchase clears the previous close reason and starts a new window. Pricing state is per player and per item and resets between matches.

The live game uses the **Compact Rail** presentation: the current price remains in each offer row, while the highlighted offer expands to show level, same-price purchases remaining, engagement countdown, and next price. The three exploratory layouts remain available through the `V` mockup for comparison.

New powerups do not change existing curves. Each new item must receive its own evidence-backed `basePrice`, `allowance`, and `growthRate` entry before it can be purchased; the runtime intentionally fails fast when a catalog item has no pricing curve.

Prices are uncapped:

```text
price(item, level) =
  basePrice                                      when level = 0
  roundToNearest5(basePrice * growthRate^level) otherwise
```

## Replay-derived inputs

For items with direct buyer/recipient and mirror suites:

```text
conditionalBuyRate = accepted purchases / eligible offers

rateDemand   = min(1, conditionalBuyRate / 0.30)
volumeDemand = min(1, median purchases per eligible trajectory / 18)
demandScore  = (rateDemand + volumeDemand) / 2
```

Strength is the normalized value-tier prior derived from purchase, survival, and win evidence. It selects the curve; it is not applied again as a separate price multiplier.

```text
growthRate = roundToNearest0.05(
  1.20 + 0.45 * (strengthPrior + demandScore)
)
```

Tax Siphon is an explicit exception at `1.20x`: its eligibility gate and percentage transfer already scale its availability and payoff.

Pair-only experiments deliberately purchased one or two ordered items, so their observed purchase rate is not a natural demand measurement. Re-Trim, Elixir, Wild Purge, and Wildcard +4 therefore use a neutral `0.50` demand prior. Freeze and Contagion also use `0.50`, but remain mechanics-only provisional curves because they lack standalone replay trajectories.

For directly measured items, the same-price allowance is the lower of:

- The empirical 75th-percentile purchases in an anchored 20-second window.
- The strength cap: S = 2, A = 3, B = 4, C/D = 5.

Pair-only and mechanics-prior items use the strength cap because their scripted cadence is not representative.

The 20-second duration is supported by the direct replay cadence: median gaps between accepted purchases were 4.6–7.35 seconds, and 91.4%–97.7% of adjacent purchases occurred within 20 seconds. A 15-second window would capture less of the observed burst behavior.

## Candidate parameters and levels

Each listed price applies to at most `Allowance` successful purchases during that level's 20-second window.

| Item | Evidence | Value tier | Allowance | Growth | L0 | L1 | L2 | L3 | L4 | L5 | L6 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Snag | Direct | S+ | 2 | 1.95x | 60 | 115 | 230 | 445 | 870 | 1,690 | 3,300 |
| Satellite | Direct | S | 2 | 2.05x | 80 | 165 | 335 | 690 | 1,415 | 2,895 | 5,940 |
| Curtain | Direct | A | 3 | 1.85x | 140 | 260 | 480 | 885 | 1,640 | 3,035 | 5,615 |
| Magnet | Direct | A | 3 | 1.95x | 125 | 245 | 475 | 925 | 1,805 | 3,525 | 6,875 |
| Tectonic Shift | Direct | B | 4 | 1.80x | 140 | 250 | 455 | 815 | 1,470 | 2,645 | 4,760 |
| Re-Trim | Pair-only | B | 4 | 1.70x | 120 | 205 | 345 | 590 | 1,000 | 1,705 | 2,895 |
| Wildcard +4 | Pair-only | B- | 4 | 1.65x | 60 | 100 | 165 | 270 | 445 | 735 | 1,210 |
| Elixir | Pair-only | C+ | 5 | 1.60x | 55 | 90 | 140 | 225 | 360 | 575 | 925 |
| Sticky | Direct | C | 5 | 1.80x | 50 | 90 | 160 | 290 | 525 | 945 | 1,700 |
| Wild Purge | Pair-only | C | 5 | 1.55x | 70 | 110 | 170 | 260 | 405 | 625 | 970 |
| Freeze | Mechanics prior | C provisional | 5 | 1.55x | 45 | 70 | 110 | 170 | 260 | 405 | 625 |
| Contagion | Mechanics prior | C provisional | 5 | 1.55x | 50 | 80 | 120 | 185 | 290 | 445 | 695 |
| Bomber | Direct | D | 4 | 1.65x | 110 | 180 | 300 | 495 | 815 | 1,345 | 2,220 |
| Tax Siphon | Direct, gated | D/special | 3 | 1.20x | 50 | 60 | 70 | 85 | 105 | 125 | 150 |

The table stops at L6 for readability. Runtime generation continues with the same formula indefinitely.

## Direct demand evidence

| Item | Eligible offers | Accepted buys | Conditional buy rate | Median buys / trajectory | Demand score |
| --- | ---: | ---: | ---: | ---: | ---: |
| Snag | 2,489 | 769 | 30.9% | 7 | 0.69 |
| Satellite | 5,781 | 1,612 | 27.9% | 18 | 0.96 |
| Curtain | 2,121 | 639 | 30.1% | 5 | 0.64 |
| Magnet | 5,476 | 1,486 | 27.1% | 17 | 0.92 |
| Tectonic Shift | 4,572 | 1,135 | 24.8% | 14 | 0.80 |
| Sticky | 5,653 | 1,525 | 27.0% | 18 | 0.95 |
| Bomber | 5,017 | 1,293 | 25.8% | 15 | 0.85 |
| Tax Siphon | 5,085 | 658 | 12.9% | 8 | 0.44 |

These totals pool saved buyer/recipient and mirror trajectories across garbage-off and garbage-on modes. Lower purchase volume can reflect earlier match endings, which is why both conditional rate and trajectory volume are retained.

## Offline affordability check

The analyzer restores each tested item's historical spending into the replay keyframes, applies the proposed price schedule, and asks which recorded purchase attempts remain affordable. This is a frozen-trajectory counterfactual: it can validate affordability but cannot claim new survival or win outcomes because rejected purchases would change later boards.

The proposed curves retained approximately:

| Item | Recorded attempts still affordable |
| --- | ---: |
| Satellite | 79.4% |
| Snag | 93.6% |
| Magnet | 95.1% |
| Curtain | 99.5% |
| Other directly measured items | 100% in the saved 120-second trajectories |

That pattern is intentional for the first candidate: the high-value/high-demand tails are constrained first, while weak and situational items remain accessible during ordinary 120-second matches. Their prices still escalate without a plateau in unusually long or purchase-heavy matches.

## What was rejected during calculation

An independent per-item wallet fit was tested and rejected. Solving each growth rate solely from late wallet size made cheap weak items grow faster than strong items because the formula was compensating for base-price differences. That contradicted the design rule and produced difficult-to-explain curves.

The selected equation therefore uses strength and demand to determine growth monotonically. Wallet reconstruction is retained as a stress test rather than the curve generator.

## Reproduction

Run the read-only analyzer:

```powershell
bun scripts/analyze-pricing-replays.mts
```

It reads existing replay JSON and prints the full calculation as JSON. It does not run the gameplay harness or generate replays.
