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
