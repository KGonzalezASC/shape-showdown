# Performance & CSS Profiling Methodology

This guide documents the systematic methodology used to profile, diagnose, and optimize rendering, frame pacing, and CSS compositor load in **Shape Showdown**.

> **Inspiration & Background:** In modern Web Apps and canvas/CSS games, GPU process CPU spikes (often hitting 20–50% on 120Hz/144Hz HDR displays) are frequently caused by continuous CSS keyframe animations (`infinite`), continuous canvas repaints, heavy `backdrop-filter: blur()`, and CSS glow shadows promoting elements to independent GPU compositing layers. Standard JavaScript profilers miss these offloaded layer repaints.

---

## 1. Diagnostics Tooling (`window.__shapeShowdownPerf`)

Shape Showdown provides a live console diagnostic interface attached to `window.__shapeShowdownPerf`. It automatically initializes in development mode, or when the URL contains `?profile`, `?profileBoard=1`, or `?perf`.

### Console Commands Overview

| Command | Purpose |
|---|---|
| `window.__shapeShowdownPerf.applyAllDisabled()` | Immediately disable all CSS animations, transitions, backdrop blurs, glow box-shadows, canvas overlays, and force reduced motion. Use as a baseline test. |
| `window.__shapeShowdownPerf.toggleAnimations(true \| false)` | Toggle CSS keyframe animations (poison sprite scrolling, hatch drift, shop pulses, bomb wiggles, wildcard source outlines). |
| `window.__shapeShowdownPerf.toggleBlurs(true \| false)` | Toggle `backdrop-filter` and heavy CSS blurs on UI containers. |
| `window.__shapeShowdownPerf.toggleGlows(true \| false)` | Toggle drop-shadow and box-shadow glows (magnet rings, poison glows, wildcard outlines). |
| `window.__shapeShowdownPerf.toggleTransitions(true \| false)` | Toggle CSS layout & color transitions. |
| `window.__shapeShowdownPerf.toggleCanvasOverlays(true \| false)` | Toggle `BoardCanvasOverlay` 2D rendering loop. |
| `window.__shapeShowdownPerf.reset()` | Restore default high-fidelity rendering and animations. |
| `window.__shapeShowdownPerf.getFpsReport()` | View rolling 120-frame FPS, average frame time (ms), 95th percentile latency, and 60Hz/120Hz frame drop counts. |
| `window.__shapeShowdownPerf.snapshot()` | Generate complete diagnostic snapshot including active toggles, FPS pacing, DOM node count, JS heap size, React commit timings, and GPU recommendations. |

---

## 2. Recommended Step-by-Step Profiling Workflow

### Step 1: Monitor GPU Process in Chrome Task Manager
1. Open Chrome Task Manager via `Shift + Esc` (or `Window -> Task Manager` on macOS).
2. Ensure the **GPU Process** column is visible.
3. Observe baseline CPU % and RAM usage when the game is idle vs active on your display (noting display refresh rate: 60Hz vs 120Hz/144Hz).

### Step 2: Test Diagnostic Baseline (`applyAllDisabled`)
1. Open Chrome Developer Console (`F12` or `Cmd+Option+I`).
2. Run `window.__shapeShowdownPerf.applyAllDisabled()`.
3. Check Chrome Task Manager: If GPU Process CPU drops significantly (e.g., from 15–30% down to 1–3%), the bottleneck is CSS compositor recompositing or continuous canvas repaints.

### Step 3: Layer Isolation
Turn layers back on one by one to pinpoint the exact culprit:
1. `window.__shapeShowdownPerf.toggleAnimations(false)` — Test CSS keyframes.
2. `window.__shapeShowdownPerf.toggleBlurs(false)` — Test backdrop filter blurs.
3. `window.__shapeShowdownPerf.toggleGlows(false)` — Test heavy box-shadow / drop-shadow glows.
4. `window.__shapeShowdownPerf.toggleCanvasOverlays(false)` — Test canvas overlay painting.

### Step 4: React Commit Profiling (`?profileBoard=1`)
1. Add `?profileBoard=1` to the browser URL (e.g. `http://localhost:3000/?profileBoard=1`).
2. Open the console or query `document.documentElement.dataset.boardPerf`.
3. Inspect `window.__shapeShowdownBoardPerf.snapshot()` to verify React render-to-commit duration (ms) for `dom`, `board-canvas`, or `voronoi-canvas` views.

---

## 3. Key Findings & Guidelines for Game Feature Engineering

1. **Avoid `infinite` compositor keyframe loops on high-DPI/120Hz screens** where standard static visuals suffice, or use discrete stepped animations (`steps(8)`).
2. **Limit `backdrop-filter: blur()` stacking** over active playfield surfaces; combine background layers or use pre-composited dark background overlays (`rgba(...)`) where possible.
3. **Canvas overlay conditional loop cleanup**: Ensure `requestAnimationFrame` loops in overlay components (like `BoardCanvasOverlay`) pause when no continuous animations (like magnet aura or wildcard outline) are active.
