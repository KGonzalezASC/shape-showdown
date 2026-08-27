# Discord Activity: why Android closed us, and what we do instead

Use this note in later chats. It is the short version of the August 2026 Android "disallowed page" work.

## What Discord actually is

A Discord Activity is not a normal website tab. Discord mounts one iframe, runs the Embedded App SDK handshake once for that mount, and proxies every page and network request through `{clientId}.discordsays.com`.

Official rules that matter here:

- Activities are designed as single-page apps. The SDK handshake is one-shot per mounted iframe. A full document navigation or `location.reload()` starts a new HTML document in the same mount. Desktop/web Discord often tolerates that. Android often does not.
- Enabling Android in the Developer Portal only means Android may *launch* the Activity. It does not allow extra pages, extra origins, or a second handshake.
- External sites and extra hosts need URL mappings. Prefixes cannot contain `.` (use `/socketio` → `.../socket.io`). Mapping targets omit `https://` and must be directories, not files.

Sources: [How Activities work](https://docs.discord.com/developers/activities/how-activities-work), [URL mappings](https://docs.discord.com/developers/activities/development-guides/local-development#url-mapping), [SDK issue #41](https://github.com/discord/embedded-app-sdk/issues/41).

## What we did wrong

This app used to be two HTML documents:

1. Discord opened `/` (`index.html` → landing).
2. Play navigated to `/game/` (`game/index.html` → match).

That is a full page load. Android reported: **activity was closed because it tried to open disallowed page**.

Patches that still loaded a new document (`location.assign('/game/')`, then later `location.reload()` on retry) did not fix it. Changing an `<a>` click to `location.assign` is still a navigation.

A private SDK hack (`sourceOrigin = '*'`, a second `handshake()`) was a reload workaround, not an official Android fix. It was removed.

## What we do now

Keep one document alive for the whole Activity:

- `RootApp` owns landing vs game.
- Switch views with `#game` via `history.pushState` in `src/appRoute.ts`. Discord query params (`frame_id`, `instance_id`, guild, channel) stay on the URL.
- `GameStateProvider` / socket bootstrap mount only on the game route, so landing does not queue.
- Return to menu, cancel search, and disconnect-forfeit call `setAppRoute('landing')`. Legacy `/game/` is rewritten to `/` with `pushState`, not a load of `index.html`.
- Guest-session reset and connection retry remount the socket in-document. Protocol mismatch inside Discord closes the Activity through the public SDK and asks the player to reopen it. Open-web protocol mismatch may still `location.reload()` to pick up a new bundle.

External links (portfolio, GitHub) still go through `openExternalLink`. That is a different rule from in-app routing.

## If Android closes it again

1. Did the close happen on launch, or after Play / Return / Retry? Launch points at URL mappings or the root HTML. After a button points at a remaining document navigation.
2. Confirm portal mappings: `/` → `shape-showdown.pages.dev` (no protocol), plus `/api`, `/health`, `/socketio`. No Application URL Override in production.
3. Android logs: Developer Mode → Debug Logs, filter `RpcApplicationLogger` or the application ID.

Longer research dump: `.scratch/discord-android-activity-research.md`.
