# Snag replay evidence

Generated 2026-08-10 from the Snag mirror-match RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Both p1 and p2 may purchase `fortify-frame` (Snag)
- Role contract: symmetric mirror matches; do not interpret as recipient-impact evidence
- Authoritative mechanic under test: On purchase, Snag blocks the opponent from hard-dropping or soft-dropping the current piece until it locks or is held; if the current piece already hard-dropped, the next spawn is blocked instead.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Pooled mirror-match metrics

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **100.00%** (95% CI: 88.6–100.0%) | **50.00%** (95% CI: 33.2–66.8%) |
| Avg score | 20,781 | 3,691 |
| Median score | 20,830 | 3,350 |
| Avg lines | 111.23 | 21.47 |
| Median lines | 112 | 22 |
| Avg holes | 0.00 | 9.53 |
| Median holes | 0.00 | 9.00 |
| Avg cavity depth | 0.00 | 74.57 |
| Median cavity depth | 0.00 | 66.00 |
| Avg aggregate height | 15.53 | 111.40 |
| Median aggregate height | 14.00 | 131.00 |
| Avg bumpiness | 6.90 | 9.00 |
| Median bumpiness | 6.00 | 8.00 |
| Avg survival time | 120.0s | 26.4s |
| Median survival time | 120.0s | 21.8s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Snag purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 30 | 354 |
| garbage-on | 15 | 30 | 15 | 80 |

## Replay artifacts

- [Snag replay folder](../../fixtures/replays/snag-mirror/)
- [Garbage-off replays](../../fixtures/replays/snag-mirror/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/snag-mirror/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/snag-mirror/summary.json)

Snag is represented by the authoritative hard/soft-drop blocking state and recorded input frames; the replay viewer does not synthesize a separate Snag animation.
