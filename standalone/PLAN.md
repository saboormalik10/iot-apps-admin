# Standalone weather station software — project plan

**Status:** approved 21 September 2026; revised 22 September 2026 for the client's
answers (see [Changes on 22 September](#changes-on-22-september)). **Phases 0–2 done**
(22 Sep); **Phases 3–8 done** (22 Sep): built, packaged and documented. Remaining: the
real-sensor acceptance and a first install on a Windows PC (see [Not yet verified](#not-yet-verified)).
**Requirements:** [`CLIENT_REQUIREMENTS.md`](CLIENT_REQUIREMENTS.md) — the client's own words.
**Superseded plan:** [`docs/history/PLAN-2026-09-10.md`](docs/history/PLAN-2026-09-10.md).

## Context

The client (Observator Instruments) wants the portal we built running **on one Windows
PC at a site**, fed by a live sensor stream instead of SFTP files. It is a separate
product from the cloud portal.

| Requirement | Client's words |
|---|---|
| Same web portal, installed on a standalone PC | *"Just make the web version you have created and install on a standalone PC"* |
| Web architecture, **not a desktop app** | *"I don't want exe"*, *"should be on web architecture"* |
| Windows | *"Windows platform"* |
| Sensor: Gill **GMX551 + rain gauge**, one combined string | *"The output is one string only as the GMX will combine the data from the rain gauge"* |
| Live **TCP/IP** stream via a PoE serial converter — no COM port | *"Is tcpip packets"*, *"The data is not through com port"* |
| **We listen** on port **4000**, configurable in a file | *"You should listen to that port"*, *"make the port number configurable in a file"* |
| Data arrives **every 1 second** | *"The data is coming in at every 1s"* |
| Store and log the **1-minute average** | *"process to 1 min average. Log the 1 min average"* |
| Display updates every minute, **wind dial in real time** | *"All parameters updated on 1 minute basis except for the wind dial"* |
| **Web alerts** | *"Please consider the web alert also"* |
| Users can create their own users | *"give the user the flexibility to create their own user"* |
| **Query screen**: choose parameters, table on screen, CSV download | *"a query screen allowing users to choose the parameters … download as csv"* |
| No real data yet — generate test data | *"You can ask ai to generate test data"* |
| **Keep the data indefinitely** | *"indefinitely cos this is their local pc"* (22 Sep) |

**Decision (21 Sep):** a **fully separate project**. Code is **copied** from the cloud
portal, not shared. Cloud-only parts are **removed** rather than hidden.

**Sensor format** — there is **no sample and no sensor yet** (22 Sep), so this comes from
Gill's MaxiMet manual and the first real connection is where any difference shows:
comma-separated
at 1 Hz; STX/ETX framing with a checksum; a header line of field names and units on
power-up; field order `NODE, DIR, SPEED, CDIR, CSPEED, TEMP, RH, PRESS, PRECIPT, PRECIPI,
STATUS, CHECK`; **no timestamp** unless a GPS/RTC is fitted; `PRECIPT` is a cumulative
rain counter that can reset.

---

## Changes on 22 September

The client answered three questions. What each one changes:

| Answer | Effect on the plan |
|---|---|
| **No sensor yet, so no sample** | No change to the approach — parser from the manual, header-driven columns, simulator. Adds a **fallback column order** in config for a unit set to send no header (Phase 2). The rain question below stays open for longer, so rain handling becomes a setting instead of waiting for an answer |
| **TCP/IP, every second** | None — confirms what was planned on 10 Sep |
| **Keep data indefinitely** | **Retention changes** (see [Data retention](#data-retention)): the weather data's auto-delete, inherited from the cloud, is removed. Knock-on effects: indexes must be created by first-run setup (Phase 1), the query screen and CSV export must handle years of data (Phase 4), and backups need their own retention because the data never shrinks (Phase 7) |

**A full review of everything the client has said** (4–22 Sep, including messages sent
while he reviewed the cloud portal) turned up:

| Finding | Effect on the plan |
|---|---|
| **Rain requirement already given (15 Sep):** hourly rain and a daily total, the rain day's start configurable per station — default midnight, BOM 9am–9am as an option. Tipping bucket, 0.2 mm per tip | Added to **Phase 4**. The daily rollup is keyed on the local calendar day, so a 9am rain day is a separate calculation over the minute totals |
| **"One station per PC" was answered on 4 Sep** — *"only 1 station"* — **but contradicted 16 Sep** (*"multiple stations sending data at the same time"*, for AB2C) | Asked again. The reader takes one sensor connection; several stations would mean one port or one connection per station, and a station picked per connection |
| **Who connects to whom** is ambiguous — *"listen to that port"*, but the converter he linked *"will have an IP address and port number"* | **Built both** — `STREAM_MODE=listen` (default) or `connect` to the converter's address — so either answer is a setting |
| Camera viewing asked for "AB2C" on 17 Sep | Asked whether it applies here; not planned until answered |

---

## Data retention

**Weather data is never deleted by the software.** The cloud copy expired minute
readings after 730 days and day records after 735; both expiries are removed here.

| Data | Kept for | Why |
|---|---|---|
| Minute readings (`MetMeasure`) | **Forever** | The client's requirement |
| Day records (`MetRecord`) and daily summaries | **Forever** | They index the readings and hold the day totals |
| Raw per-second samples (`MetRawSample`) | 7 days | Off by default; a commissioning and fault-finding aid, not the record. Turned on per station |
| Audit log | 2 years | A log of who did what, not weather data |
| In-app notifications | 90 days | The alert *rules* and their trigger history stay |

**Size:** about **0.5 GB a year** — 1,440 stored minutes a day at the ~808 bytes a minute
record measured on the cloud, plus indexes. Ten years is ~5 GB, which any PC holds. To be
re-measured with simulator data in Phase 2.

---

## Target layout

```
standalone/
  README.md                  what it is, how to run it locally
  PLAN.md                    this plan
  CLIENT_REQUIREMENTS.md     the client's requirements, verbatim
  PORTING.md                 log of cloud fixes worth carrying across
  backend/                   copied from ../backend, trimmed to single-site
    src/stream/              NEW — TCP listener, GMX551 parser, minute buffer
  web/                       copied from ../admin-web, trimmed
    features/query/          NEW — parameter picker, table, CSV
  simulator/                 NEW — GMX551 TCP test-data generator
  installer/                 NEW — PowerShell setup, WinSW service configs
  config/                    NEW — standalone.env.example (ports, paths, retention)
  docs/                      install, config reference, troubleshooting, user guide
```

---

## Phases

Each phase is demonstrable on its own. **Phases 0–5 need nothing from the client.**
Only the parser's final field mapping waits on a real sample.

| # | Phase | Size | Blocked on client? |
|---|---|---|---|
| 0 | Scaffold the separate project | S | No |
| 1 | Trim to single-site, remove cloud dependencies | M | No |
| 2 | Stream ingest + simulator | L | No — the real format is checked at the first sensor connection |
| 3 | Real-time wind dial | S | No |
| 4 | Query screen | M | No |
| 5 | User management | S | Policy only |
| 6 | Windows packaging | L | "No exe" wording |
| 7 | Backups and operations | M | Backup owner |
| 8 | Docs and handover | S | No |

### Phase 0 — Scaffold the separate project

- Copy `../backend/` → `backend/`, `../admin-web/` → `web/`. Rename the packages
  (`observator-standalone-api`, `observator-standalone-web`).
- Own `.env`, own **local** MongoDB database (`observator_standalone`) — **never the
  production Atlas cluster**. The cloud project's tests have polluted production three
  times; this project starts clean.
- **Baseline before touching anything:** both copies build and their tests pass. Every
  later phase is measured against this.

### Phase 1 — Trim to single-site, remove cloud dependencies

**Backend — remove:** `platform/` (super admin, customers), `provision/` (SFTP
accounts), `share/` (public internet links), `import/`, `files/`, the SFTP half of
`ingest/` (HTTP endpoints, station accounts, stream routes, service credentials),
`notifications/push.service.ts` (Firebase), NEP, sessions, mobile sync.

**Frontend — remove:** `features/admin`, `features/tenancy` (switcher, platform,
stations dialog), `features/streams`, `features/share`, `features/import`,
`features/maps`, `features/sessions`, `features/analytics-nep`, `features/fleet`.

**Keep `organizationId`** in the data model with one seeded organisation. Ripping
tenancy out of every query is high-risk and gains nothing; one seeded org makes it inert.

**Offline replacements** — the PC may have no internet:

| Cloud dependency | Standalone replacement |
|---|---|
| Cloudinary (logo uploads) — `utils/storage.util.ts`, `config/cloudinary.ts` | Local disk under the data folder |
| Nodemailer (password reset, alert emails) — `utils/mailer.ts` | Off by default; optional LAN SMTP in config. Admin resets passwords instead |
| Firebase push — `notifications/push.service.ts` | Removed; in-app web alerts only |
| Sentry | Removed |

**First-run seeding:** one organisation, one device (*GMX551 Station*), and the first
admin account from installer input. Nobody should have to create a customer to see
their own weather.

**First-run also creates the database indexes.** The cloud creates them with migration
scripts and runs with `autoIndex` off in production; a fresh site database would
otherwise have none — no unique key on the minute rows and slow queries. First-run
syncs every model's indexes, which also drops the expiry indexes a database created by
an earlier build still carries.

**What Phase 1 found and changed beyond the list above** (22 Sep):

| Change | Why |
|---|---|
| SFTP ingest *internals* (`ingestFiles`, station accounts, stream routes) kept until Phase 2 | The minute-record pipeline tests drive them. Only the external surface (HTTP endpoints, service credentials, provisioning) went now |
| Removed `POST /auth/register` | Anyone on the site network could create a second organisation with its own admin |
| Removed `POST /devices`, device settings, firmware, `GET /devices/:id/stats` | Phone-app and NEP surface; the one station comes from first-run setup |
| Removed the phone upload routes (`POST /records`, `/records/:id/measures`) and mobile auth | No phone apps here |
| Session cookie `Secure` only when `SESSION_COOKIE_SECURE=true` | Over plain HTTP on the LAN the browser drops a Secure cookie: nobody could stay signed in from another PC |
| No `upgrade-insecure-requests` in the web CSP | Over plain HTTP it rewrites every script to https — a blank page |
| API docs serve Swagger UI from disk, not a CDN | Blank offline |
| Map, GPS track map and fleet screens removed | They need internet map tiles |
| Malformed or missing device/record ids answer 404, not 500 | Found while probing removed routes; see `PORTING.md` |
| Backend tests run serially (`--runInBand`) | Suites share one small local database; in parallel they raced each other |

### Phase 2 — Stream ingest + simulator (the core new work)

`backend/src/stream/`, built alongside the simulator, since each proves the other.

- **TCP server** on `STREAM_TCP_PORT` (default 4000) from `config/standalone.env`, read
  at startup so a restart picks up a change.
- **Framing:** TCP delivers bytes, not lines. Strip STX/ETX, buffer across packets,
  handle several lines per packet and one line across several packets. Cap the buffer so
  a peer that never sends a terminator cannot exhaust memory.
- **Checksum:** validate each line; reject and count failures rather than store them.
- **Header-driven columns:** read the power-up header and map fields by name with
  `createColumnIndex` (`ingest/registry/column-spec.ts`). Field order then becomes data,
  so a different real format is a config change, not a rewrite. The header is sent only
  at power-up, so a reader that connects mid-stream uses **`STREAM_FIELDS`** — the
  manual's order by default — until a header arrives.
- **Timestamp on receipt** using the PC clock — the GMX has no clock. Use a sensor
  timestamp instead if a GPS/RTC is ever fitted.
- **Minute buffer → the existing pipeline**, unchanged: `applyQc` → `aggregateToMinutes`
  → upsert minute records → daily summary → `MET_MEASURES` event → alert evaluation.
  Refactor: extract the post-parse half of `ingestOne` into
  `ingestParsedRows(station, rows)` so the stream enters the same path.
- **Rain — `STREAM_RAIN_MODE`**, because whether the gauge reports a running total or a
  per-interval amount is unknown until a sensor exists:
  - `total` (default) — `PRECIPT`, a running total that may reset. Rain in each second
    is the rise since the last reading; a drop is a reset, and the new value is rain
    since the reset.
  - `interval` — each reading is the rain since the previous one.
  Either way the reader keeps **its own running total** and stores that as `precipMm`,
  resuming from the last stored minute after a restart. The rest of the pipeline is
  untouched: the daily rollup already sums positive rises, and the rain in any minute,
  hour or day is a difference of totals. A sensor-side reset can then never produce
  negative rain or lose the rain that fell after it.
- **One connection at a time**; survive disconnects without a restart; log connect and
  disconnect; expose status — connected, last line, lines per minute, checksum errors.
- **Either direction** (added 22 Sep): `STREAM_MODE=listen` waits for the converter on
  `STREAM_TCP_PORT`; `STREAM_MODE=connect` dials the converter at
  `STREAM_REMOTE_HOST:STREAM_REMOTE_PORT` and redials when the link drops. The client
  said "listen", but the converter he linked is normally the one that listens.

`simulator/` — a TCP client emitting GMX551 lines at 1 Hz with header, STX/ETX and
checksum. Scenarios: normal, gust spike, direction crossing north, rain starting and
stopping, `PRECIPT` reset, bad checksum, a line split across packets, dropped connection.

**Done (22 Sep).** What was built, and what changed on the way:

| | |
|---|---|
| `backend/src/stream/` | `framing.ts` (bytes → lines), `gmx.ts` (header, units, checksum, values), `rain.ts` (the site's rain total), `minute-buffer.ts` (when a minute is finished), `to-met-row.ts`, `stream.service.ts` (listener, one connection, serialised writes), `GET /v1/stream/status` |
| `IngestService.ingestStreamRows` | The stream's entry into the unchanged pipeline — the post-parse half of the old `ingestOne`, extracted |
| Settings | `STREAM_*` in [`config/standalone.env.example`](config/standalone.env.example) — the single settings reference for the API |
| `simulator/` | [`gmx551-sim.mjs`](simulator/README.md), ten scenarios |
| **SFTP half removed** | File ingest, station accounts, stream routes, the CSV parsers and registry, and their models (`StationAccount`, `StreamType`, `MetIngestFile`, `ProvisioningJob`). The pipeline tests were ported to the stream entry (`stream-minute-records`) before the old ones were deleted |
| QC: GMX551 status `0000` | QC accepted only `A`, `0`, `00`, `OK` as healthy, so every GMX551 reading would have had its wind nulled as a sensor fault. Any all-zero status word is now healthy |
| QC: sensor flicker at 1 Hz | Found on the first live run: the step check turned a 0.1 °C tick between seconds into "6 °C/min" and flagged 16 of 39 normal readings. Each field now has a noise floor (0.5 °C, 3 %RH, 0.5 hPa, 1 °C dew point) below which a change always passes; 3 °C in a second still fails |
| No station delete | Deleting the one station deleted every reading it ever had — against the keep-forever requirement. Route, permission and button removed. Deleting a single bad day's record stays |
| Column mapping | A plain name table in `gmx.ts` rather than the cloud's `createColumnIndex`: the registry went with the SFTP parsers, and one fixed vocabulary does not need it |
| Mail server | `EMAIL_HOST`/`EMAIL_PORT` added — the mailer was hard-wired to Gmail, so the "site's own relay" the plan offered was not possible |

**Not done yet, deliberately:** rain *intensity* (`PRECIPI`) is read but not stored —
the minute's rain comes from the running total instead; the per-reading `met:live`
event is Phase 3.

**Verified:** 42 new tests (framing, parser, rain, buffer, settings, QC, and a full
socket-to-database run); two live runs of the simulator against the built API —
direction across north averaged to ~0–3°, a 17 m/s gust captured, rain counted across
a counter reset, a part-minute written on shutdown. Backend 548 passed on a freshly
seeded database, twice.

### Phase 3 — Real-time wind dial

- New socket event **`met:live`**, emitted per received sample and **never stored**.
- The wind dial subscribes to `met:live` and moves every second; every other tile stays
  on the 1-minute `met:latest` cadence, as the client specified.
- Emit only to subscribed clients, so an idle PC does no extra work.
- **The socket address must work from any PC on the network.** Today the browser
  connects to a fixed `NEXT_PUBLIC_BACKEND_WS_URL` baked in at build time
  (`ws://localhost:3200`), which only works on the PC itself. Work it out from the page's
  own address instead, and decide whether the socket goes through the web app or the
  API listens on the network.

**Done (22 Sep).**

| | |
|---|---|
| `met:live` | Emitted by the stream for every reading — speed and TRUE bearing (mast offset applied), the station id, never stored. A reading the sensor flags, or outside what the atmosphere can do, goes as "no reading" rather than swinging the needle. The gateway sends it only to browsers in that station's room, and does nothing at all when nobody is watching |
| `LiveWindDial` | `web/features/dashboard/live-wind-dial.tsx`. Follows `met:live` for its own station; after 5 s without one it falls back to the stored minute and says "1-minute average" instead of freezing. Every other tile is untouched and stays on the minute |
| **One address for everything** | `web/server.mjs` replaces `next start`: it serves the portal and hands the socket upgrade on `/v1/ws` to the API on the same PC. A browser anywhere on the site network uses `http://<pc>:3201`; the API need not be reachable from the network at all, and `NEXT_PUBLIC_BACKEND_WS_URL` is gone. The CSP allows the socket on the page's own host, validated so a crafted `Host` header cannot add directives |
| Converter direction | `STREAM_MODE=connect` (from the review above) — dials the converter, redials with a doubling wait to 30 s, and shows why on the status when it cannot reach it |
| API on this PC only | `API_HOST`, default `127.0.0.1`. With the socket going through the portal nothing on the network needs the API, so it no longer listens there; the portal points at `127.0.0.1` explicitly, since `localhost` can resolve to IPv6 first (Windows especially) |
| Leftovers found by the contract check | The portal still carried the water-quality turbidity scales, their map colours and five chart components nothing used — removed |

**Verified:** counted, as planned — a real socket client watching the station got 121
`met:live` for 121 readings and 2 `met:latest` for 2 minutes; a client watching nothing
got none. Then end to end from the LAN address (`http://192.168.1.12:3201`) with the
built API, the built portal and the simulator: signed in, took a socket ticket, connected
**through the portal**, and received 70 `met:live` in 70 seconds and 1 `met:latest`.
With the API bound to this PC: `127.0.0.1:3200` only (refused from the LAN address),
the portal and the stream port open; sign-in, socket and live readings still flow.
Backend 558 passed; web 343 passed; both build.

### Phase 4 — Query screen and rain totals

**Rain totals (client, 15 Sep):** hourly rain and daily rain, the rain day's start
configurable per station — default 00:00, with BOM's 9am–9am as the obvious
alternative. Both are differences of the stored running total (Phase 2), so a counter
reset cannot corrupt them. Shown on the dashboard and offered as columns on the query
screen.

`web/features/query/` — one screen:

- Pick a date range and **which parameters** — a checkbox list of the fields the station
  actually reports, including gust, 2-min and 10-min means, and rain.
- Results in a **paginated table**; **CSV download** of exactly the chosen columns.
- The backend streams the CSV rather than building it in memory. Data is kept forever:
  a year is ~525,000 minute rows, ten years ~5 M. The table pages from the database; it
  never loads a range whole.

**Done (22 Sep).**

| | |
|---|---|
| Query screen | `web/features/query/`, on the menu as **Query**. A period, one row per minute / hour / day, and a column list. **Show** fills a paged table; **Download CSV** streams the same query, every page. Both come from one server path, so they cannot disagree |
| Station time | From/To are read in the **station's** timezone, not the viewer's — the same hours whichever PC opens it, and the same hours the CSV prints |
| Hours and days | Built in the database from the stored minutes: means, wind direction as a vector mean, the highest gust, rain as a total. Minute-only columns (2- and 10-min means) are greyed out for hours and days — a 10-minute mean of an hour means nothing. A day starts at the station's rain-day hour |
| CSV | `GET /v1/query/measures.csv` — needs `data:export`. Two time columns (station time and UTC), labelled units, the org's display units. Minute rows go through a database cursor, never a whole range in memory. Named `<station>-<resolution>-<from>-to-<to>.csv` |
| Rain on the dashboard | Three tiles: **Rain today** (since the rain-day hour), **Rain last hour**, **Rain rate** (last 10 minutes). `GET /v1/dashboard/met/rain`, refreshed on each minute. The graph's rain line is now "rain since the start of the range" instead of the raw counter |
| Rain day | Per station, **Stations → Edit → "Rain day starts at"**, 00:00–23:00; 09:00 is BOM's |
| Rain is always a difference | Rain in any window = the running total just before its end − just before its start. A counter reset or a gap cannot corrupt it |

**Found by the live check, fixed:**

- **812 mm of rain in one minute.** The rain accumulator took any drop in the gauge's
  counter as a reset and counted the whole new reading as rain. A restarted simulator
  began at 812.4 mm below the saved 817 — so the dashboard showed 827 mm today and
  4,905 mm/h. A real sensor swap or a converter that replays would do the same. Now a
  drop counts as a reset only when the new value is small (≤ 10 mm); a rise faster than
  10 mm a minute (allowing for how long since the last reading, so rain during an outage
  still counts) is also a new counter. Either is logged and counted on the stream status
  (`rainAnomalies`), never stored as rain.
- **The theme script was blocked by the CSP** on every page — the nonce reached the
  middleware but not `next-themes`. Passed through; the browser console is now clean.
- **Rain tiles never appeared**: the dashboard looked for a sensor called `precip_total`,
  the station reports `precipitation`. Mapped.
- **Beaufort conversions were swapped** — converting 10 m/s gave force 26.4 instead of 5.2.
- The simulator's shower was over 100 mm/h; now ~14 mm/h.

**Verified:** end to end from the LAN address with the built API, the built portal and
the simulator — rain today 0.4 mm, last hour 0.4 mm, rate 2.4 mm/h, matching the two
0.2 mm minutes in the query table; the CSV matches the table row for row; the dial live;
no browser errors. The counter-restart case replayed live: logged, no rain added.
Backend 579 passed; web 351 passed; both build; contract check green.

### Phase 5 — User management

- Admins can already create users (`POST /organizations/me/users`,
  `features/org/add-user-dialog.tsx`) — surface it clearly.
- Optional **self-registration** behind a setting, off by default, with new accounts
  pending admin approval — pending the client's answer on policy.
- **Admin password reset** from the Users screen, since there is no email offline.

**Done (22 Sep).**

| | |
|---|---|
| Admin sets a password | Users → ⋯ → **Reset password**: a 12-character suggestion (no look-alikes), editable, then shown once with a copy button. `POST /v1/organizations/me/users/:id/password` (admin, `user:write`). The user's sessions end; the audit log records that it happened, never the password. Not for your own account — that is on your profile |
| …then the user chooses their own | The admin knows the password, so the user's next sign-in goes to **Choose your own password** and nowhere else until it is done (`mustChangePassword`) |
| Forgot password, no email | "Forgot your password?" says to ask an administrator, and how to recover at the PC if none can sign in. With an email server configured the emailed-code flow still works (`GET /v1/auth/options` tells the pages which) |
| Locked out entirely | `node dist/scripts/reset-password.js --list` / `<email> <password>` at the station PC — sitting at the PC is the authority. Audited; ends the user's sessions. Replaces the dev-only `reset-account-password` |
| Self sign-up | Off by default (client's policy is open question 3). `STANDALONE_SELF_SIGNUP=true` adds **Create an account** to the sign-in page; the account waits inactive, as a Viewer, until an admin approves it — the Users screen lists those first with a count. The answer is the same whether or not the email exists |
| Users screen | Shows the role actually held (custom roles by name), who must still change their password, and approve/reject for requests |

**Found and fixed on the way:**

- **Changing your own password signed you out within 15 minutes.** It ends every session, this one included, so the next token refresh failed. The profile now signs straight back in with the new password.
- **A removed user could be re-activated** by editing them (the lookup did not skip removed users) — signing in again under a tombstoned address, invisible on the Users screen.
- **Every PC on the site shared one sign-in limit** (10 a minute), because the API saw all requests come from the portal; any device could lock everyone out, and the audit log recorded 127.0.0.1 for everybody. The portal now stamps each browser's address (overwriting any it sent) and passes it on; the API trusts that one hop while it listens on the PC alone.
- **Sign-in told anyone whether an account was deactivated** — before checking the password — and answered an unknown email faster than a wrong password. Now the password is checked first, against a dummy hash when there is no account.
- **The Users list did not return `roleId`**, so custom roles showed as their base role and the role menu could not mark the current one.
- **Wrong current password answered 401**, which the portal took for an expired session (refresh, retry). Now 400 with its own code, shown on the field.
- **The "Remove" item was never red**: it used a colour token that does not exist.
- The branding-form test failed ~1 run in 4 — it checked for the success toast a tick too early. Now waits for it.

**Verified live** through the LAN address, as three different browsers: request an account → refused while pending → admin sees "1 account is waiting", approves, sets a password → the user signs in, is held on "Choose your own password" (even `/query` sends them back), changes it, lands on the dashboard with a working session. "Forgot password" shows the ask-an-administrator page. Login audit entries now carry `192.168.1.12`. The command-line reset lists accounts, sets a password, refuses unknown emails and short passwords.

### Phase 6 — Windows packaging

- Bundle Node.js LTS (portable), MongoDB Community, and the built backend and web app.
- Three **Windows services via WinSW**: `mongod`, API, web — auto-start at boot, restart
  on failure, correct start order.
- **A PowerShell install script is the foundation**: unpack, write config, initialise the
  database, create the first admin, register services, open firewall ports (web and
  TCP 4000).
- **Optional Inno Setup `.exe` wrapper** around that script — only if the client confirms
  that *"I don't want exe"* meant "no desktop app", not "no installer".
- Upgrade and uninstall paths that **keep the data**.

**Done (22 Sep).** `installer/` — see its build script's header for the details.

| | |
|---|---|
| The release | `node installer/build-release.mjs [--exe]` → `installer/dist/`: the zip (177 MB) and, with `--exe`, the setup program `observator-weather-<version>-setup.exe` (110 MB) — the client approved an .exe installer on 23 Sep, the product itself staying a web application. Bundles Node.js 24 LTS, MongoDB 7.0 (`mongod`) + `mongodump`/`mongorestore`, WinSW 2.12 and the Visual C++ runtime `mongod` needs, each checked against its vendor's checksum or a pinned SHA-256 (`installer/versions.json`). Production dependencies only, for Windows x64: dev packages Yarn 1 kept anyway are pruned to what production code can reach, other platforms' binaries removed, and the build fails if any Linux/macOS binary remains |
| Checks at build | every script plain ASCII (Windows PowerShell 5.1 misreads UTF-8 without a BOM) and parsed by PowerShell; no foreign binaries |
| `install.cmd` | Self-elevates. Checks 64-bit Windows, admin, that `mongod` can run (AVX; installs the C++ runtime if that is what is missing), ports free. Copies to `C:\Observator`, data to `C:\ObservatorData` (never inside the program folder), writes ONE settings file with fresh secrets, locks folders down (settings: admins + services only; program: read-only to users), registers three services running as **LocalService** (not SYSTEM) with restart-on-failure and rotated logs, initiates the replica set and creates the first admin (`setup-site.js`; the password reaches only that process), starts and health-checks each service, opens the firewall to the local subnet, schedules the nightly backup. Re-runnable after a failure |
| `upgrade.cmd` | From the new release: backup, stop, set the old program aside as `.previous`, install, add new settings (never changing existing ones), re-register services, prepare the database, start and check. **Any failure puts the previous version back and starts it** |
| `uninstall.cmd` | Services, firewall, task removed; data kept unless `-RemoveData` and typing DELETE |
| `status.cmd`, `reset-password.cmd` | Health at the PC; password reset at the PC (password via environment, never the command line) |
| One settings file | `web/server.mjs` reads the same `observator.env` as the API (`OBSERVATOR_CONFIG`); the portal's port is `WEB_PORT` there, since `PORT` is the API's |
| `Setup.exe` | `installer/windows-setup/setup.iss` (Inno Setup 6, compiled here through Wine). A wizard for the two folders, the first administrator's email and the sensor/portal ports; it unpacks, then runs the same `install.ps1` **visibly** so the password is typed into its own window, never a command line. Start-menu shortcuts (portal, status, backup, reset password, guides), uninstall from Windows' Apps list, and an unattended mode (`/VERYSILENT /AdminEmail= /AdminPassword=`) that passes the password in the environment |

**Found and fixed on the way:**

- **Stopping the service lost the unfinished minute** — Nest's shutdown hooks were never enabled, so the stream's flush never ran on a reboot, upgrade or restart. Verified: stopped mid-minute with the sensor connected, the 19-reading part-minute was saved.
- **Node 24 accepts "+10:00" as a time zone** (Node 20 refused it): a station set to a fixed offset would cut days an hour wrong across daylight saving. Only named zones are accepted now; the two validity checks became one.
- **The web tests failed on Node 24**: jsdom's AbortSignal is refused by Node 24's fetch. Test environment only (a browser has one AbortSignal); the setup tolerates it. Both suites pass on Node 20 and 24.
- **The API carried five unused dependencies** (archiver, uuid, cors, express-rate-limit, @nestjs/config — 52 packages), one bringing prebuilt binaries for other platforms. Removed.
- The first-run time zone was stored as typed; a typo is now refused (the PC's zone is used, with a warning).

**Verified:** the release built and packaged; the packaged API and portal run from the one settings file against a fresh, uninitialised MongoDB: `setup-site` created the replica set, site, station and admin (and is safe to repeat); sign-in through the portal, System, dashboard, a sensor streaming to the packaged API. The PowerShell module's settings/XML logic tested under PowerShell 7. **Not run on Windows here** — see below.

### Phase 7 — Backups and operations

- Scheduled `mongodump` to a configurable folder (second drive or network share).
- **Backup retention is separate from data retention.** The data is kept forever, so
  every backup is a full copy that grows by ~0.5 GB a year; keep the last N backups
  (configurable) rather than all of them.
- **Log rotation from day one** — the cloud SFTP box accumulated 2.1 GB of unrotated
  journal logs.
- Health page: stream connected, last reading, disk space (with a warning threshold —
  nothing is ever deleted, so the disk is the limit), last backup.
- Clock guidance: the PC clock is the only timestamp source, so Windows Time sync must be
  configured; document it prominently.

**Done (22 Sep).**

| | |
|---|---|
| Nightly backup | Scheduled task (SYSTEM, 02:30, runs late if the PC was off): `mongodump` archive + uploads + settings in a dated folder; keeps the newest `BACKUP_KEEP` (14); `BACKUP_DIR` may be a second drive or a share. The result is written to `logs/backup-last.json` |
| Restore | `restore.cmd -From <folder>`: typed confirmation, safety backup first, `mongorestore --drop`, uploads back, restart |
| Logs | Every service log rotates (8 × 10 MB); the database log is rotated nightly and old ones deleted after 30 days |
| **System page** | Portal → System (everyone): sensor connected, last reading, readings per minute, rejected checksums and implausible rain; last backup; free disk; PC clock vs newest stored minute; and a list of warnings — sensor quiet, disk low, backup failed/late/none, clock gone back. `GET /v1/system/status`; `/health` (PC-only) carries the sensor line for `status.cmd` |

### Phase 8 — Docs and handover

Install guide, config reference (ports, retention, backup path), troubleshooting, and a
user guide adapted from `../admin-web/docs/guides/CUSTOMER_PORTAL_GUIDE.md`.

**Done (22 Sep).** `docs/site/` — shipped in every release's `docs/`:
[`INSTALL.md`](docs/site/INSTALL.md) (technician), [`OPERATIONS.md`](docs/site/OPERATIONS.md)
(status, backups, restore, upgrade, passwords, settings, the clock),
[`TROUBLESHOOTING.md`](docs/site/TROUBLESHOOTING.md), [`USER-GUIDE.md`](docs/site/USER-GUIDE.md).
The settings reference is the settings file itself (`config/standalone.env.example`,
every setting explained).

Writing the guides against the portal found more:

- **The heading offset could not be set.** SFTP provisioning set it in the cloud and was removed here, so every site would show "uncalibrated" for good. It is now on the station's Edit dialog (validated, stored 0–359.9, live within a minute).
- **"Relative to mast" was wrong for the GMX551**: its compass-corrected bearing is from magnetic north. The stream records which it used, and the dial says *Magnetic north · declination not set* until an offset is entered.
- **The station edit body was never validated** (typed inline, so the validation pipe had no class): any type reached Mongoose. Now a validated DTO.
- **The site's time zone showed "Select a timezone"** on the Organisation page and could not be saved without re-picking it (the cloud guide lists this as a known issue): Radix fired an empty change as the value loaded, because the zone list is built only when opened. Empty changes are ignored; a regression test fails without the fix.
- **The Organisation page was reachable only by typing `/org`** — the one place to set the time zone. Linked from Settings.
- **Dashboard answers were cached 30 s with no invalidation**: after a new minute the station list and counts could come back a minute old, and a station or organisation edit did not show. Cleared on each written minute and on edits.
- **A dialog taller than the window was cut off** top and bottom, Save out of reach (the station editor on a laptop). Dialogs now cap at the window and scroll.
- Search box on Users used a sentence as its placeholder; the sign-in pages said "Observator Admin" (cloud naming).

## QA round (23 September 2026)

With everything built, the whole system was reviewed against the running, packaged
product — the release running from its own settings file, with a sensor streaming
into it — in three passes: security and accounts, then the data, then using the
portal. **26 findings, all reproduced against the running instance and all fixed**,
each with a test.

### Part 1 — security and accounts

Tests: `backend/test/session-hardening.e2e-spec.ts`.

| What was wrong | Why it mattered | Now |
|---|---|---|
| **Revoking access did nothing for 15 minutes.** A password reset, a deactivation and a removal revoked only the refresh token; the access token kept working, grants and all | The reset is done *because* access must stop now — the old session could still read, write and export | Every request re-checks the account: still there, still active, and minted after the last "end all sessions" moment |
| **"Choose your own password" was a page redirect only** | Anyone who learned the temporary password had an unlimited session through the API and never had to replace it | The API refuses everything but reading and changing your own profile until it is changed |
| **The portal's API path could be climbed out of** (`/api/x/..%2f..%2fhealth` reached the API's root) | `/health` and `/version` are meant to answer on the station PC only | Any `.`, `..` or slash in a segment is refused |
| **A custom role could be named "Viewer" or "Admin"** and then quietly replaced the built-in one | A role named "Admin" granting nothing would lock the site out of its own administration | Built-in names are reserved |
| **Malformed query values answered 500** (`?deviceId=zzz`, `?page=-1`, `?deviceIds=a,b`) | A caller's mistake looked like a server fault, and the "at most 5 stations" limit never fired | 400 with a clear code; paging is clamped; comma lists are split |
| **A raw MongoDB error number leaked** into the error envelope | It named the failure class to the caller and broke the documented contract | Only string codes are sent |
| **Administrative actions recorded no client address** — user created, removed, approved, password reset, roles, organisation | On a shared PC the log said who, never from which machine | Every audited action carries the address the portal stamped |
| **An administrator's own password change signed them out a quarter of an hour later**; created users were not asked to replace the admin-chosen password | Surprise sign-out; a password someone else chose lived on | The portal signs straight back in; created accounts must choose their own |
| **CSRF trusted `Sec-Fetch-Site` over a mismatched `Origin`** | Defence in depth only (a page cannot forge either header) | A mismatching Origin is refused whatever else the request says |

Fixed alongside them, from our own review of the same code:

- **A live socket outlived the account.** The connection is authenticated once, by
  a 60-second ticket, and then lives for hours: a suspended or removed user's open
  page went on receiving readings. The account is now checked as the socket opens
  (without delaying it), and the socket is closed if it is gone.
- **HTTPS is now possible.** The portal speaks plain `http` by default — a site
  network rarely has a certificate authority, and a self-signed certificate warns
  every visitor — which leaves the sign-in cookie readable on the network. Where a
  site has its own certificate, `WEB_TLS_CERT` / `WEB_TLS_KEY` serve the portal over
  TLS (verified: `https://…/login` answers, plain http to that port does not).
- **An unreachable welcome screen** ("invite your teammates", "pair a unit from the
  mobile app") and eleven menu strings for screens this product does not have were
  removed.

Also checked and correct: the whole RBAC matrix across every route (52 reads, 14
admin-only writes) for viewer/operator/admin/unauthenticated; no privilege
escalation; body validation against injection shapes, wrong types and oversized
strings; the client address cannot be spoofed through the portal or the socket
proxy; CSRF on every mutating route; no token ever reaches the browser; sign-up
does not reveal which emails exist (measured: 0.30 s vs 0.31 s); removed users
cannot return; no password appears in the audit log.

### Part 2 — the data the site depends on

The readings themselves, the query screen and the ingest path were reviewed the same
way: against the running product, with lines pushed into the listener and the answers
compared with the database.

| What was wrong | Why it mattered | Now |
|---|---|---|
| **Rain stopped being recorded once the site total passed 2000 mm** — QC's gross-range ceiling rejected the running total, and `PRECIPT` never comes back down | The stored figure is the site's forever-rising total, so at a wet site every rain reading would have become null, silently, a year or two in | `precipMm` has no upper limit; the range check accepts an open-ended accumulator |
| **A checksum that was present but not two hex digits was accepted** as good data | A converter writing a malformed frame would have been trusted, and nothing counted it | Malformed checksums are rejected and counted with the bad ones |
| **`?page=abc` and `?limit=1e3` were not rejected**; hourly and daily queries then returned no rows while reporting a total above zero | The screen said "1,440 rows" and showed none — the query screen is the client's headline feature | Non-whole numbers answer 400; paging is clamped |
| **Readings arriving faster than 1 Hz had their wind nulled** — the step check's allowance is proportional to the gap between arrivals, and readings are stamped on arrival, so a converter flushing a backlog made every gap tiny | A backlog after a reconnection would have come in as a minute of missing wind | The gap is never counted as shorter than the nominal one second |
| **A line longer than `STREAM_MAX_LINE_BYTES` was emitted anyway** if it ended in a terminator | The cap exists so a chattering peer cannot exhaust memory; it only ever applied to the unterminated remainder | Over-long lines are discarded and counted as overflows |
| **The rain-restart fallback could pick a future-dated row**, freezing the total | One reading stamped ahead (a clock jump) would have suppressed rain until the clock caught up | The fallback ignores anything newer than now |
| **CSV file names used UTC dates**, and bearings were stored with floating-point noise (`231.60000000000002`) | A file named for the wrong day, and numbers that look like a fault | The station's time zone names the file; bearings round to 2 dp |
| **Hourly and daily wind direction had no cancellation guard** (the minute path has one) | Opposing winds average to a vector of no length, whose angle is arbitrary — a confident direction from nothing | Below a length of 1e-9 the direction is null |
| `metrawsamples` carried a 7-day TTL index from the cloud, against *"keep the data indefinitely"* | Only the raw 1 Hz samples, not the minute records — but still a deletion the client did not ask for | Removed |

### Part 3 — using it

Finally the portal was used as the site will use it: sign in, look at the weather, run
a query, manage people — at 1280×800, at 1024×600 and at 375 px, in light and dark.

| What was wrong | Now |
|---|---|
| **`passwordTooShort` and Zod's "String must contain at least 1 character(s)"** shown to the user | "Use at least 8 characters", "Enter a last name" |
| **Records and the System page showed times in the browser's time zone, unlabelled**, while every other screen shows station time | One shared station-time hook; the column says which zone ("Started (Australia/Melbourne)") |
| **"Deactivate" signed someone out with no confirmation**, while "Remove" asked — and both asked through the browser's own grey `127.0.0.1:3301 says` box | Both ask, in the product's own dialog, in dark mode too |
| **Cloud leftovers on screen**: "Fleet status", "invite your teammates", "pair a unit from the mobile app", a station picker on a one-station PC | Wording for one site, no mobile app and no invitations |
| **A scope bar that filtered nothing** on seven screens, and two disagreeing period pickers on the audit log | The bar appears only where something reads it; with one station it keeps just the period, and the audit log keeps its own |
| **Permanently empty Battery / DC voltage tiles** (a mains-powered GMX reports neither) | Removed |
| **"1 rows"** in the query header | "1 row" |
| **No link to the sign-up page** from sign-in while self-sign-up was switched on | Linked when it is on |
| **Viewers could read the System page** — the data folder, database size, where the sensor connects from | `system:read`: administrators and operators |
| **When the API was down the portal said nothing useful** and the sidebar fell back to the cloud brand | The System page explains that the service is not answering; the brand holds |
| **The wind dial's cadence was unexplained** — the one tile that moves every second, next to tiles that move once a minute | The dashboard says so in a line |

All of the above were re-verified against the rebuilt, packaged portal in a browser
(17 checks, no console errors), not only in unit tests.

### Part 4 — housekeeping the review turned up

- **The backend could not be linted at all.** ESLint 10 reads a flat config and the
  copied `.eslintrc.json` is ignored, so `npm run lint` failed before it looked at a
  file — which is why the dead code below had gone unnoticed. `eslint.config.mjs`
  carries the same rules across, and both projects now lint clean.
- **Dead code from the trim**: an empty `CommonOpts` still threaded through eleven
  analytics signatures, six imports of analytics helpers this product no longer has,
  a `tmp-bench.ts` benchmark script, and an unused upload helper in the portal.
- **The command palette froze its menu at whatever permissions it first saw** —
  `has` was missing from the memo's dependencies, so someone whose role changed while
  the page was open would still be offered a screen they can no longer open.
- **An 18-minute soak on the packaged build**: memory flat (API 109→113 MB, portal
  142 MB), a steady 59-60 readings a minute; pulling the sensor out showed
  "not connected" and plugging it back in returned to 60 a minute without a restart.

## Walking the product against the requirements (25 September 2026)

The packaged release was installed onto an empty database, the sensor connected on
the client's own port 4000, and the portal then used the way a site technician would
— sign in, read the weather, run a query, download it, set an alert, add a person —
checking each of the 22 locked requirements in
[`CLIENT_REQUIREMENTS.md`](CLIENT_REQUIREMENTS.md) as it went.

**Verified working, in the shipped build:** it listens (3) on port 4000 taken from the
settings file (4, 5); readings arrive at 1 Hz and exactly one row per minute is stored
(6, 7); all six parameters the client listed are on screen (8) and in the query; the
wind dial moves every second while everything beside it holds the last completed
minute (15) — measured as ten distinct dial values in ten seconds; the query screen
picks a period and columns, shows a table and downloads a CSV whose contents match it
row for row (17); rain totals agree at minute, hour and day resolution and the rain
day starts where the station says (20); the clock shows station time and UTC (21);
per-second samples are not stored unless the station is told to (22); an alert rule
fires and lands in the portal (11); an administrator adds a person, who must choose
their own password before anything else (16).

**Fixed during the walk:**

| What was wrong | Now |
|---|---|
| **The nightly deletion that was supposed to be gone.** Raw per-second samples still carried the cloud's 7-day expiry — recorded as removed in the September QA round, but the index was live in the database and in the model, against *"keep it indefinitely cos this is their local pc"* | No weather collection carries an expiry, and starting the service drops the stale index from databases that already have it. A test asserts it for the schema AND the live database |
| **An alert nobody could act on**: "wind_speed gt 1m/s — read 18.29m/s", while the dashboard showed 7.26 m/s for that same minute. The rule fires on the minute's PEAK, deliberately, so a gust cannot slip between two averages — but nothing said so, and the message was written in the rule's machine keys | "Wind speed above 1m/s — peaked at 7.01m/s in that minute" |
| **The dashboard scrolled sideways on a phone** (404px of content in a 375px window). Three causes, all found by measuring: a freshness stamp pinned right, a fixed-width wind dial, and a grid column that would not shrink below its content | Every screen fits at 375px and at 1024×600, checked |
| **The cloud product's "device" survived in five places** a person reads: the dashboard tile, the station-status column, the alert dialog, the alerts filter, two analytics empty states that told a one-station site to "pick a device with wind data" | "Station" throughout, and the filter that could not filter anything is gone |
| **"(auto-selected)" on every screen with a station picker** — there is one station, so nothing was selected over anything | Said only where there was a choice |
| **The release build needed two vendor hosts to be up**, even with every runtime already cached: it re-fetched their checksum lists each run, so a flaky connection failed a build that needed no network (nodejs.org answered half our requests that day) | The lists are cached beside the downloads they verify, used only when the fetch fails, and the build says when it falls back |

### One more thing the fork had inherited

`backend/test/alert-rules.e2e-spec.ts` arrived from the cloud project as
`describe.skip`, with a note that alerts were switched off there and the module
unregistered. That was never true here — on-screen alerts are locked requirement 11,
the module is registered, and a rule firing into the portal was verified by hand —
so six tests for a shipped feature had never run. Re-enabled; all six pass.

## Not yet verified

Honest limits of what could be tested here (Linux, no sensor):

- **A real Windows install.** The scripts parse and their logic is tested under PowerShell 7; the packaged app runs; `Setup.exe` was built and silently unpacked under Wine (597 MB, every tool and guide in place, uninstaller registered). But `install.ps1` itself — the services, firewall rules, scheduled task, upgrade/rollback and uninstall — has not run on Windows: Wine's `powershell.exe` is a stub. First install on a Windows 10/11 VM (and a power-pull test) before the site.
- **The real GMX551.** Built from Gill's manual and the simulator; the parser's field mapping, checksum and rain reporting need the client's sample output (open question 1).
- **The 3 remaining client questions** (CLIENT_REQUIREMENTS §4): which way the converter connects, whether people may ask for their own account, and the real sensor's output. Both converter directions and both sign-up policies are built and switchable, so none of them blocks delivery — the sample is the only one that could still change the parser.

---

## Copied from the cloud project

Paths are relative to the repository root.

| Need | Source |
|---|---|
| Quality control | `backend/src/ingest/qc.ts` |
| 1-minute aggregation, gust, 2/10-min means | `backend/src/ingest/minute-aggregate.ts` |
| Vector-mean direction, WMO gust | `backend/src/analytics/wmo.ts` |
| Header-driven column mapping | `backend/src/ingest/registry/column-spec.ts` |
| Dew point | `backend/src/ingest/environmental-csv/dew-point.ts` |
| Minute record model (gust, means, `res: '1m'`) | `backend/src/models/MetMeasure.ts` |
| Bucketed chart series | `backend/src/records/records.service.ts` (`getSeries`) |
| CSV export pattern | `backend/src/analytics/analytics.service.ts` (`exportMetBulk`) |
| Live gateway | `backend/src/realtime/events.gateway.ts` |
| Wind dial | `admin-web/features/dashboard/met-station-live.tsx` |
| Station clock | `admin-web/components/app-shell/station-clock.tsx` |

---

## Questions for the client

Tracked in [`CLIENT_REQUIREMENTS.md` §4](CLIENT_REQUIREMENTS.md#4-questions). **Five
of the eight were answered on 23 September**, and they close the design's last
uncertainties:

- **One station per PC.** There are two products: **AB2C** is the cloud service for
  their clients (several stations, richer user management, the cameras); **this** is
  the standalone PC for one AWS. The "multiple stations" of 16 Sep was AB2C.
- **No internet, no email** — *"just on screen alert"*. Alerts appear in the portal;
  the optional LAN mail server stays off.
- **The installer may be an .exe**, as long as people use the product *"using a web
  browser"* — which is what it is. Delivered as `Setup.exe` alongside the zip.
- **No camera** on the standalone PC. **Support** is deferred (*"let's get it running
  first"*); nightly backups are set up regardless.

Still open, neither blocking: which way the converter connects (both are built —
`STREAM_MODE`), whether people may ask for an account (built, off by default), and a
sample of the real sensor's output, promised when the sensor arrives.

Already answered earlier — do not re-ask: transport is TCP on port 4000, one reading a
second (10 and 22 Sep); the rain gauge feeds the GMX (21 Sep); data is kept
indefinitely (22 Sep).

---

## Risks

| Risk | Mitigation |
|---|---|
| **Fork drift** — cloud fixes do not reach the standalone | [`PORTING.md`](PORTING.md) log; review the cloud diff each release |
| Real format differs from the manual | Header-driven column mapping; simulator built from the manual |
| **PC clock wrong** → every timestamp wrong | Windows Time sync documented; flagged on the health page |
| CPU lacks AVX → MongoDB will not start | Stated in PC requirements; installer checks and refuses clearly |
| Offline PC breaks cloud-service calls | Phase 1 removes or replaces every one; tested with the network unplugged |
| Unrotated logs fill the disk | Rotation in Phase 7 |
| Data kept forever fills the disk over the years | ~0.5 GB a year; disk-space warning on the health page; backup copies capped (Phase 7) |
| Rain reported differently from the manual | `STREAM_RAIN_MODE` setting; the simulator exercises both modes and a counter reset |
| Power loss leaves services down | Services, proven by pulling the power |

---

## Verification

- **Baseline:** both copies build and pass their tests before any trimming.
- **Unit:** framing (split lines, several per packet, STX/ETX), checksum rejection, header
  mapping, minute boundaries, `PRECIPT` reset, and the north-crossing direction case —
  which must fail against an arithmetic mean or it is not testing anything.
- **Integration:** simulator → listener → MongoDB, then the dashboard, records, analytics
  and alerts light up unchanged.
- **Real-time:** the wind dial updates at ~1 Hz while other tiles update once a minute —
  measured by counting socket events, not by eye.
- **Query:** table rows match the CSV, and the CSV matches the database for the same range
  and columns.
- **Offline:** a full run with the network disconnected; nothing calls out.
- **Windows:** a fresh install on a clean Windows VM from the script; reboot and
  power-pull; upgrade and uninstall both keep the data.
- **Acceptance:** with the real sensor, a full day logs without gaps.
