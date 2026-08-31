# Ingest agent — install and operate

The agent runs **on the ingest box** (AWS Lightsail, Sydney), beside the SFTP
drop directory. It moves files; it does not parse them. The backend owns the one
parser, so a parser fix ships with a backend deploy rather than a fleet-wide
agent update, and archived files stay re-ingestable through a corrected parser.

It holds an **outbound-only** credential and opens no listening port.

```
station ──SFTP──► upload/<Customer>/<Tower>/
                      │  ① rename → staging/   (atomic, same volume)
                   agent
                      │  ② POST /v1/ingest/met/files   (raw bytes, Bearer obsi_…)
                      ▼
              archive/YYYY-MM-DD/   ◄── 2xx
              quarantine/           ◄── 4xx
```

## ⚠ Before you point this at the live folder

**As of 26 Aug 2026 the station's folder holds THREE file types, and the agent
picks up every `.csv`:**

| File | Count | What happens today |
| --- | --- | --- |
| `WindSonic_*.csv` | 11,759 | Correct |
| `Environmental_*.csv` | 2,087 | Ingests, but **humidity is silently dropped** — the alias list has `humidity_pct`, the file says `humidity_percent`, and matching is exact |
| `EnvDiagnostic_*.csv` | 2,056 | **Inserts ~60 all-null measures per minute.** It is an audit log, not data |

Neither new file is rejected, because the only hard bail is a missing timestamp
column and **both have one**. They fail by writing plausible-looking junk into
the station's data.

The cause is structural: `StationAccount.streamType` is keyed on
`(account, folderPath)` — one stream per folder — but this station puts three
streams in ONE folder, separated by filename prefix. Routing by prefix is item 1
of "Newly discovered scope" in `months13-24.md`, and **it blocks enabling the
agent against this folder.**

Until it lands, run with `--dry-run` here, or point the agent at a folder that
contains wind files only.

## Nothing is ever deleted

The client confirmed on 25 Aug 2026 that uploaded files are kept permanently,
even once their readings are in the database. `archive/` and `quarantine/` grow
without bound **by design**.

`deploy/archive-report.sh` runs daily and reports size and disk use, warning at
80%. **It deletes nothing.** `src/retention.test.ts` fails the build if a
destructive call or a prune unit is reintroduced — that test is the guard, so do
not weaken it. If the disk fills, move old day-folders to cold storage; do not
delete them.

## Install

Requires Node 20.

```bash
# 1. Build, and ship dist/ + node_modules to the box
npm ci && npm run build

# 2. On the box
sudo mkdir -p /opt/observator/ingest-agent
sudo rsync -a dist node_modules package.json deploy \
    /opt/observator/ingest-agent/

# 3. A dedicated service account, in the SFTP group so it can read the drop dir
sudo useradd --system --no-create-home --shell /usr/sbin/nologin obsingest
sudo usermod -aG sftpusers obsingest

# 4. Credentials — root-owned, NOT readable by the station's own SFTP account
sudo install -m 0600 -o root -g root /dev/null /etc/observator-ingest.env
sudo tee /etc/observator-ingest.env >/dev/null <<'ENV'
OBSERVATOR_API_URL=https://api.example.com/v1
OBSERVATOR_ACCOUNT=wxstation
OBSERVATOR_INGEST_TOKEN=obsi_…
ENV

# 4b. Directory permissions — the agent must be able to move files OUT of
#     each tower folder, which SFTP creates as 0755 owned by the station.
sudo chgrp -R sftpusers /home/wxstation/upload
sudo find /home/wxstation/upload -type d -exec chmod 2775 {} \;
for d in staging archive quarantine; do
  sudo mkdir -p /home/wxstation/$d
  sudo chown obsingest:sftpusers /home/wxstation/$d
  sudo chmod 2770 /home/wxstation/$d
done

# 5. Units
sudo cp deploy/observator-ingest.service /etc/systemd/system/
sudo cp deploy/observator-archive-report.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now observator-ingest observator-archive-report.timer
```

Mint the token with `npm run provision:station` in `backend/`. It is shown once.

### Two units, deliberately

`observator-ingest.service` sets `NoNewPrivileges=yes`, which makes `sudo`
impossible inside it. Provisioning **needs** sudo and therefore lives in its own
unit (`observator-provision.service`, see `provision-agent/`). **Never merge
them** — doing so would hand sudo to the process that parses untrusted filenames.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `OBSERVATOR_API_URL` | — | **Required.** Absolute `http(s)` base URL of the API |
| `OBSERVATOR_ACCOUNT` | — | **Required.** SFTP account; must match `^[a-z][a-z0-9_-]{2,31}$` |
| `OBSERVATOR_INGEST_TOKEN` | — | **Required.** Must start with `obsi_` |
| `OBSERVATOR_FILE_PREFIXES` | `WindSonic_` | **Comma-separated filename prefixes to pick up. Everything else is left untouched** — not claimed, not moved, not deleted. This is what stops `Environmental_*` being parsed as wind and losing humidity. Set to empty to take every `.csv` |
| `OBSERVATOR_ROOT_DIR` | `/home/wxstation` | Parent of `upload/ staging/ archive/ quarantine/` |
| `OBSERVATOR_POLL_MS` | `5000` | Directory poll interval |
| `OBSERVATOR_STABLE_MS` | `20000` | A file must be untouched this long before it is sent |
| `OBSERVATOR_LATE_MS` | `300000` | After this, an incomplete file is accepted as permanently truncated |
| `OBSERVATOR_MAX_FILES` | `60` | Files per request |
| `OBSERVATOR_MAX_BYTES` | `4194304` | Bytes per request |
| `OBSERVATOR_TIMEOUT_MS` | `60000` | Request timeout |

All of it is validated **at boot**, not at point of use: a long-running worker
has no request to fail, so a missing variable found an hour in is an hour of
files silently not moving.

## What happens to each file

The backend answers per file, and the agent acts on that answer alone:

| Backend says | Agent does | Why |
| --- | --- | --- |
| `ingested` | → `archive/YYYY-MM-DD/` | Stored |
| `duplicate` | → `archive/YYYY-MM-DD/` | Already held; the content hash matched |
| `rejected` | → `quarantine/` | Permanently unusable. **Never retried** — this is what stops one poison file blocking everything behind it |
| `retry` | left in `staging/` | Transient; picked up next poll |

A transport failure (network, 5xx, auth) quarantines **nothing** — the fault is
configuration or the server, not the data, so the files stay put.

`staging/`, `archive/` and `quarantine/` all **mirror the `<Customer>/<Tower>/`
tree**. Flattening them would collide same-named files from two towers, since
every station writes `WindSonic_YYYYMMDD_HHMM.csv`.

## Operating

```bash
systemctl status observator-ingest
journalctl -u observator-ingest -f          # follow
journalctl -u observator-ingest --since -1h

sudo systemctl restart observator-ingest
sudo systemctl stop observator-ingest       # safe: files simply accumulate
```

Files accumulating in `upload/` while the agent is stopped is normal and lossless
— it catches up on start.

### One-shot and dry runs

```bash
cd /opt/observator/ingest-agent
sudo -u obsingest node dist/main.js --once      # one pass, then exit
sudo -u obsingest node dist/main.js --dry-run   # report only; moves nothing
```

`--dry-run` reports what it WOULD take and returns before claiming anything, so
it is safe to run against a live folder. (It was not always: until M24 it claimed
first and checked the flag afterwards, so a "dry" run renamed every settled file
into `staging/` — 19,000 of them on this box. `watcher-tree.test.ts` now asserts
a dry run adds nothing to staging.)

Stop the service first, or the two will contend for the same files.

### Health

```bash
ls "$ROOT/staging" | wc -l         # a growing backlog means uploads are failing
ls "$ROOT/quarantine" | wc -l      # anything here is data we could not read
/opt/observator/ingest-agent/deploy/archive-report.sh
```

The API side is `GET /v1/platform/health` (super-admin). Its `silentStations`
check is the one that matters here: **a station quiet for >15 minutes is
indistinguishable from a full disk on this box**, and the check's action says so.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Exits at boot with `… is not set` | Missing variable | Check `/etc/observator-ingest.env` |
| `OBSERVATOR_INGEST_TOKEN must be an ingest credential` | Wrong token kind | Provisioning tokens (`obsp_`) are rejected on purpose |
| 403 on every request | Token revoked, or wrong kind for the route | Re-mint with `provision:station` |
| `UNKNOWN_STATION` | The folder is not registered | Register the station; the mapping is `(account, folderPath)` and must be **active** |
| `INVALID_FOLDER` | Path traversal or an unsafe segment | Check the tower folder name |
| Backlog grows, no errors | Agent stopped, or the API is unreachable | `systemctl status`, then the journal |
| Files ingest to the wrong device | Two customers share an upload folder | Folder is the only routing signal — the API refuses duplicates at creation |
| Nothing ingests, no errors, folder has files | Files are in a subfolder deeper than 3 levels | The walk is depth-capped at 3 |

## Tests

```bash
npm test        # watcher, subdirectory walk, and the retention policy guard
npm run typecheck
```

`retention.test.ts` is a **policy** test, not a unit test: it asserts no code path
deletes an uploaded file. It is the machine-checkable form of the client's
instruction, and it was verified to fail when a stray `unlink` was added.
