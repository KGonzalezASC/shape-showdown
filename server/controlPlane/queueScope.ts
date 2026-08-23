export type SearchScope = 'global' | 'guild' | 'discord_only';

export const SEARCH_SCOPES: readonly string[] = ['global', 'guild', 'discord_only'];

const GUILD_ID_PATTERN = /^\d{1,64}$/;

export type QueueScopeRequestBody = {
  searchScope?: unknown;
  guildId?: unknown;
};

export type QueueScopeContext = {
  discordUserId: string | null;
  scopedEnqueueEnabled: boolean;
};

export type ValidatedQueueScope = {
  searchScope: SearchScope;
  guildId: string | null;
};

export type QueueScopeResolution = {
  /**
   * Always populated. On validation failure it holds the safe coercion target
   * ('global') so callers that ignore the reason cannot enqueue into a scoped pool.
   */
  scope: ValidatedQueueScope;
  /** Null when the request is acceptable; otherwise the client-facing rejection reason. */
  reason: string | null;
};

/**
 * Resolves the effective search scope for a queue enqueue request.
 *
 * Guests and disabled scoped enqueue are silently coerced to 'global' so
 * legacy clients keep today's behavior. An explicit invalid scope value is
 * rejected instead of coerced so client bugs surface in logs.
 */
export function validateQueueScopeRequest(
  body: unknown,
  context: QueueScopeContext,
): QueueScopeResolution {
  if (!context.scopedEnqueueEnabled || context.discordUserId === null) {
    return { scope: { searchScope: 'global', guildId: null }, reason: null };
  }

  const rawScope = isQueueScopeBody(body) ? body.searchScope : undefined;
  if (rawScope === undefined || rawScope === null || rawScope === '') {
    return { scope: { searchScope: 'global', guildId: null }, reason: null };
  }
  if (typeof rawScope !== 'string' || !isSearchScope(rawScope)) {
    return invalid('searchScope must be global, guild, or discord_only');
  }

  if (rawScope === 'guild') {
    const rawGuildId = isQueueScopeBody(body) ? body.guildId : undefined;
    if (typeof rawGuildId !== 'string' || !GUILD_ID_PATTERN.test(rawGuildId)) {
      return invalid('guild scope requires a numeric Discord guild id');
    }
    return { scope: { searchScope: 'guild', guildId: rawGuildId }, reason: null };
  }

  return { scope: { searchScope: rawScope, guildId: null }, reason: null };
}

/** Ops switch read from the environment at request time so Railway can toggle it without a deploy. */
export function isScopedEnqueueEnabled(
  envValue: string | undefined = process.env.QUEUE_SCOPED_ENQUEUE_ENABLED,
): boolean {
  const normalized = envValue?.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off';
}

function invalid(reason: string): QueueScopeResolution {
  return { scope: { searchScope: 'global', guildId: null }, reason };
}

function isSearchScope(value: string): value is SearchScope {
  return SEARCH_SCOPES.includes(value);
}

function isQueueScopeBody(value: unknown): value is QueueScopeRequestBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
