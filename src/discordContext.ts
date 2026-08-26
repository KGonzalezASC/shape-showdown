const discordClientId =
  typeof import.meta.env.VITE_DISCORD_CLIENT_ID === 'string'
    ? import.meta.env.VITE_DISCORD_CLIENT_ID.trim()
    : '';

/**
 * The same bundle can run as a direct web client or inside Discord. A
 * configured client ID alone is not enough to select Activity auth, because
 * direct Pages guests must remain independent of the SDK.
 *
 * Kept SDK-free so lightweight entry points (landing page) can call this
 * without pulling @discord/embedded-app-sdk into their bundle.
 */
export function isDiscordActivityContext(): boolean {
  if (discordClientId.length === 0 || typeof window === 'undefined') return false;
  return (
    window.location.hostname.toLowerCase().endsWith('.discordsays.com')
    || window.parent !== window
  );
}

export function isDiscordDMLaunch(): boolean {
  if (!isDiscordActivityContext() || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const guildId = params.get('guild_id');
  const channelId = params.get('channel_id');
  return (!guildId || guildId.length === 0) && typeof channelId === 'string' && channelId.length > 0;
}

export function appendDiscordFrameId(url: string): string {
  if (!isDiscordActivityContext() || typeof window === 'undefined') return url;
  const frameId = new URLSearchParams(window.location.search).get('frame_id');
  return appendFrameId(url, frameId);
}

export function appendFrameId(url: string, frameId: string | null): string {
  if (!frameId) return url;
  const target = new URL(url);
  target.searchParams.set('frame_id', frameId);
  return target.toString();
}

/**
 * Preserves the current window.location.search (frame_id, guild_id, channel_id, etc.)
 * when navigating between pages (e.g. '/' and '/game/').
 */
export function buildAppUrl(path: string, currentSearch?: string): string {
  const search =
    currentSearch !== undefined
      ? currentSearch
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
  if (!search) return path;

  const hasQuery = path.includes('?');
  if (hasQuery) {
    const [pathname, existingQuery] = path.split('?', 2);
    const params = new URLSearchParams(search);
    const existingParams = new URLSearchParams(existingQuery);
    existingParams.forEach((val, key) => params.set(key, val));
    const queryStr = params.toString();
    return queryStr ? `${pathname}?${queryStr}` : pathname;
  }

  const cleanSearch = search.startsWith('?') ? search : `?${search}`;
  return `${path}${cleanSearch}`;
}

/**
 * Opens an external URL safely across platforms.
 * In Discord Activity context, dynamically loads and uses discordSdk.commands.openExternalLink.
 * In direct web browser context, opens via window.open without bundling or executing the SDK.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isDiscordActivityContext()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  try {
    const { openExternalUrl: openInDiscord } = await import('./discordActivity');
    await openInDiscord(url);
  } catch (err) {
    console.warn('[Discord] Could not open external link via activity helper:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Navigate to an internal app route (e.g. '/game/') safely across platforms.
 *
 * On Android Discord the WebView intercepts anchor-click navigations via
 * shouldOverrideUrlLoading and kills the Activity with "disallowed page."
 * Programmatic location.assign() bypasses that interception. On open-web
 * browsers, anchor clicks work fine, but location.assign is equally correct,
 * so we use it unconditionally in Discord context.
 *
 * Attach this as an onClick handler on any internal `<a>` that crosses
 * HTML entry points (e.g. landing → game).
 */
export function navigateInApp(e: { preventDefault(): void }, path: string): void {
  if (typeof window === 'undefined') return;
  if (!isDiscordActivityContext()) return; // let the anchor work normally
  e.preventDefault();
  window.location.assign(buildAppUrl(path));
}

