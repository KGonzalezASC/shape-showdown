export type AppRoute = 'landing' | 'game';

/**
 * Reads the active SPA route from location hash or legacy pathname.
 * - #game or #play -> 'game'
 * - /game or /game/ pathname -> 'game' (for direct-web backwards compatibility)
 * - Otherwise -> 'landing'
 */
export function getAppRoute(): AppRoute {
  if (typeof window === 'undefined') return 'landing';

  const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
  if (hash === 'game' || hash === 'play') {
    return 'game';
  }

  const pathname = window.location.pathname.toLowerCase().replace(/\/$/, '');
  if (pathname.endsWith('/game')) {
    return 'game';
  }

  return 'landing';
}

/**
 * Updates the SPA route in-place without triggering an HTML document reload.
 * Preserves all search parameters (e.g. ?frame_id=..., ?guild_id=...).
 */
export function setAppRoute(route: AppRoute): void {
  if (typeof window === 'undefined') return;

  if (route === 'game') {
    if (window.location.hash !== '#game') {
      window.location.hash = '#game';
    }
  } else {
    if (
      window.location.hash
      && window.location.hash !== '#'
      && window.location.hash !== '#landing'
    ) {
      const url = new URL(window.location.href);
      url.hash = '';
      window.history.pushState(null, '', url.toString());
      window.dispatchEvent(new Event('popstate'));
      window.dispatchEvent(new Event('hashchange'));
    }
  }
}
