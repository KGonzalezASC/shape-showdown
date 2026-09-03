# Touch controls consistency specification

Status: Ready for implementation

Scope: Multiplayer matches and single-player puzzles

Primary owners: `src/App.tsx`, `src/components/PuzzleScreen.tsx`, `src/components/MobileControls.tsx`, `src/RootApp.tsx`, and `src/index.css`

## Summary

Shape Showdown must use one touch-control policy in multiplayer and single-player gameplay. The modes can expose different secondary actions, but they must share capability detection, visibility rules, held-input behavior, action availability, document gesture policy, and minimum layout standards.

Multiplayer is the reference for capability detection and lifecycle gating. It is not a perfect reference for multi-touch input. The implementation must keep its stronger policy while fixing the shared input defects rather than copying either mode unchanged.

The player must receive the same movement and rotation behavior in both modes. Puzzle rules may remove an action such as Hold. The controls must show that restriction instead of presenting an enabled button that the server rejects.

## Problem statement

The current puzzle path renders the shared `MobileControls` component, but it reimplements the policy around that component. The two paths now disagree in five areas:

- Multiplayer detects a coarse pointer, no-hover input, and observed touch or pen use. Puzzle mode performs one initial capability check and then relies on a separate stored boolean.
- Multiplayer clears held input when gameplay stops. Puzzle mode does not clear held input on hide, puzzle end, restart, level change, or most route changes.
- Puzzle mode can disable Hold in the puzzle contract, but `MobileControls` cannot represent that disabled action.
- Multiplayer uses a game document policy. Active puzzles still inherit the landing page's scrolling and browser gesture policy.
- Puzzle chrome competes with the board and controls for height. Short phone and landscape layouts shrink the board below a playable size.

The shared component also treats every movement press as the complete input state. Two simultaneous presses overwrite each other, and releasing either press clears both. That defect affects multiplayer and puzzles.

## Evidence

The audit used the current `feature/single-player-puzzles` worktree and the local game at `http://localhost:3000/#puzzles`.

Observed document behavior during an active puzzle:

- `document.documentElement.dataset.page` remained `landing`.
- The document and body used `overflow: auto`.
- The document and body used `touch-action: auto`.
- The document used `overscroll-behavior: auto`.

Observed layout results with touch controls visible:

| Viewport | Board result | Control result | Verdict |
| --- | --- | --- | --- |
| `390x844` | `250x450px` | Two thumb clusters fit | Pass |
| `390x600` | Board fell as low as `90x162px` | Controls consumed about `144px` | Fail |
| `844x390` | `80x144px` | Controls consumed `144px`; hazard aside stayed open | Fail |

Observed rule mismatch:

- The `Four Wide` puzzle showed `No Hold` and `Storage disabled` in the playfield.
- The touch Storage button remained enabled.
- The button had neither `disabled` nor `aria-disabled`.

Static checks found these lifecycle problems:

- Hiding `MobileControls` does not emit a neutral input state.
- Starting or restarting a puzzle does not reset `heldInputsRef`.
- Receiving `puzzle:end` does not reset `heldInputsRef`.
- Puzzle keyboard and touch action handlers do not require an active, unfinished session.
- The Retry control fires on `pointerdown` during live play.
- The Retry control does not use the palm and edge rejection applied to other destructive touch actions.
- The result modal says `Try Again (R)`, but `KeyR` is not a bindable or separately handled action.

`bun run lint` passed before this specification was written.

## Goals

The implementation must meet these goals:

1. Use one policy to decide whether on-screen controls are visible.
2. Preserve an explicit player preference across multiplayer and puzzle gameplay.
3. Reveal controls when the player uses touch or pen in automatic mode.
4. Keep every essential action available through a visible control or a proven alternative input path.
5. Clear held input at every lifecycle boundary.
6. Support simultaneous directional and soft-drop presses.
7. Represent disabled puzzle actions in the controls.
8. Prevent accidental puzzle restarts.
9. Keep the board playable in short portrait and landscape layouts.
10. Lock browser gestures during gameplay while keeping the puzzle picker scrollable.

## Non-goals

This work does not change these systems:

- Server-authoritative movement, DAS, ARR, gravity, locking, or action validation.
- Puzzle generation, puzzle goals, authored timelines, or scoring.
- Keyboard rebinding.
- Multiplayer shop behavior.
- Gamepad API support.
- The visual theme of the controls or playfield.
- The production puzzle hosting model.

Do not create new tests unless the owner separately authorizes them. Existing tests remain read-only specifications.

## Terms

Use these terms consistently in code and documentation:

- **On-screen controls** means the rendered thumb controls. Do not use `mobile controls` as a policy term because viewport width does not prove touch input.
- **Automatic mode** means the application derives visibility from current capabilities and observed input.
- **Explicit preference** means the player chose to show or hide the controls.
- **Gameplay phase** means a multiplayer match or puzzle session that accepts player input.
- **Neutral input** means `{ left: false, right: false, softDrop: false }`.
- **Movement input** means Left, Right, and Soft Drop. These actions can remain held.
- **Discrete action** means Rotate Clockwise, Rotate Counter-clockwise, Hard Drop, Hold, Shop, or Retry.

## Shared policy model

Create one shared owner under `src/input/`. The exact filename may follow the local naming convention, but multiplayer and puzzles must import the same hook and types.

Use this domain shape:

```ts
type OnScreenControlsPreference = 'auto' | 'shown' | 'hidden';

interface OnScreenControlsCapabilities {
  primaryPointerCoarse: boolean;
  primaryPointerCannotHover: boolean;
  touchPointsReported: boolean;
}

interface OnScreenControlsPolicyState {
  preference: OnScreenControlsPreference;
  touchOrPenObserved: boolean;
  visible: boolean;
}
```

`visible` is derived state. Do not persist it separately.

Derive visibility with these rules:

1. `shown` always shows the controls.
2. `hidden` hides the controls but leaves a visible control that can restore them.
3. `auto` shows the controls when any of these facts is true:
   - `(pointer: coarse)` matches.
   - `(hover: none)` matches.
   - `navigator.maxTouchPoints > 0`.
   - The current page session observed a pointer event whose `pointerType` is `touch` or `pen`.
4. `auto` hides the controls when none of those facts is true.

Listen for changes to both media queries. Recompute the derived result when either query changes.

Use one origin-scoped storage key for both modes. The implementation must catch errors from both reads and writes. If storage is unavailable or invalid, use `auto` for the current session.

Do not keep the current `puzzleTouchControls` boolean as an independent policy. Migrate `true` to `shown` and `false` to `hidden` once, then delete the legacy key. The migration must tolerate missing or blocked storage.

## Visibility control

Both gameplay modes must expose the same compact control for changing the preference.

The control must communicate the effective state and the preference:

- `Controls: Auto` when the preference is `auto`.
- `Controls: On` when the preference is `shown`.
- `Controls: Off` when the preference is `hidden`.

The interaction may use a small menu or cycle through the three values. The chosen interaction must remain usable at `320px` viewport width. An icon-only form requires an accurate accessible name.

Changing the preference from a visible state to `hidden` must emit neutral input before the controls unmount.

## Gameplay and document phases

Model the puzzle view as explicit phases rather than deriving behavior from loose booleans:

```ts
type PuzzleViewPhase =
  | { kind: 'picker' }
  | { kind: 'starting'; puzzleId: string | null }
  | { kind: 'playing'; puzzleId: string }
  | { kind: 'finished'; puzzleId: string; solved: boolean };
```

The implementation may derive this union from existing authoritative state. Do not add a second phase value that can disagree with `started`, `state`, `end`, and `picking`.

Apply document interaction behavior by phase:

| Surface | Scrolling | Overscroll | Touch action |
| --- | --- | --- | --- |
| Landing page | Allowed | Allowed | `auto` |
| Puzzle picker | Allowed | Allowed | `auto` |
| Multiplayer gameplay | Locked | Disabled | `none` |
| Puzzle starting, playing, or finished | Locked | Disabled | `none` |

One shared document-policy owner must apply and clean up these values. Do not let `RootApp`, `PuzzleScreen`, and CSS set competing document modes.

## Input state model

The controls must track each active pointer independently. Use `pointerId` as the owner of a held movement action.

```ts
type HeldMovementAction = 'left' | 'right' | 'softDrop';

type HeldPointerInputs = ReadonlyMap<number, HeldMovementAction>;
```

Derive the complete server input from the map:

```ts
interface InputState {
  left: boolean;
  right: boolean;
  softDrop: boolean;
}
```

The rules are:

- A pointer press adds or replaces that pointer's held movement action.
- A pointer release removes only that pointer's action.
- A pointer cancellation removes only that pointer's action.
- Losing pointer capture removes only that pointer's action.
- Unmounting the controls clears the map and emits neutral input.
- Hiding the controls clears the map and emits neutral input before unmount.
- Blurring the window clears both keyboard and pointer input.
- Leaving the gameplay phase clears both keyboard and pointer input.
- Starting a new session clears both keyboard and pointer input before the start request.

Use pointer capture for held buttons. Do not rely on `pointerleave` as the normal release path. A finger can drift outside a small button while the player still intends to hold it.

Send the full `InputState` after every change. Do not send partial movement state from the control component.

## Discrete action model

`MobileControls` must receive explicit availability rather than guessing from optional callbacks.

Use a discriminated utility-slot type:

```ts
type UtilityControl =
  | { kind: 'shop'; enabled: boolean; disabledReason?: string; onActivate: () => void }
  | { kind: 'none' };

interface GameplayControlAvailability {
  hardDrop: { enabled: boolean; disabledReason?: string };
  hold: { enabled: boolean; disabledReason?: string };
  rotateCW: { enabled: boolean; disabledReason?: string };
  rotateCCW: { enabled: boolean; disabledReason?: string };
  utility: UtilityControl;
}
```

Puzzle mode uses `{ kind: 'none' }` for the utility slot during live play. Retry must not occupy the live Shop position.

Multiplayer derives availability from the current player state and match phase. Puzzle mode also applies the puzzle contract:

- If `allowHold` is false, disable Hold and expose `Storage disabled` as the accessible reason.
- If no active piece exists, disable piece actions.
- If the session is starting or finished, disable every gameplay action.
- If a server effect blocks an action, render the disabled state when the public player snapshot exposes that fact.

Disabled controls must use the native `disabled` attribute. Styling alone is insufficient. The button's accessible name must remain stable.

Discrete actions must ignore repeated activation until the next pointer press. Keyboard repeat must remain disabled for rotations.

## Retry behavior

Remove Retry from `MobileControls` during active play.

Keep Retry in the terminal result UI. If the product later needs a live restart action, add it to puzzle chrome as a separate destructive action with deliberate activation. Do not fire a live restart on `pointerdown`.

Remove `(R)` from `Try Again (R)` because no `KeyR` handler exists. Adding a retry binding is outside this scope.

Restarting must perform this sequence:

1. Emit neutral input.
2. Clear all local held-input ownership.
3. Clear the prior terminal presentation.
4. Request the new puzzle session.
5. Accept input only after `puzzle:started` and the initial state arrive.

## Layout contract

The board is the primary gameplay content. Controls are essential when they are the player's only proven input path. Hazard detail, decorative copy, and live Retry are secondary.

Use container and viewport height measurements to choose the composition. Do not infer the composition from phone, tablet, or desktop names alone.

The layout must follow these pressure rules in order:

1. Remove live Retry from the control cluster.
2. Collapse the hazard aside into the compact hazard chip when block height is constrained.
3. Use the compact HUD.
4. Reduce gaps and decorative padding.
5. Use a one-row-per-thumb-cluster landscape control layout.
6. Reduce control targets, but never below `44x44px`.
7. Shrink the board only after the earlier reductions apply.

For supported gameplay viewports, keep the board cell size at or above `14px`. A 10 by 18 board at this floor is `140x252px` before the frame. If a supported viewport still cannot fit, change the composition instead of shrinking below the floor.

Required branches:

| Condition | Required composition |
| --- | --- |
| Controls hidden | Board uses the released block space |
| Controls shown and sufficient height | Existing two-row thumb clusters |
| Controls shown and short portrait | Compact HUD, hazard chip, reduced gaps |
| Controls shown and landscape | Horizontal control band with one row per thumb cluster; hazard chip |
| No authored hazards | No empty hazard aside or reserved hazard width |
| Finished puzzle | Result UI owns interaction; gameplay controls are disabled or absent |

The board measurement must observe a stable parent. Keep one `GameField` instance mounted across composition changes. Update the cell size in the same layout pass. Do not defer the destination measurement to `requestAnimationFrame`.

Remove the unused `touchControlsHeight` state and `onHeightChange` prop if the final layout does not need them. If the final owner needs the measured height, wire them into that owner and use the value. Do not retain disconnected measurement code.

## Interaction details

Every button must meet these requirements:

- Use a minimum `44x44px` target.
- Prevent browser callouts and text selection in gameplay.
- Preserve the existing hard-drop protection against large or glancing contacts.
- Apply equivalent accidental-touch protection to any destructive action.
- Show a visible pressed state.
- Keep the accessible name stable when the visual form compacts.
- Remain operable with a fine pointer.

The global keyboard path remains active when controls are visible. Showing touch controls must not disable keyboard input on a hybrid device.

## Accessibility requirements

- Disabled buttons use `disabled`.
- A disabled reason appears in nearby visible text or an accessible description.
- The preference control exposes its current state.
- Focus order follows the rendered order.
- Hiding controls while focus is inside them moves focus to the preference control.
- The result overlay traps interaction from the gameplay area.
- No essential information depends on hover.
- At 200 percent zoom, the page keeps all essential actions reachable without horizontal document scrolling.

## Ownership and expected file changes

### `src/input/`

Add the shared on-screen-control policy and storage boundary here. This owner handles capability queries, observed pointer type, the explicit preference, storage migration, and derived visibility.

### `src/components/MobileControls.tsx`

Keep this component presentational and input-focused. It owns pointer capture, per-pointer held actions, button rendering, and neutral cleanup on unmount. It does not read storage, media queries, puzzle rules, match state, or viewport width.

### `src/App.tsx`

Replace the local `showTouchControls` reducer behavior with the shared policy. Build multiplayer action availability from the authoritative public player and match state. Keep Shop as the multiplayer utility control.

### `src/components/PuzzleScreen.tsx`

Replace `puzzleTouchControls`, `showTouchControls`, and the local detection code with the shared policy. Derive puzzle action availability from `PuzzleStarted`, `PuzzleWireState`, and the finished state. Clear input at every puzzle lifecycle boundary. Remove live Retry from `MobileControls`.

### `src/RootApp.tsx`

Stop classifying active puzzles as an ordinary landing document. Route the shared document interaction mode through one owner.

### `src/index.css`

Keep capability policy out of CSS. CSS owns placement and sizing only. Add short-height and landscape compositions for puzzle chrome and the touch-control clusters. Preserve the current theme variables.

### `src/types.ts`

Reuse the existing `ActionType` and `InputState`. Do not declare structural copies in component props. Add shared types here only if both the client and the server need them. Client-only policy types belong under `src/input/`.

## Implementation sequence

Implement the work in these verifiable units:

### Unit 1. Remove unsafe and dead puzzle behavior

- Remove live Retry from the touch cluster.
- Remove the false `(R)` hint.
- Remove or connect the unused touch-control height measurement.
- Verify that multiplayer still renders Shop and puzzles render no utility action.

### Unit 2. Add the shared visibility policy

- Add the tri-state preference.
- Add safe storage reads and writes.
- Add legacy puzzle preference migration.
- Add media-query subscriptions and observed touch or pen input.
- Migrate multiplayer and puzzles to the shared owner in the same unit.
- Verify mode switches without reloading the document.

### Unit 3. Fix held-input ownership and cleanup

- Add per-pointer movement ownership.
- Add pointer capture.
- Emit composed full input state.
- Add neutral cleanup to every lifecycle boundary.
- Verify simultaneous Left plus Soft Drop and Right plus Soft Drop.

### Unit 4. Add action availability

- Add the typed availability contract.
- Disable Hold when `allowHold` is false.
- Disable all controls outside an active gameplay phase.
- Verify an ordinary puzzle and `Four Wide`.

### Unit 5. Unify document interaction policy

- Keep the picker scrollable.
- Lock gestures and overscroll during puzzle gameplay.
- Verify route transitions among landing, picker, puzzle, and multiplayer.

### Unit 6. Repair short-height and landscape layout

- Collapse secondary puzzle chrome before shrinking the board.
- Add the landscape control composition.
- Enforce the board and target-size floors.
- Verify every matrix cell below in the live browser.

Do not preserve temporary compatibility branches after both callers move to the shared policy.

## Acceptance criteria

### Visibility and preference

- A new coarse-pointer or no-hover session shows controls in both modes.
- A fine-pointer and hover-capable session hides controls in both modes when the preference is `auto`.
- A touch or pen pointer event reveals controls in `auto` mode.
- A media-query capability change recomputes visibility.
- `shown` and `hidden` apply to both modes after an in-document route change.
- Blocked storage does not crash rendering.
- The control that restores hidden controls remains visible and operable.

### Input state

- Holding Left and then Soft Drop sends both as true.
- Releasing Soft Drop while Left remains held keeps Left true.
- Pointer cancellation clears only the cancelled pointer's action.
- Hiding controls emits neutral input before unmount.
- Blur, puzzle end, restart, level selection, and route exit emit neutral input.
- Starting a new puzzle never inherits an input from the prior attempt.

### Action availability

- `allowHold: false` renders a disabled Storage button.
- The disabled Storage button emits no action.
- Finished and starting sessions accept no gameplay control action.
- Multiplayer Shop remains available under its existing server-authoritative rules.
- Active puzzle gameplay has no Retry button in the thumb cluster.

### Document behavior

- The puzzle picker scrolls normally.
- Active puzzle gameplay has no document scroll or rubber-band overscroll.
- Active puzzle gameplay reports `touch-action: none` at the gameplay owner.
- Returning to the picker restores normal scrolling and browser gestures.

### Layout

Verify these viewport fixtures with controls shown:

| Viewport | Orientation | Required result |
| --- | --- | --- |
| `320x568` | Portrait | No horizontal overflow; targets at least `44px`; cell at least `14px` |
| `390x600` | Short portrait | Compact HUD and hazard chip; cell at least `14px` |
| `390x844` | Tall portrait | Two-row thumb clusters; cell at least `14px` |
| `844x390` | Landscape | Landscape control band and hazard chip; cell at least `14px` |
| `660x700` | Below phone-to-tablet threshold | Stable composition and no overlap |
| `661x700` | At phone-to-tablet threshold | Stable composition and no overlap |
| `662x700` | Above phone-to-tablet threshold | Stable composition and no overlap |
| `900x700` | Below desktop threshold | Controls follow capability policy |
| `901x700` | At desktop threshold | Controls follow capability policy |
| `902x700` | Above desktop threshold | Controls follow capability policy |

Repeat the densest fixture at 200 percent zoom. Exercise both a puzzle with authored hazards and a puzzle without hazards. Exercise both `allowHold: true` and `allowHold: false`.

At each fixture, record these facts:

- Viewport width and height.
- Playfield container width and height.
- Board CSS size and canvas backing size.
- Device pixel ratio.
- Control target rectangles.
- Document and gameplay-region scroll metrics.
- Computed `touch-action` and `overscroll-behavior`.
- Active media-query matches.
- Any overlap among controls, the board, the HUD, and hazard presentation.

Presence is not enough. Activate movement, rotations, Hard Drop, Hold when allowed, and the utility action when present.

## Verification commands

Use the smallest checks allowed by `AGENTS.md`:

```text
bun run lint
bun run test:board
```

Run existing focused input or component tests only if an existing file directly covers the changed behavior. Do not add, edit, or weaken tests without separate authorization.

Browser verification is required because compilation cannot prove pointer capture, multi-touch composition, browser gesture policy, control reachability, or responsive layout.

## Completion definition

This work is complete when both gameplay modes use the shared policy, every lifecycle boundary clears input, puzzle legality reaches the rendered controls, and the full browser matrix passes. A passing lint command alone is not completion.

The implementation must leave no independent `puzzleTouchControls` policy, no live puzzle Retry thumb button, no enabled Hold control in a no-hold puzzle, and no supported viewport with a board cell below `14px`.
