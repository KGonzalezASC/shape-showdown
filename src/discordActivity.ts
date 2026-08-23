import { DiscordSDK } from '@discord/embedded-app-sdk';

export { isDiscordActivityContext } from './discordContext';
import { appendDiscordFrameId, isDiscordActivityContext } from './discordContext';

export type DiscordActivitySessionResponse = {
  player: {
    id: string;
    displayName?: unknown;
    avatarUrl?: unknown;
  };
  session: {
    token: string;
    expiresAt?: unknown;
  };
};

export type DiscordActivityBootstrap = {
  playerId: string;
  token: string;
  expiresAt: string | null;
  /**
   * Frame-context launch target: the server the Activity was opened in.
   * Null on DM/profile launches. Re-read every launch — never persisted —
   * because the same user can open the Activity in different servers.
   */
  guildId: string | null;
};

const discordClientId =
  typeof import.meta.env.VITE_DISCORD_CLIENT_ID === 'string'
    ? import.meta.env.VITE_DISCORD_CLIENT_ID.trim()
    : '';

export async function requestDiscordActivitySession(
  gameServerUrl: string,
  signal: AbortSignal,
): Promise<DiscordActivityBootstrap> {
  if (!isDiscordActivityContext()) {
    throw new Error('Discord Activity authentication is not available in this context');
  }

  const discordSdk = new DiscordSDK(discordClientId);
  await discordSdk.ready();
  if (signal.aborted) throw signal.reason;

  const rawGuildId: unknown = discordSdk.guildId;
  const guildId =
    typeof rawGuildId === 'string' && /^\d{1,64}$/.test(rawGuildId) ? rawGuildId : null;

  const authorization = await discordSdk.commands.authorize({
    client_id: discordClientId,
    response_type: 'code',
    prompt: 'none',
    scope: ['identify'],
  });
  if (
    typeof authorization.code !== 'string'
    || authorization.code.length === 0
    || authorization.code.length > 2_048
  ) {
    throw new Error('Discord Activity returned an invalid authorization code');
  }
  if (signal.aborted) throw signal.reason;

  const response = await fetch(
    appendDiscordFrameId(`${stripTrailingSlash(gameServerUrl)}/api/players/discord`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: authorization.code }),
      cache: 'no-store',
      signal,
    },
  );
  if (response.status === 404) {
    throw new Error('Control-plane Discord bootstrap endpoint is unavailable');
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('Discord Activity identity could not be verified');
  }
  if (!response.ok) {
    throw new Error(`Discord Activity bootstrap failed with status ${response.status}`);
  }

  const body: unknown = await response.json();
  if (!isDiscordActivitySessionResponse(body)) {
    throw new Error('Discord Activity session response was malformed');
  }
  return {
    playerId: body.player.id,
    token: body.session.token,
    expiresAt:
      typeof body.session.expiresAt === 'string' ? body.session.expiresAt : null,
    guildId,
  };
}

function isDiscordActivitySessionResponse(
  value: unknown,
): value is DiscordActivitySessionResponse {
  if (!isRecord(value) || !isRecord(value.player) || !isRecord(value.session)) return false;
  return (
    typeof value.player.id === 'string'
    && typeof value.session.token === 'string'
    && value.session.token.length > 0
    && (
      value.session.expiresAt === undefined
      || typeof value.session.expiresAt === 'string'
    )
  );
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
