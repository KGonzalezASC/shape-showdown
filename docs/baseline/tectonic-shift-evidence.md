# Tectonic Shift replay evidence

Generated 2026-08-10 from the Tectonic Shift buyer-only RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Only p1 purchases `tectonic-shift` (Tectonic Shift); p2 makes no shop purchases
- Role contract: `p1` is the only powerup buyer; `p2` is the recipient
- Authoritative mechanic under test: On purchase, Tectonic Shift collapses all columns downward to fill holes; cleared lines award no score, garbage, or shop rolls.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Curtain buyer

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Buyer survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **73.33%** (95% CI: 48.0–89.1%) |
| Avg score | 35,793 | 25,657 |
| Median score | 35,982 | 28,114 |
| Avg lines | 197.40 | 149.47 |
| Median lines | 198 | 173 |
| Avg holes | 0.07 | 4.60 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.13 | 33.07 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 14.33 | 64.93 |
| Median aggregate height | 12.00 | 18.00 |
| Avg bumpiness | 7.13 | 10.20 |
| Median bumpiness | 7.00 | 7.00 |
| Avg survival time | 120.0s | 87.5s |
| Median survival time | 120.0s | 98.6s |

### Curtain recipient

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Recipient survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **60.00%** (95% CI: 35.7–80.2%) |
| Avg score | 40,046 | 29,318 |
| Median score | 40,104 | 33,506 |
| Avg lines | 207.47 | 159.40 |
| Median lines | 207 | 182 |
| Avg holes | 0.13 | 6.67 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.27 | 45.73 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.13 | 78.60 |
| Median aggregate height | 16.00 | 28.00 |
| Avg bumpiness | 5.87 | 9.80 |
| Median bumpiness | 5.00 | 8.00 |
| Avg survival time | 120.0s | 87.5s |
| Median survival time | 120.0s | 98.6s |

### Pooled (secondary)

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **66.67%** (95% CI: 48.8–80.8%) |
| Avg score | 37,919 | 27,488 |
| Median score | 38,065 | 30,574 |
| Avg lines | 202.43 | 154.43 |
| Median lines | 203 | 175 |
| Avg holes | 0.10 | 5.63 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.20 | 39.40 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 15.23 | 71.77 |
| Median aggregate height | 12.00 | 19.50 |
| Avg bumpiness | 6.50 | 10.00 |
| Median bumpiness | 6.00 | 7.50 |
| Avg survival time | 120.0s | 87.5s |
| Median survival time | 120.0s | 98.6s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Tectonic Shift purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 239 |
| garbage-on | 15 | 30 | 20 | 163 |

## Replay artifacts

- [Tectonic Shift replay folder](../../fixtures/replays/tectonic-shift/)
- [Garbage-off replays](../../fixtures/replays/tectonic-shift/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/tectonic-shift/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/tectonic-shift/summary.json)

Curtain is represented by the authoritative swap cutoff, active effect, and player-limited masked board; the replay viewer does not synthesize a separate blackout animation.
