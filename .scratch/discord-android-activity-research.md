# Discord Android Activity "disallowed page" research

Investigation date: 2026-08-25

## Conclusion

The Android setting in the Developer Portal only enables Android as a supported launch platform. It does not allow every URL, redirect, or network host used by the Activity.

The strongest repository-specific suspects are:

1. The production URL mapping is missing, malformed, attached to a different application ID, or does not cover `/game/`.
2. The Activity navigates from `/` to `/game/` with a full document navigation. Discord documents Activities as single-page apps, and the official SDK keeps one RPC handshake per mounted Activity. This transition can leave Android with a navigation or handshake it does not accept.
3. The current SDK initialization mutates private SDK state, sets `sourceOrigin` to `"*"`, and sends an extra private handshake. That is outside the documented initialization flow and is a separate Android lifecycle risk.

The exact Android string "activity was closed because it tried to open disallowed page" is not documented in the first-party sources reviewed. The report therefore separates Discord requirements from hypotheses based on this repository.

## What Discord requires

### Android support is only platform support

Discord's [mobile guide](https://docs.discord.com/developers/activities/development-guides/mobile) labels the supported platforms "Web, iOS, Android" and says to enable or disable them in **Activities -> Settings**. The [local development guide](https://docs.discord.com/developers/activities/development-guides/local-development#launch-your-application-from-the-discord-client) adds that an Activity will not appear on the current platform unless that platform is checked.

That setting controls whether Android can launch the Activity. It does not replace URL mappings or make a raw external URL an allowed Activity page.

### The Activity page is proxied and mapped

Discord says, "Activities in Discord are 'sandboxed' via a Discord proxy." It also says, "Because your application is 'sandboxed', it will be unable to make network requests to external URLs." The requirements are in the [URL Mapping guide](https://docs.discord.com/developers/activities/development-guides/local-development#url-mapping) and the [networking guide](https://docs.discord.com/developers/activities/development-guides/networking).

The production Activity website is publicly reachable at `<application_id>.discordsays.com`, according to Discord's [multiplayer guide](https://docs.discord.com/developers/activities/development-guides/multiplayer-experience). The normal production setup should therefore map the Activity proxy paths, rather than point the Activity at an unrelated raw host.

Discord's exact URL-mapping rules include:

- The HTML mapping should use the `/` route. The [production instructions](https://docs.discord.com/developers/activities/development-guides/local-development#running-your-application-in-production) say, "The URL for your application's html should be set to the `/` route."
- A target must omit its protocol. Discord says, "for a URL target, do not put `https://your-url.com`, instead, omit `https://` and use `your-url.com`."
- "Targets must point to a directory"; mapping a file such as `example.com/index.html` is unsupported.
- Longer overlapping prefixes must appear before shorter ones.

For this repository, the intended portal mapping should be checked as:

| Prefix | Target |
| --- | --- |
| `/` | `shape-showdown.pages.dev` |
| `/api` | `shape-showdown-production.up.railway.app/api` |
| `/health` | `shape-showdown-production.up.railway.app/health` |
| `/socketio` | `shape-showdown-production.up.railway.app/socket.io` |

The target values above intentionally have no `https://`. `AGENTS.md` currently shows target examples with `https://`, which conflicts with Discord's published formatting rule. If those values were copied literally into the portal, fix the portal entries first. The `/` mapping must serve both `/` and `/game/`.

The repository's `src/hooks/useGameSocket.ts` uses `window.location.origin` inside Discord, `/api` for HTTP, and `/socketio` for Socket.IO. That is correct only when the matching proxy mappings exist. A failed API or WebSocket request should normally produce an in-Activity error, not the Android page-policy message, so mappings are a page-load suspect first and a gameplay-connectivity suspect second.

There are three different origin checks here, and they must not be conflated:

- Discord's Activity proxy URL mappings decide which proxy paths can reach external targets.
- The browser/server CORS policy decides whether the Railway API accepts a request's `Origin`. This repository allows `*.discordsays.com` in `server/controlPlane/cors.ts`.
- The Embedded App SDK's `postMessage` handling decides whether messages came from an accepted Discord client origin. The official SDK source keeps an allowlist for incoming message origins and separately uses `document.referrer` as the outgoing RPC target.

Passing CORS does not authorize page navigation. A request can have valid CORS headers while Android still closes the Activity because the document navigation itself is outside the Activity route it expects.

### Activity navigation and the SPA lifecycle

Discord's [How Activities Work](https://docs.discord.com/developers/activities/how-activities-work#designed-for-singlepage-apps-spas) says, "This SDK is intended for use by a single-page application." The same page describes initialization as a handshake followed by `ready()`, then authorization and authentication.

The official [SDK source](https://raw.githubusercontent.com/discord/embedded-app-sdk/main/src/Discord.ts) shows that the constructor reads `frame_id`, `instance_id`, and `platform` from the current query string, selects the RPC source from `document.referrer`, and immediately sends a handshake. The official SDK issue [#41](https://github.com/discord/embedded-app-sdk/issues/41) records the maintainer explanation that the SDK and RPC server are designed for "only one 'ready handshake' ... per iframe mounted" and recommends initializing it once per Activity instance.

This repository has separate entry documents:

- `index.html` loads `src/landing.tsx`.
- `game/index.html` loads `src/main.tsx`.
- The Play Game link points to `/game/` and `navigateInApp()` calls `window.location.assign(...)`.
- `buildAppUrl()` preserves the current query string, which is good. It preserves Discord's frame and launch context when the navigation succeeds.

The latest commit tries to avoid an Android anchor interception by using programmatic navigation. Discord's first-party docs do not confirm the claimed `shouldOverrideUrlLoading` behavior or that `location.assign()` bypasses it. More importantly, `location.assign()` is still a full document navigation, not SPA routing. If the failure occurs after tapping **Play Game**, this transition is the leading code-level suspect. If the Activity fails before the landing page appears, this explanation is less likely and the portal mapping or launch URL should take priority.

The same problem exists in game-page paths that call `window.location.href` or `window.location.replace` to return to `/`. They can recreate the document and SDK inside the same Discord Activity mount.

### SDK initialization and OAuth

Discord's [Activity tutorial](https://docs.discord.com/developers/activities/building-an-activity) requires a redirect URI in the portal, but says the Embedded App SDK handles the redirect: "the Embedded App SDK automatically handles redirecting users back to your Activity." The tutorial uses `https://127.0.0.1` as a placeholder redirect URI for an Activity.

The documented order is:

```text
new DiscordSDK(client ID)
await discordSdk.ready()
await discordSdk.commands.authorize(...)
exchange the one-use code on the server
discordSdk.commands.authenticate(...)
```

The current client follows the first four steps, but does not call `authenticate()`. That is not the likely source of a disallowed-page close because the current game uses its own server session after the code exchange. It does mean SDK commands that require an authenticated Discord client would not work. Verify that the portal has the placeholder redirect URI even though `DISCORD_REDIRECT_URI` is optional in this server's token exchange.

The current `src/discordActivity.ts` also changes private SDK internals:

- It overwrites `sourceOrigin` with `"*"`.
- It invokes the private `handshake()` method a second time.
- It caches a rejected SDK promise permanently.

The official SDK source uses `document.referrer` as the RPC target and sends the constructor handshake itself. The `sourceOrigin` mutation is not an official Android fix. It may have been added for a referrer problem after reload, but it should be treated as an unsupported workaround and a possible contributor to Android lifecycle failures, not as proof that URL mapping is correct.

### External links

Discord's [user actions guide](https://docs.discord.com/developers/activities/development-guides/user-actions) says external links must use an SDK command. The SDK reference documents `openExternalLink()` as supported on Web, iOS, and Android. This repository routes the GitHub and portfolio links through that command, so those links are not the leading cause. Internal `/game/` navigation is a different case and should not be treated as an external-link flow.

## Recommended diagnostic order

1. In the Developer Portal, confirm the application ID matches the build's `VITE_DISCORD_CLIENT_ID`.
2. Confirm the four mappings above, including targets without `https://`, and ensure `/` points to the Pages host rather than a file or a raw `/game/` URL.
3. Disable any production **Application URL Override**. Discord documents that override as a local-development mechanism; production uses the saved URL mapping.
4. Launch the Activity and record whether it closes immediately or only after tapping **Play Game**. Immediate failure points to the launch URL or root mapping. Failure on the button points to the cross-document navigation.
5. Enable Developer Mode and inspect Android's **User Settings -> Appearance -> Debug Logs**. Discord documents filtering application logs by `RpcApplicationLogger` or the application ID and sharing logs from the voice channel.
6. Log the current `location.href`, `document.referrer`, and query parameters `frame_id`, `instance_id`, `platform`, and `mobile_app_version` before and after the transition. The official SDK requires the first three launch parameters; this code's query-preserving helper should retain them.

## Sources

- [How Activities Work](https://docs.discord.com/developers/activities/how-activities-work)
- [Local development, production setup, and URL mappings](https://docs.discord.com/developers/activities/development-guides/local-development)
- [Networking and the Activity proxy](https://docs.discord.com/developers/activities/development-guides/networking)
- [Mobile support and supported-platform settings](https://docs.discord.com/developers/activities/development-guides/mobile)
- [Building an Activity, redirect URI, and OAuth flow](https://docs.discord.com/developers/activities/building-an-activity)
- [Activity layout and layout-mode events](https://docs.discord.com/developers/activities/development-guides/layout)
- [Embedded App SDK reference](https://docs.discord.com/developers/developer-tools/embedded-app-sdk)
- [Official SDK source: `Discord.ts`](https://raw.githubusercontent.com/discord/embedded-app-sdk/main/src/Discord.ts)
- [Official SDK source: `patchUrlMappings.ts`](https://raw.githubusercontent.com/discord/embedded-app-sdk/main/src/utils/patchUrlMappings.ts)
- [Official SDK issue #41 on reloads and one handshake per mounted iframe](https://github.com/discord/embedded-app-sdk/issues/41)
