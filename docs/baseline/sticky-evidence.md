# Sticky replay evidence

Generated 2026-08-10 from the Sticky buyer-only RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Only p1 purchases `quickstep-clock` (Sticky); p2 makes no shop purchases
- Role contract: `p1` is the only powerup buyer; `p2` is the recipient
- Authoritative mechanic under test: On purchase, Sticky limits the opponent current piece to two grounded lock-delay move/rotation resets instead of the normal ten; if no piece is active, the cap applies to the next spawn.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Curtain buyer

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Buyer survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **60.00%** (95% CI: 35.7–80.2%) |
| Avg score | 39,213 | 28,562 |
| Median score | 39,256 | 38,058 |
| Avg lines | 207.53 | 160.07 |
| Median lines | 207 | 219 |
| Avg holes | 0.13 | 6.47 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.67 | 47.07 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 15.73 | 82.20 |
| Median aggregate height | 12.00 | 29.00 |
| Avg bumpiness | 6.73 | 9.13 |
| Median bumpiness | 5.00 | 6.00 |
| Avg survival time | 120.0s | 87.7s |
| Median survival time | 120.0s | 118.7s |

### Curtain recipient

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Recipient survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **86.67%** (95% CI: 62.1–96.3%) |
| Avg score | 40,046 | 29,600 |
| Median score | 40,104 | 39,438 |
| Avg lines | 207.47 | 164.60 |
| Median lines | 207 | 219 |
| Avg holes | 0.13 | 3.33 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.27 | 21.33 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.13 | 50.33 |
| Median aggregate height | 16.00 | 25.00 |
| Avg bumpiness | 5.87 | 7.20 |
| Median bumpiness | 5.00 | 7.00 |
| Avg survival time | 120.0s | 87.7s |
| Median survival time | 120.0s | 118.7s |

### Pooled (secondary)

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **73.33%** (95% CI: 55.6–85.8%) |
| Avg score | 39,630 | 29,081 |
| Median score | 39,738 | 38,964 |
| Avg lines | 207.50 | 162.33 |
| Median lines | 207 | 219 |
| Avg holes | 0.13 | 4.90 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.47 | 34.20 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 15.93 | 66.27 |
| Median aggregate height | 13.00 | 25.50 |
| Avg bumpiness | 6.30 | 8.17 |
| Median bumpiness | 5.00 | 7.00 |
| Avg survival time | 120.0s | 87.7s |
| Median survival time | 120.0s | 118.7s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Sticky purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 267 |
| garbage-on | 15 | 30 | 22 | 193 |

## Replay artifacts

- [Sticky replay folder](../../fixtures/replays/sticky/)
- [Garbage-off replays](../../fixtures/replays/sticky/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/sticky/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/sticky/summary.json)

Sticky is represented by the authoritative lock-reset cap and recorded input frames; the replay viewer does not synthesize a separate Sticky animation.
