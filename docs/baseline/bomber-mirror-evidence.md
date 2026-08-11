# Bomber replay evidence

Generated 2026-08-10 from the Bomber mirror-match RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Both p1 and p2 may purchase `nova-charge` (Bomber)
- Role contract: symmetric mirror matches; do not interpret as recipient-impact evidence
- Authoritative mechanic under test: On purchase, Bomber arms the current active piece (or the next spawn); on lock it clears the radius-2 circular blast footprint without gravity or direct score.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Pooled mirror-match metrics

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **70.00%** (95% CI: 52.1–83.3%) |
| Avg score | 37,081 | 25,040 |
| Median score | 37,102 | 31,354 |
| Avg lines | 194.53 | 139.70 |
| Median lines | 195 | 172 |
| Avg holes | 0.00 | 5.23 |
| Median holes | 0.00 | 0.50 |
| Avg cavity depth | 0.00 | 38.83 |
| Median cavity depth | 0.00 | 0.50 |
| Avg aggregate height | 15.23 | 69.60 |
| Median aggregate height | 14.00 | 25.50 |
| Avg bumpiness | 5.77 | 8.00 |
| Median bumpiness | 6.00 | 6.50 |
| Avg survival time | 120.0s | 82.1s |
| Median survival time | 120.0s | 103.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Bomber purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 492 |
| garbage-on | 15 | 30 | 21 | 365 |

## Replay artifacts

- [Bomber replay folder](../../fixtures/replays/bomber-mirror/)
- [Garbage-off replays](../../fixtures/replays/bomber-mirror/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/bomber-mirror/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/bomber-mirror/summary.json)

The replay viewer suppresses Bomber shard animation for sparse keyframe transitions because a 120-tick board diff cannot distinguish Bomber-cleared cells from ordinary line-clear removals. The authoritative board state and live-game Bomber animation remain enabled.
