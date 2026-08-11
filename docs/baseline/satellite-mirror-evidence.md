# Satellite replay evidence

Generated 2026-08-10 from the Satellite mirror-match RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Both p1 and p2 may purchase `satellite-link` (Satellite)
- Role contract: symmetric mirror matches; do not interpret as recipient-impact evidence
- Authoritative mechanic under test: On purchase, Satellite arms until incoming garbage is queued; it adds 90 ticks to queued packets and adds 90 ticks to newly queued packets for 600 ticks.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Pooled mirror-match metrics

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **93.33%** (95% CI: 78.7–98.2%) |
| Avg score | 38,562 | 36,535 |
| Median score | 38,623 | 38,903 |
| Avg lines | 207.30 | 199.70 |
| Median lines | 207 | 212 |
| Avg holes | 0.13 | 0.87 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.47 | 5.77 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 15.13 | 27.27 |
| Median aggregate height | 12.00 | 13.50 |
| Avg bumpiness | 6.17 | 7.10 |
| Median bumpiness | 5.00 | 5.50 |
| Avg survival time | 120.0s | 113.2s |
| Median survival time | 120.0s | 120.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Satellite purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 550 |
| garbage-on | 15 | 30 | 28 | 533 |

## Replay artifacts

- [Satellite replay folder](../../fixtures/replays/satellite-mirror/)
- [Garbage-off replays](../../fixtures/replays/satellite-mirror/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/satellite-mirror/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/satellite-mirror/summary.json)

Satellite timing is represented by the authoritative pending-garbage arrival ticks in each replay; the replay viewer does not synthesize a separate Satellite animation.
