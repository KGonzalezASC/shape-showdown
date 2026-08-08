# Context & Ubiquitous Language Glossary

## Solver Diagnostics & Replay Analytics

### BotDecisionTrace
Structured record of a solver decision at a piece placement tick, capturing the selected candidate placement, evaluated alternatives, individual heuristic sub-scores, active powerup state, and taxonomized misstep tags.

### Misstep Taxonomy
Categorical classification of sub-optimal or risky solver decisions into actionable diagnostic tags (e.g., `BuriedCavity`, `MisjudgedGarbageUrgency`, `HighFrontierRisk`, `MissedGarbageCancel`).

### Timeline Powerup Band
Horizontal color-coded range visualizer on the replay timeline scrubber representing the exact tick span during which a persistent powerup or field effect (e.g., `Curtain`, `Poison`, `Magnet`, `Satellite`) is active.

### Field Effect Gauge
Dynamic board-adjacent UI element displaying active powerup status, stack counts, and remaining duration (`ticksRemaining`) in real time during replay playback.

### Sub-Score Stacked Bar
Segmented horizontal bar visualization decomposing candidate placement scores into constituent heuristic components (`lineClearScore`, `holesScore`, `heightScore`, `bumpinessScore`, `spiresScore`, `wellsScore`, `poisonScore`, `dropDepthBonus`, `visibilityRiskPenalty`), enabling relative preattentive breakdown of solver choices.

### Dual-Pane Diagnostic Shell
Fixed-height (`h-dvh`) application layout separating real-time playfield canvas playback on the left from dedicated scrollable diagnostic inspectors and habit reports on the right via explicit sub-scroll containers.

### Emergent Hotspot Heatmap
Aggregated time-axis visualization with one row per misstep category, where color saturation at each tick window encodes the cross-seed frequency of that misstep type. Systemic temporal failure patterns emerge directly from the data without manual scanning.

### Small Multiples Seed Matrix
Expandable per-seed horizontal timeline strips (one per benchmark seed) with pressure-gradient coloring and misstep markers. Used as drill-down beneath the Emergent Hotspot Heatmap to identify which specific seeds contributed to an aggregate hotspot.
