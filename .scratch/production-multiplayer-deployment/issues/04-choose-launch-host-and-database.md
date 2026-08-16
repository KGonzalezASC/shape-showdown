# Choose the launch host and database

Type: research
Status: open
Blocked by: 01, 02

## Question

Which US launch combination offers the best measured value for the control service, in-process match runtimes, and Postgres? Compare Railway, Lightsail, Fly.io, Azure student credit where useful, and other credible candidates using the agreed reliability contract, resource measurements, bandwidth, WebSocket behavior, deployment restarts, static egress, rollback, and post-credit cost.

## Decision (provisional)

Select this launch topology:

| Layer | Selection |
| --- | --- |
| Static client | Cloudflare Pages |
| Control/game service | Railway US East Metal, Virginia |
| Database | Railway Postgres, colocated in Virginia |
| Database networking | Railway private network |
| Staging tier | Railway Hobby |
| Public-production budget | Assume Railway Pro’s $20 minimum |
| Regional runtimes | Deferred to ticket 08 behind a provider-neutral allocator |

### Discord mappings

Finite, stable mappings only (ticket 03). Raw Edgegap/Fly-generated hostnames remain prohibited for Discord clients.

| Activity path | Target |
| --- | --- |
| `/` | Cloudflare Pages production hostname |
| `/socket.io` | Railway game-service hostname |
| `/api` | Railway game-service hostname when introduced |

### Why Railway

Railway is selected for launch because it provides:

- A Virginia region
- Documented Socket.IO support
- Generated HTTPS domains
- Isolated development, staging, and production environments
- Private service-to-Postgres networking
- Health-gated deployments
- Configurable SIGTERM drain and deployment overlap
- Application rollback to retained deployments

Railway is **not** selected because it is proven cheapest at scale. It is selected because it appears to offer the best launch balance between operational effort, Bun/Socket.IO fit, and iteration speed.

### Why Cloudflare Pages

The client is already a distinct static artifact. Pages:

- Charges $0 for static asset requests under its current policy
- Keeps client downloads off Railway’s metered egress
- Allows UI releases without replacing the authoritative process
- Provides preview and production deployments

Pages does **not** reduce Socket.IO gameplay traffic. That remains Railway egress.

### Measured cost implication (from ticket 02)

Ticket 02 measured a conservative uncompressed fanout of approximately **300 KB/s per match** (~277 KB/s fanout upper bound in the harness writeup).

Planning ceiling (not a bill forecast):

| Active match-hours | Gameplay egress ceiling | Railway egress (order-of-magnitude) |
| --- | --- | --- |
| 100 | ~100 GB | ~$5 |
| 500 | ~500 GB | ~$25 |
| 1,000 | ~1 TB | ~$50 |

Socket.IO compression and narrower public snapshots may reduce this materially.

**Conclusion:** bandwidth is the first measured cost pressure. Incremental match CPU and memory are currently much smaller.

### Why the alternatives lost

| Alternative | Reason it lost for launch |
| --- | --- |
| DigitalOcean App Platform + managed Postgres | Strongest runner-up at roughly $25–27 base; database is genuinely managed, but long-duration Socket.IO behavior still needs proof |
| Lightsail + managed Postgres | Roughly $22–27 with excellent included transfer, but requires OS, proxy, deployment, and monitoring administration |
| Fly + Fly Managed Postgres | Central stack begins around $47; retain Fly Machines as a later regional-runtime candidate (ticket 08) |
| Azure/DigitalOcean student credit | Useful for experiments, but temporary credit cannot determine the post-credit architecture |

Railway should be **reconsidered** if measured gameplay egress makes a fixed-transfer VPS materially cheaper after including the labor of operating it.

### Accepted limitations

- Railway Postgres is not a fully managed database service.
- One Railway application replica is required while live matches remain in-process.
- Railway rollback restores application code and configuration; it does not reverse database migrations.
- Platform drain settings do not implement stop-admitting, checkpointing, or match restoration for us (tickets 01 / 06 / 09 own those product behaviors).
- Pages and Railway releases require protocol-version compatibility because they deploy independently.
- PgBouncer is not included initially. A bounded Bun connection pool is sufficient until measured connection pressure proves otherwise.

### Remaining staging evidence (keep ticket open)

Keep ticket 04 open until one staging deployment records:

1. Linux Bun idle RSS on Railway
2. One-match and small N-match CPU, memory, and compressed egress
3. A 30–60 minute Socket.IO soak
4. Direct-browser and Discord-mapped RTT to Virginia
5. Twenty-four-hour idle application and Postgres cost
6. A Railway deployment while clients are connected:
   - healthcheck gates the new deployment
   - the old process receives SIGTERM
   - Socket.IO reconnects
   - the service’s generated hostname remains unchanged
7. One Railway application rollback
8. One Postgres backup restore into a non-production environment

**Documentation contradiction to resolve in staging:** Railway’s Socket.IO guide says WebSockets can stay open indefinitely, while another Railway guide says WebSockets have a 15-minute request duration. The soak resolves that.

Full checkpoint restoration against the 15-second reliability budget remains ticket 06/09 work because the isolated match-runtime boundary is not implemented yet.

## Closure verdict

**Provisional selection:** Pages + Railway Virginia + Railway Postgres.

Keep **open** pending the bounded staging measurements above. If those measurements reveal no blocker, close ticket 04. The first public production release and permanent production Discord mappings belong to **ticket 09**’s execution plan.
