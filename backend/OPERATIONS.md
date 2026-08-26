# Running this platform

The failures that actually happen here are **silent**. A full disk on the ingest
box looks exactly like a quiet station. A dead station looks like calm weather. A
TTL that stops deleting just grows. None of them raise an error anywhere, which
is why everything below is a *pull* — something has to go and look.

There is deliberately **no scheduler in this codebase**. Inventing one to send
alerts would add a moving part that itself needs monitoring, so the platform
exposes honest signals and an external prober decides.

## Deploying

The order matters, and one step is easy to miss.

```bash
npm ci && npm run build
npm run sync:indexes          # ← REQUIRED. See below.
NODE_ENV=production node dist/main.js
```

**`npm run sync:indexes` is not optional.** `autoIndex` is off in production
(M24 W1), so nothing creates an index for a new model on its own — a fresh
deploy would run with whatever indexes the database already had, and a new
collection would have none at all. It is create-only by default and safe to
re-run; `--prune` additionally drops indexes no longer declared, and is for the
deliberate case only.

That setting exists because `autoIndex` **resurrects dropped indexes**: an index
removed from the database comes straight back on the next connect unless it is
also removed from the schema, which is how a deliberate index change silently
undid itself in M23 W1. It also cost 13 `createIndexes` round trips at cold
start.

### The API refuses to start in production when

| Condition | Why |
| --- | --- |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` missing, under 32 chars, or still a placeholder | They used to fall back to literals committed in this repo, so a forgotten variable meant anyone reading the source could forge a super-admin token |
| `CORS_ORIGIN` unset | It used to fall back to a wildcard, so a forgotten variable silently served every origin |

Both are deliberate: these are the failures that look like nothing is wrong.

### Also set

- **`TRUST_PROXY`** — the number of proxies in front of the app (`1` for a single
  load balancer). Without it every request appears to come from the balancer and
  per-IP rate limiting buckets the entire customer base together. It is a hop
  count, never `true`: trusting the client-supplied `X-Forwarded-For` lets an
  attacker spoof a fresh IP per request and skip the limiter.
- **`NODE_ENV=production`** — gates all of the above. Note the e2e suite needs
  `NODE_ENV=test` instead, or the login rate limit fails every journey after the
  tenth sign-in.

## The one endpoint to watch

```
GET /v1/platform/health          # platform administrator token
```

Returns `ok` / `warn` / `fail` — **worst wins**, so one failing check is never
averaged away — plus what to do about each. Alert on `data.status`.

| Check | Catches | Why it is not obvious |
|---|---|---|
| `database` | connection lost | — |
| `silentStations` | an active station quiet >15 min | files arrive every minute, so quiet means stopped. **A full disk on the ingest box presents identically.** Revoked and never-yet-reported stations are excluded, or the check becomes noise. |
| `ingestErrors` | files rejected in 24h | a rejected file is quarantined, not lost — but nothing surfaces it |
| `retention` | TTL not deleting | measured as the AGE of the oldest document; absence of a TTL grows the disk until an outage |
| `dayRecordLag` | rollup stopped advancing | measures keep arriving while the dashboard freezes. A **negative** lag is reported as clock skew, not as healthy — a future-dated reading pins the live view until real time catches up |
| `pendingProvisioning` | agent not polling | stations sit inactive and ingest returns `UNKNOWN_STATION` |

## Cron lines worth having

```bash
# Retention is actually happening (exit 1 if not)
npm run check:retention

# Archive growth on the SFTP box — reports, never deletes; fails at 80% disk
/opt/observator/ingest-agent/deploy/archive-report.sh
```

## Backups

```bash
npm run backup:db  -- --out ./backups          # EJSON, type-faithful
npm run restore:db -- --from ./backups/<dir> --to <database>
```

**Rehearse the restore.** The backup wrote plain JSON until M23 W2, which turned
every ObjectId and Date into a string — a restore produced documents that no
longer joined, with no error to show for it. That was found by *running* the
restore, not by reading it. Restore into a scratch database and check that the
references still resolve; `test/backup-restore.e2e-spec.ts` pins the format.

Indexes are **not** restored — the Mongoose models rebuild them on first connect.

## Sizing

Measured at 50 stations, 1 Hz, 30-day retention:

| | |
|---|---|
| Documents (steady state) | 129,600,000 |
| Write rate needed | 50/sec (measured capacity **5,981/sec**, 120× headroom) |
| Oplog volume | **3.6 GB/day** — half the entries are TTL deletes |
| Oplog window (Atlas default 5% of disk) | M10 **3.4 h**, M30 13 h, M40 27 h |

### Co-locate the API and the database

Ingesting one file is **9 database round trips**, and at 76 ms RTT that is **89%
of the total time**. Measured (M23 W4):

| API ↔ database | per file | one server carries |
|---|---|---|
| ~76 ms apart (WAN) | 767 ms | **~78 stations** |
| ~1 ms apart (same region) | ~90 ms | **~664 stations** |

Nothing about the code changes between those rows. Deploying the API in a
different region from Atlas costs an order of magnitude of capacity, and it will
look like a code problem.

**Size the tier for the oplog window, not for the data.** A window shorter than a
resync means a lagging secondary falls off and needs a full initial sync, during
which the primary carries everything.

Two known levers, both measured, neither pulled:

- **45% of every measure is stored nulls** (24 of 39 fields on a wind-only
  station). Removing the schema's `default: null` would roughly halve the largest
  collection *and* cut oplog volume by the same fraction, doubling the window.
  It touches the hottest write path and ~30 read sites, so it needs its own
  verification pass.
- Atlas caches `collStats`, so **on-disk size could not be measured from the
  application**. Take it from the Atlas metrics view before sizing.

## Things that look broken but are not

- **Stations silent on a dev box** — no agent is running. Expected.
- **A dropped index reappearing** — `autoIndex` recreates it from the schema on
  the next connect, so an index must be removed from BOTH. It is now off when
  `NODE_ENV=production`; indexes there are applied by the migration scripts,
  where a change is reviewable. It also costs 13 `createIndexes` round trips at
  cold start.
- **A station's stream type change not taking effect** — the station cache holds
  it for 60 seconds.

## Load tests

```bash
npm run loadtest:rollup -- --rows 86400   # a full day at 1 Hz
npm run loadtest:ingest -- --files 1440   # a day of files at 60×
```

Both print a verdict. What they are actually guarding:

- **Rollup must stay FLAT as a day fills.** Before M14 W2 the summary re-read the
  whole day on every event — correct, but linear in how full the day already was.
  Measured at a full day: **86,400 rows in the same 286 ms as 8,640**.
- **Per-file ingest cost must not rise as the day fills.** That is what the M23
  W1 index fix addressed. Measured p95 **flat across a whole day** of files.

Neither regression can be caught by a functional test: a slow rollup is still a
correct rollup.
