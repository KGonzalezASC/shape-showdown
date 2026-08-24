import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from './database.js';
import type { SearchScope } from './queueScope.js';

/** Normal matching wave size. */
export const MATCHING_WAVE_SIZE = 64;
/** One bounded expansion is allowed before a repeat fallback. */
export const MATCHING_EXPANDED_WAVE_SIZE = 128;

export type QueueEntry = {
  id: string;
  playerId: string;
  status: 'searching' | 'matched' | 'cancelled';
  expiresAt: Date;
  searchAttemptId: string | null;
  generation: number;
};

export type SearchAttemptStatus = 'searching' | 'matched' | 'cancelled' | 'expired';

export type SearchAttempt = {
  id: string;
  playerId: string;
  sessionId: string;
  status: SearchAttemptStatus;
  searchScope: SearchScope;
  guildId: string | null;
  poolKey: string;
  generation: number;
  poolEnteredAt: Date;
};

export type QueueCancellation = {
  status: 'cancelled' | 'already-assigned' | 'not-searching';
  matchId: string | null;
};

export type QueueLease = {
  id: string;
  expiresAt: Date;
};

export type QueueParticipant = {
  id: string;
  playerId: string;
  sessionId: string;
  searchAttemptId: string | null;
  generation: number;
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
  avoidPlayerIds?: readonly string[];
  searchAttemptId?: string | null;
  generation?: number;
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
  search_attempt_id: string | null;
  generation: number;
};

type QueueCandidateRow = {
  id: string;
  player_id: string;
  session_id: string;
  avoid_player_id: string | null;
  guild_id: string | null;
  created_at: Date;
  search_attempt_id?: string | null;
  generation?: number;
  avoid_player_ids?: string[];
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
    carryAvoidPlayerId?: string | null;
  }): Promise<QueueEntry | null> {
    const poolKey = input.searchScope === 'guild'
      ? `guild:${input.guildId}`
      : input.searchScope;
    const rows = await this.database<QueueEntryRow[]>`
      WITH blocked AS (
        SELECT EXISTS (
          SELECT 1
          FROM matches m
          WHERE ${input.playerId} IN (m.player_a_id, m.player_b_id)
            AND m.status IN ('allocating', 'countdown', 'playing')
        ) AS has_active_match
      ),
      attempt_upsert AS (
        INSERT INTO search_attempts (
          id, player_id, session_id, status,
          requested_scope, effective_scope, guild_id, pool_key,
          generation, pool_entered_at
        )
        SELECT
          ${randomUUID()},
          ${input.playerId},
          ${input.sessionId},
          'searching',
          ${input.searchScope},
          ${input.searchScope},
          ${input.guildId},
          ${poolKey},
          1,
          CURRENT_TIMESTAMP
        FROM blocked
        WHERE NOT has_active_match
        ON CONFLICT (player_id) WHERE status = 'searching'
        DO UPDATE SET
          session_id = EXCLUDED.session_id,
          requested_scope = EXCLUDED.requested_scope,
          effective_scope = EXCLUDED.effective_scope,
          guild_id = EXCLUDED.guild_id,
          pool_key = EXCLUDED.pool_key,
          generation = CASE
            WHEN search_attempts.pool_key IS DISTINCT FROM EXCLUDED.pool_key
            THEN search_attempts.generation + 1
            ELSE search_attempts.generation
          END,
          pool_entered_at = CASE
            WHEN search_attempts.pool_key IS DISTINCT FROM EXCLUDED.pool_key
            THEN CURRENT_TIMESTAMP
            ELSE search_attempts.pool_entered_at
          END,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, generation, pool_entered_at
      )
      INSERT INTO queue_entries (
        id, player_id, session_id, status, search_scope, guild_id,
        avoid_player_id, created_at, expires_at, search_attempt_id, generation, pool_entered_at
      )
      SELECT
        ${randomUUID()},
        ${input.playerId},
        ${input.sessionId},
        'searching',
        ${input.searchScope},
        ${input.guildId},
        (
          SELECT opponent_id
          FROM search_avoidances
          WHERE search_attempt_id = attempt_upsert.id
          ORDER BY created_at DESC
          LIMIT 1
        ),
        attempt_upsert.pool_entered_at,
        CURRENT_TIMESTAMP + INTERVAL '10 seconds',
        attempt_upsert.id,
        attempt_upsert.generation,
        attempt_upsert.pool_entered_at
      FROM attempt_upsert
      ON CONFLICT (player_id) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        status = 'searching',
        matched_match_id = NULL,
        avoid_player_id = EXCLUDED.avoid_player_id,
        search_attempt_id = EXCLUDED.search_attempt_id,
        generation = EXCLUDED.generation,
        pool_entered_at = EXCLUDED.pool_entered_at,
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
      WHERE (
        queue_entries.status <> 'matched'
        OR queue_entries.expires_at <= CURRENT_TIMESTAMP
      )
      AND NOT EXISTS (
        SELECT 1
        FROM matches m
        WHERE ${input.playerId} IN (m.player_a_id, m.player_b_id)
          AND m.status IN ('allocating', 'countdown', 'playing')
      )
      RETURNING id, player_id, status, expires_at, search_attempt_id, generation
    `;

    const row = rows[0];
    if (row === undefined) return null;
    const latestOpponentRows = input.carryAvoidPlayerId === undefined
      ? await this.database<{ opponent_id: string }[]>`
          SELECT CASE
            WHEN m.player_a_id = ${input.playerId} THEN m.player_b_id
            ELSE m.player_a_id
          END AS opponent_id
          FROM matches m
          WHERE ${input.playerId} IN (m.player_a_id, m.player_b_id)
            AND m.started_at IS NOT NULL
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        `
      : [];
    const avoidPlayerId = input.carryAvoidPlayerId
      ?? latestOpponentRows[0]?.opponent_id;
    if (avoidPlayerId !== undefined && row.search_attempt_id !== null) {
      await this.database`
        INSERT INTO search_avoidances (search_attempt_id, opponent_id, reason)
        VALUES (${row.search_attempt_id}, ${avoidPlayerId}, 'recent_opponent')
        ON CONFLICT (search_attempt_id, opponent_id) DO NOTHING
      `;
      await this.database`
        UPDATE queue_entries
        SET avoid_player_id = ${avoidPlayerId}
        WHERE id = ${row.id}
          AND status = 'searching'
      `;
    }
    return toQueueEntry(row);
  }

  public async heartbeatEntry(playerId: string): Promise<QueueLease | null> {
    const rows = await this.database<QueueLeaseRow[]>`
      WITH touched_attempt AS (
        UPDATE search_attempts
        SET updated_at = CURRENT_TIMESTAMP
        WHERE player_id = ${playerId}
          AND status = 'searching'
        RETURNING id
      )
      UPDATE queue_entries
      SET expires_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds'
      WHERE player_id = ${playerId}
        AND status = 'searching'
        AND expires_at > CURRENT_TIMESTAMP
        AND (
          search_attempt_id IS NULL
          OR search_attempt_id IN (SELECT id FROM touched_attempt)
        )
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
      SELECT q.id, q.player_id, q.session_id, q.avoid_player_id, q.guild_id, q.created_at,
             q.search_attempt_id, q.generation,
      ARRAY(
        SELECT a.opponent_id
        FROM search_avoidances a
        WHERE a.search_attempt_id = q.search_attempt_id
      ) AS avoid_player_ids
      FROM queue_entries q
      WHERE q.status = 'searching'
        AND q.search_scope = 'guild'
        AND q.guild_id IS NOT NULL
        AND q.expires_at > CURRENT_TIMESTAMP
        AND (
          q.search_attempt_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM search_attempts current_attempt
            WHERE current_attempt.id = q.search_attempt_id
              AND current_attempt.status = 'searching'
              AND current_attempt.generation = q.generation
          )
        )
        AND (
          q.search_attempt_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM search_attempts current_attempt
            WHERE current_attempt.id = q.search_attempt_id
              AND current_attempt.status = 'searching'
              AND current_attempt.generation = q.generation
          )
        )
        AND (
          q.search_attempt_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM search_attempts current_attempt
            WHERE current_attempt.id = q.search_attempt_id
              AND current_attempt.status = 'searching'
              AND current_attempt.generation = q.generation
          )
        )
        AND (
          q.search_attempt_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM search_attempts current_attempt
            WHERE current_attempt.id = q.search_attempt_id
              AND current_attempt.status = 'searching'
              AND current_attempt.generation = q.generation
          )
        )
        AND (
          q.search_attempt_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM search_attempts current_attempt
            WHERE current_attempt.id = q.search_attempt_id
              AND current_attempt.status = 'searching'
              AND current_attempt.generation = q.generation
          )
        )
      ORDER BY q.created_at ASC, q.id ASC
      LIMIT ${MATCHING_WAVE_SIZE}
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
      SELECT q.id, q.player_id, q.session_id, q.avoid_player_id, q.created_at,
             q.search_attempt_id, q.generation,
             ARRAY(
               SELECT a.opponent_id
               FROM search_avoidances a
               WHERE a.search_attempt_id = q.search_attempt_id
             ) AS avoid_player_ids
      FROM queue_entries q
      WHERE q.status = 'searching'
        AND q.search_scope = ${scope}
        AND q.expires_at > CURRENT_TIMESTAMP
      ORDER BY q.created_at ASC, q.id ASC
      LIMIT ${MATCHING_WAVE_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    const candidates = rows.map(toQueueCandidate);
    const picked = pickAvoidingPair(candidates);
    if (picked === null) return null;

    await this.deleteClaimedCandidates(picked.pair);
    return toClaimedPair(picked, scope, null);
  }

  public async claimGuildPairs(): Promise<ClaimedQueuePair[]> {
    const rows = await this.database<QueueCandidateRow[]>`
      SELECT q.id, q.player_id, q.session_id, q.avoid_player_id, q.guild_id, q.created_at,
             q.search_attempt_id, q.generation,
             ARRAY(
               SELECT a.opponent_id
               FROM search_avoidances a
               WHERE a.search_attempt_id = q.search_attempt_id
             ) AS avoid_player_ids
      FROM queue_entries q
      WHERE q.status = 'searching'
        AND q.search_scope = 'guild'
        AND q.guild_id IS NOT NULL
        AND q.expires_at > CURRENT_TIMESTAMP
        AND (
          q.search_attempt_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM search_attempts current_attempt
            WHERE current_attempt.id = q.search_attempt_id
              AND current_attempt.status = 'searching'
              AND current_attempt.generation = q.generation
          )
        )
      ORDER BY q.created_at ASC, q.id ASC
      LIMIT ${MATCHING_WAVE_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    const byGuild = new Map<string, QueueCandidate[]>();
    for (const row of rows) {
      const list = byGuild.get(row.guild_id!) ?? [];
      list.push(toQueueCandidate(row));
      byGuild.set(row.guild_id!, list);
    }

    const pickGuildPairs = (): PickedPair[] => [
      ...byGuild.values(),
    ].flatMap((candidates) => pickAvoidingPairs(candidates));
    let pickedPairs = pickGuildPairs();
    if (
      pickedPairs.some((picked) => picked.isRepeatPairing)
      && rows.length === MATCHING_WAVE_SIZE
    ) {
      const expandedRows = await this.database<QueueCandidateRow[]>`
        SELECT q.id, q.player_id, q.session_id, q.avoid_player_id, q.guild_id, q.created_at,
               q.search_attempt_id, q.generation,
               ARRAY(
                 SELECT a.opponent_id
                 FROM search_avoidances a
                 WHERE a.search_attempt_id = q.search_attempt_id
               ) AS avoid_player_ids
        FROM queue_entries q
        WHERE q.status = 'searching'
          AND q.search_scope = 'guild'
          AND q.guild_id IS NOT NULL
          AND q.expires_at > CURRENT_TIMESTAMP
          AND (
            q.search_attempt_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM search_attempts current_attempt
              WHERE current_attempt.id = q.search_attempt_id
                AND current_attempt.status = 'searching'
                AND current_attempt.generation = q.generation
            )
          )
          AND (
            q.search_attempt_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM search_attempts current_attempt
              WHERE current_attempt.id = q.search_attempt_id
                AND current_attempt.status = 'searching'
                AND current_attempt.generation = q.generation
            )
          )
        ORDER BY q.created_at ASC, q.id ASC
        LIMIT ${MATCHING_EXPANDED_WAVE_SIZE - MATCHING_WAVE_SIZE}
        OFFSET ${MATCHING_WAVE_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      for (const row of expandedRows) {
        const list = byGuild.get(row.guild_id!) ?? [];
        list.push(toQueueCandidate(row));
        byGuild.set(row.guild_id!, list);
      }
      pickedPairs = pickGuildPairs();
    }

    const claimed: ClaimedQueuePair[] = [];
    for (const [guildId, candidates] of byGuild) {
      const guildPairs = pickedPairs.filter((picked) =>
        picked.pair[0].searchAttemptId === candidates[0]?.searchAttemptId
          || candidates.some((candidate) => candidate.id === picked.pair[0].id),
      );
      claimed.push(...guildPairs.map((picked) => toClaimedPair(picked, 'guild', guildId)));
    }
    await this.deleteClaimedPairs(claimed);
    return claimed;
  }

  public async claimScopePairs(
    scope: Extract<SearchScope, 'global' | 'discord_only'>,
  ): Promise<ClaimedQueuePair[]> {
    const rows = await this.database<QueueCandidateRow[]>`
      SELECT q.id, q.player_id, q.session_id, q.avoid_player_id, q.created_at,
             q.search_attempt_id, q.generation,
             ARRAY(
               SELECT a.opponent_id
               FROM search_avoidances a
               WHERE a.search_attempt_id = q.search_attempt_id
             ) AS avoid_player_ids
      FROM queue_entries q
      WHERE q.status = 'searching'
        AND q.search_scope = ${scope}
        AND q.expires_at > CURRENT_TIMESTAMP
        AND (
          q.search_attempt_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM search_attempts current_attempt
            WHERE current_attempt.id = q.search_attempt_id
              AND current_attempt.status = 'searching'
              AND current_attempt.generation = q.generation
          )
        )
      ORDER BY q.created_at ASC, q.id ASC
      LIMIT ${MATCHING_WAVE_SIZE}
      FOR UPDATE SKIP LOCKED
    `;
    let candidates = rows.map(toQueueCandidate);
    let pickedPairs = pickAvoidingPairs(candidates);
    if (
      pickedPairs.some((picked) => picked.isRepeatPairing)
      && rows.length === MATCHING_WAVE_SIZE
    ) {
      const expandedRows = await this.database<QueueCandidateRow[]>`
        SELECT q.id, q.player_id, q.session_id, q.avoid_player_id, q.created_at,
               q.search_attempt_id, q.generation,
               ARRAY(
                 SELECT a.opponent_id
                 FROM search_avoidances a
                 WHERE a.search_attempt_id = q.search_attempt_id
               ) AS avoid_player_ids
        FROM queue_entries q
        WHERE q.status = 'searching'
          AND q.search_scope = ${scope}
          AND q.expires_at > CURRENT_TIMESTAMP
          AND (
            q.search_attempt_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM search_attempts current_attempt
              WHERE current_attempt.id = q.search_attempt_id
                AND current_attempt.status = 'searching'
                AND current_attempt.generation = q.generation
            )
          )
        ORDER BY q.created_at ASC, q.id ASC
        LIMIT ${MATCHING_EXPANDED_WAVE_SIZE - MATCHING_WAVE_SIZE}
        OFFSET ${MATCHING_WAVE_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      candidates = candidates.concat(expandedRows.map(toQueueCandidate));
      pickedPairs = pickAvoidingPairs(candidates);
    }
    const claimed = pickedPairs.map((picked) => toClaimedPair(picked, scope, null));
    await this.deleteClaimedPairs(claimed);
    return claimed;
  }

  private async deleteClaimedCandidates(pair: [QueueCandidate, QueueCandidate]): Promise<void> {
    await this.deleteClaimedCandidateIds(pair[0].id, pair[1].id);
  }

  private async deleteClaimedCandidateIds(firstId: string, secondId: string): Promise<void> {
    await this.database`
      DELETE FROM queue_entries
      WHERE id IN (${firstId}, ${secondId})
    `;
  }

  private async deleteClaimedPairs(pairs: readonly ClaimedQueuePair[]): Promise<void> {
    for (const claimed of pairs) {
      await this.deleteClaimedCandidateIds(claimed.pair[0].id, claimed.pair[1].id);
    }
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
      ),
      expired_attempts AS (
        UPDATE search_attempts
        SET
          status = 'expired',
          terminal_reason = 'lease_expired',
          updated_at = CURRENT_TIMESTAMP
        WHERE id IN (SELECT search_attempt_id FROM queue_entries WHERE id IN (SELECT id FROM expired))
          AND status = 'searching'
      )
      DELETE FROM queue_entries q
      USING expired
      WHERE q.id = expired.id
      RETURNING q.id
    `;

    return rows.map((row) => row.id);
  }

  public async purgeOldAvoidances(olderThanDays = 30): Promise<number> {
    const rows = await this.database<{ search_attempt_id: string; opponent_id: string }[]>`
      DELETE FROM search_avoidances
      WHERE created_at < CURRENT_TIMESTAMP - ${`${Math.max(1, Math.trunc(olderThanDays))} days`}::interval
      RETURNING search_attempt_id, opponent_id
    `;
    return rows.length;
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

  public async cancelSearch(playerId: string): Promise<QueueCancellation> {
    const rows = await this.database<QueueCancellationRow[]>`
      WITH active_match AS (
        SELECT id
        FROM matches
        WHERE ${playerId} IN (player_a_id, player_b_id)
          AND status IN ('allocating', 'countdown', 'playing')
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        FOR UPDATE
      ),
      cancelled AS (
        UPDATE search_attempts
        SET
          status = 'cancelled',
          terminal_reason = 'player_cancelled',
          updated_at = CURRENT_TIMESTAMP
        WHERE player_id = ${playerId}
          AND status = 'searching'
          AND NOT EXISTS (SELECT 1 FROM active_match)
        RETURNING id
      ),
      legacy_cancelled AS (
        UPDATE queue_entries
        SET status = 'cancelled'
        WHERE player_id = ${playerId}
          AND status = 'searching'
          AND search_attempt_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM active_match)
        RETURNING id
      ),
      queue_cancelled AS (
        UPDATE queue_entries
        SET status = 'cancelled'
        WHERE search_attempt_id IN (SELECT id FROM cancelled)
          AND status = 'searching'
        RETURNING id
      )
      SELECT 'already-assigned' AS status, id AS match_id
      FROM active_match
      UNION ALL
      SELECT 'cancelled' AS status, NULL::uuid AS match_id
      FROM cancelled
      UNION ALL
      SELECT 'cancelled' AS status, NULL::uuid AS match_id
      FROM legacy_cancelled
      UNION ALL
      SELECT 'not-searching' AS status, NULL::uuid AS match_id
      WHERE NOT EXISTS (SELECT 1 FROM active_match)
        AND NOT EXISTS (SELECT 1 FROM cancelled)
        AND NOT EXISTS (SELECT 1 FROM legacy_cancelled)
      LIMIT 1
    `;
    const row = rows[0];
    return row === undefined
      ? { status: 'not-searching', matchId: null }
      : { status: row.status, matchId: row.match_id };
  }
}

type QueueCancellationRow = {
  status: QueueCancellation['status'];
  match_id: string | null;
};

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
    searchAttemptId: row.search_attempt_id,
    generation: row.generation,
  };
}

function toQueueCandidate(row: QueueCandidateRow): QueueCandidate {
  return {
    id: row.id,
    playerId: row.player_id,
    sessionId: row.session_id,
    avoidPlayerId: row.avoid_player_id,
    avoidPlayerIds: [
      ...(row.avoid_player_ids ?? []),
      ...(row.avoid_player_id === null ? [] : [row.avoid_player_id]),
    ],
    searchAttemptId: row.search_attempt_id ?? null,
    generation: row.generation ?? 1,
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
  return pickAvoidingPairs(candidates)[0] ?? null;
}

/**
 * Finds a maximum-cardinality matching for the candidate wave. Fresh edges
 * are visited before repeat edges, so augmenting paths can replace an early
 * repeat or fresh choice when a better wave-wide arrangement exists.
 */
export function pickAvoidingPairs(candidates: readonly QueueCandidate[]): PickedPair[] {
  if (candidates.length < 2) return [];

  const matcher = new GeneralMatching(candidates.length);
  for (let left = 0; left < candidates.length; left += 1) {
    const edges = candidates
      .map((candidate, right) => ({
        right,
        fresh: isFreshPair(candidates[left], candidate),
      }))
      .filter(({ right }) => right > left)
      .sort((a, b) => Number(b.fresh) - Number(a.fresh) || a.right - b.right);
    for (const { right } of edges) {
      matcher.addEdge(left, right);
    }
  }

  const pairs = matcher.findMaximumMatching();
  return pairs.map(([left, right]) => ({
    pair: [candidates[left], candidates[right]],
    isRepeatPairing: !isFreshPair(candidates[left], candidates[right]),
  }));
}

function isFreshPair(left: QueueCandidate, right: QueueCandidate): boolean {
  const leftAvoids = new Set(left.avoidPlayerIds ?? []);
  const rightAvoids = new Set(right.avoidPlayerIds ?? []);
  if (left.avoidPlayerId !== null) leftAvoids.add(left.avoidPlayerId);
  if (right.avoidPlayerId !== null) rightAvoids.add(right.avoidPlayerId);
  return !leftAvoids.has(right.playerId) && !rightAvoids.has(left.playerId);
}

class GeneralMatching {
  private readonly graph: number[][];
  private readonly match: number[];
  private readonly parent: number[];
  private readonly base: number[];
  private readonly used: boolean[];
  private readonly blossom: boolean[];

  public constructor(private readonly size: number) {
    this.graph = Array.from({ length: size }, () => []);
    this.match = Array(size).fill(-1);
    this.parent = Array(size).fill(-1);
    this.base = Array.from({ length: size }, (_, index) => index);
    this.used = Array(size).fill(false);
    this.blossom = Array(size).fill(false);
  }

  public addEdge(left: number, right: number): void {
    this.graph[left].push(right);
    this.graph[right].push(left);
  }

  public findMaximumMatching(): Array<[number, number]> {
    for (let root = 0; root < this.size; root += 1) {
      if (this.match[root] === -1) {
        const endpoint = this.findAugmentingPath(root);
        if (endpoint !== -1) this.augment(endpoint);
      }
    }
    const pairs: Array<[number, number]> = [];
    for (let left = 0; left < this.size; left += 1) {
      if (this.match[left] > left) pairs.push([left, this.match[left]]);
    }
    return pairs;
  }

  private findAugmentingPath(root: number): number {
    this.used.fill(false);
    this.parent.fill(-1);
    this.base.forEach((_, index) => {
      this.base[index] = index;
    });
    const queue = [root];
    this.used[root] = true;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor];
      for (const next of this.graph[vertex]) {
        if (this.base[vertex] === this.base[next] || this.match[vertex] === next) continue;
        if (
          next === root
          || (this.match[next] !== -1 && this.parent[this.match[next]] !== -1)
        ) {
          const commonBase = this.findLowestCommonAncestor(vertex, next);
          this.blossom.fill(false);
          this.markBlossomPath(vertex, commonBase, next);
          this.markBlossomPath(next, commonBase, vertex);
          for (let index = 0; index < this.size; index += 1) {
            if (!this.blossom[this.base[index]]) continue;
            this.base[index] = commonBase;
            if (!this.used[index]) {
              this.used[index] = true;
              queue.push(index);
            }
          }
        } else if (this.parent[next] === -1) {
          this.parent[next] = vertex;
          if (this.match[next] === -1) return next;
          const matched = this.match[next];
          this.used[matched] = true;
          queue.push(matched);
        }
      }
    }
    return -1;
  }

  private findLowestCommonAncestor(left: number, right: number): number {
    const seen = Array(this.size).fill(false);
    let current = left;
    while (true) {
      current = this.base[current];
      seen[current] = true;
      if (this.match[current] === -1) break;
      current = this.parent[this.match[current]];
    }
    current = right;
    while (!seen[this.base[current]]) {
      current = this.base[current];
      if (this.match[current] === -1) break;
      current = this.parent[this.match[current]];
    }
    return this.base[current];
  }

  private markBlossomPath(vertex: number, commonBase: number, child: number): void {
    let current = vertex;
    while (this.base[current] !== commonBase) {
      this.blossom[this.base[current]] = true;
      this.blossom[this.base[this.match[current]]] = true;
      this.parent[current] = child;
      child = this.match[current];
      current = this.parent[this.match[current]];
    }
  }

  private augment(endpoint: number): void {
    let current = endpoint;
    while (current !== -1) {
      const previous = this.parent[current];
      const next = previous === -1 ? -1 : this.match[previous];
      this.match[current] = previous;
      if (previous !== -1) this.match[previous] = current;
      current = next;
    }
  }
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
    searchAttemptId: candidate.searchAttemptId ?? null,
    generation: candidate.generation ?? 1,
  };
}
