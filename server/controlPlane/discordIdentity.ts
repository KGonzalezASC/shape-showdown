export type DiscordPlayerProfile = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type DiscordIdentityErrorCode =
  | 'DISCORD_AUTH_NOT_CONFIGURED'
  | 'DISCORD_ASSERTION_INVALID'
  | 'DISCORD_PROVIDER_UNAVAILABLE';

export class DiscordIdentityError extends Error {
  public constructor(
    public readonly code: DiscordIdentityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DiscordIdentityError';
  }
}

export type DiscordIdentityVerifier = (
  authorizationCode: string,
) => Promise<DiscordPlayerProfile>;

export type DiscordIdentityVerifierOptions = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  fetchImpl?: typeof fetch;
};

type DiscordTokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
};

type DiscordUserResponse = {
  id?: unknown;
  username?: unknown;
  global_name?: unknown;
  avatar?: unknown;
};

const DISCORD_TOKEN_ENDPOINT = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_ENDPOINT = 'https://discord.com/api/users/@me';
const DISCORD_USER_ID_PATTERN = /^\d{17,20}$/u;
const MAX_AUTHORIZATION_CODE_LENGTH = 2_048;

/**
 * Exchanges the one-use code returned by Discord's Embedded App SDK for the
 * provider profile. The Discord client secret and provider access token never
 * leave this server.
 */
export function createDiscordIdentityVerifier(
  options: DiscordIdentityVerifierOptions = {},
): DiscordIdentityVerifier {
  const clientId = options.clientId?.trim() || process.env.DISCORD_CLIENT_ID?.trim() || '';
  const clientSecret =
    options.clientSecret?.trim() || process.env.DISCORD_CLIENT_SECRET?.trim() || '';
  const redirectUri =
    options.redirectUri?.trim() || process.env.DISCORD_REDIRECT_URI?.trim() || '';
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (authorizationCode: string): Promise<DiscordPlayerProfile> => {
    if (clientId.length === 0 || clientSecret.length === 0) {
      throw new DiscordIdentityError(
        'DISCORD_AUTH_NOT_CONFIGURED',
        'Discord Activity authentication is not configured',
      );
    }
    if (
      authorizationCode.length === 0
      || authorizationCode.length > MAX_AUTHORIZATION_CODE_LENGTH
      || /[\u0000-\u001f\u007f]/u.test(authorizationCode)
    ) {
      throw new DiscordIdentityError(
        'DISCORD_ASSERTION_INVALID',
        'Discord authorization code is invalid',
      );
    }

    const tokenResponse = await exchangeAuthorizationCode({
      clientId,
      clientSecret,
      redirectUri,
      authorizationCode,
      fetchImpl,
    });
    return readDiscordProfile(
      await fetchDiscordUser(tokenResponse, fetchImpl),
    );
  };
}

async function exchangeAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationCode: string;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const form = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: 'authorization_code',
    code: input.authorizationCode,
  });
  if (input.redirectUri.length > 0) form.set('redirect_uri', input.redirectUri);

  let response: Response;
  try {
    response = await input.fetchImpl(DISCORD_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
  } catch {
    throw new DiscordIdentityError(
      'DISCORD_PROVIDER_UNAVAILABLE',
      'Discord identity provider is unavailable',
    );
  }

  if (response.status === 401 || response.status === 400) {
    throw new DiscordIdentityError(
      'DISCORD_ASSERTION_INVALID',
      'Discord authorization code was rejected',
    );
  }
  if (!response.ok) {
    throw new DiscordIdentityError(
      'DISCORD_PROVIDER_UNAVAILABLE',
      'Discord identity provider is unavailable',
    );
  }

  const body = await readJson<DiscordTokenResponse>(response, 'token');
  if (
    typeof body.access_token !== 'string'
    || body.access_token.length === 0
    || body.access_token.length > 4_096
    || (
      body.token_type !== undefined
      && typeof body.token_type !== 'string'
    )
  ) {
    throw new DiscordIdentityError(
      'DISCORD_PROVIDER_UNAVAILABLE',
      'Discord token response was invalid',
    );
  }
  return body.access_token;
}

async function fetchDiscordUser(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<DiscordUserResponse> {
  let response: Response;
  try {
    response = await fetchImpl(DISCORD_USER_ENDPOINT, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new DiscordIdentityError(
      'DISCORD_PROVIDER_UNAVAILABLE',
      'Discord identity provider is unavailable',
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new DiscordIdentityError(
      'DISCORD_ASSERTION_INVALID',
      'Discord identity assertion was rejected',
    );
  }
  if (!response.ok) {
    throw new DiscordIdentityError(
      'DISCORD_PROVIDER_UNAVAILABLE',
      'Discord identity provider is unavailable',
    );
  }
  return readJson<DiscordUserResponse>(response, 'user');
}

async function readJson<T>(response: Response, responseName: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new DiscordIdentityError(
      'DISCORD_PROVIDER_UNAVAILABLE',
      `Discord ${responseName} response was invalid`,
    );
  }
}

function readDiscordProfile(body: DiscordUserResponse): DiscordPlayerProfile {
  if (
    typeof body.id !== 'string'
    || !DISCORD_USER_ID_PATTERN.test(body.id)
  ) {
    throw new DiscordIdentityError(
      'DISCORD_ASSERTION_INVALID',
      'Discord identity response did not contain a valid user',
    );
  }

  const rawDisplayName =
    typeof body.global_name === 'string' && body.global_name.trim().length > 0
      ? body.global_name
      : body.username;
  const displayName = normalizeDisplayName(rawDisplayName);
  if (displayName === null) {
    throw new DiscordIdentityError(
      'DISCORD_ASSERTION_INVALID',
      'Discord identity response did not contain a valid display name',
    );
  }

  const avatarUrl =
    typeof body.avatar === 'string' && /^[a-zA-Z0-9_]+$/u.test(body.avatar)
      ? `https://cdn.discordapp.com/avatars/${body.id}/${body.avatar}.png`
      : null;

  return {
    discordUserId: body.id,
    displayName,
    avatarUrl,
  };
}

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/gu, '');
  if (normalized.length === 0 || normalized.length > 32) return null;
  return normalized;
}
