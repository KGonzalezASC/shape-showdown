# Power-up UI spin

Branch: `codex/powerup-shop-ui`, based on `d97ddc9`.

Run `bunx vite --host 127.0.0.1 --port 3101` and open
`http://127.0.0.1:3101/?prototype=powerups`.
The development-only playground uses the real simulation, shop purchases,
pricing, and input controls. Open the preview controls below the game to
pause, reset, trigger attacks, refresh offers, or change available credits.
Normal multiplayer uses the same redesigned shop and playfield components.

## Design contract

| Area | Owner | Required behavior |
| --- | --- | --- |
| Incoming and applied effects | FieldEffectReadout | Prioritize incoming attacks; explain the consequence; use seconds only for actual timed mechanics. Notification expiry must not imply a permanent effect has ended. |
| Multiple effects | FieldEffectReadout / BattleLayout | One summary, expandable bounded details. Expanding reserves more space without squeezing the board below its 14px-cell floor. |
| Shop states | ShopRail | Explain start-cycle / buy-highlighted flow. Always show names, targets, credits, prices, and a purchase action or specific disabled reason. |
| Constrained shop | ShopRail / BattleLayout | Keep header and purchase action visible; offers and descriptions scroll. Names remain readable in the narrow rail. |
| Layout changes | Existing layout-mode subscription / BattleLayout | One composition owner at 661px and 901px; retain the local board instance. The alternate layout owns its CSS; classic layout helpers remain unchanged. |
| Touch and zoom | Existing control preference / gameplay scroll owner | Controls follow capabilities and preference. Allow vertical scrolling and pinch zoom; preserve essential actions in short windows. |

The canonical board artwork and gameplay purchase rules are unchanged.
The retired full-screen shop-size warning is replaced by deliberate scrolling.
Opponent purchase gates now use the same public capabilities as useShopConfirm.

## Verification, 2026-09-04

- TypeScript check passed. Both existing layout-mode tests passed. No tests added or edited.
- Chromium geometry passed at 1440x900, 768x1024, 390x844, 320x568,
  844x390, and 720x450, with warning details closed and open.
  Boards fit their slots; purchase controls stay inside their panels;
  no horizontal document overflow. Short windows intentionally scroll vertically.
- Also checked widths 660/661/662 and 900/901/902. Frame samples in both
  directions retained the local board and canvas with nonzero dimensions.
- Real preview purchase: Curtain cost 140, funds changed 240 -> 100,
  and shop returned to waiting. With zero funds, purchase was disabled
  and explained the 140-credit shortfall.
- Mouse and keyboard activated shop controls. Touch opened offer and effect
  details. Larger text and reduced-motion presentation were checked.
- Pinch scale 2 was exercised. A 720x450 CSS viewport represents the layout
  pressure of 200% zoom in a 1440x900 window. Actual browser toolbar zoom,
  physical devices, Discord embeds, and a two-player network match were not checked.

Screenshots and geometry logs are in this worktree's ignored `.scratch/`
folder (`final-1440x900.png`, `final-768x1024.png`, `final-390x844.png`,
`ui-final-evidence.json`, and `ui-resize-frames.json`).

## Feedback revision

- Restored the opponent miniature; removed opponent funds and line-clear counts.
- Local credits appear once, as the prominent shop balance.
- New effect cards explain their consequence automatically. After 3.5 seconds
  visible in the stack, each becomes a labeled line. Offscreen cards keep their
  explanation until seen. New repeated effects show their explanation again.
- Phone swap lines retain only the dashed rule; larger layouts retain the label.
- Buying instructions appear with ready/cycling offers, without a help toggle.
  Removed the generic earn-credits footer.
