# Satellite replay evidence

Generated 2026-08-10 from the Satellite buyer-only RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Only p1 purchases `satellite-link` (Satellite); p2 makes no shop purchases
- Role contract: `p1` is the only powerup buyer; `p2` is the recipient
- Authoritative mechanic under test: On purchase, Satellite arms until incoming garbage is queued; it adds 90 ticks to queued packets and adds 90 ticks to newly queued packets for 600 ticks.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Curtain buyer

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Buyer survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **93.33%** (95% CI: 70.2–98.8%) |
| Avg score | 38,607 | 34,591 |
| Median score | 38,692 | 38,382 |
| Avg lines | 207.40 | 191.67 |
| Median lines | 207 | 212 |
| Avg holes | 0.13 | 1.40 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.80 | 8.73 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.00 | 28.80 |
| Median aggregate height | 12.00 | 14.00 |
| Avg bumpiness | 6.40 | 7.07 |
| Median bumpiness | 6.00 | 7.00 |
| Avg survival time | 120.0s | 107.7s |
| Median survival time | 120.0s | 120.0s |

### Curtain recipient

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Recipient survival (15 trajectories/mode) | **100.00%** (95% CI: 79.6–100.0%) | **73.33%** (95% CI: 48.0–89.1%) |
| Avg score | 40,046 | 35,988 |
| Median score | 40,104 | 40,336 |
| Avg lines | 207.47 | 192.60 |
| Median lines | 207 | 214 |
| Avg holes | 0.13 | 3.80 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.27 | 28.47 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.13 | 59.20 |
| Median aggregate height | 16.00 | 17.00 |
| Avg bumpiness | 5.87 | 10.53 |
| Median bumpiness | 5.00 | 7.00 |
| Avg survival time | 120.0s | 107.7s |
| Median survival time | 120.0s | 120.0s |

### Pooled (secondary)

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **83.33%** (95% CI: 66.4–92.7%) |
| Avg score | 39,327 | 35,289 |
| Median score | 39,427 | 38,737 |
| Avg lines | 207.43 | 192.13 |
| Median lines | 207 | 214 |
| Avg holes | 0.13 | 2.60 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.53 | 18.60 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.07 | 44.00 |
| Median aggregate height | 13.00 | 15.50 |
| Avg bumpiness | 6.13 | 8.80 |
| Median bumpiness | 5.50 | 7.00 |
| Avg survival time | 120.0s | 107.7s |
| Median survival time | 120.0s | 120.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Satellite purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 276 |
| garbage-on | 15 | 30 | 25 | 253 |

## Replay artifacts

- [Satellite replay folder](../../fixtures/replays/satellite/)
- [Garbage-off replays](../../fixtures/replays/satellite/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/satellite/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/satellite/summary.json)

Satellite timing is represented by the authoritative pending-garbage arrival ticks in each replay; the replay viewer does not synthesize a separate Satellite animation.
