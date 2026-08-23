export type SearchScope = 'global' | 'guild' | 'discord_only';

export type ClientSessionProvider = 'guest' | 'discord';

const MATCH_SCOPE_STORAGE_KEY = 'shape-showdown.matchScope.v1';
const SEARCH_SCOPES: readonly string[] = ['global', 'guild', 'discord_only'];

export type EffectiveSearchScopeInput = {
  provider: ClientSessionProvider;
  preferredScope: string | null;
  guildId: string | null;
};

/**
 * Applies the client-side degrade rules:
 * - guests always search global (server enforces this too);
 * - guild scope without a launch guild id (DM/profile launch) degrades to
 *   discord_only rather than silently searching the whole world.
 */
export function resolveEffectiveSearchScope(
  input: EffectiveSearchScopeInput,
): { searchScope: SearchScope; guildId: string | null } {
  if (input.provider !== 'discord') {
    return { searchScope: 'global', guildId: null };
  }

  if (input.preferredScope === 'guild') {
    if (input.guildId !== null) {
      return { searchScope: 'guild', guildId: input.guildId };
    }
    return { searchScope: 'discord_only', guildId: null };
  }

  if (input.preferredScope === 'discord_only') {
    return { searchScope: 'discord_only', guildId: null };
  }

  return { searchScope: 'global', guildId: null };
}

/** Null when unset or when storage holds an unrecognized value. */
export function readPreferredMatchScope(): SearchScope | null {
  try {
    const raw = window.localStorage.getItem(MATCH_SCOPE_STORAGE_KEY);
    return raw !== null && isSearchScope(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writePreferredMatchScope(scope: SearchScope): void {
  try {
    window.localStorage.setItem(MATCH_SCOPE_STORAGE_KEY, scope);
  } catch {
    // Storage may be unavailable (private mode); preference stays session-only.
  }
}

function isSearchScope(value: string): value is SearchScope {
  return SEARCH_SCOPES.includes(value);
}
