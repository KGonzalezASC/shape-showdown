# Multiplayer board canvas migration

This migration applies the low-DOM rendering approach used by Name Drop to the
multiplayer Tetris boards without changing the server-authoritative game engine.

## Migration sequence

1. Added opt-in profiling with `?profileBoard=1`.
2. Measured the existing DOM-cell renderer with two local clients.
3. Extracted `buildBoardVisualModel` as the shared semantic presentation model.
4. Added the canvas path behind the temporary development-only
   `?boardRenderer=canvas` comparison flag.
5. Compared DOM and canvas paths with the same two-client scene.
6. Made canvas the default and removed the DOM-cell implementation and flag from
   the production bundle.

The final production bundle contains neither `MemoizedCell` nor the
`boardRenderer` query switch.

## Two-client comparison

Measurements were captured in the development build at 1280×720 with both
responsive layouts mounted. React Profiler does not expose isolated commit-phase
duration, so two explicit metrics are recorded:

- `react-render`: Profiler `actualDuration`.
- `react-render-to-commit`: wall time from Profiler `startTime` to `commitTime`;
  this includes rendering and scheduling and is a commit-latency proxy, not pure
  DOM mutation time.

| Desktop player field | DOM cells | Canvas |
| --- | ---: | ---: |
| Mounted `.arena-cell` nodes | 600 | 0 |
| React render average | 0.656 ms | 0.087 ms |
| React render p95 | 8.6 ms | 0.9 ms |
| Render-to-commit average | 1.95 ms | 0.87 ms |
| Render-to-commit p95 | 17.5 ms | 2.0 ms |

Canvas paint samples are grouped by board instance. In the final browser run,
the desktop player Voronoi layer averaged 0.087 ms with a 0.2 ms p95; the
special-effect overlay was below the browser timer's 0.1 ms resolution for most
samples.

## Rendering architecture

- `buildBoardVisualModel` merges locked cells, the active piece, poison,
  wildcard geometry, bomber state, magnet state, curtain metadata, and hatching
  eligibility.
- `VoronoiFlowfieldCanvas` preserves the existing polygon pieces and connected
  poison-spread animation.
- `BoardCanvasOverlay` paints hatching, bomber markers, magnet auras, and
  wildcard outlines.
- The board grid is a CSS background, so it does not require per-cell elements.
- The same visual model and canvas surfaces power the mobile opponent mini-board.
- Backing-store dimensions are synchronized from the current cell size and DPR
  while mounted, so live responsive changes do not stretch or clip the bitmap.
- CSS-hidden responsive canvases skip painting and retry at a low frequency until
  visible.

## Verification

- Shared-model and painter tests cover core pieces, locked/active composition,
  poison variants, wildcard outlines, bomber, magnet, curtain, hatching, DPR,
  live backing-store resize, and hidden-layout detection.
- Existing engine/shop tests cover authoritative movement, locking, hold,
  garbage, poison spread, Wildcard +4, bomber, magnet, curtain activation, and
  other shop effects.
- Browser QA confirmed falling and settled polygon pieces, the swap-line layer,
  zero `.arena-cell` nodes, fixed 10×20 aspect ratio, and no document overflow.
- Required commands:

  - `bun run lint`
  - `bun run test`
  - `bun run build`
