import type { SqlExecutor } from './database.js';

export type MatchOutcomeReason =
  | 'top_out'
  | 'forfeit_disconnect'
  | 'forfeit_resignation'
  | 'void_server_crash'
  | 'void_dual_disconnect'
  | 'cancelled_alloc_fail';

export type MatchResultStats = {
  score: number;
  linesCleared: number;
  topOut: boolean;
};

export type MatchResultInput = {
  matchId: string;
  winnerId: string | null;
  loserId: string | null;
  outcomeReason: MatchOutcomeReason;
  durationSeconds: number;
  playerAStats: MatchResultStats;
  playerBStats: MatchResultStats;
};

export class MatchResultStore {
  public constructor(private readonly database: SqlExecutor) {}

  /**
   * Result finalization is intentionally idempotent. A retry after a
   * transient database failure must not rewrite an already-finalized result.
   */
  public async insertMatchResult(input: MatchResultInput): Promise<void> {
    await this.database`
      INSERT INTO match_results (
        match_id,
        winner_id,
        loser_id,
        outcome_reason,
        duration_seconds,
        player_a_stats,
        player_b_stats
      )
      VALUES (
        ${input.matchId},
        ${input.winnerId},
        ${input.loserId},
        ${input.outcomeReason},
        ${Math.max(0, Math.floor(input.durationSeconds))},
        ${JSON.stringify(input.playerAStats)}::jsonb,
        ${JSON.stringify(input.playerBStats)}::jsonb
      )
      ON CONFLICT (match_id) DO NOTHING
    `;
  }
}
