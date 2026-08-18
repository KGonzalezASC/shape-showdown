import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from './database.js';

export type QueueEntry = {
  id: string;
  playerId: string;
  status: 'searching' | 'matched' | 'cancelled';
  expiresAt: Date;
};

export type QueueLease = {
  id: string;
  expiresAt: Date;
};

export type QueueParticipant = {
  id: string;
  playerId: string;
  sessionId: string;
};

export type QueuePair = [QueueParticipant, QueueParticipant];

export type LobbyRecord = {
  code: string;
  hostPlayerId: string;
  expiresAt: Date;
};

export type LobbyMember = {
  code: string;
  hostPlayerId: string;
  playerId: string;
};

export type LobbyLease = {
  code: string;
  expiresAt: Date;
};

type QueueEntryRow = {
  id: string;
  player_id: string;
  status: QueueEntry['status'];
  expires_at: Date;
};

type QueueLeaseRow = {
  id: string;
  expires_at: Date;
};

type QueueParticipantRow = {
  id: string;
  player_id: string;
  session_id: string;
};

type QueueIdRow = {
  id: string;
};

type LobbyRow = {
  code: string;
  host_player_id: string;
  expires_at: Date;
};

type LobbyMemberRow = {
  code: string;
  host_player_id: string;
  player_id: string;
};

type LobbyLeaseRow = {
  code: string;
  expires_at: Date;
};

type LobbyIdRow = {
  id: string;
  code: string;
};

export class QueueStore {
  public constructor(private readonly database: SqlExecutor) {}

  public async upsertEntry(input: {
    playerId: string;
    sessionId: string;
  }): Promise<QueueEntry | null> {
    const rows = await this.database<QueueEntryRow[]>`
      INSERT INTO queue_entries (
        id, player_id, session_id, status, expires_at
      )
      VALUES (
        ${randomUUID()},
        ${input.playerId},
        ${input.sessionId},
        'searching',
        CURRENT_TIMESTAMP + INTERVAL '10 seconds'
      )
      ON CONFLICT (player_id) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        status = 'searching',
        matched_match_id = NULL,
        expires_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds'
      WHERE queue_entries.status <> 'matched'
         OR queue_entries.expires_at <= CURRENT_TIMESTAMP
      RETURNING id, player_id, status, expires_at
    `;

    const row = rows[0];
    return row ? toQueueEntry(row) : null;
  }

  public async heartbeatEntry(playerId: string): Promise<QueueLease | null> {
    const rows = await this.database<QueueLeaseRow[]>`
      UPDATE queue_entries
      SET expires_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds'
      WHERE player_id = ${playerId}
        AND status = 'searching'
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING id, expires_at
    `;

    const row = rows[0];
    return row
      ? {
          id: row.id,
          expiresAt: row.expires_at,
        }
      : null;
  }

  public async claimPair(): Promise<QueuePair | null> {
    const rows = await this.database<QueueParticipantRow[]>`
      WITH candidates AS MATERIALIZED (
        SELECT id, player_id, session_id
        FROM queue_entries
        WHERE status = 'searching'
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at ASC, id ASC
        LIMIT 2
        FOR UPDATE SKIP LOCKED
      ),
      pair AS (
        SELECT id
        FROM candidates
        WHERE (SELECT COUNT(*) FROM candidates) = 2
      )
      DELETE FROM queue_entries q
      USING pair
      WHERE q.id = pair.id
      RETURNING q.id, q.player_id, q.session_id
    `;

    if (rows.length === 0) return null;
    if (rows.length !== 2) {
      throw new Error(`Queue pair claim returned ${rows.length} participants`);
    }

    return [toQueueParticipant(rows[0]), toQueueParticipant(rows[1])];
  }

  public async purgeExpiredEntries(batchSize = 500): Promise<string[]> {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error('Queue purge batch size must be a positive integer');
    }

    const rows = await this.database<QueueIdRow[]>`
      WITH expired AS (
        SELECT id
        FROM queue_entries
        WHERE status = 'searching'
          AND expires_at <= CURRENT_TIMESTAMP
        ORDER BY expires_at ASC, id ASC
        LIMIT ${batchSize}
      )
      DELETE FROM queue_entries q
      USING expired
      WHERE q.id = expired.id
      RETURNING q.id
    `;

    return rows.map((row) => row.id);
  }

  public async removeEntry(playerId: string): Promise<string | null> {
    const rows = await this.database<QueueIdRow[]>`
      DELETE FROM queue_entries
      WHERE player_id = ${playerId}
        AND status = 'searching'
      RETURNING id
    `;

    return rows[0]?.id ?? null;
  }
}

export class LobbyStore {
  public constructor(private readonly database: SqlExecutor) {}

  public async createLobby(input: {
    code: string;
    hostPlayerId: string;
  }): Promise<LobbyRecord> {
    const rows = await this.database<LobbyRow[]>`
      WITH new_lobby AS (
        INSERT INTO lobbies (
          id, code, host_player_id, status, max_players, expires_at
        )
        VALUES (
          ${randomUUID()},
          ${input.code},
          ${input.hostPlayerId},
          'waiting',
          2,
          CURRENT_TIMESTAMP + INTERVAL '15 minutes'
        )
        RETURNING id, code, host_player_id, expires_at
      ),
      host_member AS (
        INSERT INTO lobby_members (
          lobby_id, player_id, is_host, is_ready, expires_at
        )
        SELECT
          id,
          host_player_id,
          TRUE,
          FALSE,
          CURRENT_TIMESTAMP + INTERVAL '10 seconds'
        FROM new_lobby
        RETURNING lobby_id
      )
      SELECT code, host_player_id, expires_at
      FROM new_lobby
    `;

    const row = rows[0];
    if (!row) throw new Error('Lobby creation returned no row');
    return {
      code: row.code,
      hostPlayerId: row.host_player_id,
      expiresAt: row.expires_at,
    };
  }

  public async joinLobby(input: {
    code: string;
    playerId: string;
  }): Promise<LobbyMember | null> {
    const rows = await this.database<LobbyMemberRow[]>`
      WITH target AS MATERIALIZED (
        SELECT id, code, host_player_id
        FROM lobbies
        WHERE code = ${input.code}
          AND status = 'waiting'
          AND expires_at > CURRENT_TIMESTAMP
        FOR UPDATE
      ),
      joined AS (
        INSERT INTO lobby_members (
          lobby_id, player_id, is_host, is_ready, expires_at
        )
        SELECT
          t.id,
          ${input.playerId},
          FALSE,
          FALSE,
          CURRENT_TIMESTAMP + INTERVAL '10 seconds'
        FROM target t
        WHERE (
          SELECT COUNT(*)
          FROM lobby_members lm
          WHERE lm.lobby_id = t.id
            AND lm.expires_at > CURRENT_TIMESTAMP
        ) < 2
        ON CONFLICT (lobby_id, player_id) DO UPDATE
        SET expires_at = EXCLUDED.expires_at
        RETURNING lobby_id, player_id
      )
      SELECT t.code, t.host_player_id, j.player_id
      FROM target t
      JOIN joined j ON j.lobby_id = t.id
    `;

    const row = rows[0];
    return row
      ? {
          code: row.code,
          hostPlayerId: row.host_player_id,
          playerId: row.player_id,
        }
      : null;
  }

  public async heartbeatLobby(input: {
    code: string;
    playerId: string;
  }): Promise<LobbyLease | null> {
    const rows = await this.database<LobbyLeaseRow[]>`
      WITH refreshed_member AS (
        UPDATE lobby_members lm
        SET expires_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds'
        FROM lobbies l
        WHERE lm.lobby_id = l.id
          AND l.code = ${input.code}
          AND l.status IN ('waiting', 'ready', 'launching')
          AND lm.player_id = ${input.playerId}
        RETURNING lm.lobby_id
      )
      UPDATE lobbies l
      SET expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes'
      FROM refreshed_member rm
      WHERE l.id = rm.lobby_id
      RETURNING l.code, l.expires_at
    `;

    const row = rows[0];
    return row
      ? {
          code: row.code,
          expiresAt: row.expires_at,
        }
      : null;
  }

  public async deleteLobby(input: {
    code: string;
    hostPlayerId: string;
  }): Promise<{ id: string; code: string } | null> {
    const rows = await this.database<LobbyIdRow[]>`
      DELETE FROM lobbies
      WHERE code = ${input.code}
        AND host_player_id = ${input.hostPlayerId}
      RETURNING id, code
    `;

    return rows[0] ?? null;
  }
}

function toQueueEntry(row: QueueEntryRow): QueueEntry {
  return {
    id: row.id,
    playerId: row.player_id,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

function toQueueParticipant(row: QueueParticipantRow): QueueParticipant {
  return {
    id: row.id,
    playerId: row.player_id,
    sessionId: row.session_id,
  };
}
