# Evidence: Phase 4 - live deploy-while-connected and live rollback (staging)

Recorded 2026-08-21. All timestamps UTC unless noted. Environment: Railway
staging (`shape-showdown-staging.up.railway.app`), client
`main.shape-showdown.pages.dev`, Railway Postgres durable state.

## Drill 1 - Redeploy while a match is live

| Item | Value |
|---|---|
| Trigger commit | `3e13b51` feat(ui): radial orbit tetromino loading spinner + palette sync |
| Pushed to | `origin/main` |
| New deployment | `6f6b69a9-9ce7-4cf9-b46c-adb2705b3e86` SUCCESS 2026-08-21 22:09:33Z |
| Superseded deployment | `3363292c-3c2e-427a-ae89-e5282b5b86fb` (received SIGTERM) |
| Match ID | `473afc3a-7a6d-40f0-a5fb-db3dad138a3d` |
| Seat A | player `14bd8d92-d84b-4980-92a8-a5cd143880ff`, paused 158 ms |
| Seat B | player `bbac02f6-c7d3-4c54-80fe-b5c505a9a59b`, paused 2 ms |
| New process start | `server_started` 2026-08-21T22:10:14Z |
| Ticket rebinding + reconnect | both seats `reconnect_success` at 2026-08-21T22:10:48Z |
| Match state survival | `restore_ok simTick=9289` (Postgres restore) |
| `/health` | HTTP 200 before (0.12 s) and after (0.19 s) cutover |
| Client URL stability | unchanged; players kept old bundle in memory until refresh |

Outcome: PASS. Players reported only a sub-200 ms overlay flash
(`reconnecting` phase), match continued to completion.

## Drill 2 - Live rollback (revert-commit method)

Note: dashboard Rollback on the REMOVED deployment `3363292c` did not execute
(no new deployment appeared, no SIGTERM). Rollback was performed as a
`git revert` of the deploy commit pushed to `main`, which is the realistic
"undo a bad commit" path.

| Item | Value |
|---|---|
| Revert commit | `565bfcf` Revert "feat(ui): add radial orbit tetromino loading spinner..." |
| Pushed to | `origin/main` at 2026-08-21T22:33:00Z |
| New deployment | `499715b3-e455-449d-9591-4f9806eb91f0` SUCCESS 2026-08-21 22:33:25Z |
| Superseded deployment | `6f6b69a9` (SIGTERM observed ~22:34:21Z) |
| New process start | `server_started` 2026-08-21T22:34:21Z |
| Match ID | `f2660bc8-ff90-4706-a37b-dc0c29fc6eb1` |
| Seat | `14bd8d92-d84b-4980-92a8-a5cd143880ff`, paused 6 ms |
| Seat | `3a31f598-26c3-4054-86e3-0abd14f7ae81`, paused 64 ms |
| Ticket rebinding + reconnect | both seats `reconnect_success` at 2026-08-21T22:34:55Z |
| `/health` | HTTP 200 after cutover |

Outcome: PASS. Total player-visible pause under 100 ms; match uninterrupted.

## Post-drill repo state

- Staging restored to latest code via revert-of-revert `353a964`
  ("Reapply ... loading spinner") pushed to `origin/main`.
- Production promoted to `353a964` via `git merge main --ff-only` and pushed
  to `origin/production`; production Railway + Pages deploy triggered.

## Gate 4 - Additive-migration review (closed)

Scope: `db/migrations/0001_control_plane.sql`, `0002_concurrent_join_tickets.sql`,
`0003_ticket_consumption_state.sql`.

| Migration | Verdict | Notes |
|---|---|---|
| 0001 control plane | Additive | All `CREATE TABLE/INDEX IF NOT EXISTS`; initial schema only |
| 0002 concurrent join tickets | **Additive with one caveat** | Adds partial index; **drops UNIQUE constraint `match_tickets_match_id_seat_key`**. No data loss, but a pre-0002 binary rolled back against this schema would no longer get DB-level duplicate-seat rejection. Accepted: ticket consumption is enforced in application code (`server/controlPlane/`) and protocol gating prevents old binaries from attaching |
| 0003 ticket consumption state | Additive | Nullable `ADD COLUMN IF NOT EXISTS` + partial index |

Startup ordering verified twice:
- Code: `server/gameServer.ts:83` awaits `runMigrations` before the Express app,
  Socket.IO server, and listen; migration failure aborts boot (lines 84-87).
- Logs: both drill deployments show the Postgres
  `relation "schema_migrations" already exists, skipping` NOTICE before
  `event="server_started"`.
- `/health` pings the database (`healthPing`, gameServer.ts:130-142) so it only
  returns 200 after migrations and DB reachability.

Outcome: PASS with documented caveat on 0002. No deferred migrations.

## Deferred: spend cap + backup schedule (trial limitation)

Railway CLI verification results (2026-08-21):
- Workspace usage limits: soft limit NOT SET, hard limit NOT SET.
- Production Postgres: volume attached (104 MB / 500 MB) but PITR disabled and
  zero backups taken; staging has no volume at all.

Both remain unconfigured pending trial-plan constraints; owner believes these
settings are locked until the trial converts. Re-run after upgrade:
1. `railway usage limit set` (suggest soft ~$10, hard ~$20).
2. `railway postgres pitr enable --service Postgres` +
   `railway postgres pitr schedule set` (daily) for production at minimum.

## Observations / follow-ups

1. Discord Activity launch during a Railway blackout window fails at
   bootstrap (`/api`, `/socket.io` dead) while already-loaded sessions recover
   normally. Candidate UX fix spec'd separately: maintenance overlay polling
   `/health` with friendly copy (see session notes; not yet implemented).
2. One report of a simultaneous ~1 s hitch in both clients with no server-side
   anomaly (checkpoint cadence steady at ~975 ms, zero socket events,
   match `d710c7a4`, 22:24:21-22:26:14Z). Suspected shared client-side cause
   (same machine/LAN) rather than backend. Unresolved; recheck with clients on
   separate networks.
3. Dashboard Rollback button did not visibly act on a REMOVED deployment;
   verify intended workflow in Railway docs or rely on revert-commit path.
