import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlExecutor } from './database.js';
import type { MatchOutcomeReason } from './matchResultStore.js';
import type { SearchScope } from './queueScope.js';

export type MatchStatus =
  | 'allocating'
  | 'countdown'
  | 'playing'
  | 'ended'
  | 'voided'
  | 'cancelled';

export type MatchSeat = 'A' | 'B';

export type MatchRecord = {
  id: string;
  correlationId: string;
  matchSeed: number;
  playerAId: string;
  playerBId: string;
  gameServerUrl: string;
  protocolVersion: number;
  status: MatchStatus;
  isRepeatPairing: boolean;
};

export type ActiveMatchForPlayer = {
  match: MatchRecord;
  seat: MatchSeat;
};

export type JoinTicket = {
  id: string;
  matchId: string;
  playerId: string;
  seat: MatchSeat;
  expiresAt: Date;
  ticket: string;
};

export type ValidatedJoinTicket = {
  id: string;
  matchId: string;
  matchSeed: number;
  playerId: string;
  seat: MatchSeat;
  status: MatchStatus;
  gameServerUrl: string;
  protocolVersion: number;
};

export type ConsumedJoinTicket = {
  id: string;
  matchId: string;
  playerId: string;
  seat: MatchSeat;
};

export type JoinTicketRejection = 'consumed' | 'rejected';

export type MatchStatusChange = {
  id: string;
  status: MatchStatus;
  startedAt: Date | null;
  endedAt: Date | null;
};

type MatchRow = {
  id: string;
  correlation_id: string;
  match_seed: number | string;
  player_a_id: string;
  player_b_id: string;
  game_server_url: string;
  protocol_version: number;
  status: MatchStatus;
  is_repeat_pairing: boolean;
};

type ActiveMatchRow = MatchRow & {
  seat: MatchSeat;
};

type JoinTicketRow = {
  id: string;
  match_id: string;
  player_id: string;
  seat: MatchSeat;
  expires_at: Date;
};

type ValidatedJoinTicketRow = {
  id: string;
  match_id: string;
  match_seed: number | string;
  player_id: string;
  seat: MatchSeat;
  status: MatchStatus;
  game_server_url: string;
  protocol_version: number;
};

type ConsumedJoinTicketRow = {
  id: string;
  match_id: string;
  player_id: string;
  seat: MatchSeat;
};

type MatchStatusChangeRow = {
  id: string;
  status: MatchStatus;
  started_at: Date | null;
  ended_at: Date | null;
};

export class MatchStore {
  public constructor(private readonly database: SqlExecutor) {}

  public async createMatch(input: {
    correlationId: string;
    matchSeed: number;
    playerAId: string;
    playerBId: string;
    gameServerUrl: string;
    protocolVersion: number;
    searchScope?: SearchScope;
    guildId?: string | null;
    isRepeatPairing?: boolean;
  }): Promise<MatchRecord> {
    const rows = await this.database<MatchRow[]>`
      INSERT INTO matches (
        id,
        correlation_id,
        match_seed,
        player_a_id,
        player_b_id,
        game_server_url,
        protocol_version,
        search_scope,
        guild_id,
        is_repeat_pairing,
        status
      )
      VALUES (
        ${randomUUID()},
        ${input.correlationId},
        ${input.matchSeed},
        ${input.playerAId},
        ${input.playerBId},
        ${input.gameServerUrl},
        ${input.protocolVersion},
        ${input.searchScope ?? 'global'},
        ${input.guildId ?? null},
        ${input.isRepeatPairing ?? false},
        'allocating'
      )
      RETURNING
        id,
        correlation_id,
        match_seed,
        player_a_id,
        player_b_id,
        game_server_url,
        protocol_version,
        status,
        is_repeat_pairing
    `;

    const row = rows[0];
    if (!row) throw new Error('Match creation returned no row');
    return toMatchRecord(row);
  }

  public async findActiveMatchForPlayer(playerId: string): Promise<ActiveMatchForPlayer | null> {
    const rows = await this.database<ActiveMatchRow[]>`
      SELECT
        m.id,
        m.correlation_id,
        m.match_seed,
        m.player_a_id,
        m.player_b_id,
        m.game_server_url,
        m.protocol_version,
        m.status,
        m.is_repeat_pairing,
        CASE
          WHEN m.player_a_id = ${playerId} THEN 'A'
          ELSE 'B'
        END AS seat
      FROM matches m
      WHERE ${playerId} IN (m.player_a_id, m.player_b_id)
        AND m.status IN ('allocating', 'countdown', 'playing')
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    `;

    const row = rows[0];
    return row
      ? {
          match: toMatchRecord(row),
          seat: row.seat,
        }
      : null;
  }

  public async findFinalizedOutcome(
    matchId: string,
    playerId: string,
  ): Promise<MatchOutcomeReason | null> {
    const rows = await this.database<{ outcome_reason: MatchOutcomeReason }[]>`
      SELECT r.outcome_reason
      FROM match_results r
      JOIN matches m ON m.id = r.match_id
      WHERE r.match_id = ${matchId}
        AND ${playerId} IN (m.player_a_id, m.player_b_id)
      LIMIT 1
    `;
    return rows[0]?.outcome_reason ?? null;
  }

  public async issueJoinTicket(input: {
    matchId: string;
    playerId: string;
    seat: MatchSeat;
  }): Promise<JoinTicket> {
    const rawTicket = randomBytes(32).toString('hex');
    const rows = await this.database<JoinTicketRow[]>`
      INSERT INTO match_tickets (
        id, match_id, player_id, ticket_hash, seat, expires_at, revoked
      )
      VALUES (
        ${randomUUID()},
        ${input.matchId},
        ${input.playerId},
        ${hashTicket(rawTicket)},
        ${input.seat},
        CURRENT_TIMESTAMP + INTERVAL '60 seconds',
        FALSE
      )
      RETURNING id, match_id, player_id, seat, expires_at
    `;

    const row = rows[0];
    if (!row) throw new Error('Join ticket creation returned no row');
    return {
      id: row.id,
      matchId: row.match_id,
      playerId: row.player_id,
      seat: row.seat,
      expiresAt: row.expires_at,
      ticket: rawTicket,
    };
  }

  public async issueReplacementJoinTicket(input: {
    matchId: string;
    playerId: string;
    seat: MatchSeat;
  }): Promise<JoinTicket> {
    // Concurrent browser tabs may both ask for a refresh. Keep each
    // short-lived ticket valid instead of deleting a ticket another request
    // is about to return; GameManager still permits only one active socket
    // for the durable seat.
    await this.database`
      DELETE FROM match_tickets
      WHERE match_id = ${input.matchId}
        AND seat = ${input.seat}
        AND (
          revoked = TRUE
          OR expires_at <= CURRENT_TIMESTAMP
        )
    `;
    return this.issueJoinTicket(input);
  }

  public async deleteMatchTickets(matchId: string): Promise<number> {
    const rows = await this.database<{ id: string }[]>`
      DELETE FROM match_tickets
      WHERE match_id = ${matchId}
      RETURNING id
    `;
    return rows.length;
  }

  public async validateJoinTicket(rawTicket: string): Promise<ValidatedJoinTicket | null> {
    const rows = await this.database<ValidatedJoinTicketRow[]>`
      SELECT
        t.id,
        t.match_id,
        m.match_seed,
        t.player_id,
        t.seat,
        m.status,
        m.game_server_url,
        m.protocol_version
      FROM match_tickets t
      JOIN matches m ON t.match_id = m.id
      WHERE t.ticket_hash = ${hashTicket(rawTicket)}
        AND t.revoked = FALSE
        AND t.expires_at > CURRENT_TIMESTAMP
        AND m.status IN ('allocating', 'countdown', 'playing')
    `;

    const row = rows[0];
    return row
      ? {
          id: row.id,
          matchId: row.match_id,
          matchSeed: normalizeMatchSeed(row.match_seed),
          playerId: row.player_id,
          seat: row.seat,
          status: row.status,
          gameServerUrl: row.game_server_url,
          protocolVersion: row.protocol_version,
        }
      : null;
  }

  public async consumeJoinTicket(rawTicket: string): Promise<ConsumedJoinTicket | null> {
    const rows = await this.database<ConsumedJoinTicketRow[]>`
      UPDATE match_tickets t
      SET
        revoked = TRUE,
        consumed_at = CURRENT_TIMESTAMP
      FROM matches m
      WHERE t.match_id = m.id
        AND t.ticket_hash = ${hashTicket(rawTicket)}
        AND t.revoked = FALSE
        AND t.expires_at > CURRENT_TIMESTAMP
        AND m.status IN ('allocating', 'countdown', 'playing')
      RETURNING t.id, t.match_id, t.player_id, t.seat
    `;

    const row = rows[0];
    return row
      ? {
          id: row.id,
          matchId: row.match_id,
          playerId: row.player_id,
          seat: row.seat,
        }
      : null;
  }

  public async classifyJoinTicketRejection(rawTicket: string): Promise<JoinTicketRejection> {
    const rows = await this.database<{ consumed_at: Date | null }[]>`
      SELECT consumed_at
      FROM match_tickets
      WHERE ticket_hash = ${hashTicket(rawTicket)}
      LIMIT 1
    `;
    return rows[0]?.consumed_at !== null && rows[0]?.consumed_at !== undefined
      ? 'consumed'
      : 'rejected';
  }

  public async finalizeActiveMatchStatus(
    matchId: string,
    nextStatus: MatchStatus = 'ended',
  ): Promise<MatchStatusChange | null> {
    const rows = await this.database<MatchStatusChangeRow[]>`
      UPDATE matches
      SET
        status = ${nextStatus},
        ended_at = CASE
          WHEN ${nextStatus} IN ('ended', 'voided', 'cancelled')
          THEN COALESCE(ended_at, CURRENT_TIMESTAMP)
          ELSE ended_at
        END
      WHERE id = ${matchId}
        AND status IN ('allocating', 'countdown', 'playing')
      RETURNING id, status, started_at, ended_at
    `;

    const row = rows[0];
    return row
      ? {
          id: row.id,
          status: row.status,
          startedAt: row.started_at,
          endedAt: row.ended_at,
        }
      : null;
  }

  /**
   * Cancels matches that nobody ever joined: still active past the grace
   * window with no consumed join ticket. Without this sweep, two players who
   * both abandon before connecting would keep receiving the dead match from
   * findActiveMatchForPlayer and could never requeue.
   */
  public async cancelNeverJoinedMatches(olderThanSeconds: number): Promise<string[]> {
    const rows = await this.database<{ id: string }[]>`
      WITH stale AS (
        SELECT m.id
        FROM matches m
        WHERE m.status IN ('allocating', 'countdown', 'playing')
          AND m.created_at <= CURRENT_TIMESTAMP - ${`${Math.max(0, Math.trunc(olderThanSeconds))} seconds`}::interval
          AND NOT EXISTS (
            SELECT 1
            FROM match_tickets t
            WHERE t.match_id = m.id
              AND t.consumed_at IS NOT NULL
          )
        LIMIT 100
      )
      UPDATE matches m
      SET
        status = 'cancelled',
        ended_at = COALESCE(m.ended_at, CURRENT_TIMESTAMP)
      FROM stale s
      WHERE m.id = s.id
      RETURNING m.id
    `;
    return rows.map((row) => row.id);
  }

  public async updateMatchStatus(input: {
    matchId: string;
    expectedStatus: MatchStatus;
    nextStatus: MatchStatus;
  }): Promise<MatchStatusChange | null> {
    const rows = await this.database<MatchStatusChangeRow[]>`
      UPDATE matches
      SET
        status = ${input.nextStatus},
        started_at = CASE
          WHEN ${input.nextStatus} = 'playing' AND started_at IS NULL
          THEN CURRENT_TIMESTAMP
          ELSE started_at
        END,
        ended_at = CASE
          WHEN ${input.nextStatus} IN ('ended', 'voided', 'cancelled')
          THEN COALESCE(ended_at, CURRENT_TIMESTAMP)
          ELSE ended_at
        END
      WHERE id = ${input.matchId}
        AND status = ${input.expectedStatus}
      RETURNING id, status, started_at, ended_at
    `;

    const row = rows[0];
    return row
      ? {
          id: row.id,
          status: row.status,
          startedAt: row.started_at,
          endedAt: row.ended_at,
        }
      : null;
  }
}

function hashTicket(rawTicket: string): string {
  return createHash('sha256').update(rawTicket, 'utf8').digest('hex');
}

function toMatchRecord(row: MatchRow): MatchRecord {
  return {
    id: row.id,
    correlationId: row.correlation_id,
    matchSeed: normalizeMatchSeed(row.match_seed),
    playerAId: row.player_a_id,
    playerBId: row.player_b_id,
    gameServerUrl: row.game_server_url,
    protocolVersion: row.protocol_version,
    status: row.status,
    isRepeatPairing: row.is_repeat_pairing,
  };
}

function normalizeMatchSeed(value: number | string): number {
  const seed = Number(value);
  if (!Number.isSafeInteger(seed)) {
    throw new Error(`Invalid match seed returned from PostgreSQL: ${String(value)}`);
  }
  return seed;
}
