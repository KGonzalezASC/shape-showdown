# Shop Feature — Implementation Plan

## Status: IMPLEMENTED - BUGGY / NOT WORKING AS INTENDED

---

# Original Design Recap

- **Mobile placement (`< md`):** Vertical strip (~92px wide) to the right of the player board, below the opponent mini field
- **Tablet/Desktop placement (`>= md`):** Shop rail moves to the left side of the player board
- **Interaction model:** Hybrid "Straight Rail -> Staggered Expand" remains the same across breakpoints
- **Default state:** Straight icon rail (4-6 items), compact and low-visual-noise
- **Expanded state:** Tap icon -> fan out into staggered shelf cards (alternating +-6px horizontal offset)
- **Purchase:** Tap a card -> feedback -> collapse after 1.5s
- **Collapse triggers:** Tap same icon, tap-away, 5s inactivity
- **Availability:** Only during `playing` match status
- **Currency:** TBD (UI shell only)
- **Animations:** Motion (`m.div` + `AnimatePresence`) for expand/collapse; CSS keyframes for purchase feedback

## Reference

- **Mechanics inspiration:** [libtris lockdown system](https://github.com/atctwo/libtris#lock-down)
- **Design skill reference:** [frontend-design SKILL.md](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)

## Responsive Placement Strategy

| Breakpoint | Board Layout | Shop Placement | Notes |
|------------|--------------|----------------|-------|
| `< md` | Mobile single-board + opponent mini | Right strip below mini field | Existing mobile anchor model |
| `>= md` (tablet/desktop) | Two full boards side-by-side | Left side of **your** board | Must account for rail width in dual-board fit math |

## Available Space (Mobile)

| Metric | Value |
|--------|-------|
| Strip width | ~92px (`w-[5.75rem]`) |
| Opponent mini field height | ~152px (anchored `top-0`) |
| Shop anchor position | `top-[9.5rem]` (about 152px below mini top) |
| Shop-available vertical space | ~200-400px depending on screen size |
| Horizontal gap from board | 8px (0.5rem) on mobile, 16px (1rem) on sm+ |

## Available Space (Tablet/Desktop)

| Metric | Planned Value |
|--------|---------------|
| Left rail width | 92-112px (start with 92px to match mobile rail) |
| Gap between shop and player board | 8-12px |
| Vertical alignment | Top-aligned with player board title row |
| Expansion direction | Expand cards inward toward board center (to the right) |
| Constraint impact | `GameFieldsLayout` width fit must subtract left-rail reserve |

## Files Created

| File | Purpose |
|------|---------|
| `src/components/ShopRail.tsx` | Shared shop component for mobile + tablet/desktop |

## Files Modified

| File | Change |
|------|--------|
| `src/types.ts` | Add `ShopItem` type definition |
| `src/App.tsx` | Mobile mount (right strip below mini) + desktop/tablet mount (left of player board) |
| `src/components/GameFieldsLayout.tsx` | Update cell-size fit math to reserve width for left shop rail on `md+` |
| `src/index.css` | Add purchase feedback keyframe animation |

## Type Definition

```ts
interface ShopItem {
  id: string;
  name: string;
  icon: string; // emoji or icon key
  cost: number; // currency cost (TBD)
  tier: 1 | 2;
  baseWeight: number;
  colorClass: string;
  borderColorClass: string;
  description: string;
  synergyTargetId?: string; // tier-1 only: linked tier-2 item
  synergyBoost?: number; // recommended as multiplier, e.g. 1.35
}
```

## Mock Content Strategy (Planning-Only)

- Use emoji icons for all shop items during prototype phase.
- Use lorem ipsum for all item descriptions during prototype phase.
- Maintain a 12-item master catalog for healthy variation, while storefront still renders only 4-6 offers.

### Planned 12-item pool

```text
⚡ 🛡️ 💣 🧲 ❄️ 🔥 🧪 🌀 🎯 🧱 ⏱️ 🛰️
```

### Tier split

- Tier 1 (powerful, expensive, less common): 4/12
- Tier 2 (lighter, cheaper, more common): 8/12

### Description placeholder pattern

- Keep descriptions short (1 line) for narrow cards.
- Use placeholders like:
  - "Lorem ipsum dolor sit amet."
  - "Consectetur adipiscing elit."
  - "Sed do eiusmod tempor."

## Item Worth and Tiering Model

- Item cost is intentionally non-uniform.
- Currency source remains TBD (score spend vs lines-cleared resource), but pricing bands should visually communicate power.
- Planned pricing bands (mock values for UI only):
  - Tier 1: high-cost band (example: 120-180)
  - Tier 2: low-cost band (example: 40-90)

## Offer Randomization: Weighted Bag Method

Goal: preserve no-dupe feeling of a Tetris-like bag while making Tier 2 more common and allowing subtle synergy nudges.

### Core approach

1. Keep a 12-item catalog with tier and base weights.
2. Generate each storefront (4-6 offers, recommended 5) using weighted draws without replacement.
3. Refill candidate pool as needed between refresh cycles; do not allow duplicates within one storefront.

### Base weight defaults (tunable)

- Tier 1 `baseWeight`: `1.0`
- Tier 2 `baseWeight`: `2.25`

This should naturally bias storefronts toward Tier 2 without eliminating Tier 1.

### Tier presence guardrails

- Target Tier share per refresh:
  - Tier 1: ~20-30%
  - Tier 2: ~70-80%
- Hard cap Tier 1 offers in a single storefront: `max 2`

### Weighted draw formula

```text
effectiveWeight = baseWeight * tierModifier * synergyModifier * optionalGuardModifier
```

- `tierModifier`: usually `1.0` (tier bias already encoded in `baseWeight`)
- `synergyModifier`: starts at `1.0`, increases when linked by owned/active Tier 1
- `optionalGuardModifier`: anti-streak tuning if needed later

## Synergistic Item Linking (Tier1 -> Tier2)

- Some Tier 1 items define a linked Tier 2 item.
- If the Tier 1 condition is active (ownership/equipped/active effect, final rule TBD), the linked Tier 2 gets a small draw-odds boost.
- Boost should be noticeable but not guaranteed.

### Recommended default behavior

- `synergyBoost` multiplier default: `1.35` (about +35% odds weight)
- Multiple boosts can stack, but clamp max synergy multiplier to `1.75`
- Synergy never forces guaranteed inclusion

### Example pairing pattern (planning sample)

- Tier 1 `⚡ Overclock` -> Tier 2 `⏱️ Quickstep`
- Tier 1 `🛡️ Aegis` -> Tier 2 `🧱 Fortify`
- Tier 1 `🧲 Singularity` -> Tier 2 `🎯 Target Lock`
- Tier 1 `💣 Nova` -> Tier 2 `🔥 Ember`

## Storefront Lifecycle Rules

- Initial open: draw 4-6 weighted offers (recommended 5) without replacement.
- Purchase event: remove purchased item; draw one replacement with same weighted rules.
- Full refresh event: redraw all slots.
- Optional anti-repeat: prevent immediate reappearance of the exact purchased item for 1 cycle.

---

# REVISED DESIGN: Auto-Cycle Confirm Model

## Status: IMPLEMENTED - BUGGY / NOT WORKING AS INTENDED

## Current Implementation Issues (BUGS TO FIX)

The auto-cycle purchase model was implemented but has the following bugs:

### Bug #1: C key triggers when shop is closed
- **Expected:** Pressing C should do nothing when the shop is not in the cycling state.
- **Actual:** The code has a guard (`if (!ref.cycling || ref.locked) return`) but pressing C may still fire or cause issues. The ref state sync is unreliable.

### Bug #2: Shop "recloses" after cycling through all items  
- **Expected:** When cycle passes last item without confirming, the shop should:
  - Do a "null purchase"
  - Lock purchasing until next line clear
  - **BUT keep the shop panel VISIBLE** (no dark overlay)
- **Actual:** The code sets `shopLocked=true` which triggers the dark overlay, making the shop appear "closed".

### Bug #3: Shop sometimes doesn't open after line clear
- **Expected:** Shop should start cycling on every line clear.
- **Actual:** Race condition between `refreshShopOffers` (async state update) and `startShopCycle` (reads ref) causes `offersLength` to be stale/0, so the cycle never starts.

---

## Original Intended Behavior (Reference)

### Overview
- The shop panel is **always visible** (not collapsible/hidden)
- After your line clear: shop rerolls offers and starts **auto-cycling** through them
- The highlight cycles through items at a fixed interval (700ms)
- You confirm purchase by pressing C (desktop) or tapping SHOP button (mobile)
- After purchase: shop locks until next line clear

### States

| State | Description |
|-------|-------------|
| `shopCycling` | True when cycle interval is running |
| `shopCycleIndex` | Current highlighted item index (-1 when not cycling) |
| `shopLocked` | True when purchasing is disabled (no purchases allowed) |
| `shopExpired` | True when cycle passed last item without confirm |

### Cycle Behavior

| Trigger | Result |
|---------|--------|
| Your line clear | Reroll offers → start cycling from index 0 |
| Press C while cycling + affordable item | Spend score → lock shop → panel stays visible |
| Press C while cycling + unaffordable | Null purchase → keep cycling (no change) |
| Cycle reaches end without confirm | Null purchase → lock until next line clear, **panel stays visible** |
| Press C while not cycling | No action |

### Visual States

1. **Active cycling:** Highlight pulses on current item (cyan ring), Confirm button visible, panel full opacity
2. **Locked before first cycle (not playing):** Dark overlay with "Wait Line Clear" / "Locked", panel dimmed  
3. **Expired (passed end):** Items visible but dimmed, small "WAIT" badge in header, no overlay, no Confirm button

### Controls

#### Desktop
| Key | Action |
|-----|--------|
| ← → | Move |
| ↓ | Soft drop |
| ↑ | Hard drop |
| X | Rotate CW |
| Z | Rotate CCW |
| Shift | Storage (hold) |
| C | Shop confirm (only works when cycling) |

#### Mobile (right cluster layout)
| Position | Button | Action |
|----------|--------|--------|
| Top-left | STORAGE | Hold |
| Top-right | SHOP | Shop confirm |
| Bottom-left | CCW | Rotate CCW |
| Bottom-right | CW | Rotate CW |

---

## TODO: Fix These Bugs

The current implementation does NOT work as intended. Once bugs are fixed, update this plan section with "Status: WORKING".