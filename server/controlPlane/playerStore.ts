import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';

export type DiscordPlayerProfile = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
};

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
        discord_user_id, display_name, avatar_url, auth_provider, status
      )
      VALUES (
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

  public async createGuestPlayer(displayName: string): Promise<PlayerRecord> {
    const rows = await this.database<PlayerRow[]>`
      INSERT INTO players (id, display_name, auth_provider, status)
      VALUES (${randomUUID()}, ${displayName}, 'guest', 'active')
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
