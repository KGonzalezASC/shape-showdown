# Bomber replay evidence

Generated 2026-08-10 from the Bomber buyer-only RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Only p1 purchases `nova-charge` (Bomber); p2 makes no shop purchases
- Role contract: `p1` is the only powerup buyer; `p2` is the recipient
- Authoritative mechanic under test: On purchase, Bomber arms the current active piece (or the next spawn); on lock it clears the radius-2 circular blast footprint without gravity or direct score.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Curtain buyer

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Buyer survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **73.33%** (95% CI: 48.0–89.1%) |
| Avg score | 37,088 | 29,927 |
| Median score | 37,062 | 37,664 |
| Avg lines | 194.33 | 168.07 |
| Median lines | 194 | 207 |
| Avg holes | 0.00 | 4.00 |
| Median holes | 0.00 | 1.00 |
| Avg cavity depth | 0.00 | 29.27 |
| Median cavity depth | 0.00 | 1.00 |
| Avg aggregate height | 14.93 | 62.40 |
| Median aggregate height | 14.00 | 24.00 |
| Avg bumpiness | 5.87 | 10.27 |
| Median bumpiness | 6.00 | 10.00 |
| Avg survival time | 120.0s | 96.3s |
| Median survival time | 120.0s | 120.0s |

### Curtain recipient

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Recipient survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **86.67%** (95% CI: 62.1–96.3%) |
| Avg score | 40,046 | 32,707 |
| Median score | 40,104 | 40,582 |
| Avg lines | 207.47 | 177.27 |
| Median lines | 207 | 218 |
| Avg holes | 0.13 | 3.20 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.27 | 20.40 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.13 | 42.73 |
| Median aggregate height | 16.00 | 12.00 |
| Avg bumpiness | 5.87 | 6.87 |
| Median bumpiness | 5.00 | 5.00 |
| Avg survival time | 120.0s | 96.3s |
| Median survival time | 120.0s | 120.0s |

### Pooled (secondary)

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **80.00%** (95% CI: 62.7–90.5%) |
| Avg score | 38,567 | 31,317 |
| Median score | 38,667 | 38,089 |
| Avg lines | 200.90 | 172.67 |
| Median lines | 202 | 212 |
| Avg holes | 0.07 | 3.60 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.13 | 24.83 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 15.53 | 52.57 |
| Median aggregate height | 14.50 | 17.50 |
| Avg bumpiness | 5.87 | 8.57 |
| Median bumpiness | 6.00 | 6.00 |
| Avg survival time | 120.0s | 96.3s |
| Median survival time | 120.0s | 120.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Bomber purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 234 |
| garbage-on | 15 | 30 | 24 | 202 |

## Replay artifacts

- [Bomber replay folder](../../fixtures/replays/bomber/)
- [Garbage-off replays](../../fixtures/replays/bomber/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/bomber/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/bomber/summary.json)

The replay viewer suppresses Bomber shard animation for sparse keyframe transitions because a 120-tick board diff cannot distinguish Bomber-cleared cells from ordinary line-clear removals. The authoritative board state and live-game Bomber animation remain enabled.
