import type { SqlExecutor } from './database.js';
import type {
  AnalyticsEventName,
  AnalyticsProperties,
} from './analyticsPolicy.js';

export type ReliabilityAnalyticsEvent = {
  eventName: AnalyticsEventName;
  playerId: string;
  matchId: string | null;
  properties: AnalyticsProperties;
};

export class AnalyticsStore {
  public constructor(private readonly database: SqlExecutor) {}

  public async insertReliabilityEvent(event: ReliabilityAnalyticsEvent): Promise<void> {
    await this.database`
      INSERT INTO analytics_events (event_name, player_id, match_id, properties)
      VALUES (
        ${event.eventName},
        ${event.playerId},
        ${event.matchId},
        ${JSON.stringify(event.properties)}::jsonb
      )
    `;
  }

  public async purgeExpiredEvents(retentionDays = 30, batchSize = 5_000): Promise<number> {
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
      throw new Error('Analytics retention must be a positive integer');
    }
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error('Analytics purge batch size must be a positive integer');
    }

    const rows = await this.database<{ id: number }[]>`
      DELETE FROM analytics_events
      WHERE id IN (
        SELECT id
        FROM analytics_events
        WHERE created_at < CURRENT_TIMESTAMP - (${retentionDays} * INTERVAL '1 day')
        ORDER BY created_at ASC, id ASC
        LIMIT ${batchSize}
      )
      RETURNING id
    `;
    return rows.length;
  }
}
