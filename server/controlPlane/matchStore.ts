import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlExecutor } from './database.js';

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

export type MatchStatusChange = {
  id: string;
  status: MatchStatus;
  startedAt: Date | null;
  endedAt: Date | null;
};

type MatchRow = {
  id: string;
  correlation_id: string;
  match_seed: number;
  player_a_id: string;
  player_b_id: string;
  game_server_url: string;
  protocol_version: number;
  status: MatchStatus;
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
        status
    `;

    const row = rows[0];
    if (!row) throw new Error('Match creation returned no row');
    return toMatchRecord(row);
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

  public async validateJoinTicket(rawTicket: string): Promise<ValidatedJoinTicket | null> {
    const rows = await this.database<ValidatedJoinTicketRow[]>`
      SELECT
        t.id,
        t.match_id,
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
      DELETE FROM match_tickets t
      USING matches m
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
    matchSeed: row.match_seed,
    playerAId: row.player_a_id,
    playerBId: row.player_b_id,
    gameServerUrl: row.game_server_url,
    protocolVersion: row.protocol_version,
    status: row.status,
  };
}
