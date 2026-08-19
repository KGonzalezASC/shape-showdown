# Handoff: remove responsive board transition flicker

## Mission

Reduce visible flicker while resizing Shape Showdown between desktop, tablet, and phone layouts. The severe stale-piece resize loop appears fixed in the current working tree, but frame-level measurements still show blank frames, board-size bounce, and abrupt opponent-preview replacement at responsive breakpoints.

Keep the game playable and preserve canvas animation state where the same visual object survives a resize. Do not trade flicker for duplicate always-running board canvases without measuring the CPU cost.

## Decided

- The canonical board style remains Style E, the Watching Shrine Amalgam.
- The compact layout uses a miniature opponent preview. The desktop layout uses a full opponent board.
- Desktop composition starts at `min-width: 901px`.
- Compact tablet sizing starts at `min-width: 661px`; below that width the utility rail uses the phone composition.
- Integer cell sizes are intentional because fractional cells break grid hairlines.
- The client must remain lightweight. Do not add shadcn or another UI framework.
- Runtime code and tests are the behavior source of truth.

## Verified behavior

The persistent flicker involving stale active pieces appears resolved by the current uncommitted changes. A separate transition flicker remains.

### The 901px desktop boundary

A `requestAnimationFrame` trace crossed `900 -> 901 -> 900 -> 902 -> 899` at a fixed height of 800px during a live match.

- Compact to desktop:
  - one frame had no full board and no miniature canvases
  - 8 to 16ms later, two desktop boards appeared at `310x558`
- Desktop to compact:
  - the local board first appeared at `300x540`
  - it jumped to `310x558`
  - it returned to `300x540`
  - the bounce lasted about 75 to 100ms
- The desktop opponent board unmounted. The compact branch mounted two `50x90` canvases for the opponent preview.

Representative trace:

```text
width 901: full=[] mini=[]
width 901: full=[[310,558],[310,558]] mini=[]

width 900: full=[[300,540]] mini=[[50,90],[50,90]]
width 900: full=[[310,558]] mini=[[50,90],[50,90]]
width 900: full=[[300,540]] mini=[[50,90],[50,90]]
```

This is a real rendered transition, not only subjective motion blur.

### The 661px compact boundary

At a fixed height of 800px:

- `662px`: utility rail was `210x720`
- `659px`: utility rail was `96x742`
- the local board stayed `300x540`
- at `659px`, the rail had `clientWidth=96` and `scrollWidth=110`
- the document itself did not overflow horizontally

The rail therefore snaps by 114px at the breakpoint and its content exceeds the phone rail by 14px.

### Settled canvas sizing

Settled canvas CSS and backing-store sizes matched:

- desktop: `310x558`
- compact: `300x540`

The remaining issue is not a persistent DPR mismatch. It is layout lifecycle and breakpoint ownership.

## Current implementation facts

- `src/App.tsx` owns `isDesktopLayout` with `matchMedia('(min-width: 901px)')`.
- `src/components/PlayfieldShell.tsx` conditionally renders two separate trees:
  - compact tree when `!isDesktopLayout`
  - desktop tree when `isDesktopLayout`
- Crossing 901px unmounts one tree and mounts the other.
- The compact tree uses CSS breakpoint classes at 661px while `PlayfieldShell` also tracks the same breakpoint with React state:
  - CSS changes grid columns and gap
  - `isTabletLayout` changes `viewportMode` for `OpponentMiniField` and `ShopRail`
- `src/App.tsx` measures the compact board slot in a layout effect and stores `mobileCellSize` in the app-shell reducer.
- `src/components/PlayfieldLayout.tsx` independently measures desktop cell size.
- `src/components/VoronoiFlowfieldCanvas.tsx` owns active-piece motion, stack handoff, poison animation, explosion shards, and canvas backing synchronization.

## Current uncommitted WIP

Do not discard the working tree. It contains broad PostgreSQL and match-recovery work unrelated to this handoff.

Responsive/client WIP already present:

- `src/App.tsx`
  - connection-status modal
  - compact board observer now watches the stable playfield parent
  - passes `matchVisualKey`
- `src/components/PlayfieldShell.tsx`
  - keys board renderers by match identity
- `src/components/VoronoiFlowfieldCanvas.tsx`
  - synchronizes `cellSizeRef` in a layout effect
  - clears pixel-coordinate animation state when cell size changes
- `src/components/OpponentMiniField.tsx`
  - compact waiting state uses a small CSS spinner

These changes passed:

```text
bun run lint
bun run build:client
bun test src/components/PlayfieldCellSizer.test.ts
bun test server/boardVisualModel.test.ts
git diff --check
```

## Ranked causes

1. `PlayfieldShell` replaces the complete board tree at 901px. This directly explains the blank frame and opponent-preview remount.
2. Desktop and compact layouts use separate cell-size authorities. The compact branch mounts with retained `mobileCellSize`, then measurement effects update it after the breakpoint transition.
3. CSS and React both own the 661px breakpoint. CSS reflows immediately; `matchMedia` state updates through React, so child presentation can lag the grid change.
4. The phone rail is narrower than its content contract. This explains the measured `110px` content inside a `96px` rail.

## Responsive contract

| Region | Transition | Required behavior | Must remain true |
| --- | --- | --- | --- |
| Local board | 900 <-> 901 | No blank frame and no old-size bounce | Same match and active piece remain visible |
| Opponent display | 900 <-> 901 | Full board may become a preview without an empty intermediate frame | Opponent identity and latest board state remain intact |
| Compact rail | 659 <-> 662 | One settled reflow without clipped content | Shop rows and opponent preview remain readable and reachable |
| Canvas layers | Any resize | CSS size, backing size, and animation coordinates update together | Grid, Voronoi cells, overlay, and shrine frame stay aligned |
| Input | Any resize | Resizing does not drop held-key cleanup or shop controls | Keyboard and touch paths remain usable |

## Recommended implementation direction

Prefer one responsive composition owner.

1. Keep the local `GameField` mounted across the 901px boundary. Move or restyle the same instance rather than creating separate mobile and desktop instances.
2. Treat the opponent representation as an explicit mode change. Prepare the destination renderer before removing the source, or preserve a last-frame visual until the destination canvas has painted once.
3. Use one source for the 661px layout decision. Do not let CSS and delayed React state independently switch the same composition.
4. Make the phone rail satisfy its content width or adapt the content to 96px. Do not hide the 14px overflow.
5. Keep cell-size calculation integer and settle the destination size before displaying a newly mounted canvas.

Avoid keeping both full animated layouts alive and merely hiding one. That doubles canvas animation work and can hide lifecycle bugs.

## Required verification

Build a frame trace before changing code, then run it after the fix.

Minimum width matrix at 800px height:

```text
1280
902, 901, 900
662, 661, 660
430
```

Also verify:

- 900px at short supported height
- a live match with stacked and active pieces
- waiting for an opponent
- connection interrupted and recovered
- match ended
- 200% zoom
- reduced-motion preference

Assertions:

- no animation frame with zero board representation during 900/901 crossing
- no `300x540 -> 310x558 -> 300x540` bounce
- canvas CSS and backing dimensions match after every settled resize
- no rail `scrollWidth > clientWidth` unless horizontal scrolling is deliberate
- no document overflow
- no lost keyboard or touch controls
- no reset of semantic match state

Run:

```text
bun run lint
bun run build:client
bun test src/components/PlayfieldCellSizer.test.ts
bun test server/boardVisualModel.test.ts
git diff --check
```

## Unknown

- The owner has not chosen whether the full-board to preview change should crossfade or switch instantly. Either is acceptable if there is no blank frame or geometry bounce.
- No maximum transition duration has been set. Use frame evidence and keep the transition within one coherent paint where practical.
- The reduced-motion behavior for a possible crossfade has not been decided. Default to an immediate stable swap under `prefers-reduced-motion`.

## Do not do

- Do not revert or rewrite the PostgreSQL and match-recovery WIP.
- Do not remove integer cell sizing.
- Do not mask overflow without fixing the rail contract.
- Do not add another arbitrary breakpoint.
- Do not declare success from settled screenshots alone. The defect exists between settled states.
- Do not commit unless the owner asks.
