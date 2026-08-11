# Tax Siphon replay evidence

Generated 2026-08-10 from the Tax Siphon buyer-only RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Only p1 purchases `bounty-tax` (Tax Siphon); p2 makes no shop purchases
- Role contract: `p1` is the only powerup buyer; `p2` is the recipient
- Authoritative mechanic under test: On purchase, Tax Siphon steals 30% of the opponent score and adds it to the buyer score; can only be purchased when trailing behind.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Curtain buyer

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Buyer survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **60.00%** (95% CI: 35.7–80.2%) |
| Avg score | 41,010 | 26,596 |
| Median score | 40,683 | 21,456 |
| Avg lines | 208.20 | 135.53 |
| Median lines | 208 | 115 |
| Avg holes | 0.13 | 6.80 |
| Median holes | 0.00 | 1.00 |
| Avg cavity depth | 0.80 | 50.40 |
| Median cavity depth | 0.00 | 2.00 |
| Avg aggregate height | 16.80 | 85.47 |
| Median aggregate height | 14.00 | 37.00 |
| Avg bumpiness | 6.60 | 10.80 |
| Median bumpiness | 6.00 | 10.00 |
| Avg survival time | 120.0s | 74.3s |
| Median survival time | 120.0s | 62.4s |

### Curtain recipient

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Recipient survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **66.67%** (95% CI: 41.7–84.8%) |
| Avg score | 39,064 | 22,023 |
| Median score | 39,028 | 19,436 |
| Avg lines | 206.60 | 136.73 |
| Median lines | 207 | 110 |
| Avg holes | 0.13 | 5.73 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.27 | 36.93 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.53 | 72.93 |
| Median aggregate height | 14.00 | 25.00 |
| Avg bumpiness | 6.60 | 8.27 |
| Median bumpiness | 6.00 | 7.00 |
| Avg survival time | 120.0s | 74.3s |
| Median survival time | 120.0s | 62.4s |

### Pooled (secondary)

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **63.33%** (95% CI: 45.5–78.1%) |
| Avg score | 40,037 | 24,309 |
| Median score | 40,243 | 19,516 |
| Avg lines | 207.40 | 136.13 |
| Median lines | 207 | 113 |
| Avg holes | 0.13 | 6.27 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.53 | 43.67 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.67 | 79.20 |
| Median aggregate height | 14.00 | 32.50 |
| Avg bumpiness | 6.60 | 9.53 |
| Median bumpiness | 6.00 | 9.00 |
| Avg survival time | 120.0s | 74.3s |
| Median survival time | 120.0s | 62.4s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Tax Siphon purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 14 |
| garbage-on | 15 | 30 | 19 | 18 |

## Replay artifacts

- [Tax Siphon replay folder](../../fixtures/replays/bounty-tax/)
- [Garbage-off replays](../../fixtures/replays/bounty-tax/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/bounty-tax/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/bounty-tax/summary.json)

Curtain is represented by the authoritative swap cutoff, active effect, and player-limited masked board; the replay viewer does not synthesize a separate blackout animation.
