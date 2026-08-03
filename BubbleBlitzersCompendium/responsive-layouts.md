# Designing for Responsive Layouts

`[STATUS: ACTIVE]` `[CLIENT]` `[MOBILE]`

A tall 10×18 visible board has to fit everything from a 360px phone to a desktop showing **two** full boards side by side. The simulation adds two hidden spawn rows above the visible field. This guide covers the two-layout split, the scale-to-fit math, and the gotchas that caused every "not responsive" bug report.

---

## 1. Two layouts, one breakpoint

The root container uses `h-dvh` (dynamic viewport height — survives mobile browser chrome). Everything below switches at Tailwind's **`md:`** breakpoint:

```text
< md (phones / narrow)            >= md (tablet / desktop)
┌───────────────┐                 ┌──────────────────────────────┐
│ compact header│                 │ verbose header               │
│ ┌──────┐ ┌──┐ │                 │ ┌────┐┌──────────┐┌──────────┐│
│ │      │ │op│ │                 │ │shop││ YOUR     ││ OPPONENT ││
│ │board │ │mn│ │                 │ │rail││ board    ││ board    ││
│ │      │ │shp│ │                 │ └────┘└──────────┘└──────────┘│
│ └──────┘ └──┘ │                 │   (GameFieldsLayout fits both)│
│ [mobile ctrls]│                 └──────────────────────────────┘
└───────────────┘
```

In [App.tsx:1108](../src/App.tsx) the mobile view is `md:hidden` and the desktop view is `hidden … md:flex`. Only one is in the DOM at a time.

- **Mobile:** your board + a right **rail** (`OpponentMiniField` + `ShopRail`) + bottom `MobileControls`.
- **Desktop:** `GameFieldsLayout` lays out shop rail + your full board + opponent's full board.

---

## 2. Scale-to-fit math

There is no fixed cell size — the board's `cellSize` is **computed from the available box** and shared down through `PlayfieldCellSizeContext`.

**Desktop** — `fitCellSizeForDualBoard()` ([GameFieldsLayout.tsx:5](../src/components/GameFieldsLayout.tsx)):

```text
cell = min( (width - pad - gap - shopReserve) / (2 * BOARD_COLS),
            (height - chrome) / BOARD_VISIBLE_ROWS )
clamped to [22, 48]
```

**Mobile** — the measure effect at [App.tsx:579](../src/App.tsx):

```text
cell = min( (availWidth - railWidth - safety) / BOARD_COLS,
            (height - boardChrome) / BOARD_VISIBLE_ROWS )
clamped to [8, 48]
```

Both are driven by a **`ResizeObserver`** on the container (and, on mobile, on the live rail), recomputing on every size change. The mobile path measures the rail's **actual rendered width** rather than reserving fixed pixels — so a larger system font / display zoom can inflate the rail without pushing the board off-screen.

> [!TIP]
> The cap was raised to **48** so the board grows to fill wide phones; on smaller devices width/height bounds dominate, so the cap is a no-op there.

---

## 3. The gotchas (each one was a real bug)

> [!WARNING]
> **THE responsiveness bug:** the mobile sizing `useLayoutEffect` **must** depend on `[gameState != null]` ([App.tsx:612](../src/App.tsx)), not `[]`. The playfield + rail only mount **after** the "Connecting…" screen, so on first mount the refs are `null`. With `[]` deps the `ResizeObserver` never attaches and the board stays stuck at its hardcoded default size. This was behind essentially every "the board isn't responsive" report.

> [!WARNING]
> **The rail is a flex sibling, not an absolutely-positioned overlay.** The board is `shrink-0` and shrink-wraps to its computed size; the rail is a normal flex sibling. A real flex row lets the board take whatever width remains after the rail's actual size, so the rail **can never clip off-screen** regardless of device or display scaling. The old fixed-pixel-reserve approach broke on the Samsung layout.

> [!WARNING]
> **`MobileControls` is a normal flow child, not `fixed` + bottom padding.** It sits in the column flow (`mt-auto shrink-0`), not `position: fixed` with a reserved `padding-bottom`. The reservation math broke under device font/display scaling and cut off the bottom controls on the Pixel 8.

---

## 4. Cross-origin iframe embedding (the hub)

In production the game runs inside an `<iframe>` in the skillcade.games hub wrapper (`play.html`). The iframe is **cross-origin** (`:10106` vs `:443`), so **nothing in our CSS/JS can measure or fix the outer viewport**.

> [!IMPORTANT]
> The wrapper originally sized the iframe with `height: 100vh` (the *large* mobile viewport), so the iframe extended behind the browser toolbar and hid our `MobileControls`. Editing `play.html` (`100vh`→`100dvh`) works but the coworker's hub redeploys revert it. The **resilient fix in place** is an nginx `sub_filter` on the hub's 443 block that rewrites `height: 100vh;` → `height: 100vh; height: 100dvh;` on every proxied HTML response. This survives hub redeploys. Our own app root already uses `h-dvh`.

---

## 5. Debugging responsive issues

Don't guess from screenshots — measure live.

1. Start the dev server (`bun server.ts` on :3000; the Claude Preview launch config does this).
2. Use the Claude **Preview** tools: `preview_resize` to **360 / 387 / 412 / 522** (real device widths that exposed bugs), then `preview_eval` to read live `getBoundingClientRect()` of the board, rail, and controls.
3. Confirm the board fills width without pushing the rail or controls out of view, in both portrait and the embedded-iframe height.

This live-measurement loop is how the real bugs were finally found.

---

## See Also

- [online-and-production.md](./online-and-production.md) — the nginx layer where the `sub_filter` fix lives.
- [socketio-gameplay.md](./socketio-gameplay.md) — keeping render cost low (broadcast rate) for phones.
- [swapping-the-ui-framework.md](./swapping-the-ui-framework.md) — the Tailwind classes here are framework-agnostic.
