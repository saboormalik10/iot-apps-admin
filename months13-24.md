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
4. **Ship the wind alarm product** and build the framework to onboard further streams (water
   quality, air quality) as configuration once their formats actually exist.

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
| Upload bug | ~~61s drift loop uploads files mid-write~~ | **FIXED at source 25 Aug** — logger now uploads at CSV rollover. Keep the stability gates as defence |
| Folder layout | `/upload/<Customer>/<Tower>/` (was flat `/upload/`) | Files live in SUBdirectories; the agent currently skips those entirely |
| Reported unit | ~~`K`~~ → **`M` (m/s) as of logger V67** | Verified on the server 26 Aug: header unchanged, unit letter changed WITH the values, so the existing K/M/N/P handling covers it with no code change |
| Files in the folder | **THREE types, not one**: `WindSonic_*` (11,759), `Environmental_*` (2,087), `EnvDiagnostic_*` (2,056) | Verified 26 Aug. Breaks the one-stream-per-folder assumption — see "Newly discovered scope" below |
| Environmental format | `timestamp,temperature_C,humidity_percent,pressure_hPa`, 1 Hz, ISO 8601 `+10:00` | 47 of 60 seconds populated (~22% gap), consistently. Enough to write the column spec now |
| EnvDiagnostic format | `timestamp,received_time_ms,second,status,sentence,reason` | Per-second `Accepted`/`No data` audit of the environmental sentence. 9,389 vs 2,611 over 200 files — this is where the 22% gap is explained |

### Decisions taken

- Raw 1 Hz into `MetMeasure`; `source: 'sftp'` + **partial** TTL at 30 days so mobile data is never auto-deleted
- **One `MetRecord` per station per day**, appended via `$inc`
- Ingest worker runs **on the Lightsail box** and **POSTs raw file bytes** — the backend parses
- Ingested files move to an archive dir; unparseable files quarantine. **NOTHING IS EVER DELETED** — the
  client confirmed (25 Aug) that uploaded files are kept permanently, even once their readings are in the
  database. `archive/` and `quarantine/` grow without bound by design; `deploy/archive-report.sh` reports
  the growth and warns at 80% disk, but prunes nothing. A `retention.test.ts` policy test fails the build
  if a destructive call or a prune unit is reintroduced
- `Device.type` reuses `'MET-LINK'`; the upload **folder** maps to a **pre-registered** device
- **Routing is by folder, not by account** (client, 25 Aug): `/upload/<Customer>/<Tower>/`. One SFTP
  account per CUSTOMER; each tower is a subfolder. Devices have no public IPs, so the target folder is
  the only routing signal. Station key is `(account, folderPath)`, never `account` alone
- Tenant = **customer organisation owning many stations**; the customer folder IS the tenancy key
- **Store the reported unit and display it.** The sensor's own unit (K/M/N/P) is shown as sent; the
  normalised m/s stays the base for alarms and aggregates. `MetMeasure` already holds m/s, km/h and
  knots — only the reported code needs persisting
- **SFTP is the only transport** for this engagement. MQTT/HTTPS/FTP exist on their side but are
  deferred until a customer needs one
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
 WindSonic ─serial─► Logger ─SFTP─► upload/<Customer>/<Tower>/
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
| 1 | ✅ **DONE** — purged all non-production data (52,308 rows; org preserved), re-seeded logins, deleted demo seeders, made e2e credentials env-overridable. `isDemoMode` field removal moved to M15 W1, where its 213 dependent refs are removed |
| 2 | ✅ **DONE** — `met-csv/` parser + tests against real fixtures: exact-match alias registry (`direction` must not swallow `direction_deg`), K/M/N/P units, null direction never 0, duplicate timestamps preserved, CRLF, truncated tail, timestamp sanity band |
| 3 | ✅ **DONE** — `ServiceCredential` (hashed + `timingSafeEqual`) + guard; `MetIngestFile` idempotency ledger; `StationAccount`; `POST /v1/ingest/met/files` with per-file dispositions and explicit `@Throttle`. **`StationAccount` is re-keyed in M19 W5** for the folder layout |
| 4 | ✅ **DONE** — `ingest-agent`: three stability gates, staging-rename-first, backoff, per-file dispositions, systemd units; `--once` fixed (mtime age alone now suffices). **Walks only the top level — M19 W5 adds subdirectory descent** |

### M14 — Correctness, rollup performance & retention
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — `Device.lastSeenAt` + `DEVICE_STATUS`; one `MET_MEASURES` per request with `dayKeys`/`isBackfill`/`timezone`; rollup iterates every touched local day; `headingOffsetDeg` derives `windDirTrueDeg`; `availableSensors` maintained |
| 2 | ✅ **DONE** — rollup computed in MongoDB (equivalence proven field-for-field on 86,400 real rows) + per-(device,day) debounce with a 5-min ceiling. Measured 9.5s → 2.6s per recompute, and 1,440 → ~288 recomputes/day |
| 3 | ✅ **DONE** — partial 30-day TTL on `source:'sftp'` (mobile untouched) + 35-day companion TTL on `MetRecord`; `source` backfill; dropped the unused `{organizationId,tempC}` index; `availableSensors` self-heals over a 7-day window |
| 4 | ✅ **DONE** — summaries re-keyed on the local date string (found and fixed a duplicate-row bug); `parseRange` timezone-aware (was silently dropping the first day of every range); backfill walks local days; 6 regression tests |

### M15 — Demo surface removal & mobile/NEP shutdown
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — demo scoping removed from the backend (251 refs across 26 files → 0); deleted `demo-scope.util.ts` + its spec; dropped `isDemoMode` from 3 models and its dead indexes; API smoke-tested |
| 2 | ✅ **DONE** — demo surface removed from the frontend (63 refs across 15 files → 0); both scope-bar toggles, the `demo` URL param, demo columns/badges and 7 orphaned imports. 119 tests pass, build clean |
| 3 | ✅ **DONE** — 10 routes disabled (4 sync, 4 mobile auth, 2 invite); `SyncController` unregistered while keeping `SyncService` for ImportModule; `MOBILE_ORG_ID` documented as unused; invite UI flag-gated pending M19 W4 |
| 4 | ✅ **DONE** — NEP disabled across 22 routes (116 → 78 total); `SyncModule` fully unregistered once `importNep` went; `importMet` unified onto `IngestService` — verified it now produces a day record, ledger entry AND daily summary, none of which it did before |

### M16 — Wind display
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — `WindDial` (compass ring + needle + hero speed, Beaufort band, uncalibrated caption); 12 tests; rendered and visually corrected two layout bugs; `headingOffsetDeg` now travels with `MetLatest` |
| 2 | ✅ **DONE** — `MetLatestPayload` typed on both sides; `met:latest` now merges straight into the cache instead of triggering a refetch, so the dial updates on the event rather than a round trip later; 5 tests |
| 3 | ✅ **DONE** — `useDeviceSensors` is the single source; live tiles, the graph stack and both analytics pickers now hide what the station does not report. Fails open so nothing vanishes before the list loads; 7 tests |
| 4 | ✅ **DONE** — comfort/fog/pressure panels gated on their inputs; fixed a CRITICAL axe violation in 4 instruments (`role=meter` with no `aria-valuenow`); fixed the parser dropping the last row of every admin import; MET export now round-trips. 11/11 e2e incl. 3 axe gates |

### M17 — Alerts & the wind alarm product
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — `AlertRulesModule` re-registered, `alerts` flag + nav on. Proved end-to-end: SFTP ingest of 25 km/h fired a 2 m/s rule (6.956 m/s), fanned out to all 4 users; a calm batch triggered nothing |
| 2 | ✅ **DONE** — the M11 builder already covered thresholds/conditions/recipients, so this closed its gaps: sensor list now intersects device `availableSensors` (was offering 4 rules that could never fire), default app type MET, NEP option gated; 7 tests |
| 3 | ✅ **DONE** — feed/realtime/push already existed; added the missing **email** channel (per-recipient, `allSettled`, never awaited into the alert path). Cooldown + 50-entry history capped and tested; 7 tests |
| 4 | ✅ **DONE** — validating against 399 real files exposed a product defect: the evaluator used only the LAST reading per upload, missing the peak in **86.7%** of files. Alarms now evaluate the batch peak/trough per condition; a 40 km/h mid-file gust with a calm final second is caught |

### M18 — Roles & permissions
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — 22-permission catalogue in code (not a collection), `Role` model with partial-unique keys + soft delete, `User.roleId`/`isSuperAdmin`, migration applied (3 system roles, 4 users attached, super admin promoted); 16 tests |
| 2 | ✅ **DONE** — `PermissionsGuard` + `@RequirePermissions`; JWT carries `perms`/`sup`; all 8 live `@Roles` sites paired. Guard ordered BEFORE `RolesGuard` so permissions actually decide (first attempt was shadowed and inert); destructive grants re-read from the DB; 10 tests |
| 3 | ✅ **DONE** — roles screen + permission editor driven by the server's catalogue; wired the `perms`/`sup` JWT claims into the client (M18 W2 added them but nothing read them, so the UI still gated on the legacy 3-role matrix). Found and fixed three real defects: PATCH reused the create DTO so a permissions-only update failed on a missing name; no user-creation path set `roleId`; and a role change left `roleId` pointing at the old role. 22 backend + 16 frontend + 5 e2e tests |
| 4 | ✅ **DONE** — `DELETE /v1/roles/:id` with a usage preflight that returns the count AND the replacement options in one call; holders are moved and the role soft-deleted inside ONE transaction, updating `roleId` and the legacy `role` key together. Guards: 409 `ROLE_IN_USE` without a replacement, 409 `WOULD_LOCK_OUT` if an organisation would be left with nobody holding `user:write`, 404 for another tenant's role. Error envelope gained `details` so the count reaches the client. 9 backend + 9 frontend + 3 e2e tests |

### M19 — Multi-tenancy & super admin
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — `POST /auth/switch-org` re-points the token's `organizationId` at the customer (never bypasses tenancy), plus `GET /organizations` for the switcher. Super-admin status is re-read from the DB, not the token, and an existing assumption is DROPPED if the user is demoted. Fixed the refresh teleport here rather than in W2 — a switch that silently reverts within 15 minutes is broken by design — by carrying `assumedOrganizationId` on the refresh token and revoking the one presented. 12 tests |
| 2 | ✅ **DONE** — topbar switcher (renders nothing for a customer, and never calls the 403-ing endpoint) + an unmissable, non-dismissible "acting as" banner above the scope bar on EVERY route. `queryClient.clear()` on switch, not invalidate: every cached query was fetched under the previous org's token, so invalidating would render one customer's data under another's name while refetches land. Switch goes through a BFF route so neither token reaches the browser. Verified live: switched into a customer and every KPI read 0. 13 unit + 4 e2e (incl. axe) |
| 3 | ✅ **DONE** — `GET /v1/platform/overview` + an "All customers" page: totals plus a per-customer breakdown (stations, online, readings 24h, users, alert rules, upload folders) and a `silent` count for customers that own stations but sent nothing in 24h. Own `SuperAdminGuard` applied at CONTROLLER level, deliberately separate from `PermissionsGuard` so "what spans customers?" is answerable by grepping one symbol; re-reads `isSuperAdmin` from the DB and rejects service credentials outright. Every figure is a grouped aggregation — a per-customer loop would be ~250 round trips at 50 customers — and readings sum `MetRecord.measureCount` rather than scanning tens of millions of measures. 15 tests + 3 e2e |
| 4 | ✅ **DONE** — `POST /v1/platform/customers` creates the organisation, its upload folder and an ACTIVE admin in one step (no invite; password set directly and shown once). The organisation is rolled back if the admin cannot be created, so there is never a customer nobody can sign in to; duplicate name/email/folder all refused — two customers sharing a folder would route one's data to the other. `Organization.uploadFolder` added + backfilled, keeping `""` for the customer genuinely on the legacy flat root. Cross-tenant sweep: 7 list endpoints plus get/patch/delete by id, and all three platform routes 403. 20 backend + 9 unit + 1 e2e |
| 5 | ✅ **DONE (done first — it was blocking)** — agent now walks `<Customer>/<Tower>/` (depth-capped at 3) and staging/archive/quarantine MIRROR the tree, so same-named files from two towers no longer collide; batches are grouped per folder, preserving one `MET_MEASURES` emit per device. `StationAccount` re-keyed to `(account, folderPath)`, migration applied live. Reported `unitCode` now persisted on `MetRecord.speedUnitCode` + `Device.reportedSpeedUnit`. Also fixed: the staging/quarantine depth counters were flat `readdir`s that would report a backlog of zero while towers filled up. Verified live — subfolder file ingests 60 rows to the right device, flat layout unchanged, unregistered folder → `UNKNOWN_STATION`, traversal → `INVALID_FOLDER`. 20 + 8 new tests |

### M20 — Branding & customer self-service
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — `branding` subdocument on `Organization` (displayName / logoUrl / accentColor / supportEmail) with `GET`+`PATCH /v1/organizations/me/branding` under `org:write`. Fallbacks resolved SERVER-side so the shell, exports and share pages cannot drift apart; an EMPTY STRING clears a field back to the default, so no separate reset route. Settings card with live swatch, gated so a viewer sees but cannot edit. Found two real bugs: `FormField.errorKey` is a TRANSLATION KEY (plain messages rendered as the key itself) and `type="email"` triggered native validation that BLOCKED submit and hid our styled error. 12 backend + 7 unit + 4 e2e |
| 2 | ✅ **DONE** — `POST`/`DELETE /v1/organizations/me/branding/logo` reusing `uploadFile` (Cloudinary). PNG/JPEG/WebP ≤ 2 MB, validated by MAGIC BYTES not the declared type — verified live that a CSV renamed `.png` is refused. `logoStorageKey` stored so a replacement deletes the old file (new one saved FIRST, so a failed upload never leaves the customer with no logo). Shell now renders the customer's logo + display name, falling back to the wordmark, so a switched platform admin sees whose data they are in. Also fixed a real bug in the shared test harness: `Providers` built a NEW QueryClient on every render, so any interaction refetched and silently overwrote what the user had typed. 14 unit tests |
| 3 | ✅ **DONE** — accent enforced at 4.5:1 for text on it and 3:1 vs BOTH surfaces (a colour that works in light and vanishes in dark is still a broken panel). Maths lifted verbatim from `validate_palette.js`; a shared expected-value table pins client and server so they cannot drift. Foreground DERIVED, never chosen. The shell repaints `--primary`/`--ring` tokens so every control follows without restyling anything. **axe caught a real bug I introduced**: an accent can clear 3:1 vs the page and still fail 4.5:1 on a 10% tint of ITSELF — the active nav item — so `--primary-strong` is now derived by darkening in 2% steps until it passes. Also fixed the success text using `--status-ok` (3.43:1) instead of `ok-strong`. 27 + 14 tests, 3 e2e |
| 4 | ✅ **DONE** — exports carry the customer: `Observator-AU-MET-Link-2026-08-25.csv` plus a `#`-prefixed provenance line (skipped by Excel/Pandas/R, unlike a second header row), applied to the record CSV, analytics export and session ZIP. Public share pages get branding in the PAYLOAD — the recipient has no session, so the page cannot call the authenticated endpoint — carrying name, logo and accent but deliberately **not** `supportEmail`, since a forwarded link would publish it. Share page repaints the same tokens, so it looks like the customer's panel. A test I wrote caught that a newline in a display name would shift the CSV header down. 33 backend + 7 e2e |

### M21 — Automated station provisioning
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — `provision-agent/` (own workspace, zero runtime deps) POLLS `/v1/provision/jobs/claim`; the box exposes no inbound port and holds an outbound-only credential. Separate `kind:'provision'` token enforced by `ProvisionCredentialGuard` — verified live that the ingest token on a provisioning route is refused (and corrected 401 → **403**, since the credential is valid but wrong-kind). Jobs are an ENUM, never a command line; arguments validated in **three** independent layers (API, queue, agent-as-root) so no single check is load-bearing. Claim is atomic (`findOneAndUpdate`) so two agents cannot both `useradd`; lease reclaim, attempt ceiling, and passwords stripped before storage — verified a leaked `SUPERSECRET` does not persist. Own systemd unit because `NoNewPrivileges` and `sudo` are mutually exclusive; helper must be root:root 0500 and the agent refuses to start otherwise. 18 backend + 16 agent tests |
| 2 | ✅ **DONE** — `POST /v1/platform/stations` (super-admin only) creates the device + folder mapping **INACTIVE**, then queues the agent job; ingest already requires `isActive`, so a half-finished provisioning is inert rather than dangerous. The mapping activates only when the agent confirms — verified live: ingest returned `UNKNOWN_STATION` while pending, then `ingested` after. One Unix account per CUSTOMER, a directory per TOWER; the job carries only the tower name since the customer folder is the account's home. Two validators, deliberately different: accounts stay `^[a-z][a-z0-9_-]{2,31}$`, folders accept `Demo Tower` (spaces, capitals). `sshd_config` untouched — documented for one-time manual setup. Stations dialog shows *Receiving* vs *Waiting for the agent*, never conflating them. 28 backend + 11 unit tests |
| 3 | ✅ **DONE** — rotate / revoke / restore, plus per-station disk reporting. **Revoke stops routing IMMEDIATELY**, before the agent runs — waiting for a queue poll to stop accepting a compromised station's data would be the wrong way round — and the account is LOCKED, never deleted, so its files survive. Restore rotates as part of restoring, or the revoked password would come back. Generated passwords are a **one-read secret**, cleared atomically on collection and expired on read; never in the stored result. Disk is **reported, not quota'd**: refusing an upload loses data at the source, and files are retained by instruction — so the control is visibility, matching the archive-report. ~~IP allow-list~~ dropped (no public IPs). 44 backend + 18 agent tests |
| 4 | ✅ **DONE** — review written up in `provision-agent/SECURITY.md` (threat model, control table, findings, how to re-run). A 40-case corpus is now asserted in BOTH the agent and the backend, so a divergence between layers fails the build. Three findings: **sudo's `env_reset` silently stripped the agent's group/root config** — a deployment changing the SFTP group would have broken the sshd chroot with no error, so both are now constants in the root-owned script; the **mode branch of the helper self-check was untestable** (ownership fires first), split into `isSafeOwner`/`isSafeMode`; and **collecting a password was a `GET` that mutated state**, so a proxy prefetch could burn it — now a throttled `POST`. Verified the sudoers rule is one exact path, the provision unit does not set `NoNewPrivileges`, no shell is ever invoked, and no secret is ever logged. 85 backend + 66 agent tests |

### M22 — Multi-stream ingestion framework
Water and air quality are **not** planned as features here: as of 24 Aug the server holds 8,828
files and every one is wind. No water or air format has ever been seen. The client confirmed on
25 Aug that an environmental sensor (temperature/humidity/pressure, format `*,C,21.97,41.98,1003.70,;`)
exists on a second serial port, but it is **not yet written to file** — so the registry deliberately
stays here rather than moving earlier: we build on the data actually in the folder. Instead of guessing a
format, build the capability to onboard *any* new format quickly — so when files do arrive, it is
one to two weeks of configuration rather than a month of discovery.

| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — `ingest/registry/` keyed by stream type; ingest now resolves the parser from `StationAccount.streamType` instead of calling `parseMetCsv` directly, so onboarding a format is a registry entry rather than surgery through `ingest.service`. An unknown type is **rejected** (`UNKNOWN_STREAM_TYPE`), never fallen back to wind — verified live, since parsing a water-quality file as wind would store nonsense that looks like data. Re-registering a key THROWS: two modules disagreeing about how a customer's files are read, with load order deciding, is the worst failure available here. `StreamType` model separates operator metadata from the parser (code, reviewable) and the seed script refuses to seed a type whose parser is missing. Documented that the 60s station cache delays a stream-type change — which is exactly how it looks when you test one. 12 tests |
| 2 | ✅ **DONE** — `registry/column-spec.ts` describes a stream's format as DATA; `createColumnIndex()` builds a per-stream alias index, and the real MET spec was moved onto it (65 parser tests unchanged, then verified live that `direction`, `direction_deg` and `dir` all still parse and an unknown column degrades gracefully). Adding a sensor is now one array entry — asserted literally by a test that onboards turbidity/pH with **no parser code at all**. Indexes are PER STREAM, not global, so one stream's `temperature` cannot claim another's; a colliding alias THROWS at load time, since finding it while reading a customer's file means attributing readings to the wrong field. Columns are published through the registry for W3's preview screen. 14 tests |
| 3 | ✅ **DONE** — `/stream-types` (platform admins only) lists each type with the exact header cells it accepts, so a header can be checked BEFORE a station is pointed at it. `POST /platform/stream-types/preview` parses a sample and reports what would be stored — and **writes nothing**, asserted by a test that counts `MetMeasure` before and after. Ignored columns are **NAMED**, not silently dropped: that is the answer to "why is my salinity sensor missing?", verified live. A type whose parser is missing is flagged `parserAvailable: false` rather than accepting stations and then rejecting every file. A pasted sample is treated as COMPLETE, unlike an SFTP file where a missing terminator means the logger was still writing. 17 backend + 9 unit + 5 e2e (incl. axe) |
| 4 | ✅ **DONE** — `POST /import/met/dry-run` reports what an import would do and **writes nothing** (asserted by counting measures, records AND the ledger before/after). Reuses the SAME parser and content hash as the real path, so the answer cannot drift. The wizard's review is now joined by the server's, answering the two things the browser cannot: whether these exact bytes were already ingested, and which LOCAL days already hold data. Verified live: dry run → import → dry run again correctly flips to `rowsWouldInsert: 0` with the original filename and time. Fixed three real defects it exposed — the wizard defaulted to NEP (disabled since M15), `detectKind` did not recognise the station's own header so every real WindSonic file fell through to "unknown", and the review claimed "MET imports are not de-duplicated" while the server said the opposite. 12 backend + 13 unit tests |

### M23 — Scale, ops & monitoring
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — profiled every hot query with `explain`; all IXSCAN, no collection scans. **Found the ingest day lookup scanning**: `{deviceId, dayKey}` is unique PARTIAL on `$type`, which MongoDB will not use for an equality on a string literal — the planner never even considered it, so every uploaded file scanned that device's whole day history (~365 keys after a year, 1,440×/day/station). Added a plain compound index: **8 keys examined → 1**. Dropped 3 redundant indexes (a non-unique prefix on the 130M-row collection; a unique index implied by a stronger one; one never queried) — and learned they must be removed from the **Mongoose schema** too, since `autoIndex` recreated them from the declaration. `query-plans.e2e-spec.ts` now guards both, verified to fail when a redundant index is re-added. Measured 5,981 inserts/sec vs 50/sec needed = **120× headroom**. 6 tests |
| 2 | ✅ **DONE** — **the rehearsal found the backup was not restorable.** `backup-db` serialised with `JSON.stringify`, turning every ObjectId and Date into a string; its documented restore used `mongoimport`, which is not installed — the very reason that script exists — so the path had never been run. A restore would have rebuilt documents whose `_id` and foreign keys were STRINGS: no error, just data that no longer joins. Backup now writes EJSON, and `restore-db.ts` exists, guards against a production-looking target, and was **actually executed**: 5,293 docs / 32 collections restored, counts matched, and all four reference chains verified to still join. Oplog: Atlas denies `local.oplog.rs`, so the volume was computed instead — **3.6 GB/day at 50 stations** (TTL deletes add 0.53 GB and double the entry count). At Atlas's default 5%-of-disk oplog that is a **3.4-hour window on M10** — dangerous — and 27 h on M40. 8 tests |
| 3 | ✅ **DONE** — `GET /v1/platform/health` (super-admin) checks the SILENT failures specifically: a station quiet >15 min (**which is indistinguishable from a full disk on the ingest box**, and the action says so), files rejected in 24h, a TTL that has stopped deleting (measured as the AGE of the oldest document), a rollup that has stopped advancing, and stations waiting on an agent. Worst-wins status; every non-ok check must carry an ACTION, asserted by a test. Pull-based deliberately — there is no scheduler here, and adding one to send alerts would be a moving part that itself needs monitoring. `check:retention` exits non-zero and was verified to fail when a TTL is dropped. Found and fixed the lag check reporting **−193 minutes as healthy** — a future-dated reading is a station clock ahead, which pins the live view until real time catches up. `OPERATIONS.md` written. 9 tests |
| 4 | ✅ **DONE** — both harnesses report FLAT, which was the point: the rollup does a full day (86,400 rows) in the **same 286 ms as 8,640**, and per-file ingest p95 does not rise as the day fills (1,147 ms first bucket → 718 ms last). The interesting result was WHERE the time goes: one file is **9 database round trips**, and at 76 ms RTT that is **89% of the elapsed time** — so capacity is set by API↔database distance, not by code. Same build: **~78 stations across a WAN, ~664 co-located.** That is now a stated deployment requirement, because getting it wrong looks exactly like a performance bug. Instrumenting it exposed `autoIndex` running in production: **13 `createIndexes` at cold start, and the mechanism that RESURRECTED the indexes deliberately dropped in W1.** Turned off for production and replaced with `npm run sync:indexes` (create-only by default — a silently vanishing index is worse than a spare one), verified against the live database as `created 0 dropped 0`. It immediately found **3 indexes declared twice** (inline `unique` *and* `schema.index()`), i.e. the W1 trap in miniature: deleting the visible declaration would not have removed the index. Consolidated, with an `index-hygiene` policy test guarding both duplicates and prefix-redundancy — **both guards verified to fail** when a violation is re-added. Separately found the share e2e had been **dead since the M15 W4 NEP shutdown** (it fetched a disabled route, so every assertion failed on an undefined id) — meaning M20 W4's branded public page shipped with no cover. Re-pointed at MET and added a **wire-level** assertion that `supportEmail` never reaches a stranger, also verified to fire. 2 + 5 tests |

### M24 — Hardening & handover
| Week | Deliverable |
|---|---|
| 1 | ✅ **DONE** — platform-wide review (provisioning had its own in M21 W4), written up in `backend/SECURITY.md`; every finding reproduced against a running server before fixing and re-verified after. **Critical: JWT secrets fell back to literals committed in this repo** (`'fallback_access_secret'`), so a deploy that merely forgot the variable would sign real tokens with a public key and anyone reading the source could forge one — `sup: true` included — with nothing looking wrong. Production now refuses to start on a missing, short, or placeholder secret (the `CHANGE_ME_…` values in `.env.example` are equally public, so they are rejected too). **High: `POST /auth/login` had no rate limiting at all** — it carried `@Throttle` and advertised "10 requests/min" in Swagger, but `ThrottlerGuard` is not global here and auth never applied it, so the decorator configured a guard that never ran. Measured **30 failed logins → 30×401, zero 429**; the same test on `/v1/public` (which does apply the guard) gave 30×404 then 10×429, proving the mechanism worked and was simply unattached. After: **10×401 then 20×429**, legitimate login unaffected. **High: 11 request bodies validated nothing** — bound to interfaces and inline object literals, which erase at runtime, so `ValidationPipe` had no metatype; `{"email":{"$ne":null}}` reached `input.email.toLowerCase()` and returned a 500 leaking the internal message. The Mongo operator never hit a query, but only by accident. This was the **third** defect of that exact shape (M19's `SwitchOrgDto` no-op was the first). Also fixed: **no password policy on registration or reset** (both documented 8 chars, neither enforced it), **CORS falling back to a wildcard** when `CORS_ORIGIN` was unset, **`trust proxy` unset** so per-IP limits bucket everyone behind a balancer together (set as a HOP COUNT, never `true` — that trusts client-supplied `X-Forwarded-For`), and **bcrypt cost 10 on the customer-admin creation path** vs 12 everywhere else, so each new customer's most privileged account got the weakest hash. Dependencies 31 → 25 advisories (high 8 → 4); the remaining direct high is multer, whose fix is a NestJS 10→11 major and is documented as a client decision with its mitigations. Two policy tests added — `throttle-coverage` and `dto-binding` — **both verified to fail** when the defect is reintroduced. Recorded for handover: the e2e suite carries **26 pre-existing failures** from the M15 shutdown and M13 demo purge, none from this work, which means it cannot currently fail loudly on a real regression. 4 tests |
| 2 | ✅ **DONE** — the budget was gating a **dead route**: `/sessions`, disabled in M15 W4 and flag-gated out of the nav, while every route built in M16–M23 had none. Now 9 real routes, all passing. **Accessibility reached 1.00 on all nine (from 0.95–0.97) with zero failing audits**, via three real fixes the existing e2e axe gates could not see because none covered the shell or `/org`: `label-content-name-mismatch` on **all 8** authenticated routes (the palette trigger showed `Search ⌘K` but was named "Search devices…", and the user menu showed initials but was named "User menu") — `aria-hidden` is NOT a fix, since WCAG 2.5.3 protects speech-input users who say what they SEE, so it counts visually rendered text regardless; `color-contrast` at **2.77:1** in dark mode, because `strongStepFor` only ever DARKENED (correct on white, moves text toward its own background on dark) and derived against the page surface when the tinted nav item sits on the **card** — fixed per-surface and emitted for all three theme selectors, the `prefers-color-scheme` one having been missing entirely so system-dark viewers got the light value; and two **critical** `button-name`/`label` failures on the `/org` audit filters, whose `<label>`s had no `htmlFor`. Dashboard **CLS 0.388 → 0.154**. The prior write-up was wrong twice: it recorded 0.12 (the lucky run of 0.388/0.117/0.391) and blamed a component disabled since M15 — re-measuring with a PerformanceObserver plus per-section height sampling found **four** contributors, of which the named one was not the largest. Fixed a KPI skeleton 66px short of its loaded row, a `dynamic()` map fallback that escaped its own height reservation, a spinner→grid swap, and a wind rose that grew 236px. My first skeleton attempt made it **worse** (0.556) — `show()` fails open, so it painted all 11 tiles then shrank; it now waits on a new `sensors.resolved` flag. Also caught a **regression from W1**: the login throttle broke the Playwright suite (36 failed / 4 passed) because its backend has no `NODE_ENV`, so `skipIf` never fired — documented, and 40/40 e2e now pass. Remaining CLS needs a server-side devices prefetch, written up with the exact fix. 8 tests |
| 3 | ✅ **DONE** — the biggest gap was that **`ingest-agent/` had NO documentation at all**: no README, no install guide, despite being the component that runs on the client's server and does the actual ingesting (`provision-agent/`, far less critical, had both). Wrote `ingest-agent/INSTALL.md` — install, the two-unit split and why `NoNewPrivileges` makes merging them impossible, every env var with its default, the per-file disposition table (`ingested`/`duplicate`→archive, `rejected`→quarantine never retried, `retry`→left), health checks, and a symptom→cause table. It opens with a **hazard warning**: the agent picks up every `.csv`, so pointing it at the live folder today silently corrupts data — 2,056 `EnvDiagnostic` files would insert ~60 all-null measures a minute and `Environmental` files lose humidity to an exact-match alias miss. Added a top-level `README.md` orienting the whole repo, since 48 markdown files existed with nothing saying which were true — it classifies each as **current** or **historical** (most describe a platform whose primary data source was the mobile apps, an assumption that no longer holds), names the five things to know before touching anything, and flags the four **policy** tests that encode a decision rather than a behaviour. Added a **Deploying** section to `OPERATIONS.md`: `npm run sync:indexes` is now a REQUIRED deploy step, because turning `autoIndex` off in W1 means a fresh deploy creates no indexes at all — the kind of omission that looks like nothing is wrong. Verified rather than asserted: every documented command run (27 ingest-agent tests, typecheck), every internal link resolved across five docs, and the production start-up refusals re-tested — empty `CORS_ORIGIN` refuses, a set one starts. |
| 4 | ✅ **DONE** — `deliveryreport-month24/MONTH_24_DELIVERY_REPORT.md`, matching the M1–12 format and closing the programme. Covers the month in full (the critical forgeable-token defect, the unguarded login endpoint with its before/after measurements and the control experiment that proved the mechanism worked, the eleven unvalidated bodies, accessibility 0.95–0.97 → **1.00 on all nine routes**, CLS 0.388 → 0.154, and the documentation gap where the ingest agent had none at all), plus a **Months 13–24 programme summary** — one line per month with the measured results, and the two themes worth carrying forward: measuring found what reading could not (the M17 alarm defect, the M23 unrestorable backup, the M23 unusable index, this month's inert rate limit — all invisible to review and unit tests), and the client's own server was repeatedly the best source of truth. Platform as delivered: **124 live routes** (15 deliberately disabled, files intact), 21 modules, 29 panel routes, **956 tests** across five suites. **Known gaps listed plainly rather than omitted**: the three-file-type discovery that blocks enabling the agent, 26 pre-existing backend test failures from the M15/M13 shutdowns, the dashboard CLS carve-out with its exact fix, the folder migration we committed to in writing and did not perform, and four decisions left to Observator (Nest 11, the 45% stored nulls, live-display latency, EnvDiagnostic). Every link verified; report indexed from the README. |

Each month ships on a `Month-N` branch with a `deliveryreport-monthN/` folder, matching M1–12.

---

## Newly discovered scope — 26 Aug 2026

Verified directly on the ingest server, not reported by the client. The station's
folder now carries **three** file types where the whole design assumed one, and
the agent already picks up **every `.csv`** (`ingest-agent/src/paths.ts:110`). So
the moment the agent runs against this folder it ingests 4,143 files that are not
wind data.

Traced through the real parser against the real headers:

| File | Parsed as the wind stream today | Result |
|---|---|---|
| `WindSonic_*` | all columns match | Correct — unchanged |
| `Environmental_*` | `timestamp` ✓, `temperature_C` → `tempC` ✓, `pressure_hPa` → `pressureHpa` ✓, **`humidity_percent` → NO MATCH** | Ingests, but **humidity is silently dropped** — the alias list has `humidity_pct`, not `humidity_percent` |
| `EnvDiagnostic_*` | `timestamp` ✓, every other column unmatched | **Inserts ~60 all-null measures per minute.** It is not data; it is an audit log |

Neither new file is rejected, because the `NO_TIMESTAMP_COLUMN` guard is the only
hard bail and **both files have a `timestamp` column**. They fail by writing
plausible-looking junk, which is the worst available failure mode here.

### The structural gap

`StationAccount.streamType` is keyed on `(account, folderPath)` — one stream type
per folder (M19 W5 + M22 W1). This deployment puts three streams in ONE folder,
distinguished by **filename prefix**. The model cannot express that today.

### Work required

| # | Item |
|---|---|
| 1 | Route by **filename prefix within a folder**, not folder alone. `StationAccount` gains an ordered prefix→streamType map; an unmatched prefix is **skipped, not ingested as wind** |
| 2 | Register `environmental` as a stream type with its own column spec — the M22 W2 registry makes this a data entry, not a parser |
| 3 | Add `humidity_percent` to the humidity aliases. One line, but it silently loses a sensor today |
| 4 | Decide `EnvDiagnostic_*`: ingest as **sensor health** (it explains the 22% gap and feeds the M23 W3 health endpoint) or skip it entirely. **Client question outstanding** |
| 5 | Backfill: 2,087 environmental files are already on disk and will replay once the prefix routing exists |
| 6 | Move `/upload/Demo Tower` → `/upload/Observator/Demo Tower`. We committed to this in writing (`CLIENT_REPLY_FOLDERS.md`) and it has not been done — the server is still on the flat root. Harmless with one customer (M19 W4 backfilled `uploadFolder: ""` for exactly this case) and blocking the moment a second one arrives. `migrate-org-upload-folder.ts` + `migrate-station-folders.ts` exist |

Item 1 is the blocking one — until it lands, pointing the agent at this folder
actively corrupts the device's data. Items 2–3 are configuration. Item 4 is the
only one waiting on the client.

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

**`trust proxy` is never set** in `main.ts`, so `req.ip` is the proxy behind a load balancer. This no
longer blocks anything — the IP allow-list was dropped once the client confirmed their devices have no
public IPs — but rate limiting still buckets every request under the proxy's address until it is set.

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
| **Rollup recompute is O(day²)** — would break production at 1 Hz | **Closed.** Debounce + `$group` aggregation, M14 W2; load-tested at 60× in M23 W4 and measured FLAT — a full 86,400-row day rolls up in the same 286 ms as an eighth of one. `npm run loadtest:rollup` guards it. || **API and database in different regions silently costs an order of magnitude** | Measured M23 W4: ingest is 9 round trips/file and 89% of elapsed time is latency, so the same build carries ~78 stations across a WAN and ~664 co-located. It presents as a slow application, not as a network problem. Co-location is recorded as a deployment requirement in `OPERATIONS.md`. |

| **`windDirTrueDeg` null blanks the compass, alerts, gusts and exports** | `headingOffsetDeg`, populate both fields. Decide before first ingest. |
| **Provisioning is remote code execution by design** | Validate `^[a-z][a-z0-9_-]{2,31}$` in all three layers; script `root:root 0500`; job-polling not inbound; never touch `sshd_config`; separate credential; rate-limited. |
| **Cross-tenant leak on org switch** | Re-point rather than bypass the filter; `assumedOrganizationId` on the refresh token; `queryClient.clear()`; e2e assertion. |
| Local-day migration silently drops the first day of every range | `parseRange` quantises in UTC — fix with `dateKey` and test DST days explicitly. |
| **Oplog window may be hours, not days** | Measured M23 W2: 3.6 GB/day of oplog at 50 stations, half the entries from TTL deletes. Atlas's default oplog is 5% of disk, so an M10 gives ~3.4 h and an M30 ~13 h — shorter than a resync. Size the tier for the WINDOW, or raise the oplog explicitly; note that removing the stored nulls below would cut oplog volume ~45% too, roughly doubling the window. |
| **45% of every measure is stored nulls** | Measured M23 W1: 24 of 39 fields are null on a wind-only station — 638 B/doc vs 352 B without them, i.e. ~35 GB uncompressed at 130M rows. `default: null` in the schema makes Mongoose persist them. Dropping the defaults would halve the largest collection, but it touches the hottest write path and ~30 read sites, so it needs its own verification pass rather than a profiling-week change. |
| Storage/TTL churn (864k inserts + 864k deletes/day at 10 stations) | Drop the unused index; size the cluster deliberately; monitor the oplog window. |
| **The upload disk fills, and ingestion stops looking exactly like a quiet station** | Files are retained permanently by instruction, so the archive only grows (~1.3 GB/year/station). No prune. `archive-report.sh` runs daily and fails loudly at 80% disk, telling an operator to move old day-folders to cold storage rather than delete them. |
| Double-ingest or lost file on crash | Staging-rename-first + sha256 unique index + pending-takeover range delete. |
| A poison file blocks the queue | Per-file dispositions; rejected → quarantine, never retried; depth metric. |
| Truncated files lose data | Three stability gates; `truncatedTail` metric; surface completeness on the dashboard. Client-side fix still needed. |
| Station clock drift poisons a day | Sanity band; clamp `$max`; cross-check timestamps against the filename minute. |
| Demo purge order | Purge data **before** removing `demoDeviceFilter`, in every environment. Dry-run against a restored snapshot. |
| ~~**Agent silently ingests nothing under the new folder layout**~~ | **Closed in M19 W5.** The walk descends two levels and a filesystem-backed test asserts a file at `<Customer>/<Tower>/` is found, claimed and archived without flattening. |
| ~~Reported unit lost forever~~ | **Closed in M19 W5.** Stored per day on `MetRecord.speedUnitCode` and latest on `Device.reportedSpeedUnit` — file-level metadata, so a per-measure copy would add a string to ~2.6M rows per station for no extra fidelity. |
| A later stream differs in format | **Client confirmed next week's streams match.** Alias registry makes new columns one line each; M22's stream registry handles a genuinely different format as configuration. |
| Water/air quality never arrive, or arrive late | Not planned as features — no format has been seen. M22 builds the onboarding capability instead, so nothing is wasted either way. |
