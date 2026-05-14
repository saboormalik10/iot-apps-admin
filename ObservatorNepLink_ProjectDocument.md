# Observator / NEP-LINK & MET-LINK — Complete Project Document
**Prepared by:** Hassan Ali (Developer)
**Date:** May 2026
**Purpose:** Full technical reference for backend developer onboarding, client handover, and internal roadmap planning.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context](#2-business-context)
3. [Hardware Overview](#3-hardware-overview)
4. [Product 1 — MET-LINK App (Ionic / Angular)](#4-product-1--met-link-app-ionic--angular)
5. [Product 2 — NEP-LINK App (React Native)](#5-product-2--nep-link-app-react-native)
6. [Migration: Legacy RN → Latest RN](#6-migration-legacy-rn--latest-rn)
7. [Shared BLE Architecture](#7-shared-ble-architecture)
8. [Data Flow — End to End](#8-data-flow--end-to-end)
9. [Database & Storage Architecture](#9-database--storage-architecture)
10. [Feature Inventory — Both Apps](#10-feature-inventory--both-apps)
11. [Known Bugs & Code Issues (Flagged)](#11-known-bugs--code-issues-flagged)
12. [Backend Developer Specification](#12-backend-developer-specification)
13. [What Is Missing / Not Yet Built](#13-what-is-missing--not-yet-built)
14. [Roadmap & Prioritization](#14-roadmap--prioritization)
15. [Environment & Build Setup](#15-environment--build-setup)
16. [File & Folder Structure Reference](#16-file--folder-structure-reference)

---

## 1. Executive Summary

This project consists of two distinct mobile applications built for the same hardware client (Observator / NEP):

| App | Hardware Product | Tech Stack | Status |
|---|---|---|---|
| MET-LINK | Weather Station (MET-LINK device) | Ionic 8 + Angular 19 + Capacitor 7 | Active development |
| NEP-LINK | Water Quality Sensor (NEP-LINK device) | React Native 0.81.4 + Redux + SQLite | Major overhaul complete (latest pulled) |

Both apps communicate with physical hardware devices over BLE (Bluetooth Low Energy). They are fully offline-first, native apps for iOS and Android. There is currently no backend server. All data is stored locally on the phone.

The client's hardware company (Observator / NEP) manufactures:
- MET-LINK: a meteorological weather station (wind, temperature, humidity, pressure, GPS)
- NEP-LINK: a water turbidity / quality sensor (turbidity in NTU, water temperature)

Both devices transmit data to the phone via BLE using the same BLE service UUIDs but different data formats.

---

## 2. Business Context

- The client is Observator (referred to internally as "NEP" based on device naming convention NEP-LINK)
- Two hardware products, two mobile companion apps
- The mobile apps are the only interface the end user (field operators, scientists, hydrologists, meteorologists) has to interact with the hardware
- No cloud backend currently exists — this is a pure device-to-phone BLE architecture
- The client has requested (or the roadmap includes) cloud sync, data export, and potentially a web dashboard — this defines the backend developer's scope
- Target platforms: iOS and Android
- The apps must support demo mode (no hardware needed) for sales demonstrations and testing

---

## 3. Hardware Overview

### BLE Device Identification

Both hardware products are identified by BLE device name prefix:

| Device | Name Prefix | Regex |
|---|---|---|
| MET-LINK | `MET-LINK` | `startsWith('met-link')` (case-insensitive) |
| NEP-LINK | `NEP-LINK` | `/NEP-LINK/i` |

### Shared BLE Service UUIDs

Both products use identical BLE service/characteristic UUIDs:

| Role | UUID |
|---|---|
| Sensor Data Service | `c25d444c-2836-4cc0-8f2f-95f4c8fd7f8b` |
| Sensor Data Characteristic | `9915b449-2b52-429b-bfd0-ab634002404d` |
| Metadata (Battery) Service | `86a324aa-4b2f-46c7-b4d8-949cae59e6d7` |
| Metadata Characteristic | `266b64b4-19ee-4941-8253-650b4d7ab197` |

### Data Protocols per Device

**MET-LINK** transmits NMEA 0183 sentences:
- `$IIMWV,...` — Wind speed & direction (relative and true)
- `$IIXDR,...` — Temperature, humidity, pressure, precipitation, solar
- `$GPGGA,...` — GPS position
- `~,stats,...` — Battery status (legacy format: `~,<type>,<percentage>,<isCharging>`)
- Metadata JSON (new format): `{"isCharging": 1, "percentage": 85, "serialNo": "...", "firmwareVersion": "..."}`

**NEP-LINK** transmits custom proprietary format:
- Probe data: `R1,<turbidity>,<temperature>` or `R2,...` or `R3,...`
  - R1 = Low range probe setting
  - R2 = Medium range probe setting
  - R3 = High range probe setting
  - Turbidity in NTU (e.g., `245.67`)
  - Temperature in °C (optional, `0.0` = not available)
- Stats: `~,stats,<batteryPercent>,<isCharging>` (0 or 1)
- Battery metadata JSON: `{"percentage": 85, "rawVoltage": 3750, "isCharging": 0}`

### BLE Connection Parameters

Both apps request:
- MTU: 200 bytes
- Connection Priority: HIGH (for ~15ms intervals vs default 25–50ms)
- BLE Library: `react-native-ble-plx` (RN) / `@capacitor-community/bluetooth-le` (Ionic)

---

## 4. Product 1 — MET-LINK App (Ionic / Angular)

### Location
`~/Desktop/working/ionic/met-link-mob/`

### Tech Stack

| Item | Version |
|---|---|
| Ionic | 8.x |
| Angular | 19.x |
| Capacitor | 7.x |
| TypeScript | ~5.6.3 |
| BLE Library | `@capacitor-community/bluetooth-le` v7.1.1 |
| SQLite | `@capacitor-community/sqlite` v7.0.0 |
| Charts | `chart.js` v4.4.8 |
| Date Handling | `moment` v2.30.1 |
| UI Components | Ionic standalone components |

### Architecture

The app follows a layered service + page architecture:

```
App
├── Services (singleton, Angular DI)
│   ├── BluetoothService   — BLE scan, connect, data parsing, demo mode, logging
│   ├── SqliteService      — All SQLite operations (record, measure, picture tables)
│   ├── ExportService      — CSV/data export
│   └── GlobalService      — Theme, navigation helpers
├── Pages (standalone Angular components, lazy-loaded)
│   ├── /devices           — BLE device scanner, connect/disconnect
│   ├── /live-data         — Parent shell with tab navigation
│   │   ├── /dashboard     — Wind rose / line graph + customizable 8-tile layout
│   │   ├── /all-data      — All parsed NMEA sensor values list
│   │   ├── /location      — GPS map view
│   │   └── /logging       — Start/stop logging, recording timer
│   ├── /configuration     — Demo mode, calculations (QNH/QFE, dew point), theme
│   ├── /change-units      — Unit conversion preferences
│   ├── /view-record       — Browse saved logging records
│   ├── /details-log       — Detail view of a single log record
│   ├── /details-pictures  — Photos attached to a log record
│   ├── /dir-browser       — File system directory browser
│   ├── /terminal          — Raw NMEA terminal output
│   └── /about             — App info
├── Components (reusable modals)
│   ├── ConfigrationModal  — Device configuration settings
│   ├── DemoToggle         — Demo mode toggle component
│   ├── LayoutModal        — Dashboard tile data selector
│   ├── TerminalModal      — Terminal in-modal view
│   └── WindRoseSettings   — Wind rose configuration (period, unit, orientation)
├── Pipes
│   ├── DataFilter         — Filters sensor data items
│   ├── Directories        — Formats directory listings
│   ├── GraphData          — Prepares data for chart
│   └── GroupBy            — Groups data items by NMEA type
└── Interfaces
    └── ColorScheme        — Wind rose color scheme type definition
```

### Key Service: BluetoothService (`bluedata.service.ts`)

This is the core of the app. It is a singleton Angular service responsible for:

**BLE Operations:**
- `initializeBle()` — Initializes BLE client (platform-aware: Android vs iOS)
- `startDeviceScan()` — Scans for MET-LINK devices, filters by name prefix
- `stopDeviceScan()` — Stops scanning, returns found devices array
- `connect(device, maxRetries=3)` — Connects with automatic retry (1.5s apart), registers disconnect handler, navigates to dashboard on success
- `disconnect()` — Stops notifications, disconnects, clears state
- `setupBleDataSubscription()` — Subscribes to both BLE characteristics after connect

**Data Parsing:**
- `processIncomingData(data)` — Buffers raw BLE data, splits on `\n`, dispatches complete lines
- `handleBluetoothData(data)` — Routes to NMEA parser or stats parser
- `handleNMEA(data)` — Validates NMEA checksum, routes to MWV/XDR/GGA handlers
- `NmeaMWV(fields)` — Wind speed/direction, stores 10-min rolling buffer (600 samples)
- `NmeaXDR(fields)` — Temperature, humidity, pressure, precipitation, solar, voltage, current
- `NmeaGGA(fields)` — GPS position, altitude, satellite count, etc.
- `handleStats(data)` — Legacy battery format parser
- `processMetaData(data)` — JSON metadata parser (battery, serial, firmware)
- `isNmeaValid(data)` — XOR checksum validation

**Calculations:**
- `handleQq(press)` — Calculates QFE and QNH from measured pressure + configured station height
- `handleDewPoint()` — Calculates dew point from temperature and relative humidity
- `storeWindPeriod(value, desc)` — Maintains 600-sample rolling arrays for 2-min and 10-min wind averages

**Logging:**
- `startLogging()` — Creates SQLite record, sets loggingActive flag
- `stopLogging()` — Updates record end time, returns whether picture was already taken
- `logData()` — Called every second during logging; writes header + data sentences to `measure` table
- `startRecordingTimer()` — 1-second interval that triggers logData()

**Demo Mode:**
- `startDemo()` — Generates realistic NMEA sentences at 1-second intervals (MWV + XDR + GGA)
- `stopDemo()` — Stops demo timer, clears state
- `toggleDemoMode()` — Toggle with toast notification and persistence

**Settings:**
- Unit preferences: `applyUnitPreferences(unitMap)` — Persists selected unit per category
- Color theme: 3 options (black/obsblack, grey/obsgrey, blue/primary)
- QNH/QFE heights, dew point toggle, wind rose settings, graph item selection

### Key Service: SqliteService (`sqlite.service.ts`)

Database: `db.storage`, version 1, unencrypted.

**Schema:**

```sql
CREATE TABLE record (
  id_record   INTEGER PRIMARY KEY AUTOINCREMENT,
  dateStart   TEXT,       -- human-readable datetime string
  dateEnd     TEXT,       -- updated on stopLogging
  comments    TEXT,
  url_maps    TEXT,       -- currently 'maps' placeholder
  deviceName  TEXT        -- 'MET-LINK' or 'DEMO'
);

CREATE TABLE measure (
  id_measure    INTEGER PRIMARY KEY AUTOINCREMENT,
  dataSentence  TEXT,     -- CSV row of data values OR header row
  timeStamp     TEXT,     -- human-readable timestamp
  id_record     INTEGER   -- FK to record
);

CREATE TABLE picture (
  id_picture    INTEGER PRIMARY KEY AUTOINCREMENT,
  data_picture  TEXT,     -- base64 encoded JPEG
  id_record     INTEGER   -- FK to record
);
```

**Key operations:**
- `insertRecord(dateStart, url_maps, deviceName)` — Creates logging session
- `insertMeasure(dataSentence, timeStamp, id_record)` — Writes data row (called every second)
- `insertPicture(base64Image, idRecord)` — Stores photo
- `updateDateEnd(idRecord, dateEnd)` — Closes logging session
- `selectAllRecord()` — Returns all logging sessions (newest first)
- `selectMeasure(id_record)` — Returns all measurement rows for a session
- `deleteRecord(id_record)` — Deletes session + all measures + all pictures

### Dashboard: Wind Rose & Graph (`dashboard.page.ts`)

The dashboard is the primary live view. It features:

**Customizable 8-tile layout:**
- Each tile can be configured to display any sensor value
- Tile configuration stored in Capacitor Preferences as `layout0`–`layout7`
- Tap a tile → LayoutModal → select any available sensor value

**Wind Rose (Canvas-rendered):**
- Drawn on an HTML `<canvas>` element at 500ms intervals
- Supports True or Relative wind orientation
- Wind period modes: Instant, 2-minute average, 10-minute average
- Wind speed units: m/s, km/h, knots
- Color schemes: 3 themes (black, grey, blue)
- Animated direction indicator (laser beam arc)
- North/South/East/West labels, degree markings

**Line Graph (Chart.js):**
- Selectable data source (any sensor item)
- Rolling 20-point window
- Responsive, theme-aware colors
- Switches with wind rose via preference

### Configuration Features

| Feature | Storage | Description |
|---|---|---|
| Demo mode | Preferences (`demoMode`) | Generates fake sensor data |
| Theme | Preferences (`color`) | 0=black, 1=grey, 2=blue |
| Wind rose period | Preferences (`windRosePeriod`) | 0=instant, 1=2min, 2=10min |
| Wind rose orientation | Preferences (`windRoseOrient`) | true/relative |
| Wind rose unit | Preferences (`windRoseUnit`) | 0=m/s, 1=km/h, 2=knots |
| QNH/QFE enabled | Preferences (`QqEnabled`) | Pressure correction toggle |
| QFE height | Preferences (`QfeHeight`) | Height above sea level (m) |
| QNH height | Preferences (`QnhHeight`) | Station height for QNH calc |
| Dew point | Preferences (`DpEnabled`) | Dew point calculation toggle |
| Unit map | Preferences (`activeUnitMap`) | JSON map of unit overrides |
| Graph item | Preferences (`graphItem`) | Selected graph data index |
| Dashboard layout | Preferences (`layout0-7`) | JSON per tile |
| Device object | Preferences (`DeviceObj`) | Last connected BLE device |
| BLE serial/firmware | Preferences (`bleModuleSerialNo`, `bleModuleFirmwareVersion`) | Device metadata |

---

## 5. Product 2 — NEP-LINK App (React Native)

### Locations

| Version | Path | RN Version | React Version | Status |
|---|---|---|---|---|
| Latest (active) | `~/Desktop/working/reactNative/observator-nep-link-ble/` | 0.81.4 | 19.1.0 | Current — fully overhauled |
| Intermediate migration | `~/Desktop/working/reactNative/ObservatorNepLinkBLE/` | 0.80.0 | 19.1.0 | Archived — superseded |

> **Important:** The `observator-nep-link-ble` folder has been completely overhauled (latest pull). It is no longer the legacy codebase. It is now the active development version with SQLite, TypeScript, hooks, and the new `features/` folder structure. The `ObservatorNepLinkBLE` folder is an intermediate migration step and is no longer the active target.

### Tech Stack (Latest — `observator-nep-link-ble`)

| Item | Version |
|---|---|
| React Native | 0.81.4 |
| React | 19.1.0 |
| Redux | 5.x + Thunk + Promise Middleware + Logger |
| `@reduxjs/toolkit` | ^2.9.0 (installed, not yet used — store still uses `createStore`) |
| Navigation | `@react-navigation/native` v7 + `native-stack` v7 + `bottom-tabs` v7 |
| BLE | `react-native-ble-plx` v3.5.0 |
| SQLite | `react-native-sqlite-storage` v6.0.1 |
| AsyncStorage | `@react-native-async-storage/async-storage` (still present for migration support) |
| File System | `react-native-fs` v2.20.0 |
| Maps | `react-native-maps` v1.18.0 |
| Charts | `react-native-gifted-charts` v1.4.36 |
| Camera | `react-native-image-picker` v7.1.2 |
| Map Capture | `react-native-view-shot` v3.8.0 |
| Share/Export | `react-native-share` v11.0.4 |
| File Export | `rn-fetch-blob` v0.12.0 |
| UUID | `react-native-uuid` v2.0.3 |
| Date | `luxon` v3.5.0 |
| UI | `@rneui/base` + `@rneui/themed` + `react-native-paper` |
| Icons | `@react-native-vector-icons/ionicons` v12.3.0 |
| Splash Screen | `react-native-bootsplash` v6.3.11 |
| Native Patches | `patch-package` v8.0.1 |
| Node requirement | >=20 |

### Architecture

Follows a feature-based structure with functional React components, hooks, and Redux:

```
App.tsx
├── Redux Store (src/store/index.ts)
│   ├── devicesSlice (plain reducer, not RTK)
│   ├── sensorDataSlice (plain reducer)
│   ├── loggingSlice (plain reducer)
│   └── demoSlice (plain reducer)
├── NavContainer (src/navigation/RootNav.tsx)
│   └── Bottom Tabs (Devices | Sessions | About)
│       ├── DevicesStack
│       │   ├── DevicesList  — BLE scan, permissions, device list
│       │   └── DeviceView   — Live data, logging control, camera
│       ├── LoggingStack
│       │   ├── LoggingSessions — Session list
│       │   ├── LoggingSessionView — Session detail (chart, averages, images, export)
│       │   └── ImageCarousel — Full-screen modal image viewer
│       └── AboutStack
│           └── AboutScreen
├── src/features/
│   ├── Devices/
│   │   ├── index.tsx              ← CORE: BLE scan, permissions, connect
│   │   ├── DeviceView.tsx         ← CORE: live data, logging control
│   │   ├── HeaderRightCameraButton.tsx — Camera button in nav header
│   │   ├── LocationMap.android.tsx — Android-specific map
│   │   ├── LocationMap.ios.tsx     — iOS-specific map
│   │   ├── NepLinkHeader.tsx       — Branded header
│   │   ├── DevicesList.tsx         — Discovered NEP-LINK devices list
│   │   ├── DevicesListButtons.tsx  — Demo mode button
│   │   ├── BluetoothDisabledError.tsx — BT unavailable state
│   │   └── DeviceConnectingDialog.tsx — Connecting in-progress dialog
│   ├── LoggingSessions/
│   │   ├── index.tsx              — Sessions list screen
│   │   ├── LoggingSessionView.tsx ← CORE: session detail, export, delete
│   │   ├── ImageCarousel.tsx      — Full-screen image viewer
│   │   ├── ActionsMenu.tsx        — Export / Delete actions menu
│   │   ├── DataAverages.tsx       — Turbidity + temperature averages + chart toggle
│   │   ├── SessionLineChart.tsx   — Turbidity or temperature line chart
│   │   ├── Comment.tsx            — Comment display with edit icon
│   │   ├── LoggingSessionCommentDialog.tsx — Comment edit dialog
│   │   └── WaitingDialog.tsx      — Loading overlay dialog
│   └── About/
│       └── index.tsx              — App info screen
├── src/actions/
│   ├── DeviceActions.ts    ← CORE: device state + SQLite `knownDevices`
│   ├── SensorDataActions.ts — Sensor value updates
│   ├── LoggingActions.ts   ← CORE: session CRUD + SQLite + RNFS
│   └── DemoActions.ts      — Demo mode toggle
├── src/store/
│   ├── index.ts             — createStore + combineReducers
│   ├── devicesSlice.ts      — Device connection state
│   ├── sensorDataSlice.ts   — Live sensor values
│   ├── loggingSlice.ts      — Session and samples state
│   └── demoSlice.ts         — Demo mode flag
├── src/services/
│   └── BleService.ts        ← CORE: BLE scan, connect, monitor (TypeScript, renamed from BluetoothService.js)
└── src/utils/
    ├── db.js                — SQLite connection + table creation
    └── migration.js         — AsyncStorage → SQLite one-time migration utility
```

### Redux State Shape (Latest)

```typescript
{
  demo: {
    demoModeEnabled: false
  },
  devices: {
    wiping: false,                   // true during ~10s post-connect data flush
    sensorDataReceived: false,
    sensorError: false,
    bleDevicesFoundRaw: [],          // renamed from bondedDevicesRaw
    bleDevicesFoundFormatted: [],    // renamed from bondedDevicesFormatted
    connectedDevice: null,
    status: 'disconnected'           // 'connecting' | 'connected' | 'disconnecting' | 'disconnected'
  },
  sensorData: {
    probeSetting: null,              // 'R1' | 'R2' | 'R3'
    rangeLabel: null,                // 'Low range' | 'Medium range' | 'High range'
    turbidityEnabled: false,
    temperatureEnabled: false,
    turbidityValue: null,            // float (NTU)
    temperatureValue: null,          // float (°C)
    sampleDateObj: null,             // Luxon DateTime object of last sample
    locationEnabled: true,
    locationLat: null,
    locationLng: null,
    batteryLevel: null,              // integer 0-100
    batteryRawVoltage: null,         // integer (mV)
    batteryCharging: null            // boolean
  },
  logging: {
    isLogging: false,
    loggingSessionId: null,          // UUID v4
    loggingSession: null,            // full session object from SQLite
    loggingSessions: [],             // all sessions list (from SQLite)
    loggingSessionSamplesLoaded: false,
    loggingSessionSamples: [],       // in-memory array (WARNING: has bug — always only 1 item, see Section 11)
    loggingSessionSampleCount: 0     // NEW: sample counter (increments correctly)
  }
}
```

### Key Service: BleService.ts (Singleton Instance)

Renamed from `BluetoothService.js`, now full TypeScript. Key methods:

- `init()` — Creates BleManager, ensures clean state
- `isBluetoothEnabled()` — Returns promise resolving to boolean BT state
- `onStateChange(callback)` — Subscribes to BT on/off state changes, returns subscription
- `startScan(onScanStop, onDevicesFound)` — Scans for NEP-LINK devices by name regex, calls `onDevicesFound` with updated device list. Devices expire after 5s if not re-seen. Scan stops itself after 15s.
- `stopScan()` — Stops scan, removes subscription
- `connectAndListen(device, onConnected, onSensorData, onBatteryData, onDisconnected)` — Connects, requests MTU 200, requests HIGH priority, monitors both characteristics
- `disconnectConnectedDevice()` — Cancels all connections

**Sensor data parsing (in `Devices/index.tsx`):**
- Regex: `/(R\d),(\d+\.\d+),?(\d+\.\d+)?/` → probeSetting, turbidityValue, temperatureValue
- Regex: `/~,stats,(\d+),(\d)/` → batteryLevel, batteryCharging
- Battery characteristic: base64 → JSON `{ percentage, rawVoltage, isCharging }`

### SQLite Schema

Database file: `NEPLinkDB.db`

```sql
CREATE TABLE IF NOT EXISTS loggingSessions (
  id              TEXT PRIMARY KEY,
  deviceId        TEXT,
  deviceName      TEXT,
  timestamp       INTEGER,
  timezoneName    TEXT,
  timezoneOffset  INTEGER,
  turbidityEnabled INTEGER,   -- 0 or 1
  temperatureEnabled INTEGER, -- 0 or 1
  comment         TEXT
);

CREATE TABLE IF NOT EXISTS loggingSessionSamples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId       TEXT,
  timestamp       INTEGER,
  turbidityValue  REAL,
  temperatureValue REAL,
  locationLat     REAL,
  locationLng     REAL,
  batteryLevel    INTEGER,
  batteryRawVoltage REAL
);

CREATE TABLE IF NOT EXISTS knownDevices (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  address         TEXT,
  customName      TEXT
);
```

### Logging Data Pipeline

1. User taps "Start Logging" → `startLoggingHandler()` in `DeviceView.tsx`
2. UUID generated via `react-native-uuid` → `startLogging(uuid, deviceId, deviceName, timezone, ...)` dispatched
3. Session written directly to SQLite `loggingSessions` table
4. Map screenshot captured via `react-native-view-shot` → saved to RNFS (deletes old map image first)
5. Every sensor data callback → if `logging.isLogging` → `addDataToLoggingSession(id, dataObj)` dispatched → sample written to SQLite `loggingSessionSamples` AND Redux state (note: Redux array has bug — see Section 11)
6. User taps "Stop Logging" → `stopLogging()` dispatched → photo dialog shown
7. Optional: user takes photo via `HeaderRightCameraButton` (accessible during logging) → saved to RNFS
8. User ends → session available in LoggingSessions list (loaded from SQLite)

### Per-Sample Data Object (written to SQLite `loggingSessionSamples`)

```javascript
{
  sessionId: "uuid-v4",
  timestamp: 1234567890000,    // milliseconds epoch, timezone-adjusted
  turbidityValue: 245.67,      // NTU, float (null if not available)
  temperatureValue: 18.3,      // °C, float (null if not available)
  locationLat: 51.5074,        // null if GPS unavailable
  locationLng: -0.1278,        // null if GPS unavailable
  batteryLevel: 85,            // %
  batteryRawVoltage: 3750      // mV
}
```

### Session Metadata Object (in SQLite `loggingSessions`)

```javascript
{
  id: "uuid-v4",
  deviceId: "BLE-MAC-or-ID",
  deviceName: "NEP-LINK-001",
  timestamp: 1234567890000,     // session start epoch
  timezoneName: "Europe/Amsterdam",
  timezoneOffset: 2,            // hours offset (stored as INTEGER)
  turbidityEnabled: 1,          // SQLite integer boolean (0/1)
  temperatureEnabled: 1,
  comment: "Field notes here..."
}
```

### CSV Export Format

```
Date,Time,Lat,Lon,Turbidity,Temperature,,Comment,Battery Level
Europe/Amsterdam,,,,NTU,°C,,,,%
01 May 2026,14:32:01,51.5074,-0.1278,245.67,18.3,,Field notes,85
...
```

**Note:** iOS timestamps are adjusted for timezone offset in the CSV export. Android timestamps are stored in UTC already.

**Attachments included in export:**
- CSV data file (`NEP-Link-data-DD-MMM-YYYY-HHmmss.csv`)
- Map screenshot JPG (captured when session started, from `mapimage/` dir)
- Any photos taken during the session (from `images/` dir)
- All files read via `RNFetchBlob` as base64 before passing to native Share sheet

### File System Layout (RNFS.DocumentDirectoryPath)

```
DocumentDirectory/
├── loggingSessionFiles/
│   └── {loggingSessionId}/
│       ├── mapimage/
│       │   └── NEP-Link-map-DD-MMM-YYYY_HHmmss.jpg   ← deleted + recreated on each session start
│       ├── images/
│       │   └── NEP-Link-image-DD-MMM-YYYY_HHmmss-N.jpg  ← N = sequential index
│       └── csv/
│           └── NEP-Link-data-DD-MMM-YYYY-HHmmss.csv   ← generated on export
└── loggingSessionThumnails/
    └── {loggingSessionId}.jpg                          ← deleted when session deleted
```

### AsyncStorage Keys (Legacy — used only for migration)

| Key | Contents |
|---|---|
| `migrationCompleted` | `'true'` when migration to SQLite is complete |
| `knownDevices` | Legacy JSON array (migrated to SQLite `knownDevices` table) |
| `loggingSessions` | Legacy JSON array of session metadata (migrated to SQLite) |
| `loggingSessionsData_{uuid}` | Legacy JSON array of samples (migrated to SQLite) |

> **WARNING:** The migration utility (`src/utils/migration.js`) is imported in `App.tsx` but NOT called in `initializeApp()`. Any user upgrading from the old version will lose their existing session history unless this is fixed before release.

---

## 6. Migration: Legacy → Overhauled Codebase

The NEP-LINK app (`observator-nep-link-ble`) has been completely overhauled — not just a version bump. This is a full architectural rewrite of the source code delivered in the latest git pull.

### Version Progression

| | Legacy (original) | Intermediate | Latest (current) |
|---|---|---|---|
| Path | `observator-nep-link-ble/` | `ObservatorNepLinkBLE/` | `observator-nep-link-ble/` (re-used path) |
| React Native | 0.75.3 | 0.80.0 | **0.81.4** |
| React | 18.3.1 | 19.1.0 | 19.1.0 |
| Source structure | `containers/` + `components/` + `.jsx` | same | **`features/` + `.tsx`** |
| Storage | AsyncStorage | AsyncStorage | **SQLite** |
| Components | Class-based | Partially hooks | **All hooks** |
| TypeScript | No | Partial | **Full** |
| Navigation | Custom tab system | React Navigation v6 | **React Navigation v7** |

### Key Architectural Changes (Legacy → Latest)

| Area | Legacy | Latest |
|---|---|---|
| Component style | Class components | Functional + hooks |
| Storage | AsyncStorage (JSON blobs) | SQLite via `react-native-sqlite-storage` |
| Device persistence | AsyncStorage `knownDevices` | SQLite `knownDevices` table |
| Session persistence | AsyncStorage `loggingSessions` + `loggingSessionsData_*` | SQLite `loggingSessions` + `loggingSessionSamples` tables |
| Folder structure | `src/containers/` + `src/components/` | `src/features/` (collocated) |
| BLE Service | `BluetoothService.js` (class) | `BleService.ts` (TypeScript singleton) |
| Actions | `.jsx` files | `.ts` files with typed discriminated unions |
| Reducers | `.jsx` files | `.ts` files with TypeScript interfaces |
| Navigation | Custom | React Navigation v7 typed bottom tabs + native stacks |
| Image viewer | Inline in session view | Dedicated `ImageCarousel` screen (modal, fade animation) |
| Camera during logging | Post-session only | Available during logging via `HeaderRightCameraButton` |
| Map | Single `LocationMap.jsx` | Platform-split: `LocationMap.android.tsx` + `LocationMap.ios.tsx` |
| UUID | `uuid` package | `react-native-uuid` |
| Splash screen | `react-native-splash-screen` | `react-native-bootsplash` v6 |
| State refs pattern | Not used (stale closures) | `stateRef`/`loggingRef`/`sensorDataRef`/`devicesRef` pattern |

### New Packages in Latest Version

- `react-native-sqlite-storage` — SQLite database
- `react-native-bootsplash` — Splash screen (hides after DB init)
- `react-native-uuid` — UUID generation for session IDs
- `@react-native-vector-icons/ionicons` — Ionicons (replaces generic vector-icons)
- `@reduxjs/toolkit` — Installed but not yet used (store still uses legacy `createStore`)
- `patch-package` — Native module patches (must run `yarn postinstall` after install)

### Data Migration Path (AsyncStorage → SQLite)

The migration utility at `src/utils/migration.js` handles one-time data transfer:

1. Checks AsyncStorage for `migrationCompleted === 'true'`
2. If not done: reads `loggingSessions` array from AsyncStorage
3. For each session: `INSERT OR IGNORE INTO loggingSessions`
4. For each session: reads `loggingSessionsData_{id}` from AsyncStorage
5. For each sample: `INSERT OR IGNORE INTO loggingSessionSamples`
6. Sets `migrationCompleted = 'true'` in AsyncStorage when done

**Critical gap:** This migration function is defined and imported in `App.tsx` but never called in `initializeApp()`. It must be wired up before releasing to any existing users. Call `migrateAsyncStorageToSQLite()` as the first step in `initializeApp()`.

### What Still Needs Verification

- `patch-package` patches applied correctly after fresh `npm install`
- iOS CocoaPods setup for RN 0.81.4 (run `pod install` in `ios/`)
- Android Gradle compatibility with RN 0.81.4
- `react-native-bootsplash` splash assets configured correctly
- Platform-specific map rendering (`LocationMap.android.tsx` vs `.ios.tsx`)

---

## 7. Shared BLE Architecture

Both apps share these BLE concepts:

### Connection Flow

```
App Start
    │
    ├── Request Permissions (Android: BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION)
    │   (iOS: handled via Info.plist entries)
    │
    ├── Initialize BLE Manager / Client
    │
    ├── Start BLE Scan (LowLatency mode)
    │   │
    │   └── Filter devices by name regex (MET-LINK or NEP-LINK)
    │
    ├── User selects device from list
    │
    ├── Stop Scan
    │
    ├── Connect to Device
    │   ├── Request MTU 200
    │   ├── Request Connection Priority: HIGH
    │   └── Discover All Services and Characteristics
    │
    ├── Monitor Sensor Data Characteristic → onSensorDataReceived
    └── Monitor Battery Characteristic → onBatteryDataReceived
```

### Disconnect Handling

Both apps handle unexpected disconnects:
- MET-LINK (Ionic): disconnect callback passed to `BleClient.connect()`, updates connection state
- NEP-LINK (RN): `onDeviceDisconnected` registered via `manager.onDeviceDisconnected()`, navigates back to device list

### Permissions Matrix

| Permission | Android < 31 | Android >= 31 | iOS |
|---|---|---|---|
| `ACCESS_FINE_LOCATION` | Required | Required | Not needed |
| `BLUETOOTH_SCAN` | Not available | Required | Not needed |
| `BLUETOOTH_CONNECT` | Not needed | Required | Not needed |
| Bluetooth Always | — | — | NSBluetoothAlwaysUsageDescription |
| Location When In Use | — | — | NSLocationWhenInUseUsageDescription |

---

## 8. Data Flow — End to End

### MET-LINK Data Flow

```
MET-LINK Hardware Device
    │ BLE Notifications (NMEA sentences + battery JSON)
    ▼
BluetoothService.processIncomingData()
    │ Buffer management, split on \n
    ▼
handleBluetoothData() → isNmeaValid() check
    │
    ├── handleNMEA() → switch(messageType)
    │   ├── NmeaMWV() → saveDataItem() [wind speed, direction]
    │   │                storeWindPeriod() [rolling 600-sample buffer]
    │   ├── NmeaXDR() → saveDataItem() [temp, humi, press, solar, etc.]
    │   │                handleQq() [QNH/QFE calc if enabled]
    │   │                handleDewPoint() [dew point calc if enabled]
    │   └── NmeaGGA() → saveDataItem() [GPS fields]
    │
    └── handleStats() [battery: ~,stats format]
        processMetaData() [battery: JSON format]

BluetoothService.dataItems[] ← shared state array (read by all pages)
    │
    ├── DashboardPage [500ms interval poll]
    │   ├── refreshLayoutData() → reads dataItems for 8 tiles
    │   ├── updateWindRose() → reads wind values, draws canvas
    │   └── updateGraph() → reads single item, updates Chart.js
    │
    ├── AllDataPage → renders full dataItems list
    ├── LocationPage → reads GPS from dataItems
    │
    └── LoggingPage [1s timer via startRecordingTimer()]
        └── logData() → inserts measure rows to SQLite
```

### NEP-LINK Data Flow

```
NEP-LINK Hardware Device
    │ BLE Notifications (base64 encoded)
    ▼
BluetoothService.connectAndListen() → decode base64 → raw string
    │
    ├── Sensor Characteristic → onSensorDataReceivedHandler (Devices/index.jsx)
    │   ├── regex match: /(R\d),(\d+\.\d+),?(\d+\.\d+)?/
    │   │   → extract probeSetting, turbidityValue, temperatureValue
    │   │   → dispatch updateValues() → sensorDataReducer
    │   │   → if logging.isLogging → dispatch addDataToLoggingSession()
    │   └── regex match: /~,stats,(\d+),(\d)/
    │       → extract batteryLevel, batteryCharging
    │       → dispatch updateBatteryStatus()
    │
    └── Battery Characteristic → onBatteryDataReceivedHandler
        ├── decode base64 → JSON string → parse
        │   { percentage, rawVoltage, isCharging }
        └── dispatch updateBatteryStatus()

Redux Store sensorData
    │
    └── DeviceView (connected component)
        ├── LiveValues → renders turbidity (NTU) + temperature (°C) tiles
        ├── RangeIndicator → renders R1/R2/R3 label
        ├── LocationMap → renders GPS map
        └── LoggingButtons → start/stop controls

Redux Store logging
    └── loggingSessionSamples[] ← grows with each data point
        └── every 10 samples → saveLoggingSessionSamples → AsyncStorage
```

---

## 9. Database & Storage Architecture

### MET-LINK — SQLite (Native)

- Database: `db.storage` (unencrypted)
- Location: iOS: `Library/CapacitorDatabase/`, Android: app data directory
- ORM: Direct SQL via `@capacitor-community/sqlite`
- Schema: see section 4 above
- No migrations implemented (DB_VERSION = 1, `CREATE TABLE IF NOT EXISTS`)

**Data volumes to expect:**
- 1 logging session = 1 record + N measure rows (N = seconds of logging)
- 1 hour session = 3600 measure rows + header row
- Each row is a CSV string of all enabled sensor values
- Pictures stored as base64 TEXT (can become large — consider file system for production)

### NEP-LINK — SQLite + RNFS

- Session metadata: SQLite `loggingSessions` table
- Session samples: SQLite `loggingSessionSamples` table (one row per reading)
- Known devices: SQLite `knownDevices` table
- Files (photos, map captures, CSV exports): RNFS (native file system)
- Legacy data: AsyncStorage (only relevant for migration path — see Section 6)

**Data volumes to expect:**
- 1 hour session = 3600 rows in `loggingSessionSamples`
- Each row stores 8 numeric columns — SQLite handles this efficiently
- No more JSON blob size concern that existed with AsyncStorage
- SQLite survives app restarts and device reboots reliably

**Important:** SQLite tables are initialized in `App.tsx` via `getDBConnection()` + `createTables()` before the splash screen hides. The app will not render until the database is ready.

---

## 10. Feature Inventory — Both Apps

### MET-LINK Feature Status

| Feature | Status | Notes |
|---|---|---|
| BLE Scan & Connect | Done | With retry (up to 3 attempts) |
| NMEA Parsing (MWV) | Done | Wind speed + direction, relative + true |
| NMEA Parsing (XDR) | Done | Temp, humidity, pressure, precipitation, solar, voltage |
| NMEA Parsing (GGA) | Done | Full GPS: lat, lon, altitude, satellites, etc. |
| Wind Rose (Canvas) | Done | 3 themes, 3 periods, instant/2min/10min |
| Line Graph (Chart.js) | Done | 20-point rolling window, selectable sensor |
| 8-tile Dashboard Layout | Done | Fully configurable, persisted |
| Data Logging (SQLite) | Done | 1-second granularity |
| Photo Capture & Link to Log | Done | Via Capacitor Camera |
| View Log Records | Done | `view-record` page |
| Log Detail View | Done | `details-log` page |
| Pictures Viewer | Done | `details-pictures` page |
| Delete Record | Done | Cascades to measure + picture tables |
| Export Data | Done | `export.service.ts` (needs verification) |
| Demo Mode | Done | Realistic NMEA data generation |
| QNH/QFE Calculation | Done | With configurable station heights |
| Dew Point Calculation | Done | From temperature + humidity |
| Unit Conversion | Done | Per unit group, persisted |
| Terminal View (raw NMEA) | Done | `terminal` page |
| Battery Status Display | Done | % + charging state |
| Device Configuration | Done | Per-session, modal-based |
| 3 Color Themes | Done | |
| Android Edge-to-Edge | Done | `@capawesome/capacitor-android-edge-to-edge-support` |
| iOS Support | Done (needs testing) | |
| Cloud Sync / Backend | NOT DONE | See section 12 |
| Push Notifications | NOT DONE | |
| Multi-device Support | NOT DONE | One device at a time |

### NEP-LINK Feature Status

| Feature | Status | Notes |
|---|---|---|
| BLE Scan & Connect | Done | 5s device expiry, LowLatency scan |
| Sensor Data Parsing | Done | Turbidity + Temperature regex |
| Battery Data Parsing | Done | JSON + legacy stats format |
| Live Turbidity Display (NTU) | Done | Blue tile, dynamic font size |
| Live Temperature Display (°C) | Done | Orange tile |
| Range Indicator (R1/R2/R3) | Done | |
| GPS Location Map | Done | `react-native-maps` |
| GPS Location Not Found State | Done | |
| Logging Session Start/Stop | Done | UUID-based sessions |
| In-Memory Sample Collection | Done | Bug: Redux array always has 1 item (see Section 11) |
| SQLite Persistence | Done | Samples written directly to SQLite per reading |
| AsyncStorage Persistence | Legacy only | Replaced by SQLite in latest version |
| Map Screenshot on Session Start | Done | `react-native-view-shot` |
| Camera Photo During Session | Done | `react-native-image-picker` |
| Post-Session Photo Prompt | Done | TakePhotoDialog |
| Session List View | Done | |
| Session Detail View | Done | With chart, averages, images |
| Line Chart (turbidity over time) | Done | `react-native-gifted-charts` |
| Turbidity Average Display | Done | Mean NTU |
| Comment System | Done | Per-session editable comment |
| Export to CSV | Done | With images + map as attachments |
| Share via Native Share Sheet | Done | Email, AirDrop, etc. |
| Delete Session | Done | AsyncStorage + RNFS cleanup |
| Custom Device Naming | Done | Per-device, persisted |
| Demo Mode | Done | Random turbidity + temperature data |
| Battery Header Indicator | Done | % + charging icon |
| Disconnect & Reconnect | Done | Via disconnect handler |
| Android Permissions (BLE + Location) | Done | Both pre/post Android 12 |
| iOS Permissions | Done (needs testing) | Info.plist entries needed |
| Cloud Sync / Backend | NOT DONE | See section 12 |
| Temperature Chart | Done | Toggle between turbidity and temperature via `ChartDataType` selector |
| Multi-range comparison | NOT DONE | |
| Session filtering/search | NOT DONE | |

---

## 11. Known Bugs & Code Issues (Flagged)

These are bugs identified by direct code analysis. They should be fixed before release.

---

### NEP-LINK Latest (`observator-nep-link-ble`) — Active Codebase

**Bug 1 — CRITICAL: `LOGGING_ADD_DATA_TO_SESSION` overwrites entire samples array**
File: `src/store/loggingSlice.ts:76`
```typescript
// BUG: Creates new array with only ONE element instead of appending
case 'LOGGING_ADD_DATA_TO_SESSION': {
  const loggingSessionSamples = [action.payload.dataSample]; // ← WRONG
  return { ...state, loggingSessionSamples, loggingSessionSampleCount: state.loggingSessionSampleCount + 1 };
}

// FIX:
const loggingSessionSamples = [...state.loggingSessionSamples, action.payload.dataSample];
```
`loggingSessionSampleCount` increments correctly. The SQLite write is unaffected (happens in the action, not from this state). However, any component reading `logging.loggingSessionSamples` during an active session sees only the most recent data point. The chart and averages in `LoggingSessionView` read from SQLite on load (not from Redux), so the session review screen is unaffected — but the bug could cause issues if live data is ever displayed during logging.

**Bug 2 — `isScanning` field missing from `DeviceState` TypeScript interface**
File: `src/features/Devices/index.tsx:29-43` (interface) vs `80-95` (initial state)
```typescript
// DeviceState interface does NOT include isScanning
// But initial state has:
isScanning: false, // ADD THIS  ← comment acknowledges it, but it was never added to the interface
```
All `setState(prev => ({ ...prev, isScanning: ... }))` calls are untyped. TypeScript won't catch misuse.

**Fix:** Add `isScanning: boolean;` to the `DeviceState` interface.

**Bug 3 — Two duplicate `useEffect` blocks run identical BLE initialization on mount**
File: `src/features/Devices/index.tsx:404` and `src/features/Devices/index.tsx:763`
Both effects call `BleService.init()` and define + run `initBluetoothMonitoring()`. This means:
- BLE is initialized twice
- `onStateChange` subscriber is registered twice (double callbacks for BT state changes)
- `checkBluetoothState()` runs twice back-to-back

The first `useEffect` (line 404) also calls `startLocationUpdates()`. The second (line 763) does not, but has `stopScan()` in its cleanup. These should be merged into a single `useEffect`.

**Bug 4 — Migration utility never invoked**
File: `src/App.tsx`
```typescript
import { migrateAsyncStorageToSQLite } from './utils/migration'; // ← imported

const initializeApp = async () => {
  const db = await getDBConnection();
  await createTables(db);
  // migrateAsyncStorageToSQLite() is NEVER called here
  await RNBootSplash.hide({ fade: true });
};
```
Any user upgrading from the AsyncStorage-based version will silently lose all session history. Fix: add `await migrateAsyncStorageToSQLite()` as the second step in `initializeApp()`, after `createTables()`.

**Bug 5 — Nav header title references undefined route param**
File: `src/navigation/RootNav.tsx:104-107`
```typescript
options={({ route }) => ({
  // formattedDateTime is NOT in LoggingStackParamList['LoggingSessionView']
  title: route.params?.formattedDateTime
    ? `Session: ${route.params.formattedDateTime}`
    : 'Logging Session',  // ← always shows this fallback
```
`LoggingStackParamList.LoggingSessionView` only has `loggingSessionId`. The header title never shows a formatted date — it always falls back to `'Logging Session'`. TypeScript should flag this but `?.` masks the type error.

**Fix:** Remove `formattedDateTime` reference. Format the title inside `LoggingSessionView` using `navigation.setOptions()` once the session data is loaded from SQLite.

**Bug 6 — `onDeviceDisconnected` missing `startScan` dependency**
File: `src/features/Devices/index.tsx:689`
```typescript
const onDeviceDisconnected = useCallback(() => {
  // ...
  startScan(); // called here
}, [dispatch, navigation]); // ← startScan missing from deps
```
This captures a stale `startScan` reference. The refs pattern used elsewhere partially mitigates this, but the dependency array is incorrect and will cause React lint warnings.

**Issue 7 — Excessive debug logging in production code**
Files: `src/features/LoggingSessions/LoggingSessionView.tsx`, `src/features/Devices/index.tsx`
Over 60 `console.log` calls with `🔍 RNFS LOG XXX:` prefixes remain in `LoggingSessionView.tsx`. These are debug traces that should be stripped before any client-facing build. They also leak file system paths and session IDs.

**Issue 8 — `@reduxjs/toolkit` installed but unused**
`package.json` includes `@reduxjs/toolkit ^2.9.0` but `src/store/index.ts` still uses `createStore` + `combineReducers` from plain `redux`. The store files are named `*Slice.ts` but are plain reducer functions, not RTK slices. This creates confusion and adds dead bundle weight. Either migrate to `configureStore` + `createSlice`, or remove the RTK dependency.

---

### NEP-LINK Legacy Bugs (FIXED in Latest Pull)

These bugs existed in the old codebase and have been corrected:

| Bug | Old File | Status |
|---|---|---|
| `new Date.now()` syntax error | `containers/Devices/index.jsx:437` | FIXED — now uses `DateTime.now()` |
| Variable shadow `let responseStr = responseStr.split(...)` | `containers/Devices/index.jsx:401` | FIXED — clean regex parse |
| Wrong probe range order (R3→R2→R1, R1 unreachable) | `containers/Devices/index.jsx:545` | FIXED — now R1→R2→R3 |
| `newDevice['isConnected'] === true` (comparison not assignment) | `reducers/devicesReducer.jsx:34` | FIXED — `= true` in `devicesSlice.ts` |
| Undeclared `deviceInRange` implicit global | `reducers/devicesReducer.jsx:116` | FIXED — removed old reducer pattern |
| Duplicate `RNFS.unlink` same path | `actions/LoggingActions.jsx:151-152` | FIXED — now unlinks session folder + thumbnail separately |
| `locaLngbled` typo | `reducers/sensorDataReducer.jsx` | FIXED in `sensorDataSlice.ts` |

---

### MET-LINK: `bluedata.service.ts`

**Issue 9 — `scanUnpairedDevices()` method is incomplete (Lines ~1017-1040)**
This method waits 10 seconds via `setTimeout` then returns an empty array. The discovered devices in the callback are never collected. It's not called from any page currently, but should be addressed or removed.

**Issue 10 — QNH/QFE GPS height mode (`QqGpsHeight`) is not implemented**
The flag `this.QqGpsHeight` is stored and restored from preferences, but in `handleQq()`, if `QqGpsHeight` is true, the function returns immediately without calculating. The GPS-based QNH/QFE is a stub.

**Issue 11 — Pictures stored as base64 in SQLite (MET-LINK)**
The `picture` table stores full base64-encoded images in TEXT columns. This is a known anti-pattern for SQLite — images should be stored in the file system with only the path in SQLite.

---

### General

**Issue 12 — No error boundary in React Native app**
If any component throws, the app will crash with a red screen. No `ErrorBoundary` is implemented in either the legacy or latest NEP-LINK codebase.

---

## 12. Backend Developer Specification

This section defines what a backend developer needs to build to support cloud features for both apps.

### Context

Currently both apps are 100% offline. All data is local to the device. The client wants (or will want) cloud capabilities. This section defines the full scope.

### What the Backend Needs to Provide

#### 1. Authentication API

| Endpoint | Method | Description |
|---|---|---|
| `/auth/register` | POST | User registration (email + password) |
| `/auth/login` | POST | Returns JWT access token + refresh token |
| `/auth/refresh` | POST | Refresh access token |
| `/auth/logout` | POST | Invalidate refresh token |

**Auth requirements:**
- JWT-based stateless authentication
- Short-lived access tokens (15 min), long-lived refresh tokens (30 days)
- bcrypt password hashing
- Per-organization multi-tenancy (users belong to an organization)

#### 2. Device Registry API

| Endpoint | Method | Description |
|---|---|---|
| `/devices` | GET | List all registered devices for org |
| `/devices` | POST | Register a new device (MAC/BLE ID + name + type) |
| `/devices/{id}` | GET | Get device details |
| `/devices/{id}` | PATCH | Update device name/metadata |
| `/devices/{id}` | DELETE | Deregister device |

**Device object:**
```json
{
  "id": "uuid",
  "bleId": "AA:BB:CC:DD:EE:FF",
  "name": "NEP-LINK-001",
  "type": "NEP-LINK | MET-LINK",
  "serialNo": "...",
  "firmwareVersion": "...",
  "organizationId": "uuid",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

#### 3. Logging Sessions API (NEP-LINK)

| Endpoint | Method | Description |
|---|---|---|
| `/sessions` | GET | List sessions (paginated, filterable by device/date) |
| `/sessions` | POST | Create/upload a logging session |
| `/sessions/{id}` | GET | Get session details |
| `/sessions/{id}` | PATCH | Update comment |
| `/sessions/{id}` | DELETE | Delete session + samples + files |
| `/sessions/{id}/samples` | GET | Get all samples for a session (paginated) |
| `/sessions/{id}/samples` | POST | Bulk upload samples |
| `/sessions/{id}/export` | GET | Generate and return CSV export |
| `/sessions/{id}/files` | GET | List files (photos, map) for a session |
| `/sessions/{id}/files` | POST | Upload file (multipart) |
| `/sessions/{id}/files/{fileId}` | GET | Download file |
| `/sessions/{id}/files/{fileId}` | DELETE | Delete file |

**Session object (NEP-LINK):**
```json
{
  "id": "uuid",
  "deviceId": "uuid",
  "deviceName": "NEP-LINK-001",
  "startTimestamp": 1234567890000,
  "timezoneName": "Europe/Amsterdam",
  "timezoneOffset": 2,
  "turbidityEnabled": true,
  "temperatureEnabled": true,
  "comment": "Field observation notes",
  "sampleCount": 3600,
  "turbidityAverage": 245.67,
  "organizationId": "uuid",
  "createdAt": "ISO8601",
  "syncedAt": "ISO8601"
}
```

**Sample object:**
```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "timestamp": 1234567890000,
  "turbidityValue": 245.67,
  "temperatureValue": 18.3,
  "locationLat": 51.5074,
  "locationLng": -0.1278,
  "batteryLevel": 85,
  "batteryRawVoltage": 3750
}
```

#### 4. Logging Records API (MET-LINK)

| Endpoint | Method | Description |
|---|---|---|
| `/records` | GET | List records (paginated) |
| `/records` | POST | Upload a record with measures |
| `/records/{id}` | GET | Get record + measures |
| `/records/{id}` | PATCH | Update comment |
| `/records/{id}` | DELETE | Delete record + measures + pictures |
| `/records/{id}/measures` | GET | Get measures (paginated) |
| `/records/{id}/measures` | POST | Bulk upload measures |
| `/records/{id}/pictures` | GET | List pictures |
| `/records/{id}/pictures` | POST | Upload picture (multipart or base64) |
| `/records/{id}/export` | GET | Generate CSV export |

**Record object:**
```json
{
  "id": "uuid",
  "deviceId": "uuid",
  "deviceName": "MET-LINK-001",
  "dateStart": "2026-05-01 14:32:01",
  "dateEnd": "2026-05-01 15:45:22",
  "comment": "...",
  "organizationId": "uuid"
}
```

**Measure object:**
```json
{
  "id": "uuid",
  "recordId": "uuid",
  "dataSentence": "CSV row string with sensor values",
  "timeStamp": "2026-05-01 14:32:01"
}
```

#### 5. Sync API

The apps need to sync local data to cloud when connectivity is available:

| Endpoint | Method | Description |
|---|---|---|
| `/sync/status` | GET | Returns list of session/record IDs in cloud for org |
| `/sync/upload` | POST | Bulk upload multiple sessions/records |
| `/sync/download` | GET | Download all unsynced cloud data to device |

**Sync strategy:**
- Offline-first: local always wins
- App stores `syncedAt` timestamp per session/record
- On connect: check `/sync/status` → upload any local items not in cloud list → download any cloud items not local
- Conflict resolution: last-modified wins (optimistic, no true conflict expected since each device owns its sessions)

#### 6. Organization & User Management

| Endpoint | Method | Description |
|---|---|---|
| `/organizations` | POST | Create organization |
| `/organizations/{id}` | GET | Get org details |
| `/organizations/{id}/users` | GET | List users |
| `/organizations/{id}/users` | POST | Invite user |
| `/users/me` | GET | Current user profile |
| `/users/me` | PATCH | Update profile |

#### 7. Tech Stack Recommendations for Backend

| Component | Recommendation | Rationale |
|---|---|---|
| Runtime | Node.js (v20+) | Team already knows JS/TS |
| Framework | NestJS or Fastify | NestJS for structure; Fastify for performance |
| Database | PostgreSQL | Relational, good for time-series queries |
| ORM | Prisma | TypeScript-native, clean migrations |
| File Storage | AWS S3 or Cloudflare R2 | Photos, map images, CSV exports |
| Auth | JWT + refresh tokens | Standard, stateless |
| Hosting | Railway / Render / AWS ECS | Depends on budget |
| Caching | Redis | Rate limiting, session cache |
| API Style | REST (JSON) | Both apps already use axios |
| API Docs | OpenAPI / Swagger | Auto-generated from NestJS decorators |

#### 8. Environment Variables the App Needs

Both mobile apps will need:
```
API_BASE_URL=https://api.yourbackend.com/v1
API_TIMEOUT=30000
```

This is configured via `react-native-config` (already installed in RN) and environment files in Ionic.

#### 9. Database Schema (PostgreSQL, high level)

```sql
organizations (id, name, created_at)
users (id, org_id, email, password_hash, role, created_at)
devices (id, org_id, ble_id, name, type, serial_no, firmware_version, created_at)

-- NEP-LINK
nep_sessions (id, device_id, org_id, start_ts, timezone_name, tz_offset, turbidity_enabled, temperature_enabled, comment, sample_count, synced_at, created_at)
nep_samples (id, session_id, timestamp, turbidity_value, temperature_value, lat, lng, battery_level, battery_raw_voltage)
nep_files (id, session_id, file_type [map|photo|csv], storage_key, created_at)

-- MET-LINK
met_records (id, device_id, org_id, date_start, date_end, comment, synced_at, created_at)
met_measures (id, record_id, data_sentence, timestamp)
met_pictures (id, record_id, storage_key, created_at)
```

---

## 13. What Is Missing / Not Yet Built

### NEP-LINK App

1. **Migration utility not wired up** — `migrateAsyncStorageToSQLite()` is written and imported but never called. Must be added to `initializeApp()` before shipping to any existing user.
2. **Nav header missing formatted date title** — `LoggingSessionView` always shows `'Logging Session'` as the title because the referenced route param doesn't exist. Should use `navigation.setOptions()` once session data loads.
3. **Redux store not migrated to RTK** — `@reduxjs/toolkit` is installed but `createStore` + plain reducers are still used. This is dead weight. Either commit to the migration or remove the package.
4. **Session filtering / search** — No way to filter sessions by date, device, or keyword
5. **Offline sync indicator** — No UI showing what's synced vs local-only
6. **Backend API integration** — No API calls anywhere in the app (axios is installed but not used)
7. **Error boundary** — App will crash on any unhandled render error
8. **Probe range display in session detail** — R1/R2/R3 is captured during logging but not shown in `LoggingSessionView`
9. **Multi-device support in one session** — Cannot log from two NEP-LINK devices simultaneously
10. **Session sharing as a link** — Share is attachment-only via native Share sheet. No web link.

### MET-LINK App

1. **Export functionality verification** — `export.service.ts` exists but its integration with the view-record pages needs end-to-end testing
2. **Cloud sync** — No backend integration
3. **QNH/QFE GPS height mode** — `QqGpsHeight = true` path is not implemented (bug)
4. **Incomplete `scanUnpairedDevices()`** — Stub method that does nothing useful
5. **Base64 images in SQLite** — Should be migrated to file system storage
6. **Record editing** — Cannot edit the device name or date of a past record

### Both Apps

1. **Push notifications** — Not implemented (e.g., "Logging session complete" alert)
2. **App icons and splash screens** — Need final branding assets before store submission
3. **App Store / Play Store submission** — Not yet submitted for either app
4. **Unit tests** — Jest is configured but test files are empty stubs
5. **CI/CD pipeline** — No automated build or test pipeline
6. **Crash reporting** — No Sentry or similar error tracking

---

## 14. Roadmap & Prioritization

### Phase 1 — Stabilization (Immediate Priority)

**Goal:** Get both apps to a stable, bug-free, testable state.

| Task | App | File | Effort | Priority |
|---|---|---|---|---|
| Wire up `migrateAsyncStorageToSQLite()` in `initializeApp()` | NEP-LINK | `App.tsx` | 15 min | CRITICAL |
| Fix `LOGGING_ADD_DATA_TO_SESSION` array overwrite | NEP-LINK | `loggingSlice.ts:76` | 5 min | HIGH |
| Fix nav header title (`formattedDateTime` not in param type) | NEP-LINK | `RootNav.tsx:105` | 30 min | HIGH |
| Add `isScanning` to `DeviceState` interface | NEP-LINK | `Devices/index.tsx` | 5 min | MEDIUM |
| Merge duplicate `useEffect` BLE init blocks | NEP-LINK | `Devices/index.tsx:404+763` | 1 hour | MEDIUM |
| Fix `onDeviceDisconnected` missing `startScan` dep | NEP-LINK | `Devices/index.tsx:689` | 5 min | LOW |
| Strip all `🔍 RNFS LOG` debug console.log calls | NEP-LINK | `LoggingSessionView.tsx`, `Devices/index.tsx` | 30 min | MEDIUM |
| Decide: adopt RTK `configureStore`/`createSlice` or remove `@reduxjs/toolkit` dep | NEP-LINK | `store/index.ts` | 1 day (if adopting) / 5 min (if removing) | MEDIUM |
| Verify export service end-to-end | MET-LINK | `export.service.ts` | 2 hours | HIGH |
| Implement QFE/QNH GPS height mode | MET-LINK | `bluedata.service.ts` | 1 day | MEDIUM |
| Replace base64 SQLite pictures with file system | MET-LINK | `sqlite.service.ts` | 1 day | MEDIUM |
| Verify RN 0.81.4 native module linking + `patch-package` | NEP-LINK | iOS/Android native | 1 day | HIGH |
| Test iOS builds for both apps | Both | — | 1 day each | HIGH |
| Add `ErrorBoundary` to RN app | NEP-LINK | — | 2 hours | MEDIUM |

### Phase 2 — Feature Completion (Short-term)

**Goal:** Fill remaining feature gaps before client demo / beta.

| Task | App | Effort | Priority |
|---|---|---|---|
| Add temperature chart to session detail | NEP-LINK | 4 hours | MEDIUM |
| Add session filtering/search | NEP-LINK | 1 day | MEDIUM |
| Add probe setting display in session detail | NEP-LINK | 2 hours | LOW |
| Add sync status indicator UI | Both | 1 day | LOW |
| Finalize app branding (icons, splash) | Both | 0.5 day | HIGH (before store) |

### Phase 3 — Backend Integration (Medium-term)

**Goal:** Build and integrate cloud backend.

| Task | Who | Effort |
|---|---|---|
| Design and build REST API (Auth + Devices + Sessions + Records) | Backend Dev | 3-4 weeks |
| Integrate auth (login, register, JWT) into both apps | Mobile Dev | 3 days |
| Implement sync logic (upload sessions/records on WiFi) | Mobile Dev | 1 week |
| File upload for photos/maps | Backend + Mobile | 3 days |
| CSV export via backend | Backend Dev | 2 days |
| Test full sync flow (offline → online → sync) | Both | 3 days |

### Phase 4 — Store Submission

| Task | Notes |
|---|---|
| Android Play Store submission (NEP-LINK) | Needs signed APK/AAB, Play Console account |
| Android Play Store submission (MET-LINK) | Same |
| iOS App Store submission (NEP-LINK) | Needs Apple Developer account, provisioning profiles |
| iOS App Store submission (MET-LINK) | Same |

### Phase 5 — Post-Launch

- Web dashboard for data visualization (client request)
- Multi-user organization access
- Advanced analytics (time-series aggregations, trend detection)
- Push notification alerts (e.g., turbidity threshold exceeded)
- OTA firmware update flow (if hardware supports it)

---

## 15. Environment & Build Setup

### MET-LINK (Ionic + Angular)

**Prerequisites:**
- Node.js 18+
- npm or yarn
- Ionic CLI: `npm install -g @ionic/cli`
- Angular CLI: `npm install -g @angular/cli`
- Xcode (for iOS)
- Android Studio + Android SDK (for Android)
- CocoaPods (for iOS native)

**Install:**
```bash
cd ~/Desktop/working/ionic/met-link-mob
npm install
```

**Run web (dev):**
```bash
ionic serve
```

**Build iOS:**
```bash
ionic cap build ios
ionic cap open ios   # opens Xcode
```

**Build Android:**
```bash
ionic cap build android
ionic cap open android   # opens Android Studio
```

**After any plugin changes:**
```bash
ionic cap sync
```

### NEP-LINK (React Native)

**Prerequisites:**
- Node.js >= 20 (required — see `package.json` engines)
- yarn (preferred; `patch-package` relies on `postinstall` hook)
- React Native CLI (not Expo)
- Xcode (for iOS)
- Android Studio + Android SDK (for Android)
- CocoaPods (for iOS)
- Java 17+ (for Android Gradle)

**Active project path:** `~/Desktop/working/reactNative/observator-nep-link-ble/`

**Install:**
```bash
cd ~/Desktop/working/reactNative/observator-nep-link-ble
yarn install
# patch-package runs automatically via postinstall — do NOT use npm install
```

**iOS:**
```bash
cd ios && pod install && cd ..
npx react-native run-ios
```

**Android:**
```bash
npx react-native run-android
```

**Metro bundler:**
```bash
npx react-native start
```

**Important:** Always use `yarn install`, not `npm install`. The `postinstall` script runs `patch-package` to apply native patches. If you use npm, the patches may not be applied and native modules may break.

### iOS Info.plist Entries Required

Both apps need these in their iOS `Info.plist`:

```xml
<!-- Bluetooth -->
<key>NSBluetoothAlwaysUsageDescription</key>
<string>This app needs Bluetooth access to connect to [MET-LINK/NEP-LINK] devices</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>This app needs Bluetooth access to connect to [MET-LINK/NEP-LINK] devices</string>

<!-- Location (required for BLE on iOS) -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Location permission is required for Bluetooth scanning on iOS</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Location is used to tag measurement data with GPS coordinates</string>

<!-- Camera (for photo capture) -->
<key>NSCameraUsageDescription</key>
<string>Camera is used to take photos during logging sessions</string>
```

### Android AndroidManifest.xml Permissions Required

```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
```

---

## 16. File & Folder Structure Reference

### MET-LINK Key Files

```
ionic/met-link-mob/src/app/
├── app.routes.ts                          — All page routes
├── app.component.ts                       — App root, BLE lifecycle
├── services/
│   ├── bluedata.service.ts               ← CORE: BLE, NMEA parsing, logging, demo
│   ├── sqlite.service.ts                 ← CORE: all database operations
│   ├── export.service.ts                 — CSV/data export
│   └── global.service.ts                 — Theme, shared navigation helpers
├── pages/
│   ├── devices/devices.page.ts           — BLE scanner UI
│   ├── live-data/
│   │   ├── dashboard/dashboard.page.ts   ← CORE: wind rose, graph, tile layout
│   │   ├── all-data/all-data.page.ts     — Sensor values list
│   │   ├── location/location.page.ts     — GPS map
│   │   └── logging/logging.page.ts       — Start/stop logging UI
│   ├── configuration/configuration.page.ts — Settings, demo mode
│   ├── change-units/change-units.page.ts — Unit preferences
│   ├── view-record/view-record.page.ts   — Log records list
│   ├── details-log/details-log.page.ts   — Log record detail
│   └── terminal/terminal.page.ts         — Raw NMEA output
├── components/
│   ├── layout-modal.component.ts         — Dashboard tile picker
│   └── wind-rose-settings.component.ts   — Wind rose config modal
└── interfaces/
    └── color-scheme.interface.ts         — Wind rose color scheme type
```

### NEP-LINK Key Files (Latest — `observator-nep-link-ble`)

```
reactNative/observator-nep-link-ble/
├── App.tsx                               ← SQLite init, BootSplash, Redux Provider
├── src/
│   ├── navigation/
│   │   └── RootNav.tsx                  ← Bottom tabs + typed stack navigators
│   ├── services/
│   │   └── BleService.ts               ← CORE: BLE scan, connect, monitor (TypeScript)
│   ├── actions/
│   │   ├── DeviceActions.ts            ← CORE: device state + SQLite knownDevices
│   │   ├── SensorDataActions.ts        — Sensor value updates
│   │   ├── LoggingActions.ts           ← CORE: session CRUD + SQLite + RNFS
│   │   └── DemoActions.ts              — Demo mode flag
│   ├── store/
│   │   ├── index.ts                    — createStore + combineReducers
│   │   ├── devicesSlice.ts             — Device connection state (plain reducer)
│   │   ├── sensorDataSlice.ts          — Live sensor values (plain reducer)
│   │   ├── loggingSlice.ts             — Session and samples state (BUG: array overwrite)
│   │   └── demoSlice.ts               — Demo mode flag
│   ├── features/
│   │   ├── Devices/
│   │   │   ├── index.tsx              ← CORE: BLE init, permissions, scan, connect
│   │   │   ├── DeviceView.tsx         ← CORE: live data, logging control
│   │   │   ├── HeaderRightCameraButton.tsx — Camera in nav header during logging
│   │   │   ├── LocationMap.android.tsx — Android GPS map
│   │   │   ├── LocationMap.ios.tsx     — iOS GPS map
│   │   │   ├── NepLinkHeader.tsx       — Branded header
│   │   │   ├── DevicesList.tsx         — Discovered devices list
│   │   │   ├── DevicesListButtons.tsx  — Demo mode button
│   │   │   ├── BluetoothDisabledError.tsx — BT unavailable state
│   │   │   └── DeviceConnectingDialog.tsx — Connecting dialog
│   │   ├── LoggingSessions/
│   │   │   ├── index.tsx              — Sessions list screen
│   │   │   ├── LoggingSessionView.tsx ← CORE: session detail, export, delete
│   │   │   ├── ImageCarousel.tsx      — Full-screen image viewer (modal)
│   │   │   ├── ActionsMenu.tsx        — Export / Delete actions
│   │   │   ├── DataAverages.tsx       — Averages + turbidity/temperature toggle
│   │   │   ├── SessionLineChart.tsx   — Line chart (turbidity or temperature)
│   │   │   ├── Comment.tsx            — Comment display with edit
│   │   │   ├── LoggingSessionCommentDialog.tsx
│   │   │   └── WaitingDialog.tsx      — Loading overlay
│   │   └── About/
│   │       └── index.tsx
│   └── utils/
│       ├── db.js                      ← SQLite connection + table creation
│       └── migration.js               — AsyncStorage → SQLite migration (not yet wired up)
```

---

## Appendix A: Hardware UUIDs Quick Reference

| UUID | Service/Characteristic | Used For |
|---|---|---|
| `c25d444c-2836-4cc0-8f2f-95f4c8fd7f8b` | **Sensor Data Service** | Main data channel |
| `9915b449-2b52-429b-bfd0-ab634002404d` | **Sensor Data Characteristic** | NMEA (MET-LINK) / Probe data (NEP-LINK) |
| `86a324aa-4b2f-46c7-b4d8-949cae59e6d7` | **Metadata Service** | Battery and device info |
| `266b64b4-19ee-4941-8253-650b4d7ab197` | **Metadata Characteristic** | Battery JSON / serial / firmware |

## Appendix B: Data Format Quick Reference

### MET-LINK — NMEA Sentences

```
$IIMWV,045.0,R,12.5,N,A*XX\r\n     → Wind: direction=45°, relative, speed=12.5 knots, valid
$IIMWV,090.0,T,08.2,M,A*XX\r\n     → Wind: direction=90°, true, speed=8.2 m/s, valid
$IIXDR,C,23.4,C,TEMP,P,1.013,B,PRESS,H,65,P,RH*XX → Temp=23.4°C, Press=1013hPa, Humidity=65%
$GPGGA,123519,5130.00,N,00007.67,W,1,08,0.9,545,M,46.9,M,,*XX → GPS
~,stats,85,1\n                       → Battery 85%, charging (legacy format)
{"isCharging":1,"percentage":85,"serialNo":"SN001","firmwareVersion":"1.2.3"}  → metadata JSON
```

### NEP-LINK — Custom Protocol

```
R1,5.23,18.4\n       → Low range, turbidity=5.23 NTU, temperature=18.4°C
R2,245.67,21.0\n     → Medium range, turbidity=245.67 NTU, temperature=21.0°C
R3,4521.88,0.0\n     → High range, turbidity=4521.88 NTU, no temperature
~,stats,85,1\n       → Battery 85%, charging (legacy)
{"percentage":85,"rawVoltage":3750,"isCharging":0}  → Battery JSON
```

---

*End of document.*
*Last updated: May 2026 — updated to reflect latest `observator-nep-link-ble` pull (RN 0.81.4, SQLite, full TypeScript, hooks)*
*Prepared by: Hassan Ali*
