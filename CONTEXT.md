# Context & Ubiquitous Language Glossary

## Solver Diagnostics & Replay Analytics

### BotDecisionTrace
Structured record of a solver decision at a piece placement tick, capturing the selected candidate placement, evaluated alternatives, individual heuristic sub-scores, active powerup state, and taxonomized misstep tags.

### Misstep Taxonomy
Categorical classification of sub-optimal or risky solver decisions into actionable diagnostic tags (e.g., `BuriedCavity`, `MisjudgedGarbageUrgency`, `HighFrontierRisk`, `MissedGarbageCancel`).

### Timeline Powerup Band
Horizontal color-coded range visualizer on the replay timeline scrubber representing the exact tick span during which a persistent powerup or field effect (e.g., `Curtain`, `Poison`, `Magnet`, `Satellite`) is active.

### Field Effect Gauge
Dynamic board-adjacent UI element displaying active powerup status, grouped stack counts, and remaining duration in real time during replay playback. Replay inspection shows the effect owner explicitly; the timeline has one row per player.

### Candidate Heuristic Score
The candidate's net placement heuristic for one piece at one decision tick. It is not the player's `PlayerState.score` / shop wallet. Higher values win within that candidate set; the signed contribution ledger must sum to the displayed net value, including safety or terminal adjustments.

### Sub-Score Contribution Ledger
Readable signed decomposition of candidate placement scores into constituent heuristic components (`lineClearScore`, hole/cavity terms, `heightScore`, `bumpinessScore`, `spiresScore`, `wellsScore`, `poisonScore`, `dropDepthBonus`, `visibilityRiskPenalty`, and final adjustments). A relative position meter supports comparison without implying that negative penalties are positive stacked-bar area.

### Dual-Pane Diagnostic Shell
Fixed-height (`h-dvh`) application layout separating real-time playfield canvas playback on the left from dedicated scrollable diagnostic inspectors and habit reports on the right via explicit sub-scroll containers.

### Emergent Hotspot Heatmap
Aggregated time-axis visualization with one row per misstep category, where color saturation at each tick window encodes the cross-seed frequency of that misstep type. Systemic temporal failure patterns emerge directly from the data without manual scanning.

### Small Multiples Seed Matrix
Expandable per-seed horizontal timeline strips (one per benchmark seed) with pressure-gradient coloring and misstep markers. Used as drill-down beneath the Emergent Hotspot Heatmap to identify which specific seeds contributed to an aggregate hotspot.
