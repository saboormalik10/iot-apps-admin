# Observator Standalone

The Observator weather portal, running on **one Windows PC at a site** and fed by a
live sensor stream — instead of the cloud portal fed by SFTP files.

```
Gill GMX551 + rain gauge
  → RS422 → PoE serial converter → TCP/IP
  → this software, listening on port 4000
  → 1-minute averages stored in a local database
  → the portal, in any browser on the site network
```

No internet, no desktop application. Anyone on the network opens a browser at the PC's
address and gets the full portal.

## Status

**All 8 phases done, and reviewed** (23 September 2026): a trimmed, single-site copy of
the cloud portal that runs offline, fed by the GMX551 stream on TCP port 4000 — a wind
dial that moves every second, rain totals, a query screen with CSV, user management
without email, a System health page — packaged as a Windows release with an installer,
upgrades that roll back on failure, nightly backups, and site guides.

A three-part review of the running, packaged product (security and accounts, then the
data, then using the portal) found **26 problems; all are fixed, each with a test**.
Several of them exist in the cloud portal too and are logged in
[`PORTING.md`](PORTING.md). Tests: backend 634, web 370, installer logic 25.

Not yet done: a first install on a real Windows PC, and acceptance with the real
sensor. See [`PLAN.md`](PLAN.md).

**Installer checks:** `pwsh installer/tests/module-logic.tests.ps1` (settings, service
definitions, backups — runs anywhere).

**Build the Windows release:** `node installer/build-release.mjs` → `installer/dist/`
(add `--exe` for the setup program; it needs Inno Setup 6 — `ISCC=<path to ISCC.exe>`,
through Wine on Linux).
**Site guides:** [`docs/site/`](docs/site/).

There is no sensor yet: [`simulator/`](simulator/README.md) plays one.

## Run it locally

```bash
# a local MongoDB replica set — see docs/BASELINE.md
cd backend && npm install && npm run seed && npm run dev        # API on :3200, stream on :4000
cd web && yarn install && yarn dev                                 # portal on :3201 (server.mjs)
node simulator/gmx551-sim.mjs --scenario all                       # a sensor
```

Every API setting is described in [`config/standalone.env.example`](config/standalone.env.example).

## Check it

```bash
cd backend && npm test          # 634 e2e tests against a local MongoDB replica set
cd backend && npm run lint      # flat config: eslint.config.mjs
cd web && npx vitest run        # 369 component and logic tests
cd web && npx next lint

# the Windows installer's logic, without Windows (PowerShell 7)
pwsh installer/tests/module-logic.tests.ps1
```

The backend tests need the local database of `docs/BASELINE.md` and a seeded site
(`npm run seed`); they run serially and take about two minutes. To try the whole
thing end to end the way a site will use it, run the release rather than the source —
`docs/site/INSTALL.md` for a Windows PC, or unpack the zip and start
`app/api/dist/main.js` and `app/web/server.mjs` with one `observator.env`.

People on the site network use one address, `http://<pc>:3201`, for everything: the
portal's own server (`web/server.mjs`) passes the live-update socket to the API, so the
API never needs to be reachable from other PCs.

Weather data is kept **indefinitely** — the software never deletes it (client, 22 Sep).

## This is a separate project

It started as a **copy** of the cloud portal (`../backend`, `../admin-web`), and it
does not share code with it. That is deliberate: the standalone product can change
freely without affecting live cloud customers.

The cost is that the two will drift. When the cloud portal gets a fix that matters
here — a calculation, a QC rule, a security fix — record it in
[`PORTING.md`](PORTING.md) and carry it across.

## Documents

| File | What it is |
|---|---|
| [`PLAN.md`](PLAN.md) | How we build it — phases, reuse, risks, verification |
| [`CLIENT_REQUIREMENTS.md`](CLIENT_REQUIREMENTS.md) | What the client asked for, in his words, and the open questions |
| [`PORTING.md`](PORTING.md) | Cloud fixes to carry across |
| [`docs/history/PLAN-2026-09-10.md`](docs/history/PLAN-2026-09-10.md) | The first plan, superseded, kept for its reasoning |

## Layout

```
standalone/
  backend/      API, stream listener, database access
  web/          the portal
  simulator/    GMX551 test-data generator — the client has no real data yet
  installer/    build-release.mjs, versions.json; windows/ = the .cmd tools and PowerShell scripts
  config/       standalone.env.example — every setting (the installed observator.env)
  docs/site/    the guides shipped with each release: install, operations, troubleshooting, user
  docs/         development notes (BASELINE.md, history/)
```

## PC requirements

- Windows 10 or 11 (or Server 2019/2022), 64-bit — full list in [docs/site/INSTALL.md](docs/site/INSTALL.md)
- A CPU with **AVX** support — required by the database. Any Intel Core from Sandy
  Bridge (2011) onward, or AMD from Bulldozer onward. Some low-end Celeron and Pentium
  chips lack it.
- The PC clock is the only source of time for the readings — the sensor has no clock of
  its own — so Windows time synchronisation must be enabled.
