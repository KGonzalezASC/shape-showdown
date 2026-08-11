# Tectonic Shift replay evidence

Generated 2026-08-10 from the Tectonic Shift mirror-match RulesBot replay suite.

## Configuration

- 15 matched seeds per mode: `910000, 910017, 910034, 910051, 910068, 910085, 910102, 910119, 910136, 910153, 910170, 910187, 910204, 910221, 910238`
- 120-second cap per match; 30 matches and 60 pooled player trajectories total
- Observation mode: `player-limited`
- Shop enabled with the normal catalog roll pool
- Both p1 and p2 may purchase `tectonic-shift` (Tectonic Shift)
- Role contract: symmetric mirror matches; do not interpret as recipient-impact evidence
- Authoritative mechanic under test: On purchase, Tectonic Shift collapses all columns downward to fill holes; cleared lines award no score, garbage, or shop rolls.
- Replay keyframes every 120 ticks; each replay is checked against authoritative `matchStep` before being written
- Evidence type: deterministic in-process simulation, not browser/live-network evidence

## Results

### Pooled mirror-match metrics

| Metric | Garbage off | Garbage on |
| --- | ---: | ---: |
| Pooled survival (30 trajectories/mode) | **96.67%** (95% CI: 83.3–99.4%) | **63.33%** (95% CI: 45.5–78.1%) |
| Avg score | 34,337 | 21,331 |
| Median score | 35,940 | 20,621 |
| Avg lines | 189.03 | 123.30 |
| Median lines | 198 | 118 |
| Avg holes | 0.30 | 6.30 |
| Median holes | 0.00 | 1.50 |
| Avg cavity depth | 0.40 | 41.77 |
| Median cavity depth | 0.00 | 2.00 |
| Avg aggregate height | 19.10 | 82.80 |
| Median aggregate height | 14.00 | 46.00 |
| Avg bumpiness | 8.47 | 12.07 |
| Median bumpiness | 7.00 | 7.50 |
| Avg survival time | 115.3s | 73.8s |
| Median survival time | 120.0s | 72.0s |

| Mode | Matches | Player trajectories | Surviving trajectories | Accepted Tectonic Shift purchases |
| --- | ---: | ---: | ---: | ---: |
| garbage-off | 15 | 30 | 29 | 454 |
| garbage-on | 15 | 30 | 19 | 279 |

## Replay artifacts

- [Tectonic Shift replay folder](../../fixtures/replays/tectonic-shift-mirror/)
- [Garbage-off replays](../../fixtures/replays/tectonic-shift-mirror/garbage-off/)
- [Garbage-on replays](../../fixtures/replays/tectonic-shift-mirror/garbage-on/)
- [Machine-readable summary](../../fixtures/replays/tectonic-shift-mirror/summary.json)

Curtain is represented by the authoritative swap cutoff, active effect, and player-limited masked board; the replay viewer does not synthesize a separate blackout animation.
