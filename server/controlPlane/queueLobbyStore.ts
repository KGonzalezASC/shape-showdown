import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from './database.js';
import type { SearchScope } from './queueScope.js';

/** How many oldest guild-scoped rows each guild claim considers before pairing. */
const GUILD_CANDIDATE_WINDOW = 16;
/** How many oldest scope rows the global and discord-only claims consider. */
const SCOPE_CANDIDATE_WINDOW = 8;

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

export type ClaimedQueuePair = {
  pair: QueuePair;
  searchScope: SearchScope;
  guildId: string | null;
  isRepeatPairing: boolean;
};

export type QueueCandidate = {
  id: string;
  playerId: string;
  sessionId: string;
  avoidPlayerId: string | null;
  createdAtMs: number;
};

export type PickedPair = {
  pair: [QueueCandidate, QueueCandidate];
  isRepeatPairing: boolean;
};

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

type QueueCandidateRow = {
  id: string;
  player_id: string;
  session_id: string;
  avoid_player_id: string | null;
  guild_id: string | null;
  created_at: Date;
};

type QueueLeaseRow = {
  id: string;
  expires_at: Date;
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
    searchScope: SearchScope;
    guildId: string | null;
  }): Promise<QueueEntry | null> {
    const rows = await this.database<QueueEntryRow[]>`
      WITH latest_opponent AS (
        SELECT CASE
          WHEN m.player_a_id = ${input.playerId} THEN m.player_b_id
          ELSE m.player_a_id
        END AS opponent_id
        FROM matches m
        WHERE ${input.playerId} IN (m.player_a_id, m.player_b_id)
          AND m.started_at IS NOT NULL
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      )
      INSERT INTO queue_entries (
        id, player_id, session_id, status, search_scope, guild_id,
        avoid_player_id, expires_at
      )
      VALUES (
        ${randomUUID()},
        ${input.playerId},
        ${input.sessionId},
        'searching',
        ${input.searchScope},
        ${input.guildId},
        (SELECT opponent_id FROM latest_opponent),
        CURRENT_TIMESTAMP + INTERVAL '10 seconds'
      )
      ON CONFLICT (player_id) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        status = 'searching',
        matched_match_id = NULL,
        avoid_player_id = EXCLUDED.avoid_player_id,
        expires_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds',
        search_scope = EXCLUDED.search_scope,
        guild_id = EXCLUDED.guild_id,
        -- Keep FIFO seniority for same-pool re-enqueues (heartbeat-style
        -- refresh), but reset it when the pool changed so toggling scope
        -- cannot carry an older position into a new pool.
        created_at = CASE
          WHEN queue_entries.search_scope IS DISTINCT FROM EXCLUDED.search_scope
            OR queue_entries.guild_id IS DISTINCT FROM EXCLUDED.guild_id
          THEN CURRENT_TIMESTAMP
          ELSE queue_entries.created_at
        END
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

  /**
   * Claims two guild-scoped searchers that share a guild id, preferring a
   * pairing where neither player's most recent opponent is the other.
   *
   * Considers a window of the oldest live guild searchers. Within the earliest
   * guild id in that window having at least two candidates, the oldest searcher
   * is paired with the oldest partner who is not mutually avoided; when every
   * remaining candidate is the avoided player the pair falls back to the next
   * oldest candidate and flags the pairing as a repeat. The bounded window
   * prevents a solo searcher at the head of the queue from stalling pairable
   * guilds behind them indefinitely.
   */
  public async claimGuildPair(): Promise<ClaimedQueuePair | null> {
    const rows = await this.database<QueueCandidateRow[]>`
      SELECT id, player_id, session_id, avoid_player_id, guild_id, created_at
      FROM queue_entries
      WHERE status = 'searching'
        AND search_scope = 'guild'
        AND guild_id IS NOT NULL
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at ASC, id ASC
      LIMIT ${GUILD_CANDIDATE_WINDOW}
      FOR UPDATE SKIP LOCKED
    `;

    const byGuild = new Map<string, QueueCandidate[]>();
    for (const row of rows) {
      const list = byGuild.get(row.guild_id) ?? [];
      list.push(toQueueCandidate(row));
      byGuild.set(row.guild_id, list);
    }

    let claimed: { guildId: string; picked: PickedPair } | null = null;
    for (const [guildId, candidates] of byGuild) {
      if (candidates.length < 2) continue;
      const picked = pickAvoidingPair(candidates);
      if (picked === null) continue;
      claimed = { guildId, picked };
      break;
    }
    if (claimed === null) return null;

    await this.deleteClaimedCandidates(claimed.picked.pair);
    return toClaimedPair(claimed.picked, 'guild', claimed.guildId);
  }

  public async claimScopePair(
    scope: Extract<SearchScope, 'global' | 'discord_only'>,
  ): Promise<ClaimedQueuePair | null> {
    const rows = await this.database<QueueCandidateRow[]>`
      SELECT id, player_id, session_id, avoid_player_id, created_at
      FROM queue_entries
      WHERE status = 'searching'
        AND search_scope = ${scope}
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at ASC, id ASC
      LIMIT ${SCOPE_CANDIDATE_WINDOW}
      FOR UPDATE SKIP LOCKED
    `;

    const candidates = rows.map(toQueueCandidate);
    const picked = pickAvoidingPair(candidates);
    if (picked === null) return null;

    await this.deleteClaimedCandidates(picked.pair);
    return toClaimedPair(picked, scope, null);
  }

  private async deleteClaimedCandidates(pair: [QueueCandidate, QueueCandidate]): Promise<void> {
    await this.database`
      DELETE FROM queue_entries
      WHERE id IN (${pair[0].id}, ${pair[1].id})
    `;
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

function toQueueCandidate(row: QueueCandidateRow): QueueCandidate {
  return {
    id: row.id,
    playerId: row.player_id,
    sessionId: row.session_id,
    avoidPlayerId: row.avoid_player_id,
    createdAtMs: row.created_at.getTime(),
  };
}

/**
 * Pairs the oldest candidate with a partner, preferring the oldest partner
 * where neither side is the other's most recent opponent. When every remaining
 * candidate is mutually avoided the second-oldest candidate is used and the
 * pairing is flagged as a repeat.
 *
 * Candidates must arrive ordered by (createdAtMs asc, id asc); the picker
 * preserves that order for tie-breaks and does not re-sort.
 */
export function pickAvoidingPair(candidates: readonly QueueCandidate[]): PickedPair | null {
  if (candidates.length < 2) return null;

  const [first] = candidates;
  const isMutuallyAvoided = (candidate: QueueCandidate): boolean =>
    candidate.avoidPlayerId === first.playerId
    || first.avoidPlayerId === candidate.playerId;

  const freshPartner = candidates.slice(1).find((candidate) => !isMutuallyAvoided(candidate));
  if (freshPartner !== undefined) {
    return { pair: [first, freshPartner], isRepeatPairing: false };
  }
  return { pair: [first, candidates[1]], isRepeatPairing: true };
}

function toClaimedPair(
  picked: PickedPair,
  searchScope: SearchScope,
  guildId: string | null,
): ClaimedQueuePair {
  return {
    pair: [
      toQueueParticipantFromCandidate(picked.pair[0]),
      toQueueParticipantFromCandidate(picked.pair[1]),
    ],
    searchScope,
    guildId,
    isRepeatPairing: picked.isRepeatPairing,
  };
}

function toQueueParticipantFromCandidate(candidate: QueueCandidate): QueueParticipant {
  return {
    id: candidate.id,
    playerId: candidate.playerId,
    sessionId: candidate.sessionId,
  };
}
