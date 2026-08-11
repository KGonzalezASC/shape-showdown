# Magnet replay evidence

Generated 2026-08-10 from the Magnet buyer-only RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Only p1 purchases `gravity-lure` (Magnet); p2 makes no shop purchases
- Role contract: `p1` is the only powerup buyer; `p2` is the recipient
- Authoritative mechanic under test: On purchase, Magnet accelerates the opponent: the first three purchases add +2 gravity each permanently, then later purchases add +1 gravity to the current piece until it locks, with a 12-tick minimum per cell.
- RulesBot v1 uses the player-visible Magnet stacks and current-piece boost to penalize placements whose estimated control window is already exceeded; the metrics below are the corrected v1 baseline after rerunning the matched suite.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Curtain buyer

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Buyer survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **86.67%** (95% CI: 62.1–96.3%) |
| Avg score | 37,739 | 29,550 |
| Median score | 37,755 | 36,626 |
| Avg lines | 207.40 | 173.53 |
| Median lines | 207 | 209 |
| Avg holes | 0.13 | 2.60 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.67 | 15.33 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 13.33 | 46.00 |
| Median aggregate height | 10.00 | 20.00 |
| Avg bumpiness | 6.47 | 11.80 |
| Median bumpiness | 5.00 | 9.00 |
| Avg survival time | 120.0s | 93.1s |
| Median survival time | 120.0s | 112.0s |

### Curtain recipient

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Recipient survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **53.33%** (95% CI: 30.1–75.2%) |
| Avg score | 39,451 | 31,028 |
| Median score | 39,526 | 35,664 |
| Avg lines | 207.47 | 173.00 |
| Median lines | 207 | 204 |
| Avg holes | 0.13 | 7.13 |
| Median holes | 0.00 | 3.00 |
| Avg cavity depth | 0.27 | 49.13 |
| Median cavity depth | 0.00 | 30.00 |
| Avg aggregate height | 15.87 | 93.00 |
| Median aggregate height | 16.00 | 110.00 |
| Avg bumpiness | 5.93 | 11.33 |
| Median bumpiness | 5.00 | 8.00 |
| Avg survival time | 120.0s | 93.1s |
| Median survival time | 120.0s | 112.0s |

### Pooled (secondary)

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **70.00%** (95% CI: 52.1–83.3%) |
| Avg score | 38,595 | 30,289 |
| Median score | 38,896 | 36,145 |
| Avg lines | 207.43 | 173.27 |
| Median lines | 207 | 207 |
| Avg holes | 0.13 | 4.87 |
| Median holes | 0.00 | 1.00 |
| Avg cavity depth | 0.47 | 32.23 |
| Median cavity depth | 0.00 | 2.00 |
| Avg aggregate height | 14.60 | 69.50 |
| Median aggregate height | 11.00 | 33.00 |
| Avg bumpiness | 6.20 | 11.57 |
| Median bumpiness | 5.00 | 8.50 |
| Avg survival time | 120.0s | 93.1s |
| Median survival time | 120.0s | 112.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Magnet purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 278 |
| garbage-on | 15 | 30 | 21 | 211 |

## Replay artifacts

- [Magnet replay folder](../../fixtures/replays/magnet/)
- [Garbage-off replays](../../fixtures/replays/magnet/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/magnet/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/magnet/summary.json)

Magnet gravity is represented by the authoritative player gravity state in each replay; the replay viewer does not synthesize a separate Magnet animation.
