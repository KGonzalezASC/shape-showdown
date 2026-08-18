# Publish the decision-complete production architecture

Type: task
Status: closed
Blocked by: none

## Question

Synthesize the resolved decisions into the final architecture specification and phased implementation plan. It must name the launch topology, durable data ownership, reconnect and failure guarantees, client and server build artifacts, deployment workflow, observability, cost envelope, regional allocation path, migration triggers, and remaining explicitly accepted risks.

## Answer

Published [`production-architecture.md`](../production-architecture.md), the decision-complete architecture and phased delivery plan.

The final launch decision is Cloudflare Pages for the static client, one Virginia Railway service with one application replica, and Railway Postgres on the private network. The service owns a registry of isolated two-player `MatchRunner` instances. Postgres owns identity, leases, assignments, tickets, checkpoints, results, migrations, and launch analytics. The query shapes and indexes are cataloged in [`database-queries-catalog.md`](../database-queries-catalog.md).

The document fixes the remaining architecture choices:

- one-second target checkpoint cadence, two retained snapshots, and a versioned full-runtime envelope
- 60-second seat leases, a three-pause or 90-second disconnect budget, and a 15-second process-restore deadline
- Pages and Railway build artifacts, additive migration order, protocol compatibility, health gating, drain, rollback, and secret handling
- structured reliability events, Sentry, Railway resource and billing metrics, and spend alerts
- fixed regional Railway services with finite Discord mappings, Virginia fallback before match start, and no launch-time cross-region live migration
- evidence-based triggers for Redis coordination, additional replicas, analytics export, regional expansion, gateway routing, and a host-cost review

Implementation begins with Phase 1, the durable control plane and database access seams. The gameplay engine remains unchanged.
