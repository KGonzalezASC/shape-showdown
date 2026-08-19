import { createHash, randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import type { DiscordPlayerProfile } from './discordIdentity.js';
export type { DiscordPlayerProfile } from './discordIdentity.js';

export type PlayerRecord = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  discordUserId: string | null;
  status: 'active' | 'suspended';
  createdAt: Date;
};

export type SessionRecord = {
  id: string;
  expiresAt: Date;
};

export type ValidatedSession = {
  sessionId: string;
  playerId: string;
  expiresAt: Date;
  displayName: string;
  discordUserId: string | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  discord_user_id: string | null;
  status: 'active' | 'suspended';
  created_at: Date;
};

type SessionRow = {
  id: string;
  expires_at: Date;
};

type ValidatedSessionRow = {
  session_id: string;
  player_id: string;
  expires_at: Date;
  display_name: string;
  discord_user_id: string | null;
};

export class PlayerStore {
  public constructor(private readonly database: Database) {}

  public async upsertDiscordPlayer(profile: DiscordPlayerProfile): Promise<PlayerRecord> {
    const rows = await this.database<PlayerRow[]>`
      INSERT INTO players (
        id, discord_user_id, display_name, avatar_url, auth_provider, status
      )
      VALUES (
        ${randomUUID()},
        ${profile.discordUserId},
        ${profile.displayName},
        ${profile.avatarUrl},
        'discord',
        'active'
      )
      ON CONFLICT (discord_user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, display_name, avatar_url, discord_user_id, status, created_at
    `;

    const row = rows[0];
    if (!row) throw new Error('Discord player upsert returned no row');
    return toPlayerRecord(row);
  }

  public async createGuestPlayer(
    displayName: string,
    playerId: string = randomUUID(),
  ): Promise<PlayerRecord> {
    const rows = await this.database<PlayerRow[]>`
      INSERT INTO players (id, display_name, auth_provider, status)
      VALUES (${playerId}, ${displayName}, 'guest', 'active')
      ON CONFLICT (id) DO UPDATE SET
        display_name = players.display_name,
        updated_at = players.updated_at
      WHERE players.auth_provider = 'guest'
      RETURNING id, display_name, avatar_url, discord_user_id, status, created_at
    `;

    const row = rows[0];
    if (!row) throw new Error('Guest player insert returned no row');
    return toPlayerRecord(row);
  }

  public async createSession(input: {
    playerId: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<SessionRecord> {
    const rows = await this.database<SessionRow[]>`
      INSERT INTO sessions (id, player_id, token_hash, ip_address, user_agent, expires_at)
      VALUES (
        ${randomUUID()},
        ${input.playerId},
        ${input.tokenHash},
        ${input.ipAddress},
        ${input.userAgent},
        CURRENT_TIMESTAMP + INTERVAL '30 days'
      )
      RETURNING id, expires_at
    `;

    const row = rows[0];
    if (!row) throw new Error('Session insert returned no row');
    return {
      id: row.id,
      expiresAt: row.expires_at,
    };
  }

  public async validateSession(tokenHash: string): Promise<ValidatedSession | null> {
    const rows = await this.database<ValidatedSessionRow[]>`
      SELECT
        s.id AS session_id,
        s.player_id,
        s.expires_at,
        p.display_name,
        p.discord_user_id
      FROM sessions s
      JOIN players p ON s.player_id = p.id
      WHERE s.token_hash = ${tokenHash}
        AND s.expires_at > CURRENT_TIMESTAMP
        AND p.status = 'active'
    `;

    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      playerId: row.player_id,
      expiresAt: row.expires_at,
      displayName: row.display_name,
      discordUserId: row.discord_user_id,
    };
  }
}

export function deriveGuestPlayerId(idempotencyKey: string): string {
  const digest = createHash('sha256').update(idempotencyKey, 'utf8').digest();
  digest[6] = (digest[6] & 0x0f) | 0x40;
  digest[8] = (digest[8] & 0x3f) | 0x80;

  return [
    digest.subarray(0, 4).toString('hex'),
    digest.subarray(4, 6).toString('hex'),
    digest.subarray(6, 8).toString('hex'),
    digest.subarray(8, 10).toString('hex'),
    digest.subarray(10, 16).toString('hex'),
  ].join('-');
}

function toPlayerRecord(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    discordUserId: row.discord_user_id,
    status: row.status,
    createdAt: row.created_at,
  };
}
