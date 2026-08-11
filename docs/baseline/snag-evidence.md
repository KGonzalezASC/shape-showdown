# Snag replay evidence

Generated 2026-08-10 from the Snag buyer-only RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Only p1 purchases `fortify-frame` (Snag); p2 makes no shop purchases
- Role contract: `p1` is the only powerup buyer; `p2` is the recipient
- Authoritative mechanic under test: On purchase, Snag blocks the opponent from hard-dropping or soft-dropping the current piece until it locks or is held; if the current piece already hard-dropped, the next spawn is blocked instead.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Curtain buyer

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Buyer survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **93.33%** (95% CI: 70.2–98.8%) |
| Avg score | 39,223 | 6,583 |
| Median score | 39,454 | 5,788 |
| Avg lines | 207.60 | 36.07 |
| Median lines | 207 | 32 |
| Avg holes | 0.13 | 2.00 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.80 | 10.47 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.13 | 32.20 |
| Median aggregate height | 12.00 | 19.00 |
| Avg bumpiness | 6.27 | 6.33 |
| Median bumpiness | 5.00 | 6.00 |
| Avg survival time | 120.0s | 24.7s |
| Median survival time | 120.0s | 22.0s |

### Curtain recipient

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Recipient survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **6.67%** (95% CI: 1.2–29.8%) |
| Avg score | 15,913 | 2,820 |
| Median score | 15,916 | 2,040 |
| Avg lines | 83.67 | 17.33 |
| Median lines | 85 | 13 |
| Avg holes | 0.07 | 17.33 |
| Median holes | 0.00 | 18.00 |
| Avg cavity depth | 0.07 | 138.40 |
| Median cavity depth | 0.00 | 152.00 |
| Avg aggregate height | 12.47 | 179.00 |
| Median aggregate height | 10.00 | 189.00 |
| Avg bumpiness | 6.60 | 6.53 |
| Median bumpiness | 6.00 | 8.00 |
| Avg survival time | 120.0s | 24.7s |
| Median survival time | 120.0s | 22.0s |

### Pooled (secondary)

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **50.00%** (95% CI: 33.2–66.8%) |
| Avg score | 27,568 | 4,702 |
| Median score | 30,395 | 4,183 |
| Avg lines | 145.63 | 26.70 |
| Median lines | 161 | 23 |
| Avg holes | 0.10 | 9.67 |
| Median holes | 0.00 | 11.00 |
| Avg cavity depth | 0.43 | 74.43 |
| Median cavity depth | 0.00 | 73.50 |
| Avg aggregate height | 14.30 | 105.60 |
| Median aggregate height | 12.00 | 126.00 |
| Avg bumpiness | 6.43 | 6.43 |
| Median bumpiness | 6.00 | 6.50 |
| Avg survival time | 120.0s | 24.7s |
| Median survival time | 120.0s | 22.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Snag purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 280 |
| garbage-on | 15 | 30 | 15 | 55 |

## Replay artifacts

- [Snag replay folder](../../fixtures/replays/snag/)
- [Garbage-off replays](../../fixtures/replays/snag/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/snag/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/snag/summary.json)

Snag is represented by the authoritative hard/soft-drop blocking state and recorded input frames; the replay viewer does not synthesize a separate Snag animation.
