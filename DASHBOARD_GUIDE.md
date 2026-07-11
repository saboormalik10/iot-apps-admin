# Dashboard — Simple Guide

This explains the **Dashboard** page (the home screen you see after logging in): what
each part shows, which database table it comes from, and every button/action you can use.

> **About "tables":** the backend uses **MongoDB**, so its tables are called
> **collections**. They mean the same thing. Below, "table (collection)" is the place
> in the database the data is read from.

> **Everything is live.** The dashboard loads its data **once** when the page opens,
> then updates **automatically** whenever a device sends new data (through a live
> socket connection). You don't need to refresh the page.

---

## 1. The top bar (always visible, on every page)

| Item | What it is | What you can do |
|---|---|---|
| **☰ menu** (phones only) | Opens the side menu | Tap to open/close the navigation drawer |
| **Live dot** | Shows the live-connection status | Green = connected, amber = reconnecting, grey = offline. Display only |
| **Units toggle** | Switches measurement units | Click to change how values are shown (e.g. wind/pressure/temperature units) |
| **Theme toggle** (☾/☀) | Light or dark mode | Click to switch the look |
| **Bell 🔔** | Notifications | Shows an unread count; click to open the list of alerts/notifications |
| **User menu** (your initials) | Your account | Open your profile / settings, and **Log out** |

**Side menu (left):** links to **Dashboard, Devices, Fleet map, Records, Analytics,
Users, Settings**. Some links only appear based on your role and which features
are turned on. (The old **Organization** entry was replaced by **Users** — three tabs:
**MET users**, **NEP users**, and **Admins**. Other roles like viewers are hidden for now.)

---

## 2. The Scope Bar (the filter row under the top bar)

This is the **filter** that controls what the dashboard shows. It stays in the web
address, so you can bookmark or share a filtered view.

| Control | What it does |
|---|---|
| **Device type** | Show **All types**, only **MET-LINK** (weather), or only **NEP-LINK** (water). Choosing a type now **hides the other instrument's panels** (e.g. MET-LINK hides the water/turbidity panel). |
| **Device** | Pick **All devices** or one specific device. A specific device drives the live weather / wind rose / turbidity / sensor-history panels of the matching type. |
| **Date range** | Choose the time window: **1h, 24h (default), 7d, 30d, or All**. This drives the **Sensor history** chart. |
| **Include demo data** | On/off switch. **Off by default = real data only.** Turn it **on** to also include test/demo readings in the counts, live tiles, wind rose, and history. |
| **Reset to All** | Appears once you change a filter — one click puts everything back to the default |

**Note:** some panels need a single device (like live weather or the wind rose). When
the filter is on "All devices", the dashboard **auto-picks** the most recently active
device for those panels and shows a small *"(auto-selected)"* note.

### Which API each filter hits, and what changes

Changing a filter re-fetches just the affected request **once** (new value → one new
request), then keeps updating live via sockets — it never loops.

**Device type** — re-fetches the KPI summary with `type=…` AND shows/hides panels.
(The type options themselves come from the backend device list — only types your
org actually owns are offered.)

| You pick | Sections shown | Sections hidden | KPI numbers |
|---|---|---|---|
| MET-LINK | Live weather, Sensor history, Wind rose | Live turbidity, "NEP sessions" tile, MET/NEP split tile | Counts narrow to MET devices/records only |
| NEP-LINK | Live turbidity | Live weather, Sensor history, Wind rose, "MET records" tile, MET/NEP split tile | Counts narrow to NEP devices/sessions only |
| All types | all of them | — | Org-wide totals |

**Device** — adds `deviceId=…` to the device-scoped endpoints AND to the KPI
summary. Picking a device also **acts like picking its type**: the dashboard looks
up whether the device is MET or NEP and hides the other type's sections, exactly
like the type filter.

| API hit | Section that updates |
|---|---|
| `GET /dashboard/summary` | KPI tiles (narrow to that one device) |
| `GET /dashboard/met/latest` | Live weather tiles |
| `GET /dashboard/met/windrose` | Wind rose |
| `GET /dashboard/met/history` | Sensor history |
| `GET /dashboard/nep/latest` | Live turbidity tile |

**Date range** — adds `from=…&to=…` to **one** endpoint:

| API hit | Section that updates |
|---|---|
| `GET /dashboard/met/history` | Sensor history chart (only) |

**Include demo data** — adds `includeDemoMode=true` when **on** (omitted when off, so the backend excludes demo):

| API hit | Section that updates |
|---|---|
| `GET /dashboard/summary` | KPI — MET-records & NEP-sessions counts + sparklines |
| `GET /dashboard/met/latest` | Live weather tiles |
| `GET /dashboard/met/windrose` | Wind rose |
| `GET /dashboard/met/history` | Sensor history |
| `GET /dashboard/nep/latest` | Live turbidity tile |

**What no filter changes (always org-wide):**

| Section | API | Why |
|---|---|---|
| Fleet status table | `GET /dashboard/devices` | Shows every device; no filter applied |
| Fleet map | `GET /dashboard/org/device-map` | Shows all device locations |
| Recent alerts / Armed-alerts count | `GET /notifications`, alert-rule count | Alert feed and rules are org-wide, not scope-filtered |

---

## 2b. What each panel shows per filter (All vs. selected)

The quick answer to "what will I see when…":

### All types + All devices (the default)

| Panel | What it shows |
|---|---|
| **KPI row** | Org-wide totals: all devices, online/offline, MET records, NEP sessions, armed alerts, MET/NEP split — all 6 tiles visible |
| **Live weather / Wind rose / Sensor history** | **One** weather station, **auto-picked** = the most recently *seen* (heartbeated) MET device. You'll see the *"(auto-selected)"* note next to the device name |
| **Live turbidity** | **One** water probe, auto-picked the same way among NEP devices |
| **Fleet status table / Fleet map / Recent alerts** | Always **everything** in the org |

> **Why "auto-picked"?** Live weather, the wind rose, and turbidity are physical
> readings at one instrument's location — an "average across stations in different
> places" would be a number that is true nowhere. So the dashboard always narrows
> these panels to a single device and tells you which one.

### A type selected (MET-LINK or NEP-LINK)

| Panel | What happens |
|---|---|
| **KPI row** | Numbers narrow to that type (e.g. MET-LINK → only MET devices/online/records). The other type's data tile and the MET/NEP split tile **disappear** |
| **Instrument panels** | Only that type's panels stay (MET → weather panels; NEP → turbidity). The device auto-pick now only considers devices of that type |
| **Device dropdown** | Only lists devices of that type |
| **Fleet table / map / alerts** | Unchanged — still org-wide |

### A single device selected

| Panel | What happens |
|---|---|
| **KPI row** | Numbers narrow to **that one device** (Devices = 1, its online state, its records/sessions only). The other type's tiles disappear |
| **Instrument panels** | The dashboard detects the device's type and shows **only** that type's panels, pointed at exactly that device — no more "(auto-selected)" |
| **Fleet table / map / alerts** | Unchanged — still org-wide |

### Why a panel can look empty even when a device is selected

These panels show the device's **latest actual data** — they never invent values:

- **Live weather** shows "–" for any sensor the latest reading didn't include
  (a station that only reports wind + temperature shows dashes everywhere else).
- **Wind rose** needs readings that contain **both wind speed and wind direction**;
  a device that never uploaded direction data draws an empty rose.
- Both read the device's **most recent record** — if that record is old, you're
  seeing the newest data that exists, not today's. Both panels show an
  **"as of …"** stamp with the reading's age, plus a **Stale** badge when the
  data is more than 10 minutes old, so old data can't be mistaken for live.
- On "All devices" the auto-pick chooses the most recently **seen** device — which
  may be a device with very little data (a heartbeat updates "seen" even if the
  device never uploaded rich readings). Pick your real station in the Device
  dropdown to force the panels onto it.

---

## 3. The dashboard panels (what you see on the page)

### A. KPI row (the number tiles at the top)
- **Shows:** Total devices · Online (and offline) · MET records · NEP sessions ·
  Armed alerts · MET/NEP device split. The MET-records and NEP-sessions tiles include
  a tiny 14-day trend line (sparkline).
- **Follows the filter:** with a type or device selected, every count narrows to that
  scope and the tiles that don't apply (the other type's data tile, the MET/NEP
  split) are hidden — see section 2b. "Online" means *seen in the last 5 minutes*.
- **From:** `GET /dashboard/summary`, which counts across the **Device**, **MetRecord**,
  **NepSession**, and **AlertRule** tables (collections).
- **Actions:** the **Armed alerts** tile is clickable → goes to the **Alerts** page.

### B. Live weather tiles (MET-LINK)
- **Shows:** the latest weather snapshot for one weather station — wind (true &
  relative), temperature, humidity, pressure, solar, rain, dew point, voltage, plus a
  Beaufort wind badge. Missing sensors show a "–" instead of a fake 0.
- **From:** `GET /dashboard/met/latest` → the **MetMeasure** table (latest reading),
  with the device name from **MetRecord**.
- **Actions:** none to click — it refreshes itself live as new readings arrive.

### C. Sensor history (1-min)
- **Shows:** a line chart of one weather sensor over the selected time range, in 1-minute
  steps (min / average / max).
- **From:** `GET /dashboard/met/history` → the **MetMeasure** table.
- **Actions:**
  - **Sensor dropdown** — pick which sensor to chart (temperature, humidity, pressure, …).
  - **Table view toggle** — switch the chart to a data table.
  - **Export** — download the data as **CSV** or the chart as a **PNG** image.

### D. Wind rose
- **Shows:** the signature circular wind chart — wind direction (16 compass points) split
  by speed bands, over the last ~10 or ~2 minutes.
- **From:** `GET /dashboard/met/windrose` → the **MetMeasure** table (recent samples).
- **Actions:**
  - **True / Relative** — switch the wind-direction reference.
  - **10 min / 2 min** — choose how much recent data to include.
  - **Table view toggle** and **CSV / PNG export**.

### E. Live turbidity tile (NEP-LINK)
- **Shows:** the latest water-quality session — current turbidity (NTU) with a
  water-quality class badge, min/max turbidity, temperature, battery, and sample count.
- **From:** `GET /dashboard/nep/latest` → the **NepSession** table (session summary) +
  **NepSample** table (most recent sample).
- **Actions:** none to click — updates live as new samples arrive.

### F. Fleet status table
- **Shows:** one row per device with an online/offline badge, last-seen time, and a
  battery meter.
- **From:** `GET /dashboard/devices` → the **Device** table.
- **Actions:** **click a device row** → opens that device's detail page.

### G. Fleet map
- **Shows:** a map with a pin for each device at its last known GPS location, coloured by
  online/offline status.
- **From:** `GET /dashboard/org/device-map` → the **Device** table (last GPS comes from
  the device's recent **MetMeasure** / **NepSample** readings).
- **Actions:** **pan and zoom** the map; **click a pin** to see the device name and
  status. (There's a bigger full-screen version on the **Fleet map** page.)

### H. Recent alerts
- **Shows:** the latest few alert notifications (threshold breaches), newest first, with
  a "New" badge on unread ones.
- **From:** `GET /notifications` → the **Notification** table (only the "alert" type).
- **Actions:** **Alert rules** link → goes to the **Alerts** page.

---

## 4. Which mobile-app action updates which section

The **MET-LINK** (weather) and **NEP-LINK** (water) mobile apps send data to the server.
Each kind of upload updates specific dashboard panels **instantly** (through the live
socket) — only that panel reloads its own data.

| When the mobile app does this… | API it calls | Dashboard sections that update |
|---|---|---|
| Weather station uploads readings (MET) | `POST /records` + `POST /records/:id/measures` (or `POST /sync/upload`) | **Live weather tiles**, **Sensor history**, **Wind rose**, and the **"MET records"** count |
| Water probe uploads a session / samples (NEP) | `POST /sessions` + `POST /sessions/:id/samples` (or `POST /sync/upload`) | **Live turbidity tile**, and the **"NEP sessions"** count |
| Device sends a heartbeat (battery / online / firmware) | `PATCH /sync/device-status` | **Fleet status table**, **Fleet map**, and the KPI **Online / Offline** counts |
| A new device pairs for the first time | `POST /devices` | **Fleet status table**, **Fleet map**, and the KPI **Devices** / **MET-NEP split** |
| An uploaded reading crosses an alert threshold | (happens automatically from the uploads above) | **Recent alerts**, the KPI **Armed alerts** tile, and the 🔔 **bell** |
| App only downloads data / checks sync status | `GET /sync/download`, `GET /sync/status` | Nothing — these are read-only and don't change the dashboard |

*In short: MET uploads → the weather panels; NEP uploads → the turbidity panel;
heartbeats/pairing → the device panels; threshold breaches → the alert panels.*

---

## 5. How much data each section shows (time window)

| Section | How much data / time window |
|---|---|
| **KPI counts** (Devices, MET records, NEP sessions) | **All-time totals** — everything ever recorded |
| **KPI sparklines** (the mini trend lines) | **Last 14 days** — one point per day |
| **Live weather tiles** | Just the **single latest** reading (one moment in time) |
| **Sensor history** chart | The **selected date range** (default: **last 24 hours**), drawn in **1-minute** steps (min / average / max per minute) |
| **Wind rose** | The **last ~10 minutes** or **~2 minutes** of wind samples (you choose) |
| **Live turbidity tile** | The **latest session** summary + the **single most recent** sample |
| **Fleet status table** | **Right now** — current online status, last-seen time, and battery (no history) |
| **Fleet map** | Each device's **last known** GPS position (a current snapshot) |
| **Recent alerts** | The **latest ~6** alert notifications |

*Tip: the **date range** in the Scope Bar (1h / 24h / 7d / 30d / All) only changes the
**Sensor history** window. The live tiles, wind rose, and fleet panels always show the
newest data regardless of the range.*

---

## 6. Quick reference

| Panel | Shows | Table (collection) | Main actions |
|---|---|---|---|
| KPI row | Headline counts + trends | Device, MetRecord, NepSession, AlertRule | Click "Armed alerts" → Alerts |
| Live weather | Latest MET sensor values | MetMeasure (+ MetRecord) | — (live) |
| Sensor history | 1-min sensor line chart | MetMeasure | Sensor dropdown, table view, CSV/PNG |
| Wind rose | Wind direction × speed | MetMeasure | True/Relative, 10/2 min, table view, CSV/PNG |
| Live turbidity | Latest NEP session/sample | NepSession + NepSample | — (live) |
| Fleet status | Device online + battery | Device | Click row → device detail |
| Fleet map | Devices on a map | Device (+ MetMeasure/NepSample GPS) | Pan/zoom, click pin |
| Recent alerts | Latest alert notifications | Notification | "Alert rules" link |

---

## 7. How "live" works (in one line)
When a device uploads new data, the server pushes a small event to your browser
(`met:latest`, `met:windrose`, `nep:sample`, `device:status`, `alert:triggered`), and the
matching panel re-loads just its own data — so the dashboard stays current on its own,
without hitting the server in a loop.
