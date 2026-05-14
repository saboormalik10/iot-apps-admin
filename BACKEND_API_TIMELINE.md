# Observator Instruments — Backend API, MongoDB Schema & 6-Month Weekly Timeline
**Project:** MET-LINK + NEP-LINK Cloud Platform + Admin Dashboard  
**Prepared by:** Veldora Studio  
**Client:** Observator Instruments (AU / NL) — Contact: Dana Galbraith  
**Date:** May 2026  
**Stack:** Node.js + TypeScript + Express + Mongoose (MongoDB)  
**Hosting:** Render (Docker) | **DB:** MongoDB Atlas  
> ⚠️ **Month 1 Actual:** Deployed to **Render** (not Railway). Live URL: `https://iot-apps-admin.onrender.com`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [MongoDB Collections & Schema](#2-mongodb-collections--schema)
3. [Complete API Endpoint Catalog](#3-complete-api-endpoint-catalog)
4. [Admin Dashboard Widget Specification](#4-admin-dashboard-widget-specification)
5. [6-Month Weekly Timeline](#5-6-month-weekly-timeline)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Consolidated Known Mobile App Bugs](#7-consolidated-known-mobile-app-bugs)
8. [Data Retention & Storage Estimates](#8-data-retention--storage-estimates)
9. [Backend Cron Jobs & Background Tasks](#9-backend-cron-jobs--background-tasks)

---

## 1. System Overview

### What Exists (Both Mobile Apps — Fully Working)

| App | Hardware | Tech Stack | Local Storage | Key Data |
|---|---|---|---|---|
| MET-LINK | Meteorological weather station | Ionic 8 + Angular 19 + Capacitor 7 | SQLite (`db.storage`) — `record` + `measure` + `picture` tables | Wind (NMEA MWV), Temp, Humidity, Pressure, GPS, Solar, Precipitation, Dew Point, QNH/QFE, Voltage/Current, Battery |
| NEP-LINK | Water turbidity/quality sensor | React Native 0.81.4 + Redux + SQLite (`app.db`) | SQLite — `loggingSessions` + `loggingSessionSamples` + `knownDevices` | Turbidity (NTU), Water Temp, Probe Range (R1/R2/R3), GPS, Battery (% + mV) |

### What We Build (Backend + Admin Dashboard)

```
MET-LINK device ─BLE─► Ionic/Angular mobile app ──WiFi sync──► Node.js REST API ──► Admin Dashboard
NEP-LINK device ─BLE─► React Native mobile app   ──WiFi sync──► Node.js REST API ──► Admin Dashboard
                                                                      │
                                                               MongoDB Atlas
```

**Backend modules to build:**  
`Auth` → `Devices` → `MET Records` → `NEP Sessions` → `Dashboard Aggregations` → `Files` → `Sync` → `Organizations`

### Data Source — What The Apps Actually Produce

**MET-LINK (from bluedata.service.ts analysis):**
- `$IIMWV` → Wind Speed + Direction (relative AND true), unit = m/s / km/h / knots
- `$IIXDR` → Temperature (°C), Humidity (%), Pressure (hPa), Precipitation (mm), Solar (W/m²), Voltage (V), Current (A)
- `$GPGGA` → Latitude, Longitude, GPS Altitude (m), Satellites count, HOR dilution, GPS quality
- Battery JSON → `{ isCharging, percentage, serialNo, firmwareVersion }`
- Legacy battery → `~,stats,<pct>,<charging>`
- Calculated: Dew Point (°C), QFE (hPa), QNH (hPa)
- CSV row format per second: `Value,Unit,Description,Value,Unit,Description,...,Lat,Lng`

**NEP-LINK (from LoggingActions.ts + db.js analysis):**
- `R1,5.23,18.4` → Low range turbidity 0–10 NTU, temperature °C
- `R2,245.67,21.0` → Medium range 10–1000 NTU, temperature °C
- `R3,4521.88,0.0` → High range >1000 NTU (no temp)
- Battery JSON → `{ percentage, rawVoltage, isCharging }`
- `~,stats,85,1` → legacy battery
- SQLite sample → `{ sessionId, timestamp(ms), turbidityValue, temperatureValue, locationLat, locationLng, batteryLevel, batteryRawVoltage }`

**Smithtek Dashboard reference — widgets + LIVE values confirmed (fetched May 12, 2026 from client URL):**

| Widget | Smithtek Label | Live Value Confirmed Today | Notes |
|---|---|---|---|
| Temperature tile | "TEMPERATURE" | **20.040 °C** — `Last Updated: 05/12/2026 08:57` | Large number tile + last-updated timestamp |
| Humidity gauge | "PERCENT RELATIVE HUMIDITY" | **63.000 %** (gauge 0–100) | Circular gauge |
| Pressure gauge | "BAROMETRIC PRESSURE hPa" | **1,025.200 hPa** (gauge 0–1100) | Circular gauge |
| Dew Point tile | "DEW POINT °C" | Calculated | Number tile |
| Wind Speed gauge | "WIND SPEED km / hr" | **0.890 km/h** (gauge 0–65) | The `0.890` live value confirms the real station is running |
| Wind Direction numeric | "WIND DIRECTION DEGREES" | Live | Separate numeric degrees display |
| Wind Direction compass | "WIND DIRECTION" | Live | Arrow/needle compass widget — separate from DEGREES |
| Wind Rose canvas | "WIND ROSE" | Live canvas | Same algorithm as `bluedata.service.ts` |
| DC Voltage | "DC VOLTAGE" | Live | Solar panel / DC input |
| Battery voltage | "BATTERY VOLTS" | Live | Maps to `battCapacity` |
| Map | "Map" | Live | Station GPS marker |
| Precipitation total | "Total Precipitation" | **0.00** | Resets on... unclear from Smithtek |
| Precipitation rate | "Precipitation intensity" | Live | Rate widget |
| Line charts | Multiple — one per sensor | Live (time series) | One chart per sensor tile |

> **Critical insight:** The Smithtek dashboard is LIVE with real data from a physical MET-LINK station as of today (08:57 AM, May 12 2026). Temperature 20.04°C, humidity 63%, pressure 1025.2 hPa, wind 0.89 km/h. The client is actively using a live device. Our admin dashboard must exceed this in UX and feature depth.

> **Note:** Smithtek shows TWO separate wind direction widgets: "WIND DIRECTION DEGREES" (numeric) and "WIND DIRECTION" (compass/arrow). Both are needed in the admin dashboard.

---

### BLE Hardware Constants (Both Apps — Confirmed from Source Code)

Both MET-LINK and NEP-LINK use **identical BLE service and characteristic UUIDs**, confirming they share the same hardware platform:

| Constant Name | UUID | Purpose |
|---|---|---|
| `SENSOR_DATA_SERVICE_UUID` | `c25d444c-2836-4cc0-8f2f-95f4c8fd7f8b` | Primary sensor data BLE service |
| `SENSOR_DATA_CHARACTERISTIC_UUID` | `9915b449-2b52-429b-bfd0-ab634002404d` | Wind / turbidity / temperature / pressure data stream (NMEA format) |
| `METADATA_SERVICE_UUID` | `86a324aa-4b2f-46c7-b4d8-949cae59e6d7` | Device metadata BLE service |
| `METADATA_CHARACTERISTIC_UUID` | `266b64b4-19ee-4941-8253-650b4d7ab197` | Battery JSON: `{ isCharging, percentage, serialNo, firmwareVersion }` |

**BLE Connection:** Both apps request `requestMTU(200)` + `ConnectionPriority.HIGH` (~15ms intervals) on connect.

---

### MET-LINK Unit Conversion System (from `change-units.page.ts`)

MET-LINK has a dedicated **Change Units** page where the user selects their preferred display unit per sensor group. These preferences are stored in Capacitor Preferences and synced to the `deviceSettings` cloud document. The backend stores all values in **base units only** — the dashboard applies the conversion client-side.

| Sensor Group | Pref Key | Supported Units | Base Unit | Key Conversion Formulas |
|---|---|---|---|---|
| Wind Speed | `unit_wind_speed` | m/s, knots, km/h, mph, **Beaufort (Bft)** | m/s | Bft: `0.836 × v^(3/2)`, inverse: `(Bft/0.836)^(2/3)` |
| Pressure | `unit_pressure` | hPa, mbar, inHg, mmHg, PSI | hPa | inHg: `÷33.8639`, mmHg: `÷1.33322`, PSI: `÷68.9476` |
| Temperature | `unit_temperature` | °C, °F, Kelvin | °C | °F: `(°C × 9/5) + 32`, K: `°C + 273.15` |
| Altitude | `unit_altitude` | m, ft | m | ft: `÷0.3048` |

> **Backend rule:** ALL sensor values in MongoDB are stored in base units (m/s, hPa, °C, m). The API returns base unit values + the device's current `unitXxx` preference so the dashboard can convert for display. This avoids precision loss and makes data universally queryable.

> **Important distinction:** `windRoseUnit` (Preferences key) = affects ONLY the wind rose canvas label. `unit_wind_speed` (from Change Units page, stored in `activeUnitMap`) = affects ALL wind speed displays. Both are separate preferences that must BOTH be stored in `deviceSettings`.

---

### Third-Party Libraries (Both Apps — Relevant for Backend Design)

**MET-LINK (Ionic/Capacitor):**
- `@capacitor-community/bluetooth-le ^7.1.1` — BLE
- `@capacitor/camera ^7.0.0` — Session photos (CameraSource.Prompt = native iOS sheet)
- `@capacitor/filesystem ^7.0.0` — Photo file storage (`Directory.Data`)
- `@capacitor/geolocation ^7.0.0` — Phone GPS
- `@capacitor/preferences ^7.0.0` — ALL user settings: QNH/QFE heights, wind unit/period/orientation, color scheme, dashboard tile layout configs, demo mode
- `capacitor-email-composer ^7.0.0` — Email export with CSV + photos as base64 attachments
- `chart.js ^4.4.8` — Rolling 20-point live line chart (graph mode on dashboard)
- `moment ^2.30.1` — All date/time formatting

**NEP-LINK (React Native):**
- `react-native-ble-plx ^3.5.0` — BLE (same hardware UUIDs as MET-LINK above)
- `react-native-maps ^1.26.14` — GPS track map in session detail view
- `react-native-view-shot ^4.0.3` — Map screenshot → saved as `loggingSessionThumnails/{sessionId}.jpg` (note: single 'b' in "Thumnails" — typo in code path — preserve exactly)
- `react-native-image-picker ^8.2.1` — Session photos
- `react-native-gifted-charts ^1.4.64` — Turbidity + temperature line charts (limit 200 points in UI)
- `react-native-fs ^2.20.0` — File system for thumbnails + photos
- `react-native-share ^12.2.0` — Share CSV + photos via system share sheet
- `redux-persist ^6.0.0` — Session list persisted locally (app restart resilient)
- `luxon ^3.7.2` — All date/time formatting
- `axios ^1.12.2` — HTTP client already installed — will be used for cloud sync

**NEP-LINK on-device file paths:**
```
RNFS.DocumentDirectoryPath/
  loggingSessionFiles/
    {sessionId}/
      mapimage/          ← map screenshots (.jpg)
      photos/            ← session photos (.jpg, if used)
  loggingSessionThumnails/
    {sessionId}.jpg      ← thumbnail shown in session list (react-native-view-shot)
```

**MET-LINK CSV export format** (from `export.service.ts:buildCsv()`):
```
Timestamp,Type,Unit,Description,Type,Unit,Description,...,Latitude phone,Longitude phone,Comment:,<comment value>
<timestamp>,<value>,<unit>,<desc>,...,<phoneLat>,<phoneLng>
<timestamp>,<value>,<unit>,<desc>,...,<phoneLat>,<phoneLng>
```

**NEP-LINK CSV export format** (from `LoggingSessionView.tsx` + existing app export):
```
Date,Time,Lat,Lon,Turbidity,Temperature,,Comment,Battery Level
<timezoneName>,,,,NTU,°C,,,,%
01 May 2026,14:32:01,51.5074,-0.1278,245.67,18.3,,Field notes,85
```

---

## 2. MongoDB Collections & Schema

> All collections use MongoDB's native `_id` (ObjectId). App-facing IDs are a separate `id` field (UUID v4 for sessions from the RN app, auto-ObjectId for everything else). Timestamps are Unix milliseconds for sensor data; ISO strings for human-readable metadata.

---

### 2.1 `organizations`

```javascript
{
  _id: ObjectId,
  name: String,                    // "Observator Instruments AU"
  slug: String,                    // "observator-au" — URL-safe, unique
  contactEmail: String,
  country: String,                 // "AU" | "NL" | etc.
  timezone: String,                // "Australia/Melbourne" — org default
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date | null           // soft delete
}

// Indexes
{ slug: 1 }  unique
```

---

### 2.2 `users`

```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,        // ref: organizations
  email: String,                   // unique per org
  passwordHash: String,            // bcrypt cost 12
  firstName: String,
  lastName: String,
  role: String,                    // "admin" | "operator" | "viewer"
  isActive: Boolean,               // false = account suspended
  lastLoginAt: Date | null,
  invitedAt: Date | null,
  invitedBy: ObjectId | null,      // ref: users
  createdAt: Date,
  updatedAt: Date
}

// Indexes
{ email: 1 }  unique
{ organizationId: 1 }
```

---

### 2.3 `refreshTokens`

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                // ref: users
  tokenHash: String,               // SHA-256 hash of the raw refresh token
  expiresAt: Date,                 // now + 30 days
  revokedAt: Date | null,
  userAgent: String,               // device/browser info
  createdAt: Date
}

// Indexes
{ userId: 1 }
{ expiresAt: 1 }  TTL index — auto-deletes expired tokens
```

---

### 2.4 `devices`

One document per physical hardware device (BLE device). Covers both MET-LINK and NEP-LINK.

```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,        // ref: organizations
  bleId: String,                   // BLE MAC address or device ID — unique per org
  name: String,                    // "MET-LINK-001" or "NEP-LINK-003"
  customName: String | null,       // user-assigned custom name (from NEP-LINK knownDevices table)
  type: String,                    // "MET-LINK" | "NEP-LINK"
  serialNo: String | null,         // from MET-LINK BLE metadata JSON: serialNo field
  firmwareVersion: String | null,  // from MET-LINK BLE metadata JSON: firmwareVersion field

  // Live status (updated on every sync)
  lastSeenAt: Date | null,
  lastBatteryPct: Number | null,   // 0–100
  lastBatteryVoltage: Number | null, // mV (NEP-LINK only)
  lastBatteryCharging: Boolean | null,
  isOnline: Boolean,               // computed: lastSeenAt < 5 min ago

  // Metadata
  deletedAt: Date | null,          // soft delete — never hard delete
  createdAt: Date,
  updatedAt: Date
}

// Indexes
{ organizationId: 1, bleId: 1 }  unique
{ organizationId: 1, type: 1 }
{ lastSeenAt: -1 }
```

---

### 2.5 `metRecords`

One document per MET-LINK logging session. Mirrors the `record` SQLite table from the Ionic app.

```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,        // ref: organizations
  deviceId: ObjectId,              // ref: devices
  deviceName: String,              // "MET-LINK" or "DEMO"
  urlMaps: String | null,          // from SQLite record.url_maps — map URL or coordinate string captured when logging started
  dateStart: String,               // "2026-05-01 14:32:01" — original string from app
  dateEnd: String | null,          // "2026-05-01 15:45:22"
  dateStartMs: Number,             // parsed Unix ms for range queries
  dateEndMs: Number | null,
  comment: String,                 // user-entered field notes
  measureCount: Number,            // total rows in metMeasures for this record
  hasHeaderRow: Boolean,           // first measure row is a CSV header — always true

  // Sync metadata
  syncedAt: Date,                  // when the mobile app uploaded this
  localRecordId: Number | null,    // original SQLite id_record (for dedup on re-sync)
  isDemoMode: Boolean,             // true if captured in MET-LINK demo mode (deviceName === 'DEMO')

  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date | null
}

// Indexes
{ organizationId: 1, dateStartMs: -1 }
{ deviceId: 1, dateStartMs: -1 }
{ organizationId: 1, localRecordId: 1 }  sparse unique (dedup)
{ organizationId: 1, isDemoMode: 1 }  sparse — filter demo records from analytics
```

---

### 2.6 `metMeasures`

One document per logged data row (1 row = 1 second of MET-LINK logging). This is a high-volume collection — expect 3,600 documents per 1-hour session.

```javascript
{
  _id: ObjectId,
  recordId: ObjectId,              // ref: metRecords
  organizationId: ObjectId,        // ref: organizations (denormalized for fast queries)
  rowType: String,                 // "header" | "data"
  dataSentence: String,            // Raw CSV string from the app's SQLite measure.dataSentence
  timeStamp: String,               // Human-readable: "2026-05-01 14:32:01"
  timestampMs: Number,             // Parsed Unix ms for range queries and charting

  // Parsed sensor fields (extracted from dataSentence on ingest — indexed for dashboard)
  // ALL VALUES IN BASE UNITS: m/s, hPa, °C, m — NEVER store in user-display units
  windSpeedMs: Number | null,      // m/s — the only stored wind speed unit; all others computed on read
  windSpeedKmh: Number | null,     // km/h — pre-computed (avoids multiply on every read)
  windSpeedKnots: Number | null,   // knots — pre-computed
  windSpeedRelMs: Number | null,   // m/s — relative-reference wind speed (MWV 'R'); use this field for wind rose analytics
  windSpeedTrueMs: Number | null,  // m/s — true-north-reference wind speed (MWV 'T'); windSpeedMs above is last-parsed generic fallback
  windDirRelDeg: Number | null,    // 0–359° relative wind direction
  windDirTrueDeg: Number | null,   // 0–359° true (absolute) wind direction
  tempC: Number | null,            // °C
  humidityPct: Number | null,      // 0–100 %
  pressureHpa: Number | null,      // hPa
  precipMm: Number | null,         // mm total precipitation
  precipRateMmHr: Number | null,   // mm/hr precipitation intensity/rate — from second XDR 'Y' transducer (Smithtek: "Precipitation intensity" widget; separate from total)
  solarWm2: Number | null,         // W/m²
  voltageV: Number | null,         // V (DC voltage / solar panel input — maps to Smithtek "DC VOLTAGE" widget)
  batteryVoltageV: Number | null,  // V — battery bank voltage from SECOND $IIXDR 'U' (Voltage) transducer
                                   // DISTINCT from voltageV (solar/DC input). Maps to Smithtek "BATTERY VOLTS" widget.
                                   // Parser must handle multiple 'U' transducer entries in one $IIXDR sentence:
                                   // e.g. "$IIXDR,U,13.3,V,SOLAR,U,12.6,V,BATTERY,..." → voltageV=13.3, batteryVoltageV=12.6
                                   // If firmware only emits ONE voltage transducer, this field will be null.
  currentA: Number | null,         // A
  dewPointC: Number | null,        // °C — Magnus formula calculated by app
  qnhHpa: Number | null,           // hPa — QNH pressure at sea level
  qfeHpa: Number | null,           // hPa — QFE pressure at reference elevation

  // Hardware GPS (from $GPGGA — the weather station's own GPS module)
  gpsLat: Number | null,           // decimal degrees (N positive, S negative)
  gpsLng: Number | null,           // decimal degrees (E positive, W negative)
  gpsAltM: Number | null,          // meters above MSL (GGA field 9)
  gpsSatellites: Number | null,    // satellite count used (GGA field 7)
  gpsHorDilution: Number | null,   // HDOP — horizontal dilution of precision (GGA field 8)
  gpsGeoidalSepM: Number | null,   // geoidal separation in meters (GGA field 11)
  gpsQuality: Number | null,       // 0=no fix, 1=GPS fix, 2=DGPS fix (GGA field 6)

  // Phone GPS (logged separately — the operator's phone location, not station GPS)
  phoneLat: Number | null,
  phoneLng: Number | null,

  // Session flags
  isDemoMode: Boolean,             // true if captured while MET-LINK demo mode was active

  createdAt: Date
}

// Indexes
{ recordId: 1, timestampMs: 1 }
{ organizationId: 1, timestampMs: -1 }
{ organizationId: 1, tempC: 1 }   — example for per-sensor dashboard queries
{ recordId: 1, rowType: 1 }
```

---

### 2.7 `metPictures`

Photos attached to a MET-LINK logging session. Originally stored as base64 in SQLite — we store in R2/S3 and keep only the reference here.

```javascript
{
  _id: ObjectId,
  recordId: ObjectId,              // ref: metRecords
  organizationId: ObjectId,
  storageKey: String,              // R2/S3 object key: "met-pictures/{orgId}/{recordId}/{filename}"
  filename: String,                // e.g. "photo_001.jpg"
  mimeType: String,                // "image/jpeg"
  sizeBytes: Number,
  takenAt: Date | null,
  presignedUrl: String | null,     // NOT stored — generated on demand
  createdAt: Date
}

// Indexes
{ recordId: 1 }
{ organizationId: 1 }
```

---

### 2.8 `nepSessions`

One document per NEP-LINK water quality logging session. Mirrors `loggingSessions` SQLite table from the React Native app.

```javascript
{
  _id: ObjectId,
  id: String,                      // UUID v4 — original from mobile app (primary dedup key)
  organizationId: ObjectId,        // ref: organizations
  deviceId: ObjectId,              // ref: devices
  deviceName: String,              // "NEP-LINK-001" or "DEMO"

  // Session metadata (from app)
  startTimestamp: Number,          // Unix ms — session start
  endTimestamp: Number | null,     // Unix ms — session end (if available)
  timezoneName: String,            // "Australia/Melbourne" | "Europe/Amsterdam"
  timezoneOffset: Number,          // hours, INTEGER from SQLite
  probeRange: String | null,       // "R1" | "R2" | "R3" — computed at upload time from turbidityValue ranges
                                   // (NOT stored in SQLite — no probeRange column exists in app.db)
                                   // Derivation: turbidity < 10 NTU = R1, 10–1000 = R2, > 1000 = R3
                                   // Set on nepSessions from first non-null sample in the upload batch
  turbidityEnabled: Boolean,
  temperatureEnabled: Boolean,
  locationEnabled: Boolean,        // whether GPS was enabled during this session (from sensorDataSlice.locationEnabled — user-controlled toggle)
  comment: String,                 // editable by user post-session

  // Computed on upload (aggregated from samples)
  sampleCount: Number,
  turbidityAvg: Number | null,     // mean NTU across all samples in session
  turbidityMin: Number | null,
  turbidityMax: Number | null,
  temperatureAvg: Number | null,
  temperatureMin: Number | null,
  temperatureMax: Number | null,
  hasTempData: Boolean,            // false for R3 sessions (no temperature)
  hasGpsData: Boolean,
  isDemoMode: Boolean,             // true if this session was conducted in NEP-LINK demo mode (demoSlice.demoModeEnabled at session start); parallel to metRecords.isDemoMode

  // Sync metadata
  syncedAt: Date,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date | null
}

// Indexes
{ id: 1 }  unique (app's UUID — dedup key)
{ organizationId: 1, startTimestamp: -1 }
{ deviceId: 1, startTimestamp: -1 }
{ organizationId: 1, turbidityAvg: -1 }
{ organizationId: 1, isDemoMode: 1 }     // sparse — filter demo sessions from analytics
```

---

### 2.9 `nepSamples`

One document per NEP-LINK sensor reading. High-volume — 3,600 per 1-hour session. Mirrors `loggingSessionSamples` SQLite table.

```javascript
{
  _id: ObjectId,
  sessionId: String,               // UUID v4 ref to nepSessions.id
  organizationId: ObjectId,        // denormalized for fast org-scoped queries

  timestamp: Number,               // Unix ms (timezone-adjusted per app logic)
  turbidityValue: Number | null,   // NTU, float (null if not measured)
  temperatureValue: Number | null, // °C, float (null for R3 or if not measured)
  probeRange: String | null,       // "R1" | "R2" | "R3" — per-sample if mixed (rare)
  locationLat: Number | null,
  locationLng: Number | null,
  batteryLevel: Number | null,     // 0–100
  batteryRawVoltage: Number | null, // mV
  batteryCharging: Boolean | null, // whether the NEP-LINK probe was charging at sample time (from sensorDataSlice.batteryCharging)
  demoModeEnabled: Boolean | null, // true when sample was captured during NEP-LINK demo mode (loggingSlice.ts LoggingSessionSample.demoModeEnabled)

  createdAt: Date
}

// Indexes
{ sessionId: 1, timestamp: 1 }
{ organizationId: 1, timestamp: -1 }
{ sessionId: 1, turbidityValue: 1 }
{ organizationId: 1, demoModeEnabled: 1 }  // sparse — filter demo samples from analytics
```

> **Note on `demoModeEnabled`:** The `LoggingSessionSample` TypeScript interface in `loggingSlice.ts` already declares `demoModeEnabled?: boolean`. When the NEP-LINK app is in demo mode, uploaded samples will have `demoModeEnabled: true`. The backend must persist this field and use a `{ organizationId: 1, demoModeEnabled: 1 }` sparse index so all analytics can exclude demo data with `?includeDemoMode=false`.

---

### 2.10 `nepFiles`

Files (photos, map captures, CSV exports) attached to NEP-LINK sessions. Originally on RNFS — we store in R2/S3.

```javascript
{
  _id: ObjectId,
  sessionId: String,               // UUID v4 ref to nepSessions.id
  organizationId: ObjectId,
  fileType: String,                // "map" | "photo" | "csv" | "thumbnail"
                                   // thumbnail: per-session JPEG at loggingSessionThumnails/{sessionId}.jpg — uploaded for admin panel session list preview
  storageKey: String,              // R2/S3 key: "nep-files/{orgId}/{sessionId}/{filename}"
  filename: String,
  mimeType: String,                // "image/jpeg" | "text/csv"
  sizeBytes: Number,
  capturedAt: Date | null,         // when the photo/map was taken
  createdAt: Date
}

// Indexes
{ sessionId: 1, fileType: 1 }
{ organizationId: 1 }
```

---

### 2.11 `knownDevices` (NEP-LINK device registry)

Per-org registry of known NEP-LINK BLE devices. Mirrors `knownDevices` SQLite table from the app — synced to cloud.

```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  bleId: String,                   // device.id from react-native-ble-plx
  name: String,                    // BLE advertised name
  address: String | null,          // BLE address (Android only)
  customName: String | null,       // user-assigned friendly name
  lastSeenAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
{ organizationId: 1, bleId: 1 }  unique
```

---

### 2.12 `auditLogs`

Every admin-level mutation is recorded here. Powers `GET /admin/audit-logs` (Section 3.16). Written by backend middleware on any create/update/delete that affects shared data: device renames, user invites, alert rule changes, org settings, session/record deletes, share token creation/revocation, bulk exports.

```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  userId: ObjectId,
  userEmail: String,               // denormalized — readable if user is later deleted
  action: String,                  // 'create' | 'update' | 'delete' | 'invite' | 'revoke' | 'export' | 'login' | 'logout'
  resourceType: String,            // 'device' | 'user' | 'session' | 'record' | 'alertRule' | 'shareToken' | 'org' | 'settings'
  resourceId: String | null,       // ObjectId or UUID string of the affected resource
  resourceName: String | null,     // human-readable label at time of action (e.g. device name, user email)
  changes: Object | null,          // { before: {}, after: {} } for update actions — sensitive fields (tokens, passwords) redacted
  ipAddress: String | null,        // client IP from X-Forwarded-For or req.ip
  userAgent: String | null,        // browser/app UA string
  createdAt: Date
}

// Indexes
{ organizationId: 1, createdAt: -1 }
{ organizationId: 1, userId: 1, createdAt: -1 }
{ organizationId: 1, resourceType: 1, createdAt: -1 }
{ createdAt: 1 }  // TTL — auto-purge after 2 years: expireAfterSeconds: 63072000
```

---

### 2.13 `deviceSettings`

Per-device configuration — stores the settings the user sets in both mobile apps (QNH/QFE heights, wind display preferences, calculation enables). These sync from mobile → cloud when the user changes a setting.

```javascript
{
  _id: ObjectId,
  deviceId: ObjectId,              // ref: devices (unique per device)
  organizationId: ObjectId,        // denormalized

  // MET-LINK: QNH/QFE Calculation (from bluedata.service.ts QqEnabled/QqGpsHeight)
  qqEnabled: Boolean,              // QNH/QFE calculation enabled
  qqGpsHeight: Boolean,            // true = use live GPS altitude; false = use manual heights
  qfeHeightM: Number,              // QFE reference height in meters (manual mode)
  qnhHeightM: Number,              // QNH reference height in meters (manual mode)

  // MET-LINK: Dew Point Calculation
  dewPointEnabled: Boolean,        // true = calculate and log dew point

  // MET-LINK: Wind Rose display preferences (from Capacitor Preferences)
  windRoseUnit: String,            // "0" = m/s | "1" = km/h | "2" = knots
  windRosePeriod: String,          // "0" = instant | "1" = 2-min avg | "2" = 10-min avg
  windRoseOrient: String,          // "true" = True North | "relative" = Relative
  graphicalType: String,           // "rose" = wind rose canvas | "graph" = line chart
  graphItem: Number,               // index into dataItems[] — which sensor the line-graph mode displays (Preferences key: 'graphItem', default: 0)

  // MET-LINK: Color theme
  colorScheme: Number,             // 0 = Black | 1 = Grey | 2 = Blue (default)
  pageLayout: Number,              // Dashboard layout preset: 0 | 1 | 2

  // MET-LINK: Per-sensor unit preferences (from change-units.page.ts / `activeUnitMap` Preference)
  // SEPARATE from windRoseUnit above — these affect ALL sensor displays throughout the app
  unitWindSpeed: String,           // 'm/s' (default) | 'kt' | 'km/h' | 'mph' | 'Bft'
  unitPressure: String,            // 'hPa' (default) | 'mbar' | 'inHg' | 'mmHg' | 'psi'
  unitTemperature: String,         // '°C' (default) | '°F' | 'K'
  unitAltitude: String,            // 'm' (default) | 'ft'

  // MET-LINK: Per-sensor visibility and logging toggles (from Preferences keys 'EnShow' and 'EnLog')
  // EnShow controls which sensors appear on the 8-tile dashboard; EnLog controls which sensors are written to SQLite/cloud
  // Format: [{ NMEA: 'MWV', Type: 'Wind speed', Unit: 'm/s', Desc: 'true', EnShow: 1 }, ...]
  sensorShowPrefs: [Object] | null,  // JSON array — which sensors are DISPLAYED on the dashboard (Preferences key: 'EnShow')
  sensorLogPrefs: [Object] | null,   // JSON array — which sensors are LOGGED to SQLite/cloud (Preferences key: 'EnLog')

  updatedAt: Date
}

// Indexes
{ deviceId: 1 }  unique
{ organizationId: 1 }
```

---

### 2.14 `dashboardLayouts`

User-configurable tile layout for the MET-LINK live dashboard — mirrors the 8-tile configurable grid from the Ionic app's `layoutData`. Each user can configure which sensor each of the 8 tiles shows.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                // ref: users — layout is per-user per-device
  deviceId: ObjectId,              // ref: devices
  organizationId: ObjectId,
  name: String,                    // "My Layout" — optional label
  isDefault: Boolean,              // true = load this layout by default for this device

  // 8 tiles, each storing the sensor to display
  // Mirrors bluedata.service.ts layoutData[i] = { NMEA, Type, Data, Unit, Desc }
  tiles: [
    {
      index: Number,               // 0–7
      nmea: String,                // "MWV" | "XDR" | "GGA" | "CAL" | ""
      type: String,                // "Wind speed" | "Temperature" | "Humidity" | etc.
      unit: String,                // "m/s" | "°C" | "%" | "hPa" | etc.
      desc: String,                // "true" | "relative" | "TEMP" | "RH" | etc.
      label: String,               // display label in dashboard tile
    }
  ],                               // array of exactly 8 objects

  createdAt: Date,
  updatedAt: Date
}

// Indexes
{ userId: 1, deviceId: 1 }
{ organizationId: 1, deviceId: 1 }
```

---

### 2.15 `notificationTokens`

Push notification device tokens. One document per physical phone + user combination.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                // ref: users
  organizationId: ObjectId,
  platform: String,                // "ios" | "android"
  token: String,                   // FCM registration token (Android) or APNs token (iOS)
  appId: String,                   // "obs.metlink" (MET-LINK Android/iOS package ID — confirmed from configuration.page.ts) | "com.observator.neplink" (NEP-LINK)
  deviceModel: String,             // "iPhone 15 Pro" | "Samsung Galaxy S23" (optional)
  createdAt: Date,
  updatedAt: Date,
  expiresAt: Date                  // TTL — FCM tokens expire/rotate; APNs tokens do not
}

// Indexes
{ userId: 1, platform: 1 }  — find all tokens for a user to push to all their phones
{ token: 1 }  unique  — prevent duplicate token registration
{ expiresAt: 1 }  TTL
```

---

### 2.16 `shareTokens`

Public read-only share links for NEP-LINK sessions and MET-LINK records. A user can generate a link that allows anyone (no login required) to view a session.

```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  createdBy: ObjectId,             // ref: users
  resourceType: String,            // "nepSession" | "metRecord"
  resourceId: String,              // nepSession.id (UUID) or metRecord._id (ObjectId as string)
  token: String,                   // crypto.randomBytes(32).toString('hex') — 64 char hex string
  expiresAt: Date | null,          // null = never expires (default for Observator use case)
  viewCount: Number,               // how many times the link was accessed
  revokedAt: Date | null,
  createdAt: Date
}

// Indexes
{ token: 1 }  unique  — the public-facing lookup key
{ organizationId: 1, createdBy: 1 }
{ expiresAt: 1 }  TTL (sparse — only applies when expiresAt is set)
```

---

### 2.17 `metDailySummaries`

Pre-computed daily aggregates for MET-LINK. Populated by a nightly cron job (see Section 9). Replaces slow multi-million-row aggregations for calendar views and daily stats cards. Serves all `/analytics/met/daily-summary` requests instantly.

```javascript
{
  _id: ObjectId,
  deviceId: ObjectId,
  organizationId: ObjectId,
  date: String,                    // "2026-05-12" — local date in org timezone
  dateMs: Number,                  // UTC Unix ms at start of that UTC day

  // Wind stats
  windSpeedAvgMs: Number | null,
  windSpeedMaxMs: Number | null,   // max gust (single 1-second reading)
  windSpeedMaxAt: Number | null,   // Unix ms timestamp of max gust
  windDirPrevailing: Number | null, // most common 22.5° sector midpoint (0–359°)
  windCalmPct: Number | null,      // % of readings where windSpeedMs < 0.5 m/s
  beaufortDistribution: [Number],  // [count_Bft0, count_Bft1, ..., count_Bft12] — 13 values

  // Temperature
  tempAvgC: Number | null,
  tempMaxC: Number | null,
  tempMinC: Number | null,
  tempMaxAt: Number | null,        // Unix ms
  tempMinAt: Number | null,

  // Humidity
  humidityAvgPct: Number | null,
  humidityMaxPct: Number | null,
  humidityMinPct: Number | null,

  // Pressure
  pressureAvgHpa: Number | null,
  pressureMaxHpa: Number | null,
  pressureMinHpa: Number | null,
  pressureTendency: String | null, // 'rising_rapidly'|'rising'|'steady'|'falling'|'falling_rapidly'
  pressureTendencyHpaPerHr: Number | null, // e.g. -1.8 hPa/hr

  // Precipitation
  precipTotalMm: Number | null,
  precipRateMaxMmHr: Number | null, // peak precipitation intensity during the day (mm/hr) — from metMeasures.precipRateMmHr
  precipRateAvgMmHr: Number | null, // average precipitation intensity for periods when it was raining (non-zero rate samples only)

  // Solar
  solarMaxWm2: Number | null,
  solarAvgWm2: Number | null,
  solarDailyKwhM2: Number | null,  // cumulative energy: avg W/m² × hours ÷ 1000

  // Dew Point
  dewPointAvgC: Number | null,
  dewPointSpreadAvg: Number | null, // tempAvgC - dewPointAvgC: <2°C = fog risk

  // Data completeness
  sampleCount: Number,
  expectedSamples: Number,         // 86400 for full 24h at 1Hz
  completenessPercent: Number,     // (sampleCount / expectedSamples) × 100

  computedAt: Date
}

// Indexes
{ deviceId: 1, dateMs: -1 }  unique
{ organizationId: 1, dateMs: -1 }
```

---

### 2.18 `nepDailySummaries`

Pre-computed daily aggregates for NEP-LINK. Same cron job as `metDailySummaries`. Serves all `/analytics/nep/daily-summary` requests instantly.

```javascript
{
  _id: ObjectId,
  deviceId: ObjectId,
  organizationId: ObjectId,
  date: String,                    // "2026-05-12"
  dateMs: Number,

  turbidityAvg: Number | null,     // NTU
  turbidityMax: Number | null,
  turbidityMin: Number | null,
  turbidityStdDev: Number | null,

  temperatureAvg: Number | null,   // °C
  temperatureMax: Number | null,
  temperatureMin: Number | null,

  sessionCount: Number,
  totalSamples: Number,
  dominantProbeRange: String | null, // 'R1' | 'R2' | 'R3'
  r1SampleCount: Number,           // Low range (0–10 NTU, clean water)
  r2SampleCount: Number,           // Medium range (10–1000 NTU, field measurement)
  r3SampleCount: Number,           // High range (>1000 NTU, flood/extreme, no temperature)

  // Water quality classification (WHO/EPA standards)
  drinkingCompliant: Boolean | null, // avgNTU < 1 (WHO drinking water standard)
  recreationalSafe: Boolean | null,  // avgNTU < 10 (EPA recreational water standard)

  computedAt: Date
}

// Indexes
{ deviceId: 1, dateMs: -1 }  unique
{ organizationId: 1, dateMs: -1 }
```

---

### 2.19 `metMeasuresDownsampled`

1-minute averaged MET-LINK sensor buckets. Produced by the `downsamplerJob` cron for `metMeasures` data older than 90 days. Allows long-range chart queries to remain fast without per-field compound indexes on the full `metMeasures` collection.

```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  deviceId: ObjectId,
  recordId: ObjectId,              // ref: metRecords (original record this bucket belongs to)
  bucketStart: Number,             // Unix ms — start of the 1-minute window
  sampleCount: Number,             // number of original measure rows averaged into this bucket

  // Averaged sensor values — field names mirror metMeasures source fields with Avg/Min/Max suffix
  // Wind (relative)
  windSpeedRelMsAvg: Number | null,  // m/s average — source: metMeasures.windSpeedRelMs
  windSpeedRelMsMin: Number | null,
  windSpeedRelMsMax: Number | null,
  windDirRelDegAvg: Number | null,   // circular mean direction — source: metMeasures.windDirRelDeg
  // Wind (true)
  windSpeedTrueMsAvg: Number | null, // m/s average — source: metMeasures.windSpeedTrueMs
  windSpeedTrueMsMin: Number | null,
  windSpeedTrueMsMax: Number | null,
  windDirTrueDegAvg: Number | null,  // circular mean direction — source: metMeasures.windDirTrueDeg
  // Atmosphere
  tempCAvg: Number | null,           // °C average — source: metMeasures.tempC
  tempCMin: Number | null,
  tempCMax: Number | null,
  humidityPctAvg: Number | null,     // % average — source: metMeasures.humidityPct
  pressureHpaAvg: Number | null,     // hPa average — source: metMeasures.pressureHpa
  dewPointCAvg: Number | null,       // °C average — source: metMeasures.dewPointC
  qfeHpaAvg: Number | null,          // hPa average — source: metMeasures.qfeHpa
  qnhHpaAvg: Number | null,          // hPa average — source: metMeasures.qnhHpa
  // Precipitation
  precipMmAvg: Number | null,        // mm average — source: metMeasures.precipMm
  precipRateMmHrAvg: Number | null,  // mm/hr average — source: metMeasures.precipRateMmHr
  precipRateMmHrMax: Number | null,  // mm/hr max intensity in this bucket
  // Solar / Electrical
  solarWm2Avg: Number | null,        // W/m² average — source: metMeasures.solarWm2
  solarWm2Max: Number | null,        // W/m² max in this bucket
  voltageVAvg: Number | null,        // V average — source: metMeasures.voltageV
  currentAAvg: Number | null,        // A average — source: metMeasures.currentA
  // GPS
  gpsLatAvg: Number | null,          // source: metMeasures.gpsLat
  gpsLngAvg: Number | null,
  gpsAltMAvg: Number | null,         // meters — source: metMeasures.gpsAltM

  createdAt: Date
}

// Indexes
{ deviceId: 1, bucketStart: -1 }
{ organizationId: 1, bucketStart: -1 }
```

---

### 2.20 `nepSamplesDownsampled`

1-minute averaged NEP-LINK turbidity/temperature buckets. Same purpose as `metMeasuresDownsampled` — produced by `downsamplerJob` for `nepSamples` data older than 90 days.

```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  deviceId: ObjectId,
  sessionId: String,               // ref: nepSessions (original session)
  bucketStart: Number,             // Unix ms — start of the 1-minute window
  sampleCount: Number,

  turbidityAvg: Number | null,     // mean NTU in this 1-min bucket
  turbidityMin: Number | null,
  turbidityMax: Number | null,
  temperatureAvg: Number | null,
  temperatureMin: Number | null,
  temperatureMax: Number | null,

  // GPS centroid of all samples in this bucket (if locationEnabled was true)
  gpsLatAvg: Number | null,
  gpsLngAvg: Number | null,

  batteryLevelAvg: Number | null,

  createdAt: Date
}

// Indexes
{ deviceId: 1, bucketStart: -1 }
{ organizationId: 1, bucketStart: -1 }
{ sessionId: 1, bucketStart: -1 }
```

---

### 2.22 `passwordResetTokens`

Short-lived tokens for the forgot-password flow. Separate collection (not embedded in `users`) to allow atomic expiry queries and to avoid leaking token data in user list APIs.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                // ref: users
  email: String,                   // denormalized — fast lookup without joining users
  tokenHash: String,               // SHA-256 of the raw 32-byte token sent in the email link
  expiresAt: Date,                 // now + 1 hour — short window for password reset
  usedAt: Date | null,             // set when the token is consumed — prevents replay
  ipAddress: String | null,        // IP that requested the reset — audit trail
  createdAt: Date
}

// Indexes
{ tokenHash: 1 }  unique         — primary lookup key
{ userId: 1 }                    — cancel any existing token when new one issued (updateMany)
{ expiresAt: 1 }  TTL            — expireAfterSeconds: 0 — auto-purge when expiresAt passes
```

---

### 2.23 `firmwareHistory`

Every time a device reports a different `firmwareVersion` via BLE metadata sync, the backend records the transition. Enables fleet-level firmware rollout visibility and alerts when devices fall behind.

```javascript
{
  _id: ObjectId,
  deviceId: ObjectId,              // ref: devices
  organizationId: ObjectId,
  appType: String,                 // 'MET-LINK' | 'NEP-LINK'
  previousVersion: String | null,  // null = first-ever version recorded for this device
  newVersion: String,              // firmware version string from BLE metadata JSON
  detectedAt: Date,                // when the sync revealed the new version
  detectedByAppType: String,       // 'MET-LINK' | 'NEP-LINK' mobile app that synced
  createdAt: Date
}

// Indexes
{ deviceId: 1, detectedAt: -1 }
{ organizationId: 1, detectedAt: -1 }
{ organizationId: 1, appType: 1, newVersion: 1 }  — fleet version distribution queries
```

> **How it works:** In the `PATCH /sync/device-status` handler, compare incoming `firmwareVersion` to `devices.firmwareVersion`. If different, `insertOne` into `firmwareHistory` THEN update `devices.firmwareVersion`. This is the ONLY place firmware version is updated — never update it without logging the change.

---

### 2.21 `alertRules`

Admin-configurable threshold rules. One document = one condition on one sensor field for one device. When the backend ingests new data (upload or stream), it evaluates all active rules for that device and fires push notifications if the condition is met — subject to `cooldownMinutes` to prevent alert storms.

```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  deviceId: ObjectId,
  createdBy: ObjectId,             // ref: users — admin who created the rule
  name: String,                    // human label, e.g. "High turbidity alert"
  appType: String,                 // 'MET' | 'NEP'

  // Condition: field [condition] threshold
  sensor: String,                  // field name, e.g. 'turbidityValue' | 'windSpeedTrue' | 'temperature' | 'batteryLevel'
  condition: String,               // 'gt' | 'lt' | 'gte' | 'lte'
  threshold: Number,
  unit: String,                    // display unit for the notification, e.g. 'NTU' | 'm/s' | '°C'

  isActive: Boolean,               // admin can disable without deleting
  notifyUserIds: [ObjectId],       // users to receive push notification when triggered
  cooldownMinutes: Number,         // minimum minutes between consecutive alerts for this rule (default: 60)
  lastTriggeredAt: Date | null,    // last time this rule fired — used to enforce cooldown
  triggerHistory: [{               // capped at last 100 trigger events; powers GET /admin/alert-rules/:id/history
    triggeredAt: Date,
    sensorValue: Number,           // the sensor value that crossed the threshold
    notifiedCount: Number          // number of push notifications dispatched for this trigger
  }],

  createdAt: Date,
  updatedAt: Date
}

// Indexes
{ organizationId: 1, isActive: 1 }
{ deviceId: 1, isActive: 1 }
```

---

## 3. Complete API Endpoint Catalog

**Base URL:** `https://api.observator.yourbackend.com/v1`  
**Auth:** Bearer JWT (access token, 15 min expiry) on all `🔐` marked endpoints  
**Response envelope:**
```json
{ "data": ..., "meta": { "page": 1, "limit": 20, "total": 100 } }
{ "error": { "code": "NOT_FOUND", "message": "Session not found" } }
```

---

### 3.1 Auth

| Method | Endpoint | Auth | Purpose | Request Body | Response |
|---|---|---|---|---|---|
| POST | `/auth/register` | ❌ | Register new user + org in one step | `{ orgName, email, password, firstName, lastName, country }` | `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | ❌ | Get access + refresh tokens | `{ email, password }` | `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | ❌ | Exchange refresh token for new access token | `{ refreshToken }` | `{ accessToken }` |
| POST | `/auth/logout` | 🔐 | Revoke refresh token | `{ refreshToken }` | `204` |
| POST | `/auth/forgot-password` | ❌ | Send reset email via Resend | `{ email }` | `204` |
| POST | `/auth/reset-password` | ❌ | Consume reset token and update password | `{ token, newPassword }` | `204` |

**Notes:** Rate-limit `/auth/login` to 10 req/min per IP. bcrypt cost 12.

---

### 3.2 Organization & Users

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/organizations/me` | 🔐 | Get current user's org details | |
| PATCH | `/organizations/me` | 🔐 admin | Update org name / timezone | |
| GET | `/organizations/me/users` | 🔐 admin | List all users in org | Paginated |
| POST | `/organizations/me/users/invite` | 🔐 admin | Invite user by email | Sends Resend email with invite link |
| PATCH | `/organizations/me/users/:userId` | 🔐 admin | Update user role | `{ role: "admin"|"operator"|"viewer" }` |
| DELETE | `/organizations/me/users/:userId` | 🔐 admin | Deactivate user | Soft: sets `isActive: false` |
| GET | `/users/me` | 🔐 | Get current user profile | |
| PATCH | `/users/me` | 🔐 | Update own name or password | `{ firstName?, lastName?, password? }` |

---

### 3.3 Devices

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/devices` | 🔐 | List all org devices | `?type=MET-LINK\|NEP-LINK&page&limit` |
| POST | `/devices` | 🔐 | Register a new device | `{ bleId, name, type, serialNo?, firmwareVersion? }` |
| GET | `/devices/:id` | 🔐 | Device detail + live status | Includes `lastSeenAt`, `lastBatteryPct`, `isOnline` |
| PATCH | `/devices/:id` | 🔐 | Update device name / serial / firmware | |
| DELETE | `/devices/:id` | 🔐 admin | Soft-delete device | Sets `deletedAt`; historical data preserved |
| GET | `/devices/:id/stats` | 🔐 | Aggregated stats for device | Total sessions/records, last activity |

---

### 3.4 NEP-LINK Sessions

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/sessions` | 🔐 | List sessions | `?deviceId&from&to&probeRange&page&limit=20` |
| POST | `/sessions` | 🔐 | Upload session from app | Auto-computes `turbidityAvg`, `sampleCount` etc. — idempotent by `id` (UUID) |
| GET | `/sessions/:id` | 🔐 | Session detail + stats | Returns full session object |
| PATCH | `/sessions/:id` | 🔐 | Update comment | `{ comment }` |
| DELETE | `/sessions/:id` | 🔐 | Delete session cascade | Deletes samples + files from R2 + DB rows |
| GET | `/sessions/:id/samples` | 🔐 | Paginated samples | `?page&limit=500&downsample=true` (returns 1-min avg if >500 points) |
| POST | `/sessions/:id/samples` | 🔐 | Bulk insert samples | Single INSERT — body: `{ samples: [...up to 7200] }` |
| GET | `/sessions/:id/export` | 🔐 | Download CSV | Returns `Content-Disposition: attachment; filename=NEP-Link-{date}.csv` |
| POST | `/sessions/:id/files` | 🔐 | Upload file (multipart) | Accept: jpeg/png only, max 10MB |
| GET | `/sessions/:id/files` | 🔐 | List files | Returns array with presigned R2 URLs (1hr expiry) |
| DELETE | `/sessions/:id/files/:fileId` | 🔐 | Delete file | Removes from R2 + DB |

**CSV export format** (matches what the mobile app already exports):
```
Date,Time,Lat,Lon,Turbidity,Temperature,,Comment,Battery Level
Europe/Amsterdam,,,,NTU,°C,,,,%
01 May 2026,14:32:01,51.5074,-0.1278,245.67,18.3,,Field notes,85
```

---

### 3.5 MET-LINK Records

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/records` | 🔐 | List records | `?deviceId&from&to&page&limit=20` |
| POST | `/records` | 🔐 | Upload record from app | `{ deviceId, dateStart, dateEnd, comment, localRecordId }` |
| GET | `/records/:id` | 🔐 | Record detail | |
| PATCH | `/records/:id` | 🔐 | Update comment | `{ comment }` |
| DELETE | `/records/:id` | 🔐 | Delete cascade | Measures + pictures from R2 + DB |
| GET | `/records/:id/measures` | 🔐 | Paginated measures | `?page&limit=1000` |
| POST | `/records/:id/measures` | 🔐 | Bulk upload measures | `{ measures: [{ dataSentence, timeStamp }] }` — parse sensor fields on ingest |
| GET | `/records/:id/export` | 🔐 | Download CSV | Header row + data rows = ready CSV |
| POST | `/records/:id/pictures` | 🔐 | Upload photo | Multipart, jpeg/png, max 10MB |
| GET | `/records/:id/pictures` | 🔐 | List photos | Presigned download URLs |
| DELETE | `/records/:id/pictures/:picId` | 🔐 | Delete photo | Removes from R2 + DB |

---

### 3.6 Dashboard Aggregation Endpoints

> These are what the Angular admin dashboard polls. All must respond under 300ms. Cache 30 seconds with NestJS CacheModule / node-cache. Run `EXPLAIN` on every query before shipping.

| Method | Endpoint | Auth | Returns | Used For | Poll Interval |
|---|---|---|---|---|---|
| GET | `/dashboard/devices` | 🔐 | `[{ id, name, type, serialNo, firmwareVersion, batteryPct, batteryVoltage, batteryCharging, lastSeenAt, isOnline }]` | Device overview page — one card per device | On load, every 60s |
| GET | `/dashboard/org/device-map` | 🔐 | `[{ deviceId, deviceName, type, isOnline, lastSeenAt, lastGpsLat, lastGpsLng, lastGpsAltM, lastWindSpeedKmh, lastTurbidityNtu, batteryPct }]` | Fleet map — all org devices' last-known GPS position for admin panel overview map. MET-LINK: GPS from last `gpsLat/gpsLng` in `metMeasures`. NEP-LINK: from last `locationLat/locationLng` in `nepSamples`. Devices with no GPS data are omitted. | On dashboard load, every 5 min |
| GET | `/dashboard/met/latest` | 🔐 | `{ windSpeedMs, windSpeedKnots, windSpeedKmh, windDirRelDeg, windDirTrueDeg, tempC, humidityPct, pressureHpa, dewPointC, solarWm2, precipMm, **precipRateMmHr**, voltageV, **batteryVoltageV**, currentA, qnhHpa, qfeHpa, gpsLat, gpsLng, gpsAltM, gpsSatellites, phoneLat, phoneLng, batteryPct, batteryCharging, lastUpdatedAt }` | MET-LINK 8-tile sensor grid + wind rose. Latest row from most recent active record | Every 30s |
| GET | `/dashboard/met/history` | 🔐 | `[{ ts, value }]` | MET-LINK line charts — any single sensor over time. `?deviceId&sensor=wind_speed\|wind_gust\|wind_dir\|temperature\|humidity\|pressure\|solar\|precipitation\|precip_rate\|dew_point\|voltage\|battery_voltage\|current&from&to` → 1-min averages (`wind_gust` → 1-min MAX not avg) | On range select |
| GET | `/dashboard/met/windrose` | 🔐 | `{ instant: { dirRel, speedRel, dirTru, speedTru }, min2avg: {...}, min10avg: {...} }` — arrays of last 120 and 600 readings | Wind rose canvas in dashboard — delivers pre-bucketed direction+speed arrays | Every 30s |
| GET | `/dashboard/nep/sessions` | 🔐 | `[{ id, startTs, endTs, deviceName, probeRange, turbidityAvg, turbidityMin, turbidityMax, temperatureAvg, sampleCount, comment }]` | NEP-LINK sessions table `?deviceId&limit=20` | On load |
| GET | `/dashboard/nep/trend` | 🔐 | `[{ ts, value }]` | NEP-LINK line chart for a specific session `?sessionId&field=turbidity\|temperature` — downsample to ≤500 pts | On session select |
| GET | `/dashboard/nep/map` | 🔐 | `[{ ts, lat, lng, turbidityValue, probeRange }]` | GPS points for Leaflet map overlay, turbidity color-coded `?sessionId` — downsample to ≤300 pts | On session select |
| GET | `/dashboard/nep/latest` | 🔐 | `{ turbidityValue, temperatureValue, probeRange, batteryPct, batteryVoltage, locationLat, locationLng, lastUpdatedAt }` | Live NEP-LINK reading from last active session `?deviceId` | Every 30s |
| GET | `/dashboard/summary` | 🔐 | `{ totalDevices, onlineDevices, totalMetRecords, totalNepSessions, totalNepSamples, storageUsedMb }` | Dashboard home page stats bar | On load |
| GET | `/dashboard/met/stats` | 🔐 | `{ totalRecords, totalMeasures, totalLoggingHours, firstRecordAt, lastRecordAt, maxWindSpeedKmh, maxWindSpeedAt, minTempC, maxTempC, maxPressureHpa, minPressureHpa }` | Device lifetime aggregate stats card. `?deviceId`. Queries `metRecords` + `metMeasures` aggregations. Cache result for 1h. | On device page load |
| GET | `/dashboard/nep/analytics` | 🔐 | `[{ date, avgTurbidity, maxTurbidity, minTurbidity, sessionCount, totalSamples }]` | Cross-session turbidity trend grouped by day over a date range. `?deviceId&from&to`. Powers the NEP analytics chart. | On date range select |
| GET | `/dashboard/met/live-config` | 🔐 | Returns device's `deviceSettings` + current `dashboardLayout` tiles for the requesting user | Dashboard uses this to know which unit labels / thresholds to render for each tile | On dashboard load |

---

### 3.7 Sync API

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/sync/status` | 🔐 | Returns `{ sessionIds: [], recordIds: [] }` in cloud for this org | App compares against local list to find what to upload |
| POST | `/sync/upload` | 🔐 | Bulk upload sessions + records with samples | `{ sessions: [...], records: [...] }` — upsert by UUID, idempotent, returns `{ uploaded, skipped }` |
| GET | `/sync/download` | 🔐 | Returns items in cloud NOT present on this device | For multi-phone teams where one synced already |
| PATCH | `/sync/device-status` | 🔐 | Update device lastSeenAt + battery from mobile app heartbeat | Called on BLE connect + periodically while connected |

---

### 3.8 System

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | ❌ | `{ status: "ok", db: "connected", storage: "ok" }` — deployment monitoring |
| GET | `/version` | ❌ | `{ version: "1.0.0", env: "production" }` |

---

### 3.9 WebSocket Real-Time Events

> **Why WebSocket?** The 30-second polling in Section 3.6 is sufficient for MVP (Month 1–2). But a live dashboard benefits from push — when a mobile app syncs a new batch of data, the dashboard should update instantly. Implement WebSocket as an upgrade in Month 3 (Week 10).

**Connection:** `wss://api.observator.railway.app/v1/ws?token=<accessToken>`

**Authentication:** Query param `token` is verified as a valid JWT access token on connect. Invalid/expired token → connection rejected with code `4001`.

| Event (server → client) | Payload | Trigger |
|---|---|---|
| `met:latest` | Full `/dashboard/met/latest` payload | After `POST /records/:id/measures` completes |
| `met:windrose` | Full `/dashboard/met/windrose` payload | Same trigger as above |
| `nep:sample` | `{ sessionId, turbidityValue, temperatureValue, timestamp, probeRange }` | After `POST /sessions/:id/samples` |
| `nep:session:created` | `{ id, deviceId, startTimestamp, probeRange }` | After `POST /sessions` |
| `device:status` | `{ deviceId, isOnline, lastSeenAt, batteryPct }` | After `PATCH /sync/device-status` heartbeat |
| `device:connected` | `{ deviceId, deviceName }` | BLE connect heartbeat detected |
| `device:disconnected` | `{ deviceId }` | Heartbeat not received for > 5 min |

| Event (client → server) | Purpose |
|---|---|
| `subscribe:device` | `{ deviceId }` — subscribe to updates for a specific device |
| `unsubscribe:device` | `{ deviceId }` |
| `ping` | Keep-alive ping every 30s |

**Angular integration:** Use `WebSocketSubject` from `rxjs/webSocket`. Inject as a service. Subscribe per page component, unsubscribe on `ngOnDestroy`.

---

### 3.10 Push Notifications

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/notifications/register` | 🔐 | Register FCM/APNs token from mobile app | `{ platform: "ios"\|"android", token, appId }` — upsert by token |
| GET | `/notifications/settings` | 🔐 | Get user's notification preferences | Returns thresholds + enabled flags |
| PATCH | `/notifications/settings` | 🔐 | Update notification settings | `{ turbidityThresholdNtu?, windSpeedThresholdKmh?, batteryLowPct?, sessionCompleteEnabled? }` |
| POST | `/notifications/test` | 🔐 admin | Send a test push to all tokens of current user | Useful for confirming token registration in staging |

**Notification triggers (Week 24):**
- Session complete → push to operator who started the session
- Turbidity exceeds threshold → push to all org admins/operators
- Battery below 20% → push to all org admins
- Device offline (heartbeat timeout > 5 min) → push to all org admins

---

### 3.11 Device Settings

> These endpoints sync the per-device configuration (QNH/QFE heights, wind unit preference, etc.) that both mobile apps store locally in Capacitor Preferences / AsyncStorage. The mobile app calls `PATCH /devices/:id/settings` when a user changes a setting, so it stays in sync across multiple phones.

| Method | Endpoint | Auth | Purpose | Request Body |
|---|---|---|---|---|
| GET | `/devices/:id/settings` | 🔐 | Get device configuration | — |
| PATCH | `/devices/:id/settings` | 🔐 | Update device configuration (partial update) | `{ qqEnabled?, qqGpsHeight?, qfeHeightM?, qnhHeightM?, dewPointEnabled?, windRoseUnit?, windRosePeriod?, windRoseOrient?, graphicalType?, colorScheme?, pageLayout?, graphItem?, sensorShowPrefs?, sensorLogPrefs?, unitWindSpeed?, unitPressure?, unitTemperature?, unitAltitude? }` |

**MET-LINK setting values (from Capacitor Preferences keys):**

| Setting | Preferences Key | Values |
|---|---|---|
| QNH/QFE enabled | `QqEnabled` | `"true"` \| `"false"` |
| QNH/QFE GPS mode | `QqGpsHeight` | `"true"` = GPS altitude \| `"false"` = manual |
| QFE reference height | `QfeHeight` | meters string, e.g. `"15"` |
| QNH reference height | `QnhHeight` | meters string |
| Dew point enabled | `DpEnabled` | `"true"` \| `"false"` |
| Wind unit | `windRoseUnit` | `"0"` = m/s \| `"1"` = km/h \| `"2"` = knots |
| Wind period | `windRosePeriod` | `"0"` = instant \| `"1"` = 2-min \| `"2"` = 10-min |
| Wind orientation | `windRoseOrient` | `"true"` = True \| `"relative"` = Relative |
| Graph type | `graphicalType` | `"rose"` \| `"graph"` |
| Color scheme | `color` | `0` = Black \| `1` = Grey \| `2` = Blue |
| Dashboard layout preset | `pagelayout` | `0` \| `1` \| `2` |
| Graph sensor item | `graphItem` | index into `dataItems[]` |
| Wind speed display unit | `unit_wind_speed` | `'m/s'` (default) \| `'kt'` \| `'km/h'` \| `'mph'` \| `'Bft'` |
| Pressure display unit | `unit_pressure` | `'hPa'` (default) \| `'mbar'` \| `'inHg'` \| `'mmHg'` \| `'psi'` |
| Temperature display unit | `unit_temperature` | `'°C'` (default) \| `'°F'` \| `'K'` |
| Altitude display unit | `unit_altitude` | `'m'` (default) \| `'ft'` |
| Per-sensor show prefs | `sensorShowPrefs` | `{ "NMEA_type_unit_desc": boolean }` map — EnShow toggles (which tiles render) |
| Per-sensor log prefs | `sensorLogPrefs` | `{ "NMEA_type_unit_desc": boolean }` map — EnLogging toggles (which sensors write to dataSentence) |

---

### 3.12 Dashboard Layouts

> The MET-LINK app has a configurable 8-tile grid — each tile can show any parsed sensor field. This layout config is stored per-user per-device and can be loaded on the web dashboard too.

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/dashboard-layouts?deviceId=` | 🔐 | List all saved layouts for a device (current user) | Returns array, including `isDefault` flag |
| POST | `/dashboard-layouts` | 🔐 | Save a new layout | `{ deviceId, name, tiles: [{index, nmea, type, unit, desc, label}×8], isDefault? }` |
| PATCH | `/dashboard-layouts/:id` | 🔐 | Update layout name or tiles | Partial update |
| DELETE | `/dashboard-layouts/:id` | 🔐 | Delete a saved layout | Hard delete |
| PATCH | `/dashboard-layouts/:id/set-default` | 🔐 | Set this layout as default for the device | Unsets `isDefault` on all other layouts for same device |

**Valid NMEA/sensor combinations (from `bluedata.service.ts` `saveDataItem()` calls):**

| NMEA | Type | Unit | Desc |
|---|---|---|---|
| MWV | Wind speed | m/s \| km/h \| knots | true \| relative |
| MWV | Wind direction | ° | true \| relative |
| XDR | Temperature | °C | TEMP |
| XDR | Humidity | % | RH |
| XDR | Pressure | B (bar) | PRESS |
| XDR | Precipitation | mm | — |
| XDR | Solar | W/M² | — |
| XDR | Voltage | V | — |
| XDR | Current | A | — |
| GGA | latitude | N \| S | LAT |
| GGA | longitude | E \| W | LON |
| GGA | GPS height | M | GEOID |
| GGA | Satellites | — | NUM |
| GGA | GPS quality | — | Quality |
| CAL | QFE | hPa | Calculated |
| CAL | QNH | hPa | Calculated |
| CAL | Dew point | °C | Calculated |

---

### 3.13 Public Share Links

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/sessions/:id/share` | 🔐 | Generate public share token for a NEP-LINK session | Returns `{ shareUrl: "https://dashboard.observator.com/public/:token" }` |
| POST | `/records/:id/share` | 🔐 | Generate public share token for a MET-LINK record | Same structure |
| GET | `/public/:shareToken` | ❌ | Fetch public session/record data — no auth required | Returns session/record + downsampled samples + presigned file URLs. Rate-limited: 60 req/min per IP |
| DELETE | `/sessions/:id/share` | 🔐 | Revoke share token for a session | Sets `revokedAt` |
| DELETE | `/records/:id/share` | 🔐 | Revoke share token for a record | Sets `revokedAt` |

---

### 3.14 Advanced Analytics & Graphical Data APIs

> This is the section that elevates the Observator backend from a **data store** to a **data platform**. Every endpoint below returns chart-ready, pre-aggregated data — the frontend renders it directly without any calculation. All endpoints accept `?includeDemoMode=false` (default) to exclude demo sessions from analytics.
>
> **Performance contract:** All endpoints backed by `metDailySummaries`/`nepDailySummaries` must return in < 100ms. Live aggregation endpoints (not backed by pre-computed docs) must return in < 500ms with proper indexes. Run `EXPLAIN` before shipping each one.
>
> **Base path:** `/analytics` — Auth: all `🔐`

#### MET-LINK Analytics

| Method | Endpoint | Returns | Chart Type | Notes |
|---|---|---|---|---|
| GET | `/analytics/met/wind-rose?deviceId&from&to&period=instant\|2min\|10min` | `{ sectors: [{ dir, label, count, pct, avgSpeedMs, maxSpeedMs, speedBuckets }] }` 16 sectors | **Polar wind rose** | Pre-bucketed into 16 compass sectors (22.5° each: N, NNE, NE … NNW). `speedBuckets` = 5 speed bands (Calm/Light/Gentle/Moderate/Strong) per sector — powers the stacked color layers. Add `?unit=m/s\|km/h\|knots` (default: m/s) — when `unit=km/h`, speed bucket thresholds auto-convert and labels become `0–25\|25–50\|50–75\|75–100 Km/Hr` to match the Smithtek wind rose legend exactly. THIS replaces the raw-array `/dashboard/met/windrose` endpoint for analytics. |
| GET | `/analytics/met/multi-sensor?deviceId&sensors[]=wind_speed&sensors[]=temperature&from&to&interval=1min\|5min\|1h` | `{ timestamps: [ms], series: [{ sensor, unit, values: [Number\|null] }] }` | **Multi-line overlay** | All requested sensors on the SAME aligned timestamp axis, in ONE request. Max 5 sensors per call. Avoids N serial requests from the dashboard. `interval` controls bucket granularity. |
| GET | `/analytics/met/heatmap?deviceId&sensor=wind_speed\|temperature\|humidity\|pressure\|solar\|precipitation&from&to` | `{ grid: [[Number\|null × 24] × 7], hourLabels: ['00:00',...], dayLabels: ['Mon',...], unit }` | **24×7 heatmap** | 168-cell grid: hour-of-day (0–23) × day-of-week (Mon–Sun). Shows avg sensor value at each slot across all data in the date range. Instantly reveals daily/weekly patterns (e.g. peak wind at 14:00, calmest Sundays). |
| GET | `/analytics/met/statistics?deviceId&sensor&from&to` | `{ count, mean, median, stdDev, variance, p10, p25, p50, p75, p90, p95, p99, min, max, range, skewness, beaufortBreakdown?: [...] }` | **Stats card / histogram** | Full statistical profile for any sensor over any period. When `sensor=wind_speed`, also returns `beaufortBreakdown: [{ force: 0..12, label, description, count, pct, totalHrs }]`. |
| GET | `/analytics/met/daily-summary?deviceId&from&to` | `[{ date, tempMax, tempMin, tempAvg, windSpeedMax, windDirPrevailing, pressureAvg, precipTotal, solarTotal, dewPointAvg, pressureTendency, completeness, ... }]` | **Daily summary calendar / table** | Served from `metDailySummaries` pre-computed collection. Powers a calendar heatmap (color cells by temperature or wind speed) and a printable daily weather report table. |
| GET | `/analytics/met/pressure-tendency?deviceId&hours=3\|6\|12\|24` | `{ current, previous, deltaHpa, deltaPerHr, tendency, label }` | **Pressure trend widget** | Standard meteorological pressure tendency. Thresholds: >+6 hPa/3h = `rising_rapidly`, +1.6–+6 = `rising`, ±1.6 = `steady`, −1.6–−6 = `falling`, <−6 = `falling_rapidly`. Include a natural-language label: `"Falling — watch for deteriorating conditions"`. |
| GET | `/analytics/met/beaufort-breakdown?deviceId&from&to` | `[{ force: 0..12, label, description, minMs, maxMs, count, pct, totalHrs }]` | **Bar/pie chart** | How many hours in each Beaufort force category over the period. Force labels: 0=Calm, 1=Light air, 2=Light breeze, 3=Gentle breeze, 4=Moderate breeze, 5=Fresh breeze, 6=Strong breeze, 7=Near gale, 8=Gale, 9=Strong gale, 10=Storm, 11=Violent storm, 12=Hurricane. |
| GET | `/analytics/met/anomalies?deviceId&sensor&from&to&sigma=2` | `[{ windowStart, windowEnd, avgValue, rollingMean, sigmaValue, severity }]` | **Anomaly bands on line chart** | Returns TIME WINDOWS (not individual points) where sensor is > N sigma from 1-hour rolling mean. `severity = 'warning'` (2σ) or `'critical'` (3σ+). Render as shaded bands behind the sensor line chart. |
| GET | `/analytics/met/export-bulk?deviceId&from&to&format=csv\|json` | File download | **Bulk data export** | All parsed measure fields for date range. `Content-Disposition: attachment`. Max 90 days per request. Rate-limited: 5 downloads/hr per org. CSV has a header row identical to MET-LINK app export format. |
| GET | `/analytics/met/wind-gust-history?deviceId&from&to&interval=1h\|4h\|1d` | `[{ ts, gustMs, gustKmh, gustKnots, dirDeg }]` | **Wind gust time series** | Maximum wind speed (not average) per time bucket. Standard meteorological wind gust product. `ts` = bucket start. Used for gust overlay behind the wind speed line chart, and for identifying storm events. `interval=1h` default. |
| GET | `/analytics/met/comfort-indices?deviceId&from&to&interval=5min\|1h` | `[{ ts, tempC, humidityPct, windSpeedMs, heatIndexC, windChillC, effectiveTempC, comfortLabel, comfortClass }]` | **Heat Index + Wind Chill time series** | Computes BOTH derived comfort metrics per bucket. **Heat Index formula** (when tempC > 27 AND humidityPct > 40): Australian BOM-aligned Steadman formula — returns `null` when conditions not met. **Wind Chill formula** (when tempC < 10 AND windSpeedMs > 1.34): `WC = 13.12 + 0.6215T − 11.37(V^0.16) + 0.3965T(V^0.16)` (JAG/TI standard) — returns `null` when conditions not met. `effectiveTempC` = heat index if applicable, else wind chill if applicable, else tempC. `comfortLabel` = "Very Hot", "Hot", "Warm", "Comfortable", "Cool", "Cold", "Very Cold", "Dangerously Cold". For construction site safety, outdoor event planning, field operator welfare. |
| GET | `/analytics/met/fog-risk?deviceId&from&to&interval=1h` | `[{ ts, tempC, dewPointC, spread, fogRisk, relativeHumidityPct }]` | **Dew point spread + fog risk time series** | `spread = tempC − dewPointC`. Fog risk: `< 2°C = HIGH`, `2–4°C = MODERATE`, `> 4°C = LOW`. Relevant for aviation ground ops (MET-LINK at airfields), road management, marine ops. `relativeHumidityPct` included for context. |
| GET | `/analytics/met/record-comparison?recordIds[]=id1&recordIds[]=id2&sensors[]=wind_speed&sensors[]=temperature` | `{ records: [{ id, label, deviceName, dateStart, color }], series: [{ sensor, unit, data: [{ offsetMs, recordId, value }] }] }` | **Multi-record overlay** | Side-by-side comparison of up to 5 MET-LINK records on the SAME time axis (aligned by session start, `offsetMs` = ms since session start). Equivalent of NEP `/analytics/nep/session-comparison` for MET data. Used for comparing before/after weather events, seasonal comparison, different device locations. |
| GET | `/analytics/met/precipitation-events?deviceId&from&to&minRateMmHr=0.1` | `[{ eventStart, eventEnd, durationMin, totalMm, peakRateMmHr, peakAt }]` | **Discrete precipitation events** | Identifies individual rainfall events from continuous `precipRateMmHr` data. An event starts when `precipRateMmHr >= minRateMmHr` and ends when rate drops to 0 for >15 min. Returns event catalogue: start, end, duration, total accumulation, peak intensity. Renders as event markers on the precipitation chart. |

#### NEP-LINK Analytics

| Method | Endpoint | Returns | Chart Type | Notes |
|---|---|---|---|---|
| GET | `/analytics/nep/turbidity-distribution?sessionId\|deviceId&from&to` | `{ buckets: [{ label, minNtu, maxNtu, count, pct, waterQualityClass }], probeRange, totalSamples }` | **Histogram** | Buckets aligned to WHO/EPA water quality bands: 0–1, 1–10, 10–50, 50–100, 100–500, 500–1000, 1000–5000, >5000 NTU. Each bucket gets a `waterQualityClass` colour label. |
| GET | `/analytics/nep/session-comparison?sessionIds[]=uuid1&sessionIds[]=uuid2` | `{ sessions: [{ id, label, color, probeRange }], timeSeries: [{ offsetMs, values: { sessionId: ntu } }] }` | **Multi-session overlay** | Time axis is OFFSET from session start (0 = logging began). Up to 5 sessions simultaneously. Essential for comparing before/after flood events or seasonal monitoring at the same water body. |
| GET | `/analytics/nep/water-quality-summary?sessionId` | `{ avgNtu, maxNtu, minNtu, probeRange, who: { compliant, threshold: 1 }, epa: { recreational: 'safe'\|'caution'\|'unsafe', threshold: 10 }, isoLabel, badgeColor }` | **Quality badge / summary card** | Classifies the session against WHO drinking water standard (1 NTU) and EPA recreational water standard (10 NTU). Returns `badgeColor` (hex) and `isoLabel` for direct rendering. |
| GET | `/analytics/nep/probe-range-breakdown?deviceId&from&to` | `[{ date, r1Count, r2Count, r3Count, r1Pct, r2Pct, r3Pct, totalSamples }]` | **Stacked bar chart** | R1 (0–10 NTU, clean), R2 (10–1000 NTU, field), R3 (>1000 NTU, flood) breakdown per day. Reveals how the water body's turbidity regime changes over time / after events. |
| GET | `/analytics/nep/gps-density?deviceId&from&to&resolution=low\|medium\|high` | `[{ lat, lng, avgTurbidity, maxTurbidity, sampleCount, dominantProbeRange }]` | **Spatial heatmap / Leaflet overlay** | Clusters GPS samples into geographic grid cells (low=100m², medium=10m², high=1m²). Returns per-cell turbidity averages. Renders as Leaflet circle markers sized/coloured by NTU. THIS is the key spatial analysis feature. |
| GET | `/analytics/nep/daily-summary?deviceId&from&to` | `[{ date, turbidityAvg, turbidityMax, turbidityMin, temperatureAvg, sessionCount, dominantProbeRange, drinkingCompliant, recreationalSafe }]` | **Daily calendar / table** | Served from `nepDailySummaries`. Powers calendar heatmap and trending overview. |
| GET | `/analytics/nep/turbidity-temperature-correlation?sessionId\|deviceId&from&to` | `{ pearsonR, rSquared, trend: 'positive'\|'negative'\|'none', significance: 'strong'\|'moderate'\|'weak'\|'none', sampleCount, interpretation, scatterPoints: [{ ntu, tempC }] }` | **Scatter plot + correlation card** | Computes Pearson correlation coefficient between turbidity (NTU) and water temperature (°C). `interpretation` = plain-English label e.g. "Strong positive correlation — warmer water is associated with higher turbidity, suggesting biological activity or resuspension during warm conditions". `scatterPoints` capped at 500 for rendering. Filter to sessions with `hasTempData=true` (R3 sessions have no temperature and are excluded). |
| GET | `/analytics/nep/session-events?sessionId&minNtu=&eventGapMin=15` | `[{ eventStart, eventEnd, durationMin, peakNtu, peakAt, meanNtu, probeRange, gpsCentroid: { lat, lng } }]` | **Turbidity spike events** | Identifies discrete turbidity exceedance events within a session. An event starts when NTU crosses `minNtu` threshold (default: 50% above session mean) and ends when it drops below for `eventGapMin` minutes. Returns structured event list for chart annotation markers, GPS location of the peak reading (if GPS enabled), and per-event statistics. Essential for field scientists documenting disturbance events. |
| GET | `/analytics/nep/export-bulk?deviceId&from&to&format=csv\|json` | File download | **Bulk export** | All samples for device+date range. CSV format matches the mobile app export exactly. Max 30 days per request. Rate-limited. |

#### Cross-Device / Org Analytics

| Method | Endpoint | Returns | Chart Type | Notes |
|---|---|---|---|---|
| GET | `/analytics/org/device-comparison?deviceIds[]=&sensor=temperature\|wind_speed\|pressure&from&to&interval=1h` | `{ series: [{ deviceId, deviceName, color, values: [{ ts, value }] }] }` | **Multi-device overlay line** | Same sensor from multiple MET-LINK stations on one chart. For orgs with multiple weather stations at different locations (e.g., coastal vs inland). |
| GET | `/analytics/org/fleet-health` | `[{ deviceId, deviceName, type, isOnline, lastSeenAt, batteryPct, batteryCharging, daysSinceFirst, totalRecords, totalSessions, storageEstimateMb }]` | **Fleet health table** | All devices in org with health + usage stats. Backend computes `storageEstimateMb` from document counts × avg sizes. Refresh every 5 min; cache aggressively. |

#### Unit Conversion Utility

| Method | Endpoint | Returns | Notes |
|---|---|---|---|
| GET | `/analytics/unit-convert?value=12.5&fromUnit=m/s&toUnit=Bft` | `{ input: 12.5, fromUnit: 'm/s', result: 5.0, toUnit: 'Bft', label: 'Fresh breeze' }` | Converts between all supported units. Returns Beaufort label string when `toUnit=Bft`. Used by export tools, report generators, and CSV headers. |

---

**Wind Rose Sector Definitions (used by `/analytics/met/wind-rose`):**

| Sector | Center | Range | Sector | Center | Range |
|---|---|---|---|---|---|
| N | 0° | 348.75–11.25° | S | 180° | 168.75–191.25° |
| NNE | 22.5° | 11.25–33.75° | SSW | 202.5° | 191.25–213.75° |
| NE | 45° | 33.75–56.25° | SW | 225° | 213.75–236.25° |
| ENE | 67.5° | 56.25–78.75° | WSW | 247.5° | 236.25–258.75° |
| E | 90° | 78.75–101.25° | W | 270° | 258.75–281.25° |
| ESE | 112.5° | 101.25–123.75° | WNW | 292.5° | 281.25–303.75° |
| SE | 135° | 123.75–146.25° | NW | 315° | 303.75–326.25° |
| SSE | 157.5° | 146.25–168.75° | NNW | 337.5° | 326.25–348.75° |

**Wind Speed Bands (used in speed buckets within each sector):**
- Calm: 0–0.5 m/s (Bft 0)
- Light: 0.5–3.3 m/s (Bft 1–2)
- Gentle: 3.3–7.9 m/s (Bft 3–4)
- Moderate: 7.9–13.8 m/s (Bft 5–6)
- Strong: >13.8 m/s (Bft 7+)

**NTU Water Quality Classification (used in turbidity-distribution + nepDailySummaries):**
- 0–1 NTU: WHO drinking water compliant — badge: dark green (`#1a7a1a`)
- 1–10 NTU: EPA recreational safe — badge: green (`#4caf50`)
- 10–50 NTU: Slightly turbid — badge: yellow (`#ffeb3b`)
- 50–100 NTU: Moderately turbid — badge: orange (`#ff9800`)
- 100–500 NTU: Turbid (R2 mid) — badge: deep orange (`#ff5722`)
- 500–1000 NTU: Highly turbid — badge: red (`#f44336`)
- >1000 NTU: Extreme / flood (R3) — badge: dark red (`#b71c1c`)

---

### 3.15 Bulk Export & Reporting

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/reports/met/daily?deviceId&date` | 🔐 | Generate printable 1-page daily weather summary JSON | Returns structured JSON for PDF rendering client-side or server-side via puppeteer. Includes: all daily stats from `metDailySummaries`, wind rose sector data, 24h pressure chart data, 24h temperature range chart data. |
| POST | `/reports/nep/session?sessionId` | 🔐 | Generate session report data JSON | Includes: session metadata, turbidity time series (downsampled), GPS density points, water quality classification, photo file URLs. |
| GET | `/exports/met/zip?deviceId&from&to` | 🔐 | ZIP of all record CSVs + photos for date range | Uses `archiver` npm package. Streams ZIP to client. Max 7 days per request. Rate-limited: 3/hr per org. |
| GET | `/exports/nep/zip?deviceId&from&to` | 🔐 | ZIP of all session CSVs + photos + map screenshots | Same `archiver` approach. Max 7 days. |

---

### 3.16 Admin Management APIs

Additional admin-only endpoints for org management, alert rules, storage introspection, and device configuration sync.  
All require 🔐 with `role: admin` claim in JWT.

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/admin/alert-rules?deviceId&appType&isActive` | 🔐 admin | List alert rules for this org | Filter by `deviceId`, `appType` ('MET'|'NEP'), `isActive` (bool). Returns full `alertRules` documents. |
| POST | `/admin/alert-rules` | 🔐 admin | Create a new alert rule | Body: `{ deviceId, name, appType, sensor, condition, threshold, unit, notifyUserIds, cooldownMinutes }` |
| PATCH | `/admin/alert-rules/:id` | 🔐 admin | Update alert rule | Partial update — any field except `organizationId`. Returns updated document. |
| DELETE | `/admin/alert-rules/:id` | 🔐 admin | Delete alert rule | Hard delete. |
| PATCH | `/admin/alert-rules/:id/toggle` | 🔐 admin | Enable or disable a rule | Toggles `isActive`. Body optional: `{ isActive: bool }` to set explicitly. |
| GET | `/admin/audit-logs?from&to&userId&action&page&limit` | 🔐 admin | Paginated audit log | Queries `auditLogs` collection. Default `limit=50`, max 200. Returns `{ logs: [], total, page, totalPages }`. |
| GET | `/admin/storage` | 🔐 admin | Org storage breakdown | Returns `{ mongoDb: { metRecords, metMeasures, nepSessions, nepSamples, photos, ... }, r2: { photosMb, csvsMb, mapsMb }, totalMb }` — useful for billing/quota display in admin panel. |
| POST | `/admin/org/invite-resend/:userId` | 🔐 admin | Re-send invite email to a pending user | Only for users with `status: 'pending'`. Rate-limited: 1/min per target user. |
| GET | `/admin/org/stats` | 🔐 admin | Org-level lifetime statistics | Returns `{ totalDevices, totalMetRecords, totalMetMeasures, totalNepSessions, totalNepSamples, oldestDataAt, newestDataAt, activeDevices30d }` |
| PATCH | `/admin/devices/:id/rename` | 🔐 admin | Rename a device | Body: `{ name, customName }`. Updates `devices` collection. Propagates to any live dashboard. |
| POST | `/admin/devices/:id/settings/sync-prefs` | 🔐 | Sync MET-LINK EnShow/EnLog arrays from mobile | Body: `{ sensorShowPrefs: [...], sensorLogPrefs: [...] }` — upserts `sensorShowPrefs` / `sensorLogPrefs` arrays in `deviceSettings`. Called by mobile app after user changes sensor toggles. |
| GET | `/admin/alert-rules/:id/history` | 🔐 admin | Trigger history for one alert rule | Returns last 100 trigger events: `{ triggeredAt, value, notifiedCount }`. Stored in embedded sub-array on `alertRules` doc (capped at 100). |

---

### 3.17 CSV Import / Backfill APIs

> These endpoints are for admin-side recovery, migration, and bulk ingestion. They are intentionally backend-only and are not exposed in the mobile apps.

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/admin/import/met/csv` | 🔐 admin | Bulk import legacy MET-LINK CSV files | Multipart upload or raw text body. Parses the exact MET-LINK export format, validates timestamps, de-duplicates by `(organizationId, deviceId, timestampMs)`, and writes both `metRecords` + `metMeasures`. Supports `dryRun=true` to return a parse report without writing. |
| POST | `/admin/import/nep/csv` | 🔐 admin | Bulk import legacy NEP-LINK CSV files | Parses the exact NEP-LINK export format, validates session UUID mapping, de-duplicates by `(organizationId, sessionId, timestamp)`, and writes `nepSessions` + `nepSamples`. Supports `dryRun=true`. |
| POST | `/admin/import/files` | 🔐 admin | Import attached photos, maps, and thumbnails for a record/session | Accepts ZIP or multipart bundle of exported assets. Stores files in R2/S3 and backfills `metPictures` / `nepFiles` rows. Useful for historical data migration from phones. |
| GET | `/admin/import/jobs` | 🔐 admin | List recent import jobs | Returns job status, counts, parse errors, duplicate counts, and uploaded-by user. Supports `?status=pending\|running\|failed\|completed`. |
| GET | `/admin/import/jobs/:id` | 🔐 admin | Import job detail | Full parse log with row-level errors and sample preview snippets. |

---

### 3.18 Firmware & Device Health APIs

| Method | Endpoint | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/devices/:id/firmware-history` | 🔐 | View firmware version timeline for one device | Returns `firmwareHistory` docs ordered newest-first. Used by admin panel device detail view and release audit. |
| GET | `/devices/:id/health` | 🔐 | Device health summary | Returns `{ isOnline, lastSeenAt, batteryPct, batteryVoltage, batteryCharging, firmwareVersion, firmwareAgeDays, lastSyncAt, lastSyncLagSeconds, alertCount24h }`. This is backend-only; no frontend logic should derive these values independently. |
| PATCH | `/devices/:id/firmware-version` | 🔐 admin | Manually correct a device firmware version | Rare admin override when a device sends stale metadata. Creates a `firmwareHistory` row with `detectedByAppType='ADMIN'`. |
| POST | `/admin/devices/:id/mark-offline` | 🔐 admin | Force a device offline | Manual override for a lost or retired device. Sets `isOnline=false`, leaves `lastSeenAt` intact, and writes an `auditLogs` entry. |
| POST | `/admin/devices/:id/heartbeat` | 🔐 admin | Backfill heartbeat / lastSeenAt | For troubleshooting or replaying sync events. Updates `lastSeenAt`, battery, and optional firmware metadata exactly like the mobile heartbeat route. |

> **Backend note:** The primary runtime heartbeat still comes from `PATCH /sync/device-status`. These admin endpoints exist so operators can correct or replay state from the dashboard without editing the database directly.

---

## 4. Admin Dashboard Widget Specification

> This is what Hassan builds in Angular. All widgets consume the dashboard API endpoints above. Built to be **categorically better than Smithtek** (client's reference dashboard).

### 4.1 Page: Device Overview (`/dashboard`)

| Widget | Data Source | Type | Notes |
|---|---|---|---|
| Summary stats bar | `GET /dashboard/summary` | 4 stat cards | Total devices, Online now, Total MET records, Total NEP sessions |
| Device cards grid | `GET /dashboard/devices` | Card grid | One card per device. Status pill (online/offline), last seen, battery indicator, type badge |
| Online/offline history | — | Timeline chart | Future Phase 3 feature |

### 4.2 Page: MET-LINK Live Dashboard (`/dashboard/met/:deviceId`)

Mirrors the Ionic app dashboard. Client can see live weather station data in browser.

| Widget | Data Source | Smithtek Equivalent | Notes |
|---|---|---|---|
| Wind Rose (canvas) | `GET /dashboard/met/windrose` | "WIND ROSE" widget | Port the actual Angular canvas component from met-link-mob. Instant / 2-min / 10-min toggle. True/Relative toggle. m/s, km/h, knots toggle |
| Wind Speed gauge | `GET /dashboard/met/latest` → `windSpeedKmh` | "WIND SPEED Km/Hr" gauge | Gauge + current value. Same range as Smithtek: 0–65 km/h |
| Wind Direction | `GET /dashboard/met/latest` → `windDirTrueDeg` | "WIND DIRECTION DEGREES" | Compass needle widget + numeric degrees |
| Temperature tile | `GET /dashboard/met/latest` → `tempC` | "TEMPERATURE °C" | Large number tile + mini line chart (last 20 values) |
| Humidity gauge | `GET /dashboard/met/latest` → `humidityPct` | "PERCENT RELATIVE HUMIDITY" | Gauge 0–100% (matches Smithtek widget) |
| Barometric Pressure gauge | `GET /dashboard/met/latest` → `pressureHpa` | "BAROMETRIC PRESSURE hPa" | Gauge 0–1100 hPa (matches Smithtek) |
| Dew Point tile | `GET /dashboard/met/latest` → `dewPointC` | "DEW POINT °C" | Number tile |
| Solar radiation tile | `GET /dashboard/met/latest` → `solarWm2` | _(not in Smithtek)_ | Number tile + unit W/m² |
| Precipitation tile | `GET /dashboard/met/latest` → `precipMm` | "Total Precipitation" + "Precipitation intensity" | Two sub-tiles |
| Voltage / Current | `GET /dashboard/met/latest` → `voltageV`, `currentA` | "DC VOLTAGE" / "BATTERY VOLTS" | Number tiles |
| Battery voltage | `GET /dashboard/met/latest` → `batteryVoltageV` | "BATTERY VOLTS" | Separate from DC input. This is the exact Smithtek parity tile. |
| QNH / QFE | `GET /dashboard/met/latest` → `qnhHpa`, `qfeHpa` | _(not in Smithtek)_ | Observator-specific. Number tiles |
| GPS Map | `GET /dashboard/met/latest` → `gpsLat`, `gpsLng` | "Map" widget | Leaflet map, station marker |
| Battery indicator | `GET /dashboard/met/latest` → `batteryPct`, `batteryCharging` | "BATTERY VOLTS" | % + charging icon |
| 8-tile configurable layout | User preference | _(not in Smithtek)_ | Port the layout config from the app — any tile can show any sensor |
| Precipitation intensity tile | `GET /dashboard/met/latest` → `precipRateMmHr` | "Precipitation intensity" | Separate live rate widget, not just total accumulation. |
| Wind gust chart | `GET /analytics/met/wind-gust-history` | _(not in Smithtek)_ | Shows gust spikes over time and makes storm bursts obvious. |
| Comfort / fog-risk cards | `GET /analytics/met/comfort-indices`, `GET /analytics/met/fog-risk` | _(not in Smithtek)_ | Adds operations-grade safety insights from the same data. |
| Turbidity-temperature correlation | `GET /analytics/nep/turbidity-temperature-correlation` | _(not in Smithtek)_ | Graphical science view: does warmer water correlate with higher turbidity? |
| Turbidity spike events | `GET /analytics/nep/session-events` | _(not in Smithtek)_ | Marks disturbance windows and peak NTU moments on the chart. |
| Session comparison overlay | `GET /analytics/nep/session-comparison` | _(not in Smithtek)_ | Compare multiple field runs on one aligned axis. |
| Fleet firmware health | `GET /devices/:id/health`, `GET /devices/:id/firmware-history` | _(not in Smithtek)_ | Admin-only device health and rollout visibility. |

### 4.3 Page: MET-LINK Historical Data (`/dashboard/met/:deviceId/history`)

| Widget | Data Source | Notes |
|---|---|---|
| Multi-sensor line chart | `GET /dashboard/met/history` | Date range picker, sensor selector dropdown, Chart.js |
| Wind history chart | Same | Wind speed + direction overlay |
| Data table export | `GET /records/:id/export` | Download CSV button per record |

### 4.4 Page: MET-LINK Records (`/dashboard/met/:deviceId/records`)

| Widget | Notes |
|---|---|
| Records list table | Columns: Date Start, Date End, Duration, Comment, Actions |
| Record detail drawer | CSV data preview, photos gallery |
| Download CSV button | `GET /records/:id/export` |

### 4.5 Page: NEP-LINK Sessions (`/dashboard/nep/:deviceId`)

| Widget | Data Source | Notes |
|---|---|---|
| Sessions table | `GET /dashboard/nep/sessions` | Columns: Date, Duration, Probe Range (R1/R2/R3 color badge), Avg NTU, Avg Temp, Samples, Comment |
| Turbidity gauge | `GET /dashboard/nep/latest` | Live last reading — large NTU value, R1/R2/R3 range label |
| Water temperature tile | Same | °C |
| Battery indicator | Same | % + charging state |
| GPS map (live) | Same | Current device location |

### 4.6 Page: NEP-LINK Session Detail (`/dashboard/nep/sessions/:id`)

| Widget | Data Source | Notes |
|---|---|---|
| Session info header | Session metadata | Device, start/end time, probe range, sample count |
| Turbidity line chart | `GET /dashboard/nep/trend?field=turbidity` | Chart.js, downsampled to ≤500 pts |
| Temperature line chart | `GET /dashboard/nep/trend?field=temperature` | Toggleable with turbidity chart |
| GPS map with turbidity overlay | `GET /dashboard/nep/map` | Leaflet, each GPS point colored by turbidity intensity — THIS is what beats Smithtek |
| Data averages cards | From session object | Min / Max / Avg NTU, Avg Temp |
| Photos gallery | `GET /sessions/:id/files` | Lightbox viewer |
| Map screenshot image | Same `fileType=map` | Map snapshot taken at session start |
| Export button | `GET /sessions/:id/export` | Download CSV with attachments |
| Comment editor | `PATCH /sessions/:id` | Inline edit |

### 4.7 Page: Admin — Organization & Users

| Widget | Notes |
|---|---|
| Users table | Role badge, last login, active status |
| Invite user form | Email + role selector |
| Role editor | Dropdown per user row |
| Activity log | Destructive actions audit trail |

---

### 4.8 Angular Admin Dashboard — Architecture Specification

> This section defines the complete Angular 19 admin dashboard project structure so Hassan can scaffold it correctly in Week 7.

#### Route Map

```
/login                                      → LoginComponent
/dashboard                                  → DashboardHomeComponent  [AuthGuard]
  /dashboard/devices                        → DevicesOverviewComponent
  /dashboard/met/:deviceId                  → MetLiveDashboardComponent
  /dashboard/met/:deviceId/history          → MetHistoryComponent
  /dashboard/met/:deviceId/records          → MetRecordsComponent
  /dashboard/met/:deviceId/settings         → MetDeviceSettingsComponent
  /dashboard/nep/:deviceId                  → NepSessionsComponent
  /dashboard/nep/:deviceId/:sessionId       → NepSessionDetailComponent
/admin                                      → AdminLayoutComponent  [AdminGuard]
  /admin/users                              → UsersManagementComponent
  /admin/devices                            → DeviceManagementComponent
  /admin/audit                              → AuditLogComponent
  /admin/settings                           → OrgSettingsComponent
/profile                                    → UserProfileComponent  [AuthGuard]
/public/:shareToken                         → PublicSessionViewComponent  (no guard)
```

#### Folder Structure

```
dashboard-web/src/app/
  core/
    guards/
      auth.guard.ts          — Checks auth.service.isLoggedIn(). Redirect to /login on fail.
      admin.guard.ts         — Checks user role === 'admin'. Redirect to /dashboard on fail.
    interceptors/
      jwt.interceptor.ts     — Injects Authorization: Bearer <accessToken> on all API requests.
      refresh.interceptor.ts — On HTTP 401, calls POST /auth/refresh (cookie-based refresh token),
                               stores new access token, retries original request once.
                               On second 401 → logout + redirect to /login.
    services/
      auth.service.ts        — login(), logout(), refreshToken(). Access token stored as a
                               private signal (never localStorage — XSS risk). Refresh token
                               stored in httpOnly cookie set by the server.
      api.service.ts         — Base HttpClient wrapper. Handles { data, meta } and { error } envelope.
      ws.service.ts          — WebSocketSubject wrapper for real-time events (Month 3).
  shared/
    components/
      wind-rose/             — Canvas wind rose. Ported from met-link-mob/dashboard.page.ts drawRose().
                               Inputs: [windDirection], [windSpeed], [windUnit], [windPeriod], [colorScheme]
      chart-line/            — Chart.js ^4.4.x line chart. Inputs: [data], [label], [color], [unit]
      battery-indicator/     — Battery % pill. Inputs: [pct], [isCharging]
      device-status-pill/    — "Online" (green) / "Offline" (red) badge. Input: [isOnline]
      leaflet-map/           — Leaflet 1.9 map wrapper. Inputs: [lat], [lng], [points], [colorFn]
      sensor-tile/           — Single tile in the 8-tile grid. Input: [tileData] = {label, value, unit}
      data-table/            — Paginated sortable table. Inputs: [columns], [rows], [loading]
      skeleton-loader/       — Bone skeleton animation for loading states
    pipes/
      duration.pipe.ts       — milliseconds → "2h 14m"
      ntu-color.pipe.ts      — NTU value → CSS class string (clean/moderate/turbid)
      ago.pipe.ts            — timestamp → "5 minutes ago"
  pages/
    login/
    dashboard-home/          — Summary stats + device cards
    met-live/                — 8-tile grid + wind rose. Polls /dashboard/met/latest every 30s.
    met-history/             — Date range picker + sensor dropdown + Chart.js line chart
    met-records/             — Record list + detail drawer + CSV download
    met-device-settings/     — QNH/QFE heights, wind unit, color scheme. Calls PATCH /devices/:id/settings
    nep-sessions/            — Sessions list table + live latest tile
    nep-session-detail/      — Turbidity chart + GPS turbidity map + photo gallery
    public-session-view/     — Read-only public share page (no sidebar/auth)
    admin-users/
    admin-devices/
    admin-audit/
    admin-settings/
    user-profile/
  app.config.ts              — provideRouter, provideHttpClient(withInterceptors([jwtInterceptor, refreshInterceptor]))
  app.routes.ts              — Route definitions with loadComponent() for lazy loading
```

#### State Management

**Decision: Angular Signals only — NO NgRx, NO BehaviorSubject services.**

```typescript
// auth.service.ts
private readonly _accessToken = signal<string | null>(null);
readonly isLoggedIn = computed(() => !!this._accessToken());
readonly currentUser = signal<User | null>(null);

// met-live.component.ts
readonly latestData = signal<MetLatestResponse | null>(null);
readonly isLoading = signal(true);

ngOnInit() {
  this.pollInterval = setInterval(() => this.loadLatest(), 30_000);
  this.loadLatest();
}

private loadLatest() {
  this.api.get<MetLatestResponse>(`/dashboard/met/latest?deviceId=${this.deviceId}`)
    .subscribe(data => { this.latestData.set(data); this.isLoading.set(false); });
}
```

#### JWT Interceptor Pattern

```typescript
// jwt.interceptor.ts
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getAccessToken(); // reads signal synchronously
  if (!token) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

// refresh.interceptor.ts
export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/auth/refresh')) {
        return auth.refreshToken().pipe( // POST /auth/refresh — uses httpOnly cookie
          switchMap(() => next(req.clone({ setHeaders: { Authorization: `Bearer ${auth.getAccessToken()}` } }))),
          catchError(() => { auth.logout(); return throwError(() => err); })
        );
      }
      return throwError(() => err);
    })
  );
};
```

#### Chart.js Integration

- Library: `chart.js ^4.4.x` — same major version as met-link-mob (reuse knowledge)
- Chart types needed: `line` (all time-series sensors), `bar` (optional session comparison)
- Wind rose: **Canvas API drawn directly** (port from `dashboard.page.ts:drawRose()`) — NOT Chart.js
- Compass direction: **Canvas API needle** (port from dashboard)
- Gauges (humidity, pressure, wind speed): Either `chart.js` doughnut or pure CSS arc component
- Turbidity GPS map: **Leaflet 1.9** with custom circle markers colored by NTU value (green=0, orange=100, red=1000+)

#### Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| CSS framework | Tailwind CSS v4 | Utility-first, small bundle, easy dark mode |
| Component library | None (custom) | Observator brand needs custom look |
| Map library | Leaflet 1.9 | `react-native-maps` is in NEP-LINK but Leaflet is the web standard |
| HTTP polling | 30s interval with `setInterval` | Simple for MVP. WebSocket upgrade in Month 3. |
| Token storage | Access token: memory signal; Refresh token: httpOnly cookie | Prevents XSS (localStorage) and CSRF (SameSite=Strict cookie) |
| Dark mode | CSS custom properties + `prefers-color-scheme` + manual toggle | Match the 3 themes from the mobile app: Black / Grey / Blue |
| Build | `ng build --configuration=production` → Cloudflare Pages or Railway Static | |  

---

## 5. 6-Month Weekly Timeline

> 24 weeks total. Each week has a clear deliverable. Based on the exact commitment made to Dana Galbraith (GM, Observator Instruments).

---

### MONTH 1 — Foundation: Server Live, Schema Migrated, Auth Working

**Month 1 Goal:** Cloud server live on Railway. Hassan has a live API URL + Swagger. Can show Dana a working dashboard skeleton by end of Month 1. No sensor data yet — that's Month 2.

> ✅ **Month 1 Actual:** Deployed to **Render** (Docker runtime, free tier). Live: `https://iot-apps-admin.onrender.com` | Swagger: `https://iot-apps-admin.onrender.com/api/` | 39 endpoints working.

---

#### Week 1 (May 12–16)

**Theme:** Project scaffold + PostgreSQL-style MongoDB schema + Auth

| # | Task | File/Module | Effort | Priority |
|---|---|---|---|---|
| 1 | NestJS/Express project init: TypeScript, ESLint, Prettier, `.env`, Dockerfile, README | `/backend/src/app.ts` | 0.5 day | HIGH |
| 2 | MongoDB Atlas cluster connection via Mongoose. All 12 schemas from Section 2 defined. Seed script: 1 org + 1 admin user + 1 MET-LINK device + 1 NEP-LINK device | `/backend/src/models/` | 1.5 days | HIGH |
| 3 | Auth module: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`. bcrypt cost 12. JWT (15 min access + 30 day refresh). JWT guard middleware | `/backend/src/auth/` | 1.5 days | HIGH |
| 4 | Rate limiting: `express-rate-limit` on `/auth/login` (10/min per IP) | `app.ts` | 0.5 day | HIGH |
| 5 | GitHub repo under Veldora Studio org. Branch strategy: `main` / `dev` / `feature/*`. CI pipeline placeholder | `.github/` | 0.5 day | MEDIUM |

**Week 1 Deliverable:** Auth endpoints working in Postman against local dev. Share Postman collection with Hassan.

---

#### Week 2 (May 19–23)

**Theme:** Device registry + NEP-LINK sessions API

| # | Task | File/Module | Effort | Priority |
|---|---|---|---|---|
| 1 | Device registry CRUD: `GET/POST/PATCH/DELETE /devices` — scoped by `organizationId`. Validate `type = MET-LINK \| NEP-LINK`. Soft delete | `/backend/src/devices/` | 1 day | HIGH |
| 2 | NEP-LINK sessions module: full CRUD. `POST /sessions` auto-computes `turbidityAvg`, `turbidityMin`, `turbidityMax`, `sampleCount`, `probeRange` | `/backend/src/sessions/` | 1.5 days | HIGH |
| 3 | `POST /sessions/:id/samples` — bulk insert. Single `insertMany()` call — NEVER loop per row. Accept up to 7,200 samples in one request | `sessions.service.ts` | 1 day | HIGH |
| 4 | `GET /sessions/:id/samples` with pagination + `?downsample=true` (1-min average if >500 pts) | `sessions.service.ts` | 0.5 day | HIGH |

**Week 2 Deliverable:** NEP-LINK sessions + samples endpoints verified in Postman with realistic seed data.

---

#### Week 3 (May 26–30)

**Theme:** MET-LINK records + measure parsing + Deploy to Render *(actual: Render, not Railway)*

| # | Task | File/Module | Effort | Priority |
|---|---|---|---|---|
| 1 | MET-LINK records module: full CRUD. `POST /records/:id/measures` — bulk insert, parse sensor fields from CSV `dataSentence` string on ingest into indexed fields (`windSpeedMs`, `tempC`, `pressureHpa`, etc.) | `/backend/src/records/` | 2 days | HIGH |
| 2 | CSV measure parsing utility: given `"12.5,m/s,Wind speed,045.0,°,relative,23.4,°C,Temperature,..."` → extract and store all numeric fields | `measure-parser.util.ts` | 1 day | HIGH |
| 3 | ~~Deploy to Railway~~: Deploy to **Render** (Docker runtime): MongoDB Atlas connection string, all env vars set, HTTPS auto, `/health` live. Share live URL with Hassan | `render.yaml` + `/Dockerfile` | 0.5 day | HIGH |
| 4 | Swagger / OpenAPI docs auto-generated. Pre-generate `swagger-spec.json` at build time (Alpine Linux glob fix). Share `https://iot-apps-admin.onrender.com/api/` with Hassan — this is the live API contract | `swagger.ts` + `generateSwagger.ts` | 0.5 day | HIGH |

**Week 3 Deliverable:** ✅ Live HTTPS URL on **Render**: `https://iot-apps-admin.onrender.com`. Swagger at `https://iot-apps-admin.onrender.com/api/` (39 endpoints, try-it-out working). Hassan can start building Angular dashboard against real data. **THIS UNBLOCKS ALL FRONTEND WORK.**

---

#### Week 4 (Jun 2–6)

**Theme:** File uploads + Sync API + Password reset + Handover

| # | Task | File/Module | Effort | Priority |
|---|---|---|---|---|
| 1 | File upload: `POST /sessions/:id/files` + `POST /records/:id/pictures` — multipart, MIME validate, 10MB max. Store files on **local disk** (`/uploads/`) for Month 1 — R2 deferred to Month 2 | `/backend/src/files/` | 1 day | MEDIUM |
| 2 | Download URL generation for `GET /sessions/:id/files` + `GET /records/:id/pictures` — returns server-relative URLs from disk (Month 1). ~~Presigned R2 URLs~~ deferred to Month 2 | `files.service.ts` | 0.5 day | MEDIUM |
| 3 | Sync API: `GET /sync/status`, `POST /sync/upload` (upsert by UUID, idempotent), `GET /sync/download` | `/backend/src/sync/` | 1 day | MEDIUM |
| 4 | Forgot password / reset password endpoints via Resend email | `auth.service.ts` | 0.5 day | MEDIUM |
| 5 | README complete: local dev setup, env variable list (values via secure channel — NOT WhatsApp), API contract link | `README.md` | 0.5 day | HIGH |

**Week 4 Deliverable:** All Month 1 deliverables complete. Live API. Swagger. README. Postman collection updated with all endpoints.

---

### MONTH 2 — Sensor Data Flowing Into Dashboard

**Month 2 Goal:** Real sensor data visible in Angular dashboard. MET-LINK 8 tiles live. Wind rose working. NEP-LINK turbidity chart live. This is what Dana sees for the first time.

---

#### Week 5 (Jun 9–13)

**Theme:** Dashboard aggregation endpoints — MET-LINK

| # | Task | File/Module | Effort | Priority |
|---|---|---|---|---|
| 1 | `GET /dashboard/summary` — total devices, online count, record/session totals | `dashboard.service.ts` | 0.5 day | HIGH |
| 2 | `GET /dashboard/devices` — device overview with `isOnline` computed field (lastSeenAt < 5 min) | `dashboard.service.ts` | 0.5 day | HIGH |
| 3 | `GET /dashboard/met/latest?deviceId=` — latest row from most recent record's last measure. Parse all sensor fields. Return full sensor snapshot | `dashboard.service.ts` | 1 day | HIGH |
| 4 | `GET /dashboard/met/windrose?deviceId=` — return last 600 (10-min) and last 120 (2-min) wind direction + speed readings as arrays for canvas wind rose | `dashboard.service.ts` | 1 day | HIGH |
| 5 | Run `EXPLAIN` on every dashboard query. Add compound indexes if any query exceeds 100ms on seed dataset. Cache all dashboard endpoints 30s | `models/*.ts` | 1 day | HIGH |

**Week 5 Deliverable:** MET-LINK `/dashboard/met/latest` and `/dashboard/met/windrose` endpoints live. Hassan can render live MET-LINK tiles and wind rose.

---

#### Week 6 (Jun 16–20)

**Theme:** Dashboard aggregation endpoints — MET-LINK history + NEP-LINK

| # | Task | File/Module | Effort | Priority |
|---|---|---|---|---|
| 1 | `GET /dashboard/met/history?deviceId&sensor&from&to` — 1-minute aggregation pipeline. Support all sensors: `wind_speed`, `wind_dir`, `temperature`, `humidity`, `pressure`, `solar`, `precipitation`, `dew_point`, `voltage` | `dashboard.service.ts` | 1.5 days | HIGH |
| 2 | `GET /dashboard/nep/sessions?deviceId` — sessions table for NEP-LINK | `dashboard.service.ts` | 0.5 day | HIGH |
| 3 | `GET /dashboard/nep/latest?deviceId=` — latest turbidity/temp from most recent active session | `dashboard.service.ts` | 0.5 day | HIGH |
| 4 | `GET /dashboard/nep/trend?sessionId&field=turbidity\|temperature` — downsample to ≤500 pts using bucket aggregation | `dashboard.service.ts` | 0.5 day | HIGH |
| 5 | `GET /dashboard/nep/map?sessionId=` — GPS points with turbidity values, downsampled to ≤300 pts | `dashboard.service.ts` | 0.5 day | HIGH |

**Week 6 Deliverable:** All 8 dashboard endpoints from spec live and tested with seed data. Hassan has everything needed to build all widgets.

---

#### Week 7 (Jun 23–27)

**Theme:** Hassan builds Angular dashboard — MET-LINK live tiles

| # | Task | Who | File | Notes |
|---|---|---|---|---|
| 1 | Angular dashboard project scaffold: routing, auth guard, HTTP client, environment files | Hassan | `dashboard-web/` | Consumes live Railway API |
| 2 | Login page + JWT auth service | Hassan | `auth.service.ts` | Store tokens in memory (access) + httpOnly cookie (refresh) |
| 3 | Device overview page: device cards from `GET /dashboard/devices` | Hassan | `devices.component.ts` | Online/offline status indicator |
| 4 | MET-LINK live dashboard: 8-tile grid consuming `GET /dashboard/met/latest` polling every 30s | Hassan | `met-dashboard.component.ts` | Port tile layout concept from mobile app |

**Week 7 Deliverable:** Dashboard running locally with real data tiles updating every 30s.

---

#### Week 8 (Jun 30–Jul 4)

**Theme:** Hassan builds Angular dashboard — Wind rose + NEP-LINK charts

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Port wind rose canvas component from `met-link-mob/src/app/pages/live-data/dashboard/dashboard.page.ts` into Angular dashboard | Hassan | The canvas-drawing logic is already written — port it as a standalone Angular component consuming `/dashboard/met/windrose` |
| 2 | MET-LINK historical line charts: date range picker + sensor selector dropdown consuming `GET /dashboard/met/history` | Hassan | Chart.js |
| 3 | NEP-LINK sessions table: consuming `GET /dashboard/nep/sessions` | Hassan | |
| 4 | NEP-LINK session detail: turbidity + temperature line charts consuming `GET /dashboard/nep/trend` | Hassan | Toggle turbidity/temperature |

**Week 8 Deliverable:** Wind rose + NEP-LINK charts live. **This is what Dana sees in Month 2 demo.** Show client working prototype.

---

### MONTH 3 — Historical Data, GPS Map, Multi-Device, Export

---

#### Week 9 (Jul 7–11)

**Theme:** GPS map overlay for NEP-LINK + MET-LINK GPS

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | NEP-LINK session GPS map: Leaflet map in Angular, render points from `GET /dashboard/nep/map`, color each point by turbidity intensity (green→red scale) | Hassan | THIS is the killer feature vs Smithtek — spatial view of turbidity measurements |
| 2 | Probe range (R1/R2/R3) color badges on session list and map points | Hassan | R1=blue (clean), R2=orange (field), R3=red (flood/extreme) |
| 3 | MET-LINK GPS station map on live dashboard | Hassan | Simple static marker on Leaflet |
| 4 | Backend: ensure `GET /dashboard/nep/map` returns `probeRange` per point for color coding | Backend | |

**Week 9 Deliverable:** NEP-LINK spatial map live. The standout feature over Smithtek is working.

---

#### Week 10 (Jul 14–18)

**Theme:** CSV export + Photo gallery + File download

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | `GET /sessions/:id/export` — generate CSV with correct format matching what mobile app exports. Content-Disposition header for file download | Backend | Test with real NEP-LINK CSV format |
| 2 | `GET /records/:id/export` — concatenate header row + all data rows as CSV | Backend | Test with real MET-LINK CSV format |
| 3 | Photo gallery in session detail: grid view consuming `GET /sessions/:id/files` with presigned URLs | Hassan | Lightbox viewer |
| 4 | Map screenshot display in session detail | Hassan | `fileType=map` from `/files` |
| 5 | Download CSV button on session detail and record detail | Hassan | |

**Week 10 Deliverable:** Export functionality end-to-end. Users can download data from the dashboard.

---

#### Week 11 (Jul 21–25)

**Theme:** Multi-device view + Records browser

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Multi-device comparison: side-by-side MET-LINK panels for orgs with multiple devices | Hassan | `?deviceId=` param already supported |
| 2 | MET-LINK records browser: paginated list, record detail with measure preview | Hassan | `GET /records` + `GET /records/:id/measures` |
| 3 | Date range filtering on sessions and records list | Hassan | `?from&to` params |
| 4 | Session search / filter by probe range, device, date | Hassan | Filter bar component |

**Week 11 Deliverable:** Multi-device view + full historical data browsing working.

---

#### Week 12 (Jul 28–Aug 1)

**Theme:** Performance tuning + Sync verification + Backend hardening

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Load test: simulate 10 devices syncing simultaneously. Identify slow queries | Backend | Use k6 or artillery |
| 2 | Verify all compound indexes are working. Add any missing indexes | Backend | |
| 3 | Integration tests for critical paths: auth flow, session upload + bulk samples, dashboard endpoints return correct shape | Backend | Jest + supertest |
| 4 | Mobile app sync integration: wire up `PATCH /sync/device-status` heartbeat in both apps | Mobile | Call from BLE connect handler |
| 5 | Verify `POST /sync/upload` idempotency — upload same session twice, confirm no duplicate | Backend + Mobile | |

**Week 12 Deliverable:** System stable under realistic load. Sync verified end-to-end with both apps.

---

### MONTH 4 — Branding, User Roles, Mobile-Responsive, Testing

---

#### Week 13 (Aug 4–8)

**Theme:** Organization & user management UI

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Admin users page: user table with role badges, last login, active status | Hassan | `GET /organizations/me/users` |
| 2 | Invite user flow: email input + role selector → `POST /organizations/me/users/invite` | Hassan | Resend email with invite link |
| 3 | Role-based UI guards: hide admin-only elements from operator/viewer roles | Hassan | Angular route guards |
| 4 | User profile page: edit name, change password | Hassan | `GET/PATCH /users/me` |

**Week 13 Deliverable:** Full user management available for org admins.

---

#### Week 14 (Aug 11–15)

**Theme:** Observator branding + Design polish

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Apply Observator color scheme, logo, typography to dashboard | Hassan | Match brand identity |
| 2 | Dark/light mode toggle | Hassan | Match the 3 themes from the mobile app (black/grey/blue) |
| 3 | App icons and favicon | Hassan | Use Observator brand assets |
| 4 | Loading states, error states, empty states for all pages | Hassan | Skeleton loaders for data widgets |
| 5 | Toast notifications for actions (delete, export, invite) | Hassan | |

**Week 14 Deliverable:** Fully branded dashboard. Professional client-ready appearance.

---

#### Week 15 (Aug 18–22)

**Theme:** Mobile responsiveness

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Responsive layout: dashboard works on tablet viewport (1024px) and phone (375px) | Hassan | CSS Grid + media queries |
| 2 | Touch-friendly controls: larger tap targets for mobile | Hassan | |
| 3 | Wind rose canvas scales correctly on all viewports | Hassan | Dynamic canvas sizing |
| 4 | Leaflet map responsive container | Hassan | |
| 5 | Test on iOS Safari, Android Chrome, desktop Chrome/Firefox/Edge | Hassan | Cross-browser QA |

**Week 15 Deliverable:** Dashboard usable on mobile devices and tablets.

---

#### Week 16 (Aug 25–29)

**Theme:** Internal testing with Observator team

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Set up staging environment on Railway with real Observator device seed data | Backend | |
| 2 | Send Dana's team staging URL + login credentials | Hassan | |
| 3 | Collect feedback from Observator team: missing features, wrong units, UI confusion points | Hassan | Google Form or Notion doc |
| 4 | Verify sensor parameter list with Dana: are all MET-LINK XDR fields they care about shown? | Hassan | Month 2 deliverable action item |
| 5 | Fix any critical feedback items immediately | Both | |

**Week 16 Deliverable:** Observator team has access to staging. Feedback collected. Critical issues fixed.

---

### MONTH 5 — Bug Fixes, Production Hardening, Store Prep

---

#### Week 17 (Sep 1–5)

**Theme:** Fix all feedback from Month 4 internal testing

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Implement all UI feedback from Observator team review | Hassan | Prioritize by user impact |
| 2 | Fix NEP-LINK Redux array overwrite bug (`loggingSlice.ts:76`) | Mobile | `[action.payload.dataSample]` → `[...state.loggingSessionSamples, action.payload.dataSample]` |
| 3 | Fix NEP-LINK migration utility not wired up (`App.tsx`) | Mobile | Add `await migrateAsyncStorageToSQLite()` call |
| 4 | Fix NEP-LINK nav header title bug (`RootNav.tsx:104`) | Mobile | Use `navigation.setOptions()` inside `LoggingSessionView` |
| 5 | Fix MET-LINK `scanUnpairedDevices()` stub method | Mobile | Implement or remove |

**Week 17 Deliverable:** All known bugs from Section 11 of project doc resolved.

---

#### Week 18 (Sep 8–12)

**Theme:** Security hardening

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Verify every query scoped by `organizationId` — org isolation audit | Backend | A user MUST NEVER see another org's data |
| 2 | File upload: strict MIME type validation (`file-type` library — not just extension check) | Backend | Reject anything not jpeg/png/csv |
| 3 | Remove all 60+ `🔍 RNFS LOG` debug console.log calls from NEP-LINK production build | Mobile | `LoggingSessionView.tsx`, `Devices/index.tsx` |
| 4 | Add `ErrorBoundary` to React Native app | Mobile | Prevent full crash on unhandled render errors |
| 5 | Security headers: HSTS, X-Frame-Options, CSP in backend response | Backend | Use `helmet` middleware |
| 6 | Structured logging with Pino — no passwords/tokens/storage keys ever logged | Backend | Replace all `console.log` |

**Week 18 Deliverable:** Security audit complete. No plaintext secrets in logs.

---

#### Week 19 (Sep 15–19)

**Theme:** Production deployment + monitoring

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Production Railway environment: separate from staging. All env vars set via Railway UI | Backend | |
| 2 | MongoDB Atlas production cluster: M10 tier minimum, automated backups, VPC peering | Backend | |
| 3 | Sentry integration for both mobile apps + backend (crash reporting) | Both | `@sentry/react-native` + `@sentry/node` |
| 4 | UptimeRobot or Railway health check monitoring on `/health` endpoint | Backend | Alert on downtime |
| 5 | CORS configuration: restrict to `https://dashboard.observator.com` | Backend | Not wildcard `*` |

**Week 19 Deliverable:** Production environment live. Monitoring active.

---

#### Week 20 (Sep 22–26)

**Theme:** App Store / Play Store submission preparation

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Final app icons and splash screens for both apps (Observator branding) | Hassan | Use `@capacitor/assets` for MET-LINK, `react-native-bootsplash` for NEP-LINK |
| 2 | iOS Info.plist: all required usage descriptions (Bluetooth, Location, Camera) | Mobile | Already documented in Section 15 of project doc |
| 3 | Android `AndroidManifest.xml`: all permissions verified | Mobile | Already documented |
| 4 | MET-LINK: replace base64 SQLite pictures with file system storage | Mobile | Known technical debt item |
| 5 | iOS build test: `pod install`, Xcode archive, TestFlight internal testing | Mobile | Both apps |

**Week 20 Deliverable:** Both apps ready for store submission. Tested on physical iOS and Android devices.

---

### MONTH 6 — Buffer, Extras, Post-Launch

---

#### Week 21 (Sep 29–Oct 3)

**Theme:** App Store submission

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | NEP-LINK Android: signed AAB, Play Console listing, internal testing track | Mobile | |
| 2 | MET-LINK Android: signed AAB, Play Console listing | Mobile | |
| 3 | NEP-LINK iOS: provisioning profiles, App Store Connect listing, TestFlight beta | Mobile | Apple Developer account required |
| 4 | MET-LINK iOS: same | Mobile | |

---

#### Week 22 (Oct 6–10)

**Theme:** CI/CD pipeline + unit tests

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Backend: Jest unit tests for auth, sessions CRUD, dashboard aggregations | Backend | Target 70% coverage on service layer |
| 2 | GitHub Actions: lint + test + build on every PR | Both | Block merge on failing tests |
| 3 | NEP-LINK: fix duplicate `useEffect` BLE init blocks (`Devices/index.tsx:404` and `:763`) | Mobile | Merge into single effect |
| 4 | NEP-LINK: add `isScanning` to `DeviceState` TypeScript interface | Mobile | 5-minute fix |
| 5 | NEP-LINK: either adopt RTK `configureStore`/`createSlice` OR remove `@reduxjs/toolkit` package | Mobile | Decision: remove (saves 40KB bundle) |

---

#### Week 23 (Oct 13–17)

**Theme:** Advanced analytics (if ahead of schedule) + Probe range display

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | NEP-LINK: probe range (R1/R2/R3) display in session detail view | Mobile | Currently captured but not shown |
| 2 | Dashboard: turbidity threshold alerts UI (visual — no push yet) | Hassan | Highlight readings above configurable threshold |
| 3 | Dashboard: session filtering/search by date, device, probe range | Hassan | Filter bar with query string params |
| 4 | Dashboard: export all sessions as ZIP (multiple CSVs + photos) | Backend + Hassan | Batch export endpoint |
| 5 | Backend: `GET /dashboard/nep/analytics?deviceId&from&to` — aggregate turbidity stats over time | Backend | For multi-session trend view |
| 6 | Backend: `GET /analytics/nep/turbidity-temperature-correlation` and `GET /analytics/nep/session-events` | Backend | Adds the missing analytical layer for NEP-LINK graphical insights |

---

#### Week 24 (Oct 20–24)

**Theme:** Push notifications + OTA firmware tracking (stretch)

| # | Task | Who | Notes |
|---|---|---|---|
| 1 | Push notification infrastructure: FCM (Android) + APNs (iOS) via OneSignal | Backend + Mobile | "Logging session complete" alerts |
| 2 | Turbidity threshold push alert: notify when session avg exceeds user-defined threshold | Backend | NEP-LINK field scientist use case |
| 3 | Firmware version tracking in device registry: alert when device reports older firmware | Backend | MET-LINK `firmwareVersion` from BLE metadata |
| 4 | Web dashboard share link: public read-only link for a session (no login required) | Backend + Hassan | For sharing with external stakeholders |
| 5 | Final client handover: production URLs, admin credentials, code ownership transfer to Observator | Hassan | |
| 6 | CSV import/backfill admin tools for historical migrations | Backend | Safe recovery path for old phone exports and demos |

---

### Timeline Summary Table

| Month | Focus | Key Deliverable to Dana |
|---|---|---|
| **1** | Foundation: schema + auth + APIs deployed | Live API URL on Railway. Swagger docs. Dashboard login works. |
| **2** | Sensor data in dashboard: MET-LINK tiles + wind rose + NEP-LINK charts | Real sensor data visible in browser. Wind rose working. Turbidity chart live. |
| **3** | History + GPS map + export + multi-device | Spatial turbidity map. CSV downloads. Historical charts with date range. |
| **4** | Branding + user roles + internal testing with Observator | Fully branded, mobile-responsive dashboard. Observator team has access to staging. |
| **5** | Bug fixes + production hardening + store prep | All bugs fixed. Production live. App Store submissions prepared. |
| **6** | Store submissions + CI/CD + advanced features (stretch) | Apps on Play Store + App Store. Push alerts. OTA firmware tracking. |

---

## 6. Environment Variables Reference

```bash
# ── Server ────────────────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=production                  # "development" | "staging" | "production"

# ── MongoDB Atlas ─────────────────────────────────────────────────────────────
MONGO_URI=mongodb+srv://saboormalik77222_db_user:<password>@cluster0.p8wxlgv.mongodb.net/observator
# NOTE: Already connected and working as of May 12, 2026 (confirmed in backend/ project)

# ── JWT ───────────────────────────────────────────────────────────────────────
# Generate with: openssl rand -hex 32
JWT_ACCESS_SECRET=<64 char random string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<DIFFERENT 64 char random string from access>
JWT_REFRESH_EXPIRES_IN=30d

# ── Cloudflare R2 (file storage for photos, maps, CSVs) ──────────────────────
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=observator-files
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://files.observator.yourbackend.com   # optional CDN

# ── Email (Resend — user invites + password reset) ────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ORIGIN=https://dashboard.observator.yourbackend.com

# ── Cache ─────────────────────────────────────────────────────────────────────
CACHE_TTL_SECONDS=30                 # dashboard endpoint cache TTL

# ── Rate limiting ─────────────────────────────────────────────────────────────
LOGIN_RATE_LIMIT_MAX=10              # per IP per minute
LOGIN_RATE_LIMIT_WINDOW_MS=60000

# ── Sentry (Month 5) ──────────────────────────────────────────────────────────
SENTRY_DSN=
```

> **Security rules:**
> - Never commit `.env` to git — it is in `.gitignore`
> - Use Railway Environment Variables UI for production values
> - Share secret values via Bitwarden Send or 1Password Share — NEVER WhatsApp or email plaintext
> - Use DIFFERENT secrets for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
> - The MongoDB URI above already has a working Atlas cluster (set up May 12, 2026)

---

---

## 7. Consolidated Known Mobile App Bugs

> All bugs identified from deep source code analysis of both mobile apps. Ordered by severity. These should be fixed in Month 5 (Weeks 17–18) unless marked CRITICAL (fix immediately).

| # | App | File | Line | Bug Description | Severity | Fix |
|---|---|---|---|---|---|---|
| 1 | NEP-LINK | `loggingSlice.ts` | 76 | `LOGGING_ADD_DATA_TO_SESSION` replaces the entire samples array instead of appending: `const loggingSessionSamples = [action.payload.dataSample]` | **CRITICAL** | Change to `[...state.loggingSessionSamples, action.payload.dataSample]` |
| 2 | NEP-LINK | `App.tsx` | ~line 10 | `migrateAsyncStorageToSQLite()` is imported but never called — users upgrading from old AsyncStorage app version have duplicate data stuck in AsyncStorage | **HIGH** | Add `await migrateAsyncStorageToSQLite()` in the app startup `useEffect` |
| 3 | MET-LINK | `sqlite.service.ts` | All picture methods | Photos stored as raw base64 text in SQLite `picture` table — a single 1280×640 JPEG is ~200KB raw which becomes ~267KB base64 — severely bloats the local database | **HIGH** | Migrate to `Filesystem.writeFile()` storage. Store only the file path in the `picture` table. |
| 4 | NEP-LINK | `SessionLineChart.tsx` | 22 | `samples.slice(0, limit)` — always shows the FIRST 200 samples (oldest data) instead of the most recent 200 | **MEDIUM** | Change to `samples.slice(-limit)` or pass the trimmed array pre-sliced from the parent |
| 5 | NEP-LINK | `Devices/index.tsx` | 404 + 763 | Two duplicate `useEffect` BLE initialization blocks — BLE is initialized twice on mount | **MEDIUM** | Merge into a single effect |
| 6 | NEP-LINK | `RootNav.tsx` | 104 | `formattedDateTime` is passed as route param but is NOT declared in `LoggingStackParamList.LoggingSessionView` type — header title never renders and falls back to default | **MEDIUM** | Either add `formattedDateTime?: string` to the type, or set the title inside `LoggingSessionView` using `navigation.setOptions({ title: formattedDateTime })` |
| 7 | MET-LINK | `bluedata.service.ts` | `handleQq()` | QNH/QFE GPS height mode (`if (!this.QqGpsHeight)` block) — the else branch for GPS mode is never implemented. GPS altitude from `$GPGGA` is received but never used for QNH/QFE calculation | **MEDIUM** | Implement GPS-altitude QNH formula in the `else` branch using the parsed `gpsAltM` from GGA |
| 8 | MET-LINK | `bluedata.service.ts` | `scanUnpairedDevices()` | Method is a stub — calls `BleClient.requestLEScan`, waits 10s via `setTimeout`, but never pushes found devices into the result array. Returns `[]` always. | **MEDIUM** | Implement like `startDeviceScan()` — push matched devices in the scan callback |
| 9 | MET-LINK | `bluedata.service.ts` | `NmeaMWV()` | Wind rose orientation check uses `localStorage.getItem('windRoseOrient')` — this bypasses Capacitor Preferences and does not persist correctly on iOS (localStorage is wiped by iOS in low-storage conditions) | **MEDIUM** | Change to `await this.getPreference('windRoseOrient')` — same pattern used everywhere else in the service |
| 10 | NEP-LINK | `Devices/index.tsx` | ~line 95 | `isScanning: false` in `useState` initial value but `isScanning` is NOT declared in the `DeviceState` TypeScript interface — causes a TypeScript error | **LOW** | Add `isScanning: boolean` to `DeviceState` interface |
| 11 | NEP-LINK | `loggingSlice.ts` | `timezoneOffset` field | Typed as `string` in the TypeScript interface but stored as `INTEGER` in SQLite and used as `Number` in actions — inconsistent type | **LOW** | Align to `number` throughout: interface, actions, and DB schema |
| 12 | NEP-LINK | `LoggingSessionView.tsx` + `Devices/index.tsx` | Multiple | 60+ debug `🔍 RNFS LOG` console.log calls left in code — these print sensitive path and data information to the device console in production builds | **LOW** | Remove all debug console.log calls before any production / App Store build |
| 13 | NEP-LINK | `loggingSlice.ts` | — | `@reduxjs/toolkit` is installed (`^2.9.0`) but the app uses plain `combineReducers` / `createStore` — RTK is 40KB unused dead weight | **LOW** | Either migrate reducers to `createSlice` (RTK) OR remove `@reduxjs/toolkit` from `package.json` |

---

## 8. Data Retention & Storage Estimates

### Volume Projections

| Collection | Row Rate | 1 Device / Month | 10 Devices / 12 Months | Avg Doc Size |
|---|---|---|---|---|
| `metMeasures` | 1 row/sec when logging. Assume 4h/day active | ~432K rows | ~52M rows | ~650 bytes |
| `nepSamples` | 1 row/sec when logging. Assume 2h/day active | ~216K rows | ~26M rows | ~120 bytes |
| `metRecords` | ~1 per session | ~120/month | ~14,400 total | ~500 bytes |
| `nepSessions` | ~1 per session | ~60/month | ~7,200 total | ~600 bytes |
| `auditLogs` | ~50/day per org | ~1,500/month | ~180K total | ~200 bytes |
| All other collections | — | Negligible | Negligible | — |

**Total uncompressed (10 devices, 12 months):**
- `metMeasures`: 52M × 650B ≈ **34 GB**
- `nepSamples`: 26M × 120B ≈ **3.1 GB**
- MongoDB uses WiredTiger snappy compression ≈ **50% reduction** → ~18.5 GB live data

### MongoDB Atlas Tier Recommendation

| Phase | Tier | Storage | Cost/month | Upgrade Trigger |
|---|---|---|---|---|
| Month 1–4 (dev + staging) | M10 | 10 GB | ~$57 | When DB > 7 GB |
| Month 5+ (production launch) | M20 | 20 GB | ~$144 | When DB > 15 GB |
| Year 2+ (10+ active devices) | M30 | 40 GB | ~$288 | When DB > 30 GB |

### Cloudflare R2 Storage (Photos, Maps, CSVs)

| Asset Type | Avg Size | Per Session | 10 Devices × 4 sessions/day × 365 days |
|---|---|---|---|
| Map screenshot (NEP-LINK) | 300 KB | 1 per session | ~4.4 GB |
| Photo (MET-LINK, JPEG 1280×640 quality 50) | 200 KB | 1 per record | ~2.9 GB |
| Thumbnail (NEP-LINK) | 30 KB | 1 per session | ~0.4 GB |
| CSV exports | 50 KB avg | Optional | Small |

**Total R2 Year 1: ~8 GB** → R2 free tier is 10 GB/month reads, $0.015/GB storage. Year 1 cost ≈ **$1.50/month**.

### Data Retention Strategy

```javascript
// Recommended: TTL-based auto-purge for high-volume collections
// Option A: TTL index (simple, automatic)
db.metMeasures.createIndex({ createdAt: 1 }, { expireAfterSeconds: 63072000 }); // 2 years
db.nepSamples.createIndex({ createdAt: 1 }, { expireAfterSeconds: 63072000 });   // 2 years

// Option B: Manual archive job (more control — recommended for Year 2+)
// Monthly cron: move docs older than 6 months to metMeasuresArchive (no indexes = cheaper reads)
// Keep last 6 months in live collection (fully indexed, fast dashboard queries)
```

**Dashboard query safety rule: NEVER fetch more than 10,000 documents in a single aggregation pipeline without downsampling.** Use the `$bucket` aggregation stage to reduce to ≤500 data points before returning to the frontend.

### Railway Hosting Cost

| Service | Plan | Cost/month |
|---|---|---|
| Backend (Node.js) | Railway Hobby → Pro | $5 → $20 |
| Static dashboard (Angular) | Cloudflare Pages | Free |
| MongoDB Atlas | M10 → M20 | $57 → $144 |
| Cloudflare R2 | 10 GB/month | ~$1.50 |
| Resend (email) | Starter | $0 (100 emails/day free) |
| Sentry (error tracking) | Developer | Free |
| **Total Month 1–4** | | **~$83/month** |
| **Total Month 5+ (production)** | | **~$166/month** |

---

## 9. Backend Cron Jobs & Background Tasks

All cron jobs are registered in `src/cron/index.ts` using the `node-cron` package. Every job emits structured Pino log entries (`{ job, status, durationMs, affectedCount }`) on start, success, and failure. Failed jobs emit to Sentry. Jobs are idempotent — re-running them for the same date must produce the same result (upsert, not insert).

```
npm install node-cron @types/node-cron
```

| Job | Schedule | Purpose |
|---|---|---|
| `dailyMetSummaryJob` | `5 0 * * *` (00:05 daily) | Compute `metDailySummaries` for all active MET-LINK devices for yesterday |
| `dailyNepSummaryJob` | `10 0 * * *` (00:10 daily) | Compute `nepDailySummaries` for all active NEP-LINK devices for yesterday |
| `deviceOnlineCheckerJob` | `*/5 * * * *` (every 5 min) | Mark devices offline if `lastSeenAt < now − 5min` |
| `tokenCleanerJob` | `0 2 * * *` (02:00 daily) | Hard-delete expired `refreshTokens` + expired `notificationTokens` |
| `downsamplerJob` | `0 3 * * 0` (03:00 Sunday) | Downsample raw measures older than 90 days into 1-min averages |
| `shareTokenUsageJob` | `0 * * * *` (hourly) | Flush Redis `viewCount` increments → `shareTokens.viewCount` in MongoDB |
| `deviceFirmwareAuditJob` | `15 2 * * *` (02:15 daily) | Detect stale firmware versions across active devices and write audit summaries for admin review |
| `importJobCleaner` | `30 2 * * *` (02:30 daily) | Remove stale failed import jobs and purge temporary upload artifacts |

### Job Details

#### `dailyMetSummaryJob` — 00:05 daily

Iterates over all `devices` with `type = 'MET'` that have at least one record in the last 48 hours. For each device, runs a MongoDB aggregation pipeline on `metMeasures` for the previous calendar day (in the org's configured timezone). Upserts into `metDailySummaries`.

**Pipeline stages:**
1. `$match`: `{ deviceId, createdAt: { $gte: dayStart, $lt: dayEnd }, isDemoMode: false }`
2. `$group`: compute `{ avg, max, min, count }` for all numeric fields
3. `$addFields`: compute `pressureTendency` from first/last 3-hour pressure readings, `beaufortDistribution` by classifying each `windSpeedMs` into Bft force, `solarDailyKwhM2` = sum(solarWm2) × (1 / sampleRate) / 1000, `completenessPercent`
4. `$merge` into `metDailySummaries` with `whenMatched: 'replace'`

Expected runtime per device: 200–800ms for a full 24h of 1-second samples (~86k docs).

#### `dailyNepSummaryJob` — 00:10 daily

Same pattern as `dailyMetSummaryJob` but queries `nepSamples` for `type = 'NEP'` devices. Counts R1/R2/R3 samples using `$cond` in `$group`. Computes `drinkingCompliant` (avg NTU < 1) and `recreationalSafe` (avg NTU < 10). Upserts into `nepDailySummaries`.

#### `deviceOnlineCheckerJob` — every 5 minutes

```typescript
// Pseudocode
const cutoff = new Date(Date.now() - 5 * 60 * 1000);
await Device.updateMany(
  { lastSeenAt: { $lt: cutoff }, isOnline: true },
  { $set: { isOnline: false } }
);
```

The complementary online-setter is in the `PATCH /sync/device-status` route handler (Section 3.7) — not a cron job.

#### `tokenCleanerJob` — 02:00 daily

```typescript
await RefreshToken.deleteMany({ expiresAt: { $lt: new Date() } });
await NotificationToken.deleteMany({ expiresAt: { $lt: new Date() } });
```

Keeps both collections lean. Ensures expired tokens cannot be replayed even if the TTL index hasn't fired yet.

#### `downsamplerJob` — 03:00 every Sunday

For `metMeasures` documents older than 90 days:
1. Group into 1-minute buckets using `$dateTrunc`
2. Compute avg of every numeric field per bucket
3. Insert into `metMeasuresDownsampled` collection (no per-field indexes — cheaper storage)
4. Delete the raw documents

Same for `nepSamples` → `nepSamplesDownsampled`.

**Retention policy result:**
- 0–90 days: raw 1-second data in fully-indexed `metMeasures` / `nepSamples`
- 90 days–2 years: 1-minute averages in downsampled collections
- >2 years: TTL auto-purges downsampled collections

> Run this job during low-traffic hours only (Sunday 03:00). Set `DOWNSAMPLER_ENABLED=false` env var to disable in dev/staging.

#### `shareTokenUsageJob` — hourly

When a public share link is viewed, the backend increments a Redis counter (`share:{tokenId}:views`) instead of writing to MongoDB on every request (avoids high-concurrency write contention). This cron job flushes the Redis counters to `shareTokens.viewCount` once per hour using `$inc`.

```typescript
const keys = await redis.keys('share:*:views');
for (const key of keys) {
  const count = await redis.getdel(key);
  const tokenId = key.split(':')[1];
  await ShareToken.updateOne({ _id: tokenId }, { $inc: { viewCount: Number(count) } });
}
```

### Cron Registration (`src/cron/index.ts`)

```typescript
import cron from 'node-cron';
import { dailyMetSummaryJob } from './dailyMetSummaryJob';
import { dailyNepSummaryJob } from './dailyNepSummaryJob';
import { deviceOnlineCheckerJob } from './deviceOnlineCheckerJob';
import { tokenCleanerJob } from './tokenCleanerJob';
import { downsamplerJob } from './downsamplerJob';
import { shareTokenUsageJob } from './shareTokenUsageJob';
import { deviceFirmwareAuditJob } from './deviceFirmwareAuditJob';
import { importJobCleaner } from './importJobCleaner';

export function registerCronJobs() {
  cron.schedule('5 0 * * *',   dailyMetSummaryJob,      { timezone: 'UTC' });
  cron.schedule('10 0 * * *',  dailyNepSummaryJob,       { timezone: 'UTC' });
  cron.schedule('*/5 * * * *', deviceOnlineCheckerJob,   { timezone: 'UTC' });
  cron.schedule('0 2 * * *',   tokenCleanerJob,          { timezone: 'UTC' });
  cron.schedule('0 3 * * 0',   downsamplerJob,           { timezone: 'UTC' });
  cron.schedule('0 * * * *',   shareTokenUsageJob,       { timezone: 'UTC' });
  cron.schedule('15 2 * * *',  deviceFirmwareAuditJob,   { timezone: 'UTC' });
  cron.schedule('30 2 * * *',  importJobCleaner,         { timezone: 'UTC' });
}
```

Call `registerCronJobs()` from `app.ts` after the MongoDB connection is established.

---

*End of Document — Veldora Studio | Observator Instruments | May 2026*
*Last updated: May 12, 2026 — Version 5.1 (deep analysis pass #6 — batteryVoltageV added for Smithtek "BATTERY VOLTS", passwordResetTokens and firmwareHistory collections added, NEP turbidity-temperature correlation + session event analytics added, CSV import/backfill APIs added, firmware/admin health APIs added, dashboard widget parity expanded, cron jobs updated for firmware/import maintenance, and MET/NEP timeline aligned to graphical backend analytics)*
