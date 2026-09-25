# Phase 0 baseline — 22 September 2026

The state of the copied code **before any trimming**. Every later phase is measured
against this: a phase may remove tests along with the modules they cover, but must not
break a test in a module we keep.

Copied from cloud commit `e39dd7f`.

## Local development database

MongoDB 7 in Docker, as a **single-node replica set** — the roles service uses
transactions, which MongoDB refuses on a plain standalone server.

```bash
docker run -d --name observator-standalone-mongo -p 27018:27017 \
  -v observator-standalone-mongo:/data/db mongo:7 --replSet rs0 --bind_ip_all
docker exec observator-standalone-mongo mongosh --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
```

Connection string uses `directConnection=true`, because the container advertises
`localhost:27017` internally while the host reaches it on 27018.

**The Windows install must do the same** — run MongoDB with `--replSet` and initiate it
once. Plain standalone MongoDB will fail the moment a role is edited.

## Setup data a fresh database needs

The cloud project created these by hand, once, with migration scripts. A fresh database
has none of them, and without the system roles every user is left with no role at all.
**Phase 1's first-run setup must do all of this automatically.**

```bash
npm run seed                                   # org, users, demo devices
npm run seed:accounts                          # superadmin (removed in Phase 1)
npm run migrate:roles -- --apply --super-admin superadmin@observator.com
npm run migrate:role-scoping -- --apply
npx ts-node src/scripts/seed-stream-types.ts --apply
```

## Results

| Check | Result |
|---|---|
| Backend `tsc` | clean |
| Backend build | exit 0 |
| Backend tests | **819 passed**, 30 failed, 14 skipped |
| Web `tsc` | clean |
| Web tests | **452 passed** |
| Web build | exit 0 |

### The 30 backend failures

All but one test file cover functionality **Phase 1 removes** — they fail because a
fresh database has no multi-customer or SFTP state:

| Suite | Covers | Phase 1 |
|---|---|---|
| `ops-health` | Platform operations | Removed |
| `platform-devices` | Cross-customer station list | Removed |
| `provision` | SFTP station provisioning | Removed |
| `stream-types` | SFTP stream routing | Removed |
| `tenant-isolation` | Creating customers | Removed |
| `rbac-wiring` (2 cases) | A super admin acting as a customer | Removed |

The one exception, `met-range-summary`, was a **latent test bug** — see `PORTING.md`.
Fixed; it now passes 24/24.

## After Phase 1 (22 September 2026)

| Check | Result |
|---|---|
| Backend `tsc` | clean |
| Backend build | exit 0 |
| Backend tests | **656 passed**, 0 failed, 6 skipped — run serially (`npm test` = `--runInBand`) |
| Web `tsc` | clean |
| Web tests | **347 passed** |
| Web build | exit 0 |

Fewer tests than the baseline because the suites for removed features went with
them. New suites: `first-run` (14), `local-storage` (9), `malformed-id` (9).

**Setup for a fresh development database is now just** `npm run seed`. The seed reuses
first-run setup for the indexes and system roles, and gives every seeded user a real
role. The
`seed:accounts` and `migrate:*` steps above belong to the cloud's history.
`seed.ts` is development-only: it sets known passwords, and never runs on a site PC.

## After Phase 2 (22 September 2026)

| Check | Result |
|---|---|
| Backend `tsc` / build | clean / exit 0 |
| Backend tests | **548 passed**, 0 failed, 6 skipped — on a dropped database set up with `npm run seed` alone, run twice |
| Web `tsc` / tests / build | clean / **347 passed** / exit 0 |

Fewer backend tests than after Phase 1: the SFTP suites went with the SFTP code, and
the pipeline cases they held were ported first. New: `stream-units` (32),
`stream-integration` (9), `stream-minute-records` (6).

## After Phase 3 (22 September 2026)

| Check | Result |
|---|---|
| Backend tests | **558 passed**, 0 failed, 6 skipped |
| Web tests / build | **343 passed** / exit 0 |
| Contract check (`node web/scripts/check_contract_drift.js`) | socket events and scales both match the backend |

New: `stream-live` (5 — counts socket events), `stream-connect` (3), web `live-wind-dial` (5).
The portal now runs through `web/server.mjs` (`yarn dev` / `yarn start`).

## After Phase 4 (22 September 2026)

| Check | Result |
|---|---|
| Backend tests | **579 passed**, 0 failed, 6 skipped |
| Web tests / build | **351 passed** / exit 0 |
| Contract check | socket events and scales both match the backend |

New: `query` (13), rain plausibility (5, in `stream-units`), tz-util rain day (3), qc
flicker (1); web `zoned-time` (4), `query-page` (4).

`test/branding-form.test.tsx` failed once in a full web run and passed in the three
runs after it, and alone — a timing flake under load. Fixed in Phase 5 (it asserted the
success toast a tick early).

Before a live check, clear what the simulator left behind, or a restarted simulator
looks like a new rain counter (now logged, not counted — see PLAN Phase 4):
`db.metmeasures.deleteMany({source:"stream"})`, `db.metrecords.deleteMany({source:"stream"})`,
`db.devices.updateMany({}, {$set:{rainState:null}})`.

## After Phase 5 (22 September 2026)

| Check | Result |
|---|---|
| Backend tests | **591 passed**, 0 failed, 6 skipped |
| Web tests / build | **359 passed** / exit 0 |

New: backend `user-accounts` (12); web `user-accounts` (8).

## After Phases 6-8 (22-23 September 2026)

| Check | Result |
|---|---|
| Backend tests | **599 passed**, 0 failed, 6 skipped (Node 20 and Node 24) |
| Web tests | **363 passed** (Node 20 and Node 24) |
| Installer logic (`pwsh installer/tests/module-logic.tests.ps1`) | **25 checks passed** |
| PowerShell scripts | all 9 parse; all scripts plain ASCII (checked by the release build) |
| Release | zip 177 MB, `Setup.exe` 110 MB; no Linux/macOS binaries in `app/` |

Verified with the packaged release, not just the source tree:

- `setup-site.js` on an empty MongoDB: creates the one-member replica set, the site,
  the station and the first administrator; safe to run again; exits 2 while no
  administrator exists.
- The packaged API and portal run from the single `observator.env`, the sensor
  streams into them, sign-in works through the portal, `/v1/system/status` answers.
- `mongodump` and `mongorestore` **from the release** (run through Wine) take a
  backup and restore it into a scratch database: 50 documents, matching counts,
  indexes rebuilt.
- `Setup.exe` unpacks silently under Wine: 597 MB, every tool and guide in place,
  the uninstaller registered. (Wine's `powershell.exe` is a stub, so `install.ps1`
  itself still needs a Windows machine.)

New tests: backend `user-accounts` (12), `system-status` (4), `station-settings` (4);
web `user-accounts` (8), `system-page` (3), a timezone-picker regression (1).

## After the QA round (23 September 2026)

| Check | Result |
|---|---|
| Backend tests | **608 passed**, 0 failed, 6 skipped (614 total) |
| Web tests | **369 passed** (49 files) |
| Installer logic (`pwsh installer/tests/module-logic.tests.ps1`) | **25 checks passed** |
| PowerShell scripts | all parse; 16 scripts plain ASCII |
| Release | zip 177 MB (sha256 `c8b5d3a0…`), `Setup.exe` 110 MB; no Linux/macOS binaries in `app/` |
| Browser re-check of the fixes, against the packaged portal | **17 checks passed**, no console errors |
| `npm run lint` (backend, via the new `eslint.config.mjs`) | clean |
| `npx next lint` (web) | clean |
| `tsc --noEmit`, both projects | clean |
| 18-minute soak on the packaged build | memory flat, 59-60 readings/min, recovers from a sensor dropout |

New since Phase 8: `session-hardening` (8) and the stream, QC and query cases added
with the data findings; web `scope-bar-visibility`, `confirm-dialog`, `site-timezone`.

Two test expectations were rewritten rather than "fixed", because the product
deliberately changed under them, and each now says why in a comment:

- `system-status`: the System page is no longer readable by every role — it names the
  data folder, the database size and where the sensor connects from, so it needs
  `system:read` (administrators and operators).
- `scope-bar-visibility` and the CSV filename case: the scope bar is drawn only where
  something reads it, and an export is named in the station's time zone.


## After the requirements walk (25 September 2026)

| Check | Result |
|---|---|
| Backend tests | **634 passed**, 0 failed, **0 skipped** (the last skipped suite — alert-rules — was a stale inheritance and is back in) |
| Web tests | **370 passed** |
| `tsc --noEmit` and lint, both projects | clean |
| Every screen at 375px and 1024×600 | fits, no sideways scroll |
| Release | zip 178 MB (sha256 `0098d5ae…`), `Setup.exe` 110 MB |

New tests: `retention` (8 — no expiry on any weather collection, in the schema and in
the live database), `bearing` (5), the at-the-PC reset ending live sessions, the
refresh cookie's Secure flag, control characters in a name, the default role a new
person gets, and the words an alert uses.

The packaged release was run from an empty database for this pass, so the first-run
path (site, station, first administrator) was exercised again rather than assumed.

The release build no longer depends on two vendor hosts being up. It cached the
runtimes already, but re-fetched their checksum lists every run — so a flaky
connection failed a build that needed no network at all (nodejs.org answered about
half of our requests on 25 Sep). The lists are now cached beside the downloads they
verify, used only when the fetch fails and logged when that happens; this build used
the cached Node list and still verified every runtime.
