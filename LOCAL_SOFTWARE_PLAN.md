# Implementation plan — Local (on-premise) weather station software

> Companion to `CLIENT_REPLY_LOCAL_SOFTWARE.md`, which holds the client's
> verbatim requirements. **That file is the source of truth for WHAT was asked.
> This file is HOW we build it.**

- **Product:** a second, separate product from the cloud portal
- **Client:** Observator Instruments (Hassan)
- **Status:** approved to start — *"Pls start the development now"* (10 Sep 2026)

---

## 1. Context

The client has a Gill GMX551 weather station plus a rain gauge. Its serial
(RS422) output goes through a PoE serial-to-Ethernet converter and arrives at a
Windows PC as a **live CSV stream over TCP/IP, one reading per second**.

He wants the portal we already built to display, log and alert on that data —
but running **on that PC**, reachable over the local network, with no internet
and no desktop application.

```
GMX551 + rain gauge → RS422 → PoE converter → TCP/IP
                                                 ↓
                          our listener on port 4000 (configurable)
                                                 ↓
                    aggregate 60 samples → ONE row per minute
                                                 ↓
                         MongoDB → backend → web portal (browser)
```

**Why this is cheap for us:** the portal, charts, alerts and most of the data
model already exist. **Why it is not free:** the input side is genuinely new,
and Windows packaging is real work we have never done for this product.

---

## 2. What we reuse vs what we build

| Area | Status |
| --- | --- |
| Dashboard, charts, wind rose, records, analytics | **Reuse unchanged** |
| Alerts — rules, evaluation, notifications | **Reuse unchanged** |
| Wind speed/direction, temp, humidity, pressure fields | **Already in `MetMeasure`** |
| Rainfall (`precipMm`, `precipRateMmHr`) | **Already in `MetMeasure`** |
| Dew point derivation | **Reuse** `environmental-csv/dew-point.ts` |
| Per-minute aggregation from many samples | **Pattern exists** — `parse-environmental-csv.ts` |
| Stream/column registry | **Reuse** `src/ingest/registry/` |
| Config from a file on startup | **Already `dotenv`** — satisfies the requirement natively |
| TCP listener | **BUILD** |
| GMX551 parser + column spec | **BUILD** |
| Minute aggregator (mean / max / sum / vector mean) | **BUILD** |
| Wind gust field | **BUILD** — no `windGustMs` exists today |
| Test data generator | **BUILD** |
| Single-site mode | **BUILD** |
| Windows services + installer | **BUILD** |
| Local backups | **BUILD** |

---

## 3. Milestones

Ordered so each one is demonstrable on its own. M1–M4 can be built and proven
with no sensor and no Windows box.

### M1 — TCP listener

`backend/src/ingest/tcp/` (new)

Listen on a configurable port; accept the converter's inbound connection; read
the stream line by line.

- Port from config, default **4000**, read at startup (`OBSERVATOR_TCP_PORT`).
- **Handle partial lines.** TCP delivers bytes, not lines. A reading can arrive
  split across two packets, or two readings in one packet. Buffer until a line
  terminator; never assume one packet is one reading.
- Cap the buffer so a peer that never sends a newline cannot exhaust memory.
- Survive disconnects and reconnect without a restart. Log connect/disconnect.
- Accept one connection at a time (one sensor per PC for v1); decide behaviour
  on a second connection rather than leaving it undefined.

**Done when:** a script that opens a socket and prints lines to it is read
correctly, including a reading deliberately split mid-line, and the listener
recovers when that script is killed and restarted.

### M2 — GMX551 parser + registry entry

`backend/src/ingest/gmx551/` (new) — mirrors `environmental-csv/`

- A `ColumnSpec[]` built with the existing `createColumnIndex`, so column names
  are data, not code — the live format **will** differ from our test data.
- Register with `label` / `description` so it appears in the portal like the
  others.
- Fields: wind speed, wind direction, temperature, humidity, pressure, rain.
- Derive dew point using the existing helper.

**Done when:** unit tests parse our generated sample and map every column.

### M3 — Minute aggregator

`backend/src/ingest/tcp/minute-aggregator.ts` (new)

Buffer the ~60 samples of each minute and emit **one row**.

| Field | Rule |
| --- | --- |
| Wind speed | **mean AND max** (max = the gust) |
| Wind direction | **vector mean** — see §4 |
| Temperature, humidity, pressure | mean |
| Rain | **sum** — rainfall accumulates |

- Flush when the first sample of the **next** minute arrives.
- Also flush on a timer, so a dropped connection cannot strand a part-minute
  in memory forever.
- Record how many samples the minute actually contained — a minute built from
  6 samples is not the same as one built from 60, and only the row can say so.
- Tolerate gaps and out-of-order samples rather than assuming a clean 1 Hz.

**Done when:** tests cover a full minute, a short minute, a minute with gaps,
and the direction cases in §4.

### M4 — Test data generator

`tools/gmx551-simulator/` (new)

A small script that opens a TCP connection and emits realistic GMX551 CSV at
1 Hz. The client has no data yet and explicitly asked for this.

Must be able to produce the awkward cases, not just the happy path: a gust
spike, direction crossing north, rain starting and stopping, a missing field,
a dropped connection.

**Done when:** M1–M3 run end to end against it and rows land in MongoDB.

### M5 — Single-site mode

A local install has one customer and one station. Customer switching, SFTP
accounts, station provisioning and the platform admin screen are meaningless
there.

- A `DEPLOYMENT_MODE=local` flag that hides those surfaces.
- Seed one organisation and one device automatically on first run — nobody
  should have to create a customer to see their own weather.

**Done when:** a fresh install shows data with no manual setup.

### M6 — Windows packaging

- MongoDB, the backend and the listener all installed as **Windows services**,
  so everything restarts by itself after a power cut with nobody logged in.
- A single installer or documented setup script.
- Fixed local address for the browser; document how to find it.

**Done when:** the PC is switched off at the wall, switched back on, and data
is flowing with no human intervention.

### M7 — Backups

Scheduled `mongodump` to a second drive or network folder, with retention.
Atlas does this automatically; a local PC does not, and nobody notices until
the drive fails.

### M8 — Handover

Install guide, config reference, "how to change the port", how to check it is
running, and what to do when it stops.

---

## 4. Technical decisions and traps

### Wind direction CANNOT be averaged arithmetically — highest risk item

350° and 10° are both nearly north. Their arithmetic mean is **180° — due
south**, exactly backwards.

Direction must be **vector-averaged**: convert each angle to a unit vector,
average the components, convert back with `atan2`.

This is the single most dangerous item in the plan, because the failure is
silent. A wind rose built on arithmetic means looks entirely plausible and is
wrong. The cloud system never hit this because it stores every second and never
averages. **The moment we aggregate to one minute, we own it.**

Tests must include: 350°/10° straddling north, and a full-circle spread where
the mean is genuinely undefined.

### Store the gust, not just the mean

The gust exists only in the per-second data. Once the other 59 samples are
discarded it is **gone permanently** and cannot be recovered from history.

Two extra numbers per row is ~7% more storage — nothing at this rate — and it
removes the risk of a rebuild if gusts are asked for later. Mean + gust is also
standard meteorological practice, which matters for a client who sells
instruments for a living.

**Requires a schema addition:** `MetMeasure` has no `windGustMs` today.

### Rain is summed, never averaged

Rainfall accumulates. An averaged rainfall figure is meaningless. Confirm
whether the gauge reports **tips**, **mm since reset**, or **rate** — the three
need different handling, and a counter that resets needs care across a reboot.

### The stream has no file boundary

Existing parsers take a whole file that represents one complete minute, and the
file boundary is what says "this record is finished". A stream has none. The
reader decides for itself where a record ends and when a minute is complete.

This is the same class of bug as the 605-minute SFTP delay: the cost of getting
"is it finished?" wrong is silent and large.

### Everything must survive a reboot

The PC will be switched off and on with nobody logged in. Services, not
console windows.

### Storage at the agreed rate

| Rate | Per day | Per year |
| --- | --- | --- |
| 1/second | ~54 MB | ~20 GB |
| **1/minute (agreed)** | **~0.9 MB** | **~0.3 GB** |

Storage is a non-issue locally. The 512 MB pressure on the cloud system is the
**Atlas free-tier ceiling**, a pricing limit — not MongoDB being heavy.

---

## 5. Blocking questions

| # | Question | Blocks |
| --- | --- | --- |
| 1 | Mean, or mean + gust, for the stored minute? *(recommendation sent)* | M3, schema |
| 2 | Which GMX551 output format / field layout? | M2 — mitigated by the registry |
| 3 | Does the rain gauge feed the GMX551 or arrive separately? | M2 |
| 4 | Rain reported as tips, mm-since-reset, or rate? | M3 |
| 5 | Fully standalone, or also sync to the cloud portal? | M5, architecture |
| 6 | One station per PC, or more? | M1, M5 |
| 7 | Who installs and updates on site? | M6, M8 |
| 8 | Who owns backups? | M7 |

**None of these block M1 or M4.** Start there.

---

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| **Real data differs from our test data** — no live sensor exists yet | Parser built on the column-spec registry, so adapting is one entry, not a rewrite. Flag to the client as a schedule risk we do not control |
| **Wind direction averaged wrongly** — silent, plausible-looking corruption | Vector averaging, with tests on the north-crossing case |
| **Gusts lost forever** | Store max from day one |
| **Rain counter resets or double-counts across a restart** | Confirm the gauge's reporting mode before building M3 |
| **Nothing restarts after a power cut** | Windows services, proven by actually pulling the power |
| **No backups until a drive fails** | M7, and name an owner |
| **Scope creep from "it's the same software"** | Track as a separate product with its own scope and commercials |
| **Partial TCP lines treated as whole readings** | Explicit buffering in M1, tested with a deliberately split line |

---

## 7. Verification

- **Unit:** parser against generated samples; aggregator for mean, max, sum and
  the direction cases; the north-crossing test must fail against arithmetic
  averaging, or it is not testing anything.
- **Integration:** simulator → listener → aggregator → MongoDB, then confirm
  the portal's existing dashboard, charts and alerts light up untouched.
- **Resilience:** kill the simulator mid-minute; restart it; change the port in
  the config file and restart; pull the PC's power.
- **Acceptance:** with real hardware, confirm the live format matches and a
  full day logs without gaps.

---

## 8. Suggested order of work

1. **M1 + M4 together** — listener and simulator. Neither needs answers from
   the client, and together they prove the hardest new part.
2. **M2** — parser, once the format question is answered or assumed.
3. **M3** — aggregator, with the direction and rain rules settled.
4. **M5** — single-site mode.
5. **M6 + M7** — Windows packaging and backups.
6. **M8** — handover docs.
