# Observator — MET-LINK weather station platform

Ingests weather-station data arriving by SFTP, stores it, and serves it to a
multi-customer admin panel with charts, alerting and export.

> **Start here for handover.** This file is the map. Everything else is linked
> below and marked **current** or **historical**.

## What runs where

```
Windows PC (station)          Lightsail (Sydney)                    Backend + DB
 WindSonic ─serial─► Logger ─SFTP─► upload/<Customer>/<Tower>/
                                       │  ① rename → staging/
                                  ingest-agent ───────POST raw bytes──────►  NestJS API
                                       │                                      ├─ parse (server-side)
                                       ▼                                      ├─ MetRecord (one per day)
                               archive/YYYY-MM-DD/                            ├─ MetMeasure (1 Hz)
                               quarantine/                                    ├─ daily rollup (debounced)
                                                                              └─ alert evaluation
                                  provision-agent ──poll──►                        │
                                  (restricted sudo)                                ▼
                                                                          Next.js admin-web (BFF)
```

| Component | What it is | Docs |
| --- | --- | --- |
| `backend/` | NestJS 10 + Mongoose 8. The API, the parser, the rollups, alerting | [OPERATIONS](backend/OPERATIONS.md) · [SECURITY](backend/SECURITY.md) |
| `admin-web/` | Next.js 15 admin panel. Tokens live in an iron-session cookie, never in the browser | [README](admin-web/README.md) · [RUNBOOK](admin-web/RUNBOOK.md) · [LIGHTHOUSE](admin-web/LIGHTHOUSE.md) · [VERCEL](admin-web/VERCEL.md) |
| `ingest-agent/` | Runs on the ingest box. Moves file bytes to the API. Outbound only | [INSTALL](ingest-agent/INSTALL.md) |
| `provision-agent/` | Creates SFTP accounts and folders. Job-polling, restricted sudo | [INSTALL](provision-agent/deploy/INSTALL.md) · [SECURITY](provision-agent/SECURITY.md) |

`met-link-mob/` and `observator-nep-link-ble/` are the **mobile app repos**. They
are out of scope: their server-side APIs were switched off in M15, and the
directories are here for reference only.

## The five things worth knowing before you touch anything

1. **Nothing on the ingest box is ever deleted.** The client instructed this on
   25 Aug 2026. `archive/` and `quarantine/` grow without bound by design;
   `ingest-agent/src/retention.test.ts` fails the build if a prune is
   reintroduced. If the disk fills, move day-folders to cold storage.

2. **The upload folder is the only routing signal.** The CSVs carry no station
   identifier, so a file's tenant and device come from `(account, folderPath)`.
   Two customers sharing a folder would route one's data to the other, which is
   why the API refuses duplicate folders at creation.

3. **Co-locate the API and the database.** Ingesting one file is 9 round trips and
   ~89% of the time is network latency. The same build carries ~78 stations across
   a WAN and ~664 in-region. See [OPERATIONS](backend/OPERATIONS.md).

4. **`autoIndex` is off in production.** Indexes are applied deliberately by
   `npm run sync:indexes`. With it on, a dropped index came back on the next
   connect.

5. **Mobile and NEP are disabled at module registration, not deleted.** The files
   compile and are still type-checked, so they can be re-enabled. Do not
   "clean up" by deleting them.

## Running it locally

```bash
# backend  (needs MONGO_URI + JWT secrets — see backend/.env.example)
cd backend && npm ci && npm run build && PORT=3100 node dist/main.js

# admin-web
cd admin-web && yarn && BACKEND_URL=http://localhost:3100/v1 PORT=3001 yarn dev
```

Swagger is at `/api` on the backend.

**For the e2e suite, start the backend with `NODE_ENV=test`.** The login rate
limit added in M24 W1 otherwise fails every journey after the tenth sign-in, and
it looks like a broken app rather than a rate limit.

## Tests

| | |
| --- | --- |
| `cd backend && npx jest --config test/jest-e2e.json` | API + policy tests (needs a database) |
| `cd admin-web && yarn vitest run` | 293 unit tests |
| `cd admin-web && npx playwright test` | 40 journeys, incl. axe gates |
| `cd admin-web && yarn lighthouse:auth` | Performance + accessibility budgets |
| `cd ingest-agent && npm test` | Watcher, subdirectory walk, retention guard |

Four of these are **policy tests** that encode a decision rather than a
behaviour, and are worth understanding before editing what they guard:
`retention` (nothing is deleted), `index-hygiene` (one declaration per index, no
redundant prefixes), `throttle-coverage` (no `@Throttle` without its guard), and
`dto-binding` (no request body bound to a type that erases at runtime).

### Known: the backend e2e suite is not green

It carries pre-existing failures from routes commented out in M15 (NEP, mobile
sync, invitations) that older specs still assert, plus MET statistics tests
asserting on demo data purged in M13. They are documented in
[SECURITY.md](backend/SECURITY.md#not-a-security-finding-but-material-for-handover).
The consequence is that the suite cannot currently fail loudly on a real
regression — worth clearing before it is relied on.

## Documentation index

**Current — operational**

| Doc | Covers |
| --- | --- |
| [backend/OPERATIONS.md](backend/OPERATIONS.md) | Runbook: backup/restore, oplog sizing, retention checks, load tests, co-location |
| [backend/SECURITY.md](backend/SECURITY.md) | Platform security review (M24 W1) — findings, fixes, how to re-run |
| [ingest-agent/INSTALL.md](ingest-agent/INSTALL.md) | Install and operate the ingest box |
| [provision-agent/deploy/INSTALL.md](provision-agent/deploy/INSTALL.md) | Install the provisioning agent |
| [provision-agent/SECURITY.md](provision-agent/SECURITY.md) | Provisioning threat model (M21 W4) |
| [admin-web/RUNBOOK.md](admin-web/RUNBOOK.md) | Frontend operations |
| [admin-web/LIGHTHOUSE.md](admin-web/LIGHTHOUSE.md) | Performance + accessibility budgets and the one open CLS gap |
| [admin-web/VERCEL.md](admin-web/VERCEL.md) | Frontend deployment |

**Current — plan and correspondence**

| Doc | Covers |
| --- | --- |
| [months13-24.md](months13-24.md) | The live plan: SFTP ingestion, tenancy, consolidation. Includes newly discovered scope from 26 Aug |
| `CLIENT_REPLY_*.md` | Correspondence with the client, most recent first |
| [creds_&_questions.md](creds_&_questions.md) | Server access details and open questions |
| [deliveryreport-month24/](deliveryreport-month24/MONTH_24_DELIVERY_REPORT.md) | **Final delivery report** — Months 13–24 summary, what was built, and every known gap |

**Historical — kept for context, not maintained**

`plan.md`, `month7.md`, `month8.md` (Months 7–12 frontend plan),
`BACKEND_API_TIMELINE.md` (Months 1–6), `IMPLEMENTATION.md` and
`MOBILE_API_INTEGRATION.md` (mobile integration, now disabled),
`ADMIN_PANEL_DONE.md`, `ADMIN_PANEL_REMAINING.md`,
`DASHBOARD_WIDGETS_GAP_ANALYSIS.md`, `analytics-filters-and-data-plan.md`,
`deliveryreport-month*/`.

These describe a platform whose primary data source was the mobile apps. That
assumption no longer holds — read `months13-24.md` for what is true now.
