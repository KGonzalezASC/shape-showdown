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

## Curated Puzzle Library

### Curated Puzzle
A deliberately authored and published challenge with a stable identity, defined objective, intended mechanics, and a recorded validation state. A curated puzzle is distinct from an arbitrary procedural run.

### Daily Challenge
A puzzle instance selected by calendar date from the published puzzle content. All players receive the same content, rules, and scoring inputs for that day.

### Puzzle Attempt
One playthrough of a puzzle. Attempts may be repeated without changing the identity or definition of the underlying puzzle.

### Intended Solution
A canonical route that demonstrates how the author expects the puzzle objective to be achieved. It is guidance and a baseline, not automatically the only valid solution.

### Solution Alternative
A distinct route that also satisfies the puzzle objective and its allowed mechanics. Alternatives may differ in placement order, timing, or resource use while remaining valid.

### Star Threshold
A measurable performance target used to award a puzzle rating, such as piece count, elapsed ticks, score, or another puzzle-specific criterion.

### Allowed Mechanics
The explicit set of game actions or systems a puzzle permits, requires, or excludes, including hold, powerups, shop interactions, and hazard responses.

### Validation Status
The recorded content-quality state of a puzzle: which mechanical, solver, and human-play checks have passed, and whether the puzzle is eligible for publication.

### Puzzle Visibility Policy
A per-puzzle presentation choice controlling how much future puzzle information is revealed to the player, including solution steps and scheduled hazards. Visibility does not alter the puzzle outcome and is not a security boundary.

### Reference Baseline
The recorded outcome of the best qualifying RulesBot run from a configured validation batch for a puzzle, including the final game score and supporting performance measures used for comparison. The selection metric is defined by the puzzle's scoring policy, and the baseline is distinct from the bot's internal placement heuristic scores.
