# Sticky replay evidence

Generated 2026-08-10 from the Sticky mirror-match RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Both p1 and p2 may purchase `quickstep-clock` (Sticky)
- Role contract: symmetric mirror matches; do not interpret as recipient-impact evidence
- Authoritative mechanic under test: On purchase, Sticky limits the opponent current piece to two grounded lock-delay move/rotation resets instead of the normal ten; if no piece is active, the cap applies to the next spawn.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Pooled mirror-match metrics

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **80.00%** (95% CI: 62.7–90.5%) |
| Avg score | 39,139 | 36,952 |
| Median score | 39,159 | 39,982 |
| Avg lines | 207.37 | 209.27 |
| Median lines | 207 | 225 |
| Avg holes | 0.13 | 3.43 |
| Median holes | 0.00 | 0.00 |
| Avg cavity depth | 0.47 | 24.60 |
| Median cavity depth | 0.00 | 0.00 |
| Avg aggregate height | 16.07 | 52.73 |
| Median aggregate height | 14.00 | 21.00 |
| Avg bumpiness | 6.27 | 7.87 |
| Median bumpiness | 5.00 | 6.00 |
| Avg survival time | 120.0s | 110.4s |
| Median survival time | 120.0s | 120.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Sticky purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 546 |
| garbage-on | 15 | 30 | 24 | 519 |

## Replay artifacts

- [Sticky replay folder](../../fixtures/replays/sticky-mirror/)
- [Garbage-off replays](../../fixtures/replays/sticky-mirror/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/sticky-mirror/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/sticky-mirror/summary.json)

Sticky is represented by the authoritative lock-reset cap and recorded input frames; the replay viewer does not synthesize a separate Sticky animation.
