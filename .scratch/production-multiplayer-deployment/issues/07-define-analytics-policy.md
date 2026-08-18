# Define the analytics event and retention policy

Type: grilling
Status: closed
Blocked by: 05

## Question

Which product, reliability, network, and gameplay-summary events should be appended to Postgres at launch? Define identifiers, consent and privacy boundaries, retention, aggregation, deletion, sampling, and the evidence that would trigger exporting analytics to a separate store. Explicitly exclude per-tick state from routine analytics.

## Answer

### 1. Event Scope & Launch Catalog

Postgres records high-level lifecycle, reliability, and economy events. Frame-by-frame 60 Hz piece movement and keystroke streams are strictly excluded from routine analytics.

| Category | Event Name | Payload Properties | Purpose |
|---|---|---|---|
| **Matchmaking** | `queue_enter` | `{ auth_provider, queue_duration_ms }` | Measures matchmaking wait times and dropouts. |
| **Lifecycle** | `match_start` | `{ match_id, player_a_id, player_b_id, is_rematch }` | Tracks total games initiated. |
| **Lifecycle** | `match_end` | `{ match_id, winner_id, reason, duration_s }` | Analyzes match duration and win conditions. |
| **Reliability** | `disconnect_start` | `{ match_id, player_id, pause_count }` | Identifies client drops and connection instability. |
| **Reliability** | `reconnect_success` | `{ match_id, player_id, disconnected_seconds }` | Measures reconnect recovery success rate. |
| **Reliability** | `forfeit_abandon` | `{ match_id, player_id, total_paused_seconds }` | Tracks disconnect budget expirations. |
| **Reliability** | `match_voided` | `{ match_id, reason }` | Flags server crashes or mutual seat lease timeouts. |
| **Economy** | `shop_purchase` | `{ match_id, buyer_id, item_id, cost, tick }` | Evaluates balance across all 13 shop items. |

### 2. Privacy, Identifiers & PII Boundaries

1. **Pseudonymous IDs:** All events link to internal `player_id` UUIDs. Real names and raw Discord user IDs are omitted from analytics payloads.
2. **IP Isolation:** Client IP addresses are stored exclusively in the ephemeral `sessions` table for disconnect security. They are never written to `analytics_events`.
3. **Discord Compliance:** Game telemetry is decoupled from Discord personal profile data, satisfying Discord Activity developer privacy policies.

### 3. Postgres Schema: `analytics_events`

```sql
CREATE TABLE analytics_events (
    id BIGSERIAL PRIMARY KEY,
    event_name VARCHAR(32) NOT NULL,
    player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_created_at ON analytics_events(created_at);
CREATE INDEX idx_analytics_event_name ON analytics_events(event_name);
CREATE INDEX idx_analytics_match_id ON analytics_events(match_id) WHERE match_id IS NOT NULL;
```

### 4. Retention & Automated Pruning Policy

- **Raw Events (`analytics_events`):** Retained for **30 days**. A daily automated SQL job prunes older events:
  ```sql
  DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '30 days';
  ```
- **Match Records (`match_results`):** Retained for **180 days** to power player history and win/loss records.
- **Daily Summaries (`daily_metrics`):** Retained for **1 year** as compact aggregate rollups (total matches, unique players, disconnect rates).
- **Sampling:** 100% sample rate at launch (no downsampling needed).

### 5. Scale Triggers & External Store Export (Neon)

Analytics remain inside Railway Postgres at launch. We will extract analytics into a dedicated external store if any of the following triggers occur:

1. **Query CPU Load:** Analytics dashboard queries cause more than 10% CPU load on Railway Postgres.
2. **Ingestion Volume:** Game traffic exceeds 500,000 events per day.
3. **Disk Footprint:** The `analytics_events` table exceeds 10 GB of storage.

**Selected External Store:** When triggered, historical events stream asynchronously to **Neon Serverless Postgres** for cold storage archiving. This preserves Railway Postgres solely for sub-millisecond live match transactions.
