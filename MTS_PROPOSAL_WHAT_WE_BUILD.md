# Sydney Metro M1 — what the software side actually is

Everything below is taken from `MTS-Proposal-31072026-1.pdf` (52 pages,
Observator → Metro Trains Sydney, 22 July 2026, ref `OBS-MTS-M1-WX-2026-01`).

**Separate project from our current platform.** This document is only "what
exists in the PDF and what we would have to build".

---

## 1. The project in five lines

- 7 weather stations along the Sydney Metro M1 rail line.
- They measure **rain, flood water level, temperature/humidity, wind**.
- At Marrickville the system **automatically starts and stops existing flood pumps**.
- Alerts go to Metro staff by **screen, email and SMS** within 5 minutes.
- Everything is viewed in one **online portal**.

It is **safety-critical rail**: the alerts trigger train patrols, speed
restrictions, and blocking the line.

Timeline: **~20 weeks** from contract award. Server + portal work sits in
**weeks 8–12**.

---

## 2. The 7 stations and what each has

| # | Location | Rain | Water level | Float switch | Temp/Humidity | Wind | Pumps |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | Marrickville | ✓ | ✓ | ✓ | – | – | ✓ |
| 2 | Marrickville–Dulwich Hill | – | ✓ | ✓ | ✓ | ✓ | – |
| 3 | Canterbury | – | ✓ | ✓ | – | – | – |
| 4 | Campsie | – | ✓ | ✓ | – | – | – |
| 5 | Belmore triangle | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| 6 | Lady Game Drive (tunnel) | – | ✓ ×2 | ✓ ×2 | – | – | – |
| 7 | Windsor Road SSC | – | – | – | ✓ | ✓ | – |

Location 6 is **two completely separate units** (up tunnel + down tunnel), each
with its own logger, solar panel and cellular link — but shown as one location in
the portal.

So the portal handles **8 loggers across 7 locations**.

---

## 3. The hardware (NOT our job — context only)

| Thing | Product |
|---|---|
| Wind | Gill WindSonic 75 ultrasonic, 0–75 m/s, at 10 m |
| Temp + humidity + pressure | Gill GMX300, at 1.5–2 m, ±0.3 °C |
| Rain | RIMCO 7499 tipping bucket, 0.2 mm per tip, ±2% |
| Water level | YGRD-65-D radar, 120 GHz, ±1 mm, non-contact |
| Backup water sensor | RS PRO RSF80 float switch |
| Manual check | Painted staff gauge (read by eye) |
| Data logger | **OMC-048** — scriptable, 1-minute logging, runs the pump control |
| Mast | VM5F telescopic, 11.3 m, hand winch |
| Enclosure | 316 stainless, IP66 |
| Power | 400 W solar + 2 × 55 Ah LiFePO4 battery |
| Comms | 4G/5G cellular |

**Key point:** the pump control logic runs **on the OMC-048 logger, not on the
server**. The server never sits inside the safety loop. It only shows what
happened and offers a supervised manual override.

That single fact makes the software far less risky than it first looks.

---

## 4. Web app or mobile app?

**Web app only. No mobile app.**

The PDF says it explicitly: *"Single responsive interface (device-width viewport,
fluid grid) that auto-resizes from phone to tablet to laptop/desktop, with
touch-friendly navigation … **one codebase, no separate app**."*

Figure 9 and Figure 13 show the same portal reflowing to a phone — including the
pump screen, so field staff can operate pumps from a phone browser.

So: **one responsive web app**, works on phone / tablet / laptop.

---

## 5. Is MERN the right stack?

**Yes, it works.** But the honest answer is more useful:

| Layer | MERN default | Better here | Why |
|---|---|---|---|
| Database | MongoDB | **MongoDB** ✓ | Data volume is tiny — 8 loggers × 1 reading/min ≈ **11,500 readings/day**. Any database handles this. Mongo time-series collections fit well. |
| Backend | Express | **NestJS** | Same Node/JS world, but gives structure, guards, validation and role handling out of the box. This system has 6 roles and an audit trail — Express means hand-rolling all of it. |
| Frontend | React | **Next.js (React)** | Responsive portal with maps and charts. Server rendering helps first-load on a phone in the field. |
| Realtime | — | **WebSockets (socket.io)** | Needed for on-screen alerts and the 10-minute health refresh. |

**Recommendation: NestJS + MongoDB + Next.js.**
That is the same stack we already built the Observator platform on — the roles,
audit log, alerting, map, charts, CSV export and RBAC all exist there already in
working form. We would be re-using proven pieces, not starting from zero.

**Do not use MERN's Express default** just because it's "the M-E-R-N". The
structure matters more than the letters here.

---

## 6. What we would build — every feature in the PDF

### A. Data intake

| # | What | How | Possible? |
|---|---|---|---|
| A1 | Receive telemetry from 8 OMC-048 loggers over 4G/5G | An ingest endpoint on the server | ✅ **Protocol not stated in the PDF — must ask** |
| A2 | Decode each message and stamp an authoritative server time | Parser per message type | ✅ Easy |
| A3 | Accept both routine (every 5 min) and event-triggered messages | Same endpoint, flagged | ✅ Easy |
| A4 | Reconcile store-and-forward backlog after an outage, losing nothing | Idempotency by content/ID, out-of-order insert | ✅ We have done exactly this before |
| A5 | Validate readings (range + plausibility) | Validation stage | ✅ Easy |

### B. Storage and history

| # | What | How | Possible? |
|---|---|---|---|
| B1 | Store every reading from every sensor, permanently | Time-series collection | ✅ Easy — volume is small |
| B2 | Query engine: filter by location + sensor + date range + averaging interval | Query screen, no SQL for the user | ✅ Easy |
| B3 | Paged, sortable results table with per-reading status | Standard table UI | ✅ Easy |
| B4 | One-click CSV export of exactly the filtered set | Streamed CSV | ✅ We have this |

### C. The alert engine — the heart of it

| # | What | How | Possible? |
|---|---|---|---|
| C1 | Configurable threshold table (not hard-coded) | Rules stored in DB, edited on a config screen | ✅ Easy |
| C2 | **Rainfall rolling totals**: live tally of last 1 h, 3 h, 3 days | Rolling-window aggregation on each new reading | ✅ Moderate |
| C3 | Thresholds ≥25 mm/hr, ≥45 mm/3 h, ≥120 mm/3 days | Compare tally to threshold | ✅ Easy |
| C4 | **Vigilance timers**: after rain drops below the line, hold the alert for 6 h / 12 h / 48 h | Countdown per active alert | ⚠️ **Needs a scheduler** — see §8 |
| C5 | Reset the countdown if more qualifying rain falls | Restart timer | ✅ Moderate |
| C6 | Automatic "all-clear" alert when the countdown ends | Scheduled job | ⚠️ Same scheduler |
| C7 | Temperature: ≥38 °C and ≥45 °C rising held >5 min; falling <45 °C / <38 °C held >10 min | Dwell timers | ✅ Moderate |
| C8 | Wind: ≥75 / ≥85 kph TSR wording, ≥120 kph block-line | Threshold + wording | ✅ Easy |
| C9 | Flood: standing water / above rail foot / trending down, with staged reinstatement (25 → 60 kph → unrestricted) | Multi-stage state machine | ✅ Moderate |
| C10 | **Redundancy fallback**: if a sensor fails, alert from a named alternate station and **reword** the alert to say which extra section it now covers | Per-location fallback map + message templating | ✅ Moderate |
| C11 | Fault alert first, telling MTS that fallback is now active | Alert on switch | ✅ Easy |
| C12 | Exact alert wording is configurable by MTS | Message templates in DB | ✅ Easy |

### D. Alert delivery

| # | What | How | Possible? |
|---|---|---|---|
| D1 | **On-screen** alert within 5 min | WebSocket push + pop-up | ✅ Easy |
| D2 | **Email** within 5 min | Email service | ✅ We have this |
| D3 | **SMS** within 5 min | Third-party SMS gateway | ⚠️ **No provider named in the PDF** — see §8 |
| D4 | System-fault alerts within 30 min | Same pipeline, lower priority | ✅ Easy |
| D5 | Every alert carries: date, time, **track (up/down)**, **rail (up/down)**, **kilometrage**, and a **hyperlink to the event** | Extra fields on every station | ✅ Easy, but these fields must exist in the data model |
| D6 | PTZ camera: pop-up prompt + "View live PTZ feed" button | Store a camera URL per location | ✅ Easy |
| D7 | Blinking red camera icon on the map when triggered | Map marker state | ✅ Easy |
| D8 | Same camera link inside the email, and a short URL inside the SMS | URL shortener for SMS | ✅ Easy |

### E. The portal screens

| # | Screen | Contents | Possible? |
|---|---|---|---|
| E1 | **Map / corridor view** | All stations, live readings against thresholds, system-health fields, station-status table | ✅ We have most of this |
| E2 | **Trends** | Time-series charts: wind mean + gust, rainfall intensity, temperature, humidity — with thresholds shown dashed | ✅ We have this |
| E3 | **Flood event** | Water-level series for adjacent locations, pump auto-start markers, pump status, affected-vicinity inset, timestamped event log | ✅ Moderate |
| E4 | **Marrickville pump station** | Live readings, level trend vs pump-start and high-high lines, duty/standby pump status and condition, **AUTO/MANUAL toggle**, **supervised START/STOP** | ⚠️ New — see §8 |
| E5 | **Health dashboard** | Refreshes at ≤10 min. Inoperable / unresponsive / missing sensor / missing pump data / low battery | ✅ We have the backend for this |
| E6 | **Alerts & notifications** | Filter by severity (alert / warning / information / cleared), by acknowledgement state, location, date range. Unacknowledged badge in header. Who acknowledged and when. CSV export | ✅ We have most of this |
| E7 | **Responsive everywhere** | 1 column phone → 2 tablet → 3–4 desktop | ✅ We have this |

### F. Users, roles and security

| # | What | Detail | Possible? |
|---|---|---|---|
| F1 | 20+ named logins, no shared accounts | — | ✅ Have it |
| F2 | MTS administrator manages users themselves, no dependence on us | Admin console | ✅ Have it |
| F3 | Add / edit / **suspend** / delete users | Suspend keeps audit history | ✅ Have it |
| F4 | **Invitation email** — user sets their own password | — | ⚠️ We disabled this on our platform; would need re-enabling |
| F5 | **6 roles**: Administrator, Operator, **Pump Controller**, Maintainer/Technician, Analyst/Reporting, Viewer | Role → permission bundles | ✅ Have the mechanism, need the 6 roles |
| F6 | **A user may hold more than one role** | — | ⚠️ Ours allows one role per user — needs changing |
| F7 | **Scope a user to specific stations or areas** | Per-station access | ⚠️ Ours scopes by organisation, not station — needs adding |
| F8 | **MFA (optional)** | TOTP or similar | ⚠️ New |
| F9 | Full audit trail: user changes, role changes, threshold edits, acknowledgements, **manual pump start/stop** — with user, timestamp, detail | — | ✅ Have it |
| F10 | Every action attributable to a named person | — | ✅ Have it |

### G. Hosting and operations

| # | What | Detail | Possible? |
|---|---|---|---|
| G1 | Hosted on AWS **or** Google cloud | Not decided in the PDF | ✅ |
| G2 | High availability, automatic failover, automated backups | Managed services | ✅ |
| G3 | Region / data residency / cyber requirements | **Deferred to detailed design** | ⚠️ Must be pinned down |
| G4 | Availability: not inoperable >12 h in any 6 months; ≤24 h total per year | | ⚠️ Needs real HA design |
| G5 | Planned maintenance: one 36-hour window per year, 48 h notice | | ✅ |
| G6 | Live solar/battery telemetry displayed and alarmed (state of charge, PV input, charge/discharge, faults) | Battery data from the charge controller via the logger | ✅ Easy |

---

## 7. What is NOT our job

All of this is Observator's, not software:

- Sensors, masts, enclosures, solar panels, batteries, cabling.
- Installation, site works, rail possessions, EMC compliance.
- Calibration and calibration certificates.
- The pumps themselves (they already exist on site — we only integrate).
- **The pump control logic** — it runs on the OMC-048 logger, not the server.
- Preventative and corrective maintenance (their Blue2Care programme).

---

## 8. The genuinely hard parts

Everything above is possible. These four need real thought:

**1. SMS within 5 minutes.**
The PDF promises it but **names no SMS provider and no delivery SLA**. Carrier
delivery time is outside anyone's control. Needs a provider with an Australian
delivery guarantee, plus a fallback provider, plus delivery-receipt tracking so
we can prove the 5 minutes was met.

**2. The vigilance-timer engine.**
6 h / 12 h / 48 h countdowns that survive restarts, reset on new rain, and fire an
automatic all-clear. This needs a **proper scheduler with persistent state** —
timers held in memory are lost on a restart, and here that means an alert
silently disappearing on a safety-critical system.

**3. Supervised pump control from a browser.**
An AUTO/MANUAL toggle and START/STOP on a real pump, from a phone. Needs
confirmation dialogs, a dedicated role, full audit, and a clear answer to "what
happens if the command is sent while the link is down". The safety logic itself
lives on the logger, which helps a lot — but the UI must never imply a command
succeeded when it did not.

**4. The ingest protocol is not specified.**
The PDF says only that the server "receives telemetry over the 4G/5G network and
decodes each message". **How** — MQTT, HTTP, a raw TCP socket, an Observator
proprietary format — is never stated. This is the first thing to ask, because it
decides the whole intake design.

---

## 9. Questions to ask before estimating

1. **How does the OMC-048 actually send data?** Protocol, format, authentication.
2. **Which SMS provider**, and what delivery SLA?
3. **AWS or Google, which region?** Is Australian data residency required?
4. Are there **cyber security standards** MTS requires (and a penetration test)?
5. **How long must data be kept**, and in what format at contract end?
6. Is **MFA optional or mandatory**?
7. Who supplies the **PTZ camera URLs and network access**? (The PDF lists this as
   a dependency on MTS.)
8. Are the **kilometrage / track / rail** values per station given to us, or do we
   collect them?

---

## 10. Bottom line

- **Web app, responsive, one codebase.** No mobile app.
- **NestJS + MongoDB + Next.js** — effectively the stack we already run.
- **~70% of the portal already exists** in our current platform: map, charts,
  history, CSV export, roles, audit, alert acknowledgement, health monitoring.
- **New work**: rainfall accumulation + vigilance timers, flood state machine,
  pump screen with supervised control, SMS channel, per-station user scoping,
  multi-role users, MFA, PTZ links, sensor-fallback rewording.
- **All of it is possible.** Nothing here needs unusual technology.
- The risk is **not** the software. It is the four items in §8 — and three of
  them are answered by asking Observator a question, not by writing code.
