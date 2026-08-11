# Tax Siphon replay evidence

Generated 2026-08-10 from the Tax Siphon mirror-match RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Both p1 and p2 may purchase `bounty-tax` (Tax Siphon)
- Role contract: symmetric mirror matches; do not interpret as recipient-impact evidence
- Authoritative mechanic under test: On purchase, Tax Siphon steals 30% of the opponent score and adds it to the buyer score; can only be purchased when trailing behind.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Pooled mirror-match metrics

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **66.67%** (95% CI: 48.8–80.8%) |
| Avg score | 39,434 | 27,141 |
| Median score | 39,603 | 29,539 |
| Avg lines | 207.33 | 153.53 |
| Median lines | 207 | 181 |
| Avg holes | 0.13 | 6.87 |
| Median holes | 0.00 | 2.00 |
| Avg cavity depth | 0.47 | 45.53 |
| Median cavity depth | 0.00 | 8.50 |
| Avg aggregate height | 15.87 | 82.93 |
| Median aggregate height | 14.00 | 50.50 |
| Avg bumpiness | 6.60 | 10.13 |
| Median bumpiness | 6.00 | 9.00 |
| Avg survival time | 120.0s | 83.4s |
| Median survival time | 120.0s | 102.1s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Tax Siphon purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 365 |
| garbage-on | 15 | 30 | 20 | 261 |

## Replay artifacts

- [Tax Siphon replay folder](../../fixtures/replays/bounty-tax-mirror/)
- [Garbage-off replays](../../fixtures/replays/bounty-tax-mirror/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/bounty-tax-mirror/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/bounty-tax-mirror/summary.json)

Curtain is represented by the authoritative swap cutoff, active effect, and player-limited masked board; the replay viewer does not synthesize a separate blackout animation.
