# Discord Activity constraints

Investigation date: 2026-08-20

## Conclusion

Both reports have a code-level explanation. Discord runs the same app in a nested, proxy-served iframe, so the responsive breakpoints measure the Activity iframe rather than the user's whole Discord window. The pixel font is requested from Google Fonts, an external origin that Discord's Activity proxy blocks unless the app has matching URL mappings.

## Responsive resizing

Discord documents Activities as web apps hosted in an iframe. Its layout guide names three Activity modes, focused, picture-in-picture, and grid, and provides `subscribeToLayoutModeUpdatesCompat` so an app can change its layout when Discord changes modes.

This repo currently reacts to the iframe's ordinary web dimensions:

- `src/responsive/playfieldLayoutMode.ts` uses `matchMedia` thresholds at 661px and 901px. Those queries are evaluated against the document's viewport.
- `src/responsive/playfieldLayoutMode.ts` also sizes the main screen with `100dvh`, then applies `min-h-[500px]`.
- `src/App.tsx` puts the root at `h-dvh max-h-dvh`, centers the screen, and hides overflow.
- `src/components/PlayfieldShell.tsx` observes the playfield element with `ResizeObserver` and recalculates cell size.
- `src/App.tsx` uses `window.innerWidth`, `window.resize`, and `visualViewport.resize` for the shop-fit warning.
- `src/discordActivity.ts` and `src/hooks/useGameSocket.ts` initialize the Discord SDK and use Activity authentication, but do not subscribe to Discord layout-mode or orientation updates.

The web-platform behavior matches the report. MDN says each iframe has its own `window` and viewport. Width media queries and `vw`/`vh` units inside the iframe use that iframe's viewport, not the outer browser window. MDN also says an iframe's visual and layout viewports are the same, so the child `visualViewport` is not a way to read the top-level Discord window.

That creates two concrete differences from the raw Pages tab:

1. Discord may give the Activity a much narrower or shorter viewport. A width below 661px selects the phone composition; 661px through 900px selects tablet; 901px and above selects desktop.
2. A short Activity viewport can be smaller than the screen's 500px minimum. The `min-h-[500px]` screen is then centered inside an `overflow-hidden` root, so content can be clipped instead of shrinking to the available height. The short-window CSS at `max-height: 600px` compacts the shop, but it does not remove that minimum height.

`ResizeObserver` is a sound mechanism for reacting to a changed element box, and this code does use it. It does not provide Discord's semantic layout-mode signal, however. The repo has no Activity layout subscription, so it cannot deliberately distinguish focused, PIP, and grid presentation when the mode changes.

**Finding:** the raw Pages URL and Discord Activity are not equivalent responsive environments. The likely failure is the combination of iframe-local breakpoints and the 500px minimum inside a short Discord layout. Confirm with the Activity's `window.innerWidth`, `window.innerHeight`, `document.documentElement.clientWidth`, `clientHeight`, and the measured `main.getBoundingClientRect()` values in each Discord mode.

## Missing pixel font

The font path is visible in the source and production build:

- `index.html` links to `https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap`.
- The built `dist/client/index.html` preserves that absolute Google Fonts stylesheet URL.
- `src/index.css` names `"Press Start 2P"` first, followed by `Consolas, monospace`.
- The repository contains no `.woff`, `.woff2`, `.ttf`, or `.otf` font asset.
- There is no `@font-face` rule, no `patchUrlMappings` call, and no repository record of a Google Fonts URL mapping.

The raw Cloudflare Pages page can load the Google stylesheet and its font file as ordinary browser requests. Discord's official networking guide says all Activity network traffic goes through the Discord proxy. It also says external URLs are sandboxed and can fail with `blocked:csp`; external resources need Developer Portal URL mappings, or the SDK's `patchUrlMappings` helper when a dependency hard-codes an external URL. The URL-mapping guide says the app should request the mapped local prefix, which Discord forwards to the target.

The current absolute links request `fonts.googleapis.com` and, through that stylesheet, a font file on `fonts.gstatic.com`. They do not request an Activity-relative mapped prefix. If those hosts are not explicitly mapped in the Discord application, the stylesheet or font request is expected to fail in the Activity. CSS then reaches the declared fallback, which explains why the page still renders while the pixel typeface disappears.

**Finding:** the font difference is most consistent with Discord CSP/proxy handling, not with Tailwind or the `font-family` declaration. The direct URL proves that the CSS is valid and the fallback chain is working. It does not prove that the same external requests are permitted inside the Activity.

## Vite and asset-path evidence

`vite.config.mjs` reads `config/client.json`, whose current `baseUrl` is `"./"`. Vite's production output therefore uses relative asset URLs, as seen in the built module and stylesheet links. The runtime `game-config.json` fetch correctly uses `import.meta.env.BASE_URL`.

Vite documents that `public` files are copied as-is to the output root and are normally referenced with root-absolute URLs. This repo follows that pattern for `/poison/poison-sheet.svg`, while the runtime config uses a base-aware URL. That mixed convention is an adjacent embedded-deployment risk, but it does not explain the Google font report because the font is not in `public` or the Vite asset graph at all.

## Decided conclusions

- Responsive differences are expected when comparing a normal Pages tab with a Discord-managed iframe. The current code measures the iframe correctly in web terms, but it has a hard 500px minimum and no Discord layout-mode subscription.
- The pixel font is not bundled. Discord must be allowed to fetch both external font resources through Activity URL mappings, or the font must be delivered through the app's own mapped assets. The repo currently shows neither.
- No gameplay or Socket.IO code explains either visual report. The Activity-specific socket origin and path in `useGameSocket.ts` are separate from CSS viewport calculation and font loading.

## Unknowns that require Activity-side evidence

- The actual Discord Developer Portal URL mappings for this application.
- The Activity iframe dimensions in focused, PIP, and grid modes.
- Discord's console/network result for the Google Fonts stylesheet and `fonts.gstatic.com` font request.
- `document.fonts.check('12px "Press Start 2P"')` and the loaded `FontFace` statuses inside Discord.

## Primary sources

- [Discord Activities overview](https://docs.discord.com/developers/activities/overview)
- [How Activities work](https://docs.discord.com/developers/activities/how-activities-work)
- [Discord Activity layout guide](https://docs.discord.com/developers/activities/development-guides/layout)
- [Discord Activity networking guide](https://docs.discord.com/developers/activities/development-guides/networking)
- [Discord Activity URL mappings](https://docs.discord.com/developers/activities/development-guides/local-development#url-mapping)
- [MDN viewport concepts](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/CSSOM_view/Viewport_concepts)
- [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)
- [MDN CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API)
- [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Vite static asset handling](https://vite.dev/guide/assets)
- [Vite shared configuration options](https://vite.dev/config/shared-options)
