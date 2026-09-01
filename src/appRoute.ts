export type AppRoute = 'landing' | 'game' | 'puzzles';

function stripTrailingSlash(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/$/, '');
}

function isLegacyGamePathname(pathname: string): boolean {
  return stripTrailingSlash(pathname).toLowerCase().endsWith('/game');
}

function toLandingPathname(pathname: string): string {
  const trimmed = stripTrailingSlash(pathname);
  if (!trimmed.toLowerCase().endsWith('/game')) return pathname;
  const parent = trimmed.slice(0, -'/game'.length);
  return parent === '' ? '/' : `${parent}/`;
}

function routeFromLocation(pathname: string, hash: string): AppRoute {
  const normalizedHash = hash.toLowerCase().replace(/^#\/?/, '');
  if (normalizedHash === 'game' || normalizedHash === 'play') return 'game';
  if (normalizedHash === 'puzzles' || normalizedHash === 'puzzle') return 'puzzles';
  if (isLegacyGamePathname(pathname)) return 'game';
  return 'landing';
}

/**
 * Reads the active SPA route from location hash or legacy pathname.
 * - #game or #play -> 'game'
 * - /game or /game/ pathname -> 'game' (for direct-web backwards compatibility)
 * - Otherwise -> 'landing'
 */
export function getAppRoute(): AppRoute {
  if (typeof window === 'undefined') return 'landing';
  return routeFromLocation(window.location.pathname, window.location.hash);
}

/**
 * Updates the SPA route in-place without triggering an HTML document reload.
 * Preserves all search parameters (e.g. ?frame_id=..., ?guild_id=...).
 * Legacy `/game/` documents are rewritten to `/` via history.pushState.
 */
export function setAppRoute(route: AppRoute): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (route === 'game') {
    url.hash = 'game';
  } else if (route === 'puzzles') {
    url.hash = 'puzzles';
  } else {
    url.hash = '';
    if (isLegacyGamePathname(url.pathname)) {
      url.pathname = toLandingPathname(url.pathname);
    }
  }

  const next = url.toString();
  if (next === window.location.href && getAppRoute() === route) return;

  window.history.pushState(null, '', next);
  window.dispatchEvent(new Event('popstate'));
}
