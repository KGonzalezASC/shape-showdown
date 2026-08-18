# Define the release and operations contract

Type: grilling
Status: closed
Blocked by: 01, 04, 05, 06, 07

## Question

What must a production release guarantee for health, readiness, stop-admitting, active-match drain, schema migration, secret injection, logs, metrics, alerts, rollback, client and protocol compatibility, backups, regional-provider failure, and cost limits? Turn these guarantees into explicit release gates rather than provider assumptions.

## Answer

### 1. Environment Wiring & Release Lanes

Staging and production operate as isolated environments with separate databases to prevent test data from corrupting live matches.

| Client Lane | Targets | Database | Purpose |
|---|---|---|---|
| **Pages Preview / Staging** | Railway **staging** (`shape-showdown-staging.up.railway.app`) | Staging Postgres | Structural experiments, breaking protocol changes, networking trials. |
| **Pages Production / Discord** | Railway **production** (`shape-showdown-prod.up.railway.app`) | Production Postgres | Live player traffic. |
| **Railway Feature Flags** | In-process server runtime gates | Server memory | Instant power-up toggles and balance adjustments without redeploying. |

#### Client URL Resolution Rule
- **Discord Activities:** Route relative requests (`/`, `/socket.io`, `/api`) through mapped Discord proxy origins (`discordsays.com`).
- **Direct Web:** Reads `game-config.json` on Cloudflare Pages, which points to the production Railway backend.

---

### 2. Deploy Health, Stop-Admitting & Match Drain

1. **Readiness Health Gate (`/health`):**
   - Railway polls `GET /health` before routing public traffic to a new container build.
   - `/health` performs a lightweight SQL ping (`SELECT 1`) with a 2-second timeout.
   - If Postgres is unreachable, `/health` returns HTTP 503 and deployment halts.
2. **Stop-Admitting New Matches:**
   - On receiving `SIGTERM`, the draining server marks `draining = true` on `MatchRegistry`.
   - The draining server immediately rejects new matchmaking allocations and redirects joins to the new server.
3. **Graceful Match Drain:**
   - Active matches on the draining server continue running up to a configured 180-second grace window (`drainTimeout: 180` in Railway settings).
   - If an active player disconnects from a draining server, that server immediately writes a final checkpoint to Postgres and closes the match runner, allowing the new server to resume the match cleanly.
4. **Safety Net Checkpoint Recovery:**
   - If a match exceeds 180 seconds, Railway terminates the old container.
   - Reconnecting clients trigger a checkpoint restore on the new container within the 15-second budget defined in ticket 01.
5. **Client Protocol Handshake:**
   - Socket connections validate `PROTOCOL_VERSION`.
   - Incompatible clients receive a version mismatch error with a prompt to reload the browser or Discord Activity.

---

### 3. Schema Migrations, Secrets & Rollbacks

1. **Forward-Compatible Migrations:**
   - Migrations run automatically on container startup via `bun run db:migrate` before the HTTP server begins listening.
   - Migrations must be purely additive (adding new tables or nullable columns with defaults).
   - Deleting or renaming active columns in a single deploy step is strictly prohibited.
2. **Secret Injection:**
   - Sensitive credentials (`DATABASE_URL`, `DISCORD_CLIENT_SECRET`, `DEV_SECRET`) are stored in Railway Environment Variables.
   - No private keys or connection strings enter git repositories.
3. **One-Click Rollbacks:**
   - Reverting to a previous container build in Railway Deployments restores old server code instantly.
   - Because database schema changes are strictly additive, the rolled-back code runs without SQL errors.

---

### 4. Observability, Alerting, Spend Limits & Backups

1. **Structured Logs & Metrics:**
   - Server stdout outputs structured JSON (`timestamp`, `level`, `match_id`, `correlation_id`, `message`).
   - Railway dashboard visualizes real-time container CPU, RAM (~157 MB idle floor), and network egress.
2. **Crash Alerting (Sentry):**
   - Frontend and backend error tracking configured through Sentry (free via GitHub Student Pack).
   - Uncaught exceptions and WebSocket handshake failures group by release version.
3. **Spend Limit Safeguards:**
   - Strict spending ceiling (e.g. $15/month) configured in Railway billing settings to prevent unexpected cost surges.
4. **Backup Policy & Accepted Risk:**
   - Automated daily snapshots enabled on Railway Postgres.
   - Point-in-time recovery (PITR) is waived at launch.
   - In the event of catastrophic disk failure, data restores from the latest daily snapshot, accepting up to 24 hours of match history loss.

---

### 5. Explicit Production Release Gates

Before promoting any build to live players, the release must satisfy these 6 verification gates:

- [ ] **Gate 1 (Wiring):** `shape-showdown.pages.dev/game-config.json` points to the production Railway backend with a dedicated production Postgres database.
- [ ] **Gate 2 (Health):** `GET /health` passes database ping (`SELECT 1`) within 2 seconds.
- [ ] **Gate 3 (Drain):** Railway grace period configured to 180 seconds.
- [ ] **Gate 4 (Migrations):** All database schema changes are additive and backward-compatible.
- [ ] **Gate 5 (Secrets):** Zero secrets committed to git; `localhost` CORS disabled in production without `DEV_SECRET`.
- [ ] **Gate 6 (Spend Cap):** Railway spending limit configured and active.
