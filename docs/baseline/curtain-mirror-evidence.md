# Curtain replay evidence

Generated 2026-08-10 from the Curtain mirror-match RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Both p1 and p2 may purchase `curtain` (Curtain)
- Role contract: symmetric mirror matches; do not interpret as recipient-impact evidence
- Authoritative mechanic under test: On purchase, Curtain lowers the opponent swap line and frosts the three rows above a four-second blackout below that frontier; the authoritative board remains unchanged.
- RulesBot v1 remembers the last visible board while it remains inferable. In garbage-enabled matches, hidden garbage makes that snapshot stale, so the known match rule selects a low-assumption recovery policy that never reads the authoritative concealed board.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Pooled mirror-match metrics

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **76.67%** (95% CI: 59.1–88.2%) | **50.00%** (95% CI: 33.2–66.8%) |
| Avg score | 16,190 | 2,925 |
| Median score | 16,066 | 3,127 |
| Avg lines | 91.83 | 17.23 |
| Median lines | 99 | 19 |
| Avg holes | 4.80 | 19.87 |
| Median holes | 0.00 | 19.00 |
| Avg cavity depth | 29.00 | 108.60 |
| Median cavity depth | 0.00 | 123.00 |
| Avg aggregate height | 61.53 | 126.87 |
| Median aggregate height | 35.00 | 142.00 |
| Avg bumpiness | 14.60 | 9.17 |
| Median bumpiness | 10.00 | 8.00 |
| Avg survival time | 88.6s | 19.0s |
| Median survival time | 120.0s | 21.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Curtain purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 23 | 286 |
| garbage-on | 15 | 30 | 15 | 60 |

## Replay artifacts

- [Curtain replay folder](../../fixtures/replays/curtain-mirror/)
- [Garbage-off replays](../../fixtures/replays/curtain-mirror/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/curtain-mirror/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/curtain-mirror/summary.json)

Curtain is represented by the authoritative swap cutoff, active effect, and player-limited masked board; the replay viewer does not synthesize a separate blackout animation.
