# Magnet replay evidence

Generated 2026-08-10 from the Magnet mirror-match RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Both p1 and p2 may purchase `gravity-lure` (Magnet)
- Role contract: symmetric mirror matches; do not interpret as recipient-impact evidence
- Authoritative mechanic under test: On purchase, Magnet accelerates the opponent: the first three purchases add +2 gravity each permanently, then later purchases add +1 gravity to the current piece until it locks, with a 12-tick minimum per cell.
- RulesBot v1 uses the player-visible Magnet stacks and current-piece boost to penalize placements whose estimated control window is already exceeded; the metrics below are the corrected v1 baseline after rerunning the matched suite.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Pooled mirror-match metrics

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **76.67%** (95% CI: 59.1–88.2%) |
| Avg score | 37,117 | 30,444 |
| Median score | 37,124 | 37,242 |
| Avg lines | 207.03 | 180.47 |
| Median lines | 207 | 219 |
| Avg holes | 0.13 | 3.87 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.47 | 27.37 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 14.60 | 58.50 |
| Median aggregate height | 11.00 | 20.00 |
| Avg bumpiness | 6.30 | 9.30 |
| Median bumpiness | 6.00 | 8.00 |
| Avg survival time | 120.0s | 97.4s |
| Median survival time | 120.0s | 120.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Magnet purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 544 |
| garbage-on | 15 | 30 | 23 | 453 |

## Replay artifacts

- [Magnet replay folder](../../fixtures/replays/magnet-mirror/)
- [Garbage-off replays](../../fixtures/replays/magnet-mirror/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/magnet-mirror/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/magnet-mirror/summary.json)

Magnet gravity is represented by the authoritative player gravity state in each replay; the replay viewer does not synthesize a separate Magnet animation.
