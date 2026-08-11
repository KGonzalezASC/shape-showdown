# Curtain replay evidence

Generated 2026-08-10 from the Curtain-only RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Only p1 purchases `curtain` (Curtain); p2 makes no shop purchases
- Role contract: `p1` is the only powerup buyer; `p2` is the recipient
- Authoritative mechanic under test: On purchase, Curtain lowers the opponent swap line and frosts the three rows above a four-second blackout below that frontier; the authoritative board remains unchanged.
- RulesBot v1 remembers the last visible board while it remains inferable. In garbage-enabled matches, hidden garbage makes that snapshot stale, so the known match rule selects a low-assumption recovery policy that never reads the authoritative concealed board.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Curtain buyer

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Buyer survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **80.00%** (95% CI: 54.8–93.0%) |
| Avg score | 32,623 | 8,074 |
| Median score | 37,506 | 5,454 |
| Avg lines | 179.40 | 47.93 |
| Median lines | 207 | 30 |
| Avg holes | 0.13 | 3.53 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.60 | 26.87 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 15.73 | 52.67 |
| Median aggregate height | 14.00 | 18.00 |
| Avg bumpiness | 6.93 | 7.67 |
| Median bumpiness | 6.00 | 9.00 |
| Avg survival time | 104.8s | 30.4s |
| Median survival time | 120.0s | 21.6s |

### Curtain recipient

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Recipient survival (15 trajectories/mode) | **80.00%** (95% CI: 54.8–93.0%) | **20.00%** (95% CI: 7.0–45.2%) |
| Avg score | 18,329 | 6,448 |
| Median score | 20,558 | 3,634 |
| Avg lines | 98.07 | 40.53 |
| Median lines | 110 | 22 |
| Avg holes | 3.47 | 19.73 |
| Median holes | 0.00 | 19.00 |
| Avg cavity depth | 22.73 | 126.60 |
| Median cavity depth | 0.00 | 151.00 |
| Avg aggregate height | 53.47 | 152.47 |
| Median aggregate height | 34.00 | 166.00 |
| Avg bumpiness | 15.47 | 10.80 |
| Median bumpiness | 9.00 | 10.00 |
| Avg survival time | 104.8s | 30.4s |
| Median survival time | 120.0s | 21.6s |

### Pooled (secondary)

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **90.00%** (95% CI: 74.4–96.5%) | **50.00%** (95% CI: 33.2–66.8%) |
| Avg score | 25,476 | 7,261 |
| Median score | 23,738 | 5,374 |
| Avg lines | 138.73 | 44.23 |
| Median lines | 126 | 30 |
| Avg holes | 1.80 | 11.63 |
| Median holes | 0.00 | 10.00 |
| Avg cavity depth | 11.67 | 76.73 |
| Median cavity depth | 0.00 | 65.50 |
| Avg aggregate height | 34.60 | 102.57 |
| Median aggregate height | 18.00 | 122.00 |
| Avg bumpiness | 11.20 | 9.23 |
| Median bumpiness | 7.50 | 9.50 |
| Avg survival time | 104.8s | 30.4s |
| Median survival time | 120.0s | 21.6s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Curtain purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 27 | 222 |
| garbage-on | 15 | 30 | 15 | 71 |

## Replay artifacts

- [Curtain replay folder](../../fixtures/replays/curtain/)
- [Garbage-off replays](../../fixtures/replays/curtain/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/curtain/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/curtain/summary.json)

Curtain is represented by the authoritative swap cutoff, active effect, and player-limited masked board; the replay viewer does not synthesize a separate blackout animation.
