# Months 13–24 — SFTP Ingestion, Tenancy & Platform Consolidation

## Context

The Observator platform (Months 1–12) was built around **mobile apps pushing data over HTTP**, with
every write path deriving its tenant from a user JWT. That assumption no longer holds.

The client's weather station is a Windows PC running "WindSonic SFTP Logger V16", which writes CSV
files to `/home/wxstation/upload` on an AWS Lightsail box in Sydney and **never authenticates to our
API at all**. Files simply appear. The client has confirmed the mobile apps are out of scope for the
data server — so SFTP file drop becomes the *only* source of truth for incoming data.

This programme does four things:

1. **Build the ingestion pipeline** — the platform currently has no way to accept this data.
2. **Retire mobile, NEP and demo** — purge the demo machinery entirely; comment out (not delete)
   every mobile API and NEP feature, so the codebase reflects the one real data source.
3. **Make it genuinely multi-customer** — a super admin who sees everything, customer organisations
   logging into the same frontend seeing only their own data, with a real roles/permissions system.
4. **Onboard the remaining product lines** — wind alarms, water quality, air quality.

### Verified facts about the incoming data

Measured from 2,434 real files (74,636 rows) on the server — not assumed:

| Fact | Value | Consequence |
|---|---|---|
| Format | `timestamp,direction,speed,units,status` | Plain CSV, **not NMEA** — no NMEA parser needed |
| Naming | `WindSonic_YYYYMMDD_HHMM.csv`, new file per minute | Never appended, never overwritten |
| Header variants | `direction` **and** `direction_deg` both seen | Match aliases by **exact** lowercased equality — `direction` is a substring of `direction_deg` |
| Sample rate | 1 Hz (file rotation is 1/min) | 86,400 rows/day/station |
| Timestamps | ISO 8601 with explicit `+10:00` | No timezone ambiguity |
| Units | `K` = km/h (from `$IIMWV,284,R,001.26,K,A*1D`) | Convert to m/s; handle K/M/N/P |
| Direction | **Relative** to mast (`R` in sentence) | Populate **both** fields — see the heading-offset note below |
| Empty direction | **31.3% of rows** below 0.16 km/h | **Parse to `null`, never `0`**. Trim before the empty check — `Number('  ') === 0` |
| Duplicate timestamps | 280 pairs, genuinely different readings | **No unique index on (device, timestamp)**; parser must not dedupe |
| Data quality | 0 malformed rows, 0 empty speeds | Parser can be strict |
| Upload bug | 61s drift loop uploads files mid-write | ~49% loss — client-side fix; tolerate partial files |

### Decisions taken

- Raw 1 Hz into `MetMeasure`; `source: 'sftp'` + **partial** TTL at 30 days so mobile data is never auto-deleted
- **One `MetRecord` per station per day**, appended via `$inc`
- Ingest worker runs **on the Lightsail box** and **POSTs raw file bytes** — the backend parses
- Ingested files move to an archive dir; unparseable files quarantine; 7-day archive prune
- `Device.type` reuses `'MET-LINK'`; the SFTP account maps to a **pre-registered** device
- Tenant = **customer organisation owning many stations**
- `isSuperAdmin` on `User`; 3 seeded roles with full super-admin CRUD
- SFTP accounts provisioned automatically via a **narrow token-authenticated agent** on the box
- Mobile + NEP: **disabled at module registration, files intact**. Demo: **removed entirely, first**
- Deployment target is **AWS EC2** — write host-agnostic code now, deploy later

### Explicitly out of scope

- **Per-customer subdomains.** One domain; the UI adapts to permissions.
- **Email invitations.** Super admin creates the login directly. `InviteToken` and
  `POST /organizations/me/users/invite` are disabled.
- **The mobile app repos** (`met-link-mob/`, `observator-nep-link-ble/`). Only their server-side APIs
  are switched off.

---

## Target architecture

The worker does **not** parse. It moves bytes; the backend owns the single parser. That keeps one
testable parser, lets a parser fix ship with a backend deploy rather than a fleet-wide agent update,
and makes archived files re-ingestable through a corrected parser.

```
Windows PC (station)         Lightsail (Sydney)                      Backend
 WindSonic ─serial─► Logger ─SFTP─► upload/
                                      │  ① rename → staging/  (atomic, same volume)
                                 ingest-agent
                                      │  ② POST /v1/ingest/met/files  (raw bytes, gzip)
                                      │     Bearer obsi_…                     │
                                      ▼                                       ▼
                              archive/YYYY-MM-DD/  ◄── 2xx           IngestService
                              quarantine/          ◄── 4xx           ├─ MetIngestFile (sha256 idempotency)
                                                                     ├─ parse (server-side)
                                 provision-agent ──poll──►           ├─ upsert day MetRecord (dayKey)
                                 (restricted sudo)                   ├─ insertMany MetMeasure
                                                                     ├─ Device.lastSeenAt
                                                                     └─ ONE MET_MEASURES per request
                                                                          ├─► gateway (skip if backfill)
                                                                          ├─► daily summary (debounced)
                                                                          └─► alert evaluation
```

### New backend files

| Path | Purpose |
|---|---|
| `backend/src/ingest/met-csv/{columns,units,parse-met-csv}.ts` | Pure parser — no Nest, no DB, unit-testable |
| `backend/src/ingest/{ingest.module,ingest.controller,ingest.service,dto}.ts` | `POST /v1/ingest/met/files` |
| `backend/src/models/ServiceCredential.ts` | Machine token — `ShareToken` shape, but **hashed** |
| `backend/src/models/MetIngestFile.ts` | Idempotency ledger + per-file provenance |
| `backend/src/models/StationAccount.ts` | SFTP account ↔ organisation + device |
| `backend/src/models/Role.ts` | Named role + permission list |
| `backend/src/common/guards/{service-credential,permissions}.guard.ts` | Machine auth; permission enforcement |
| `backend/src/common/permissions.ts` | Permission constants — **code, not a collection** |
| `backend/src/utils/tz.util.ts` | Local-day keys and bounds (DST-correct, Node 20 ICU) |
| `ingest-agent/` | Node 20 + TS, systemd on Lightsail. Sibling workspace, same toolchain |

### Model changes

- `MetMeasure` — `+source`, `+`partial TTL, **`−{organizationId, tempC}`** (unused index, would cost 26M docs), `−isDemoMode`
- `MetRecord` — `+dayKey` (local date string) with partial unique `{deviceId, dayKey}`, `+source`, `−isDemoMode`
- `Device` — `+availableSensors`, `+sensorsUpdatedAt`, **`+headingOffsetDeg`** (default 0)
- `User` — `+isSuperAdmin`, `+roleId`. **Keep `role`** as a denormalised mirror — the JWT, `RolesGuard`, `publicUser()`, the frontend `Role` union and the last-admin guard all read it
- `Organization` — branding fields. **`timezone` already exists**; super admin sets it, customer can change it
- `AuditLog` — `userId` becomes nullable, `+actorType: 'user'|'service'`; enum gains `role`/`serviceCredential`/`station`

### The three seeded roles

Super Admin is a flag, not a role. Roles are global (`organizationId: null`, `isSystem: true`);
custom roles are org-owned.

| Role | Permissions |
|---|---|
| **Organisation Admin** | View, export, manage devices, branding, alerts, own users |
| **Operator** | View, export, acknowledge alerts, edit comments |
| **Viewer** | View and export only |

---

## Month breakdown

### M13 — Demo purge & ingestion foundation
| Week | Deliverable |
|---|---|
| 1 | **Purge all non-production data** — demo rows, seeded devices/records, dummy users and orgs. Drop `isDemoMode` from models, delete seed scripts. Ships as its own PR **before** any ingest work; `demoDeviceFilter` returns `{}` only once the purge has run in *every* environment |
| 2 | `met-csv/` parser + tests against real fixtures: alias registry (exact match), K/M/N/P units, null direction, duplicate timestamps, CRLF, truncated tail, timestamp sanity band |
| 3 | `ServiceCredential` (hashed + `timingSafeEqual`) + guard; `MetIngestFile`; `StationAccount`; `POST /v1/ingest/met/files` with per-file dispositions and explicit `@Throttle` |
| 4 | `ingest-agent`: three stability gates, staging-rename-first, backoff, per-file disposition handling, systemd units. **Map the live `wxstation` account** to a real org + device |

### M14 — Correctness, rollup performance & retention
| Week | Deliverable |
|---|---|
| 1 | Day-record `dayKey` upsert with `$max`/`$min` span widening; `Device.lastSeenAt` + `DEVICE_STATUS`; **one** `MET_MEASURES` per request carrying `dayKeys`/`isBackfill`/`source` |
| 2 | **Rewrite the daily rollup as a Mongo aggregation + debounce** (see risks — the current per-event full-day re-read is production-breaking at 1 Hz) |
| 3 | `source` + partial TTL + `source:'mobile'` backfill; drop the unused index; `MetRecord` retention policy; `availableSensors` self-healing rewrite |
| 4 | Local-day summaries via `tz.util`; fix `parseRange`'s UTC quantisation; DST-length days; backfill `MetDailySummary` |

### M15 — Demo surface removal & mobile/NEP shutdown
| Week | Deliverable |
|---|---|
| 1 | Remove the remaining demo surface from the backend (**213 refs across 26 files**) |
| 2 | Remove the remaining demo surface from the frontend (**63 refs across 17 files**) |
| 3 | Disable mobile sync, the 4 mobile auth endpoints, `MOBILE_ORG_ID`, and the invite path |
| 4 | Disable NEP — analytics, sessions, screens, nav, flags. Unify `importMet` onto `IngestService` |

### M16 — Wind display
| Week | Deliverable |
|---|---|
| 1 | Live wind dial: direction needle + centre speed readout, "uncalibrated" badge while `headingOffsetDeg` is 0 |
| 2 | Typed `met:latest` payload; push-driven updates (today the payload is discarded) |
| 3 | Panel hiding driven by `availableSensors` via one shared hook |
| 4 | Graph stack + analytics pickers intersect with availability; axe + Lighthouse |

### M17 — Alerts & the wind alarm product
| Week | Deliverable |
|---|---|
| 1 | Re-enable `AlertRulesModule`; verify `wind_speed`/`wind_dir` end-to-end |
| 2 | Alert rule UI — thresholds, conditions, recipients |
| 3 | Delivery: in-app, push, email; cooldown and trigger history |
| 4 | Validation against real station data |

### M18 — Roles & permissions
| Week | Deliverable |
|---|---|
| 1 | Permission constants, `Role` model, seed the 3 roles from the existing `capabilities.ts` matrix so both sides agree on day one |
| 2 | `PermissionsGuard` alongside `RolesGuard` (only 9 `@Roles` sites — migrate incrementally); `migrate-roles.ts`, dry-run by default |
| 3 | Role CRUD UI |
| 4 | **Role deletion with reassignment** — usage preflight, replacement dropdown, transactional bulk reassign, last-`user:write` lockout guard |

### M19 — Multi-tenancy & super admin
| Week | Deliverable |
|---|---|
| 1 | `isSuperAdmin` + `POST /auth/switch-org` that **re-points `organizationId` rather than bypassing it**, so no existing filter changes |
| 2 | Org switcher + persistent "acting as" banner; `queryClient.clear()` on switch; fix `refreshAccessToken` teleporting back to the home org |
| 3 | **Super-admin cross-customer stats** — the only queries that deliberately span orgs; own guard, own tests |
| 4 | Customer creation (direct email + password); cross-tenant leak tests on every endpoint |

### M20 — Branding & customer self-service
| Week | Deliverable |
|---|---|
| 1 | Branding model + settings screen |
| 2 | Logo upload (reuse `uploadFile` in `storage.util.ts`), app-shell theming |
| 3 | Accent colour with contrast guard rails (`validate_palette.js`) |
| 4 | Branding on exports and share pages |

### M21 — Automated station provisioning
| Week | Deliverable |
|---|---|
| 1 | Provisioning agent — **job-polling, not an inbound listener** (no open port, no TLS cert, outbound-only credential); separate `kind:'provision'` token |
| 2 | Backend provisioning service + admin UI; `usermod -aG sftpusers` only — **never edit `sshd_config`** |
| 3 | Rotation, revocation, deprovisioning, disk quota; per-station IP allow-list — **blocked on the client supplying fixed IPs; asked three times.** Build the mechanism, leave the list empty |
| 4 | Security review — argument validation in all three layers, script ownership self-check |

### M22 — Water quality ingestion
| Week | Deliverable |
|---|---|
| 1 | Format discovery; parser as a new `ColumnSpec` set |
| 2 | Parser registry keyed by stream type |
| 3 | Screens and analytics |
| 4 | End-to-end validation |

### M23 — Air quality, scale & ops
| Week | Deliverable |
|---|---|
| 1 | Air quality ingestion |
| 2 | Performance at 50+ stations; oplog window under TTL churn |
| 3 | Monitoring, backups, retention automation |
| 4 | Load test by replaying the 2,434 real files at 60× |

### M24 — Hardening & handover
| Week | Deliverable |
|---|---|
| 1 | Security review |
| 2 | Accessibility + Lighthouse budgets |
| 3 | Documentation + runbooks |
| 4 | Delivery report + handover |

Each month ships on a `Month-N` branch with a `deliveryreport-monthN/` folder, matching M1–12.

---

## Implementation notes — verified in the codebase

**Populate both direction fields.** Only two call sites fall back to `windDirRelDeg`
(`daily-summary.util.ts:168`, `analytics.service.ts:165`). Bare `windDirTrueDeg` reads at
`alert-rules/evaluate.ts:28` (wind-direction alerts), `analytics.service.ts:357` (gust history) and
`:1005` (CSV export) would silently go null. Store `windDirRelDeg` **and**
`windDirTrueDeg = (rel + headingOffsetDeg) mod 360`, offset defaulting to 0, badged as uncalibrated
in the UI. **Decide before first ingest** — backfilling a derived column across 26M rows is expensive.

**The rollup must not run per file.** `daily-summary.service.ts:38` → `:79` re-reads the *whole day*
on every `MET_MEASURES` event. At 1,440 events/day that is ~62M document reads/day/station. Emit once
per request, debounce per `(deviceId, dayKey)`, and replace the in-Node reduce with a `$group`
aggregation.

**Emit or the platform goes silent.** That one emit drives the gateway, the rollup and alerts.
`import.service.ts importMet` doesn't emit it — don't copy that path; unify it instead.

**Reject unknown SFTP accounts.** Deriving a device from the account string means a typo silently
creates an orphan station with no owner. Mapping is pre-registered by provisioning; unknown accounts
return `UNKNOWN_STATION`.

**One record per day has three consequences** — `exportRecordCsv` string-joins every measure (OOM at
86,400), `getMeasures` defaults to `limit: 1000` (87 pages/day), and `deleteRecord` does a synchronous
`deleteMany`. All three need paging/streaming before the grain change lands.

**Timestamp sanity band.** `parseImportTimestampMs('20260820')` matches `/^-?\d+$/` and returns
January 1970. Reject anything outside `[2020-01-01, now + 48h]` — this also catches a dead station RTC,
which would otherwise pin `getMetLatest` to a future reading forever.

**`MetIngestFile` TTL must outlive the measure TTL** (45d vs 30d), or a file whose measures expired
could be re-ingested from a stale archive and resurrect deleted data.

**`trust proxy` is never set** in `main.ts`, so `req.ip` is the proxy behind a load balancer and any
CIDR allow-list is meaningless. Configure it or make the check log-only until it is.

**`NoNewPrivileges` and `sudo` are mutually exclusive** in one systemd unit — split ingest and
provisioning into two units. The provisioning script must be `root:root 0500` and **not writable by
the agent user**, with a startup self-check that refuses to run otherwise.

**Every new screen needs translation keys.** `next-intl` + `messages/en.json`, and
`test/i18n-keys.test.ts` fails the build on a missing key. Applies to M16, M18, M19, M20.

**Leave the open day-record's `dateEndMs` null.** `daily-summary.service.ts:64-77` matches
`dateEndMs == null OR >= dayStart`; a too-narrow end silently produces no summary.

**Disable at module registration, not inside files.** `app.module.ts:22-26` is the precedent.
Commenting inside a file stops TypeScript checking it, so it won't compile when re-enabled.

**Other confirmed traps** — `splitCsv` is quote-unaware and `Math.min(...tsList)` throws past ~100k
args (a day is 86,400); `MetMeasureDownsampled` has zero readers and writers; `use-scope.ts:83-93`
documents an infinite-refetch trap; no scheduler exists anywhere; models are plain Mongoose so the
worker connects itself; `AuditLog` actor throws synchronously on a non-ObjectId.

---

## Verification

**Parser** — unit tests against real fixtures: both header variants, 31% null direction, the 280
duplicate timestamps, CRLF, truncated tail, out-of-range timestamps.

**Ingestion** — replay a copy of `/home/wxstation/upload`; assert exact row counts, nulls preserved
(not zeros), correct km/h→m/s, one `MetRecord` per station per local day.

**Crash safety** — `SIGKILL` the agent between POST and archive, and kill the backend mid-insert;
assert no duplicates and no loss on restart.

**Rollup performance** — replay at 60× against one station and assert rollup p95 stays flat as the
day fills. This is the regression that matters most.

**Event fan-out** — `met:latest` reaches a subscribed client, `MetDailySummary` lands on the correct
**local** day (including both Sydney DST transition days, expecting 82,800 and 90,000 samples), and an
armed wind threshold fires.

**Retention** — the partial TTL expires only `source:'sftp'` rows.

**Tenancy** — a customer token gets 403/empty on every endpoint for another customer's data; an org
switch followed by a token refresh must not teleport back; the query cache must be empty after a switch.

**Demo purge** — zero demo rows, no seeded users or orgs, no `isDemoMode` reference in either codebase.

**Regression** — `npm test`, `yarn test`, `yarn e2e` (axe zero-tolerance), `npm run check:swagger`,
`yarn validate-palette`, `test/i18n-keys.test.ts`.

---

## Risks

| Risk | Mitigation |
|---|---|
| **Rollup recompute is O(day²)** — would break production at 1 Hz | Debounce + `$group` aggregation, M14 W2. Load-test at 60× before go-live. |
| **`windDirTrueDeg` null blanks the compass, alerts, gusts and exports** | `headingOffsetDeg`, populate both fields. Decide before first ingest. |
| **Provisioning is remote code execution by design** | Validate `^[a-z][a-z0-9_-]{2,31}$` in all three layers; script `root:root 0500`; job-polling not inbound; never touch `sshd_config`; separate credential; rate-limited. |
| **Cross-tenant leak on org switch** | Re-point rather than bypass the filter; `assumedOrganizationId` on the refresh token; `queryClient.clear()`; e2e assertion. |
| Local-day migration silently drops the first day of every range | `parseRange` quantises in UTC — fix with `dateKey` and test DST days explicitly. |
| Storage/TTL churn (864k inserts + 864k deletes/day at 10 stations) | Drop the unused index; size the cluster deliberately; monitor the oplog window. |
| Double-ingest or lost file on crash | Staging-rename-first + sha256 unique index + pending-takeover range delete. |
| A poison file blocks the queue | Per-file dispositions; rejected → quarantine, never retried; depth metric. |
| Truncated files lose data | Three stability gates; `truncatedTail` metric; surface completeness on the dashboard. Client-side fix still needed. |
| Station clock drift poisons a day | Sanity band; clamp `$max`; cross-check timestamps against the filename minute. |
| Demo purge order | Purge data **before** removing `demoDeviceFilter`, in every environment. Dry-run against a restored snapshot. |
| A later stream differs in format | **Client confirmed next week's streams match.** Alias registry makes new columns one line each. |
