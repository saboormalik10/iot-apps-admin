# Month 2 — Delivery Report

**Project:** ObservatorNepLink (MET-LINK + NEP-LINK IoT Platform)
**Month:** 2 (Weeks 5–8)
**Backend URL:** https://iot-apps-admin.onrender.com
**Branch:** Month-2

---

## Summary

Month 2 builds the admin dashboard API layer on top of the Month 1 data-sync infrastructure. The goal is to expose aggregated, real-time device and measurement data to the Angular admin dashboard (built in Weeks 7–8 by Hassan).

---

## Week 5 — MET-LINK Dashboard Endpoints (COMPLETED)

### Deliverables

| Task | Status | Detail |
|------|--------|--------|
| `GET /v1/dashboard/summary` | ✅ Done | Org-wide device/record/session counts |
| `GET /v1/dashboard/devices` | ✅ Done | Device list with isOnline flag |
| `GET /v1/dashboard/met/latest` | ✅ Done | Latest sensor snapshot per device |
| `GET /v1/dashboard/met/windrose` | ✅ Done | Wind data arrays for canvas rendering |
| Compound DB index on MetMeasure | ✅ Done | `{recordId, rowType, timestampMs}` |
| 30-second in-process cache | ✅ Done | Applied to all four endpoints |
| DashboardModule registered in AppModule | ✅ Done | Imports array updated |
| Build passes (`nest build` exit 0) | ✅ Done | TypeScript clean |

### New Files

```
backend/src/dashboard/
  dashboard.module.ts
  dashboard.controller.ts
  dashboard.service.ts
```

### Endpoint Reference

#### `GET /v1/dashboard/summary`
**Auth:** JWT Bearer required

**Response:**
```json
{
  "totalDevices": 3,
  "onlineDevices": 1,
  "offlineDevices": 2,
  "metLinkDevices": 2,
  "nepLinkDevices": 1,
  "totalMetRecords": 47,
  "totalNepSessions": 14,
  "serverTime": "2025-01-10T04:30:00.000Z"
}
```

---

#### `GET /v1/dashboard/devices`
**Auth:** JWT Bearer required

**Response:**
```json
[
  {
    "_id": "66a...",
    "name": "MET-01",
    "bleId": "AA:BB:CC:DD:EE:FF",
    "type": "MET-LINK",
    "firmwareVersion": "1.2.3",
    "lastSeenAt": "2025-01-10T04:28:00.000Z",
    "isOnline": true,
    "lastBatteryPct": 82,
    "lastBatteryCharging": false
  }
]
```
> `isOnline` is `true` if `lastSeenAt` is within the last 5 minutes.

---

#### `GET /v1/dashboard/met/latest?deviceId=<id>`
**Auth:** JWT Bearer required
**Query:** `deviceId` (Device ObjectId, required)

**Response:**
```json
{
  "recordId": "66a...",
  "deviceName": "MET-01",
  "recordDateStart": "2025-01-10",
  "measuredAt": "2025-01-10T04:29:55.000",
  "measuredAtMs": 1736483395000,
  "windSpeedMs": 3.4,
  "windSpeedKmh": 12.2,
  "windSpeedKnots": 6.6,
  "windDirRelDeg": 215.0,
  "windDirTrueDeg": 218.3,
  "tempC": 22.1,
  "humidityPct": 68.0,
  "pressureHpa": 1013.2,
  "dewPointC": 15.6,
  "precipMm": 0.0,
  "solarWm2": 450.0,
  "voltageV": 12.4,
  "batteryVoltageV": 12.1,
  "gpsLat": -27.4698,
  "gpsLng": 153.0251,
  "gpsAltM": 42.0
}
```

---

#### `GET /v1/dashboard/met/windrose?deviceId=<id>`
**Auth:** JWT Bearer required
**Query:** `deviceId` (Device ObjectId, required)

**Response:**
```json
{
  "recordId": "66a...",
  "last600": [
    { "speedMs": 3.4, "speedKmh": 12.2, "dirTrueDeg": 218.3, "dirRelDeg": 215.0, "timestampMs": 1736483395000 }
  ],
  "last120": [
    { "speedMs": 3.4, "speedKmh": 12.2, "dirTrueDeg": 218.3, "dirRelDeg": 215.0, "timestampMs": 1736483395000 }
  ]
}
```
> `last600` = up to 600 samples (≈10 min at 1 Hz). `last120` = first 120 from `last600` (≈2 min). Used for wind rose canvas animation.

---

## Week 6 — MET-LINK History + NEP-LINK Dashboard Endpoints (COMPLETED)

### Deliverables

| Task | Status | Detail |
|------|--------|--------|
| `GET /v1/dashboard/met/history` | ✅ Done | 1-min bucket aggregation, all 9 sensors |
| `GET /v1/dashboard/nep/sessions` | ✅ Done | Paginated NEP-LINK session list |
| `GET /v1/dashboard/nep/latest` | ✅ Done | Latest session + most recent sample snapshot |
| `GET /v1/dashboard/nep/trend` | ✅ Done | Downsampled to ≤500 pts |
| `GET /v1/dashboard/nep/map` | ✅ Done | GPS points downsampled to ≤300 pts |
| 30-second cache on all new endpoints | ✅ Done | |
| `downsample()` utility (evenly-spaced) | ✅ Done | Used by trend + map endpoints |
| Build passes (`nest build` exit 0) | ✅ Done | TypeScript clean |

### Endpoint Reference

#### `GET /v1/dashboard/met/history?deviceId=&sensor=&from=&to=`
**Auth:** JWT Bearer required
**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `deviceId` | ✅ | Device ObjectId |
| `sensor` | ✅ | `wind_speed` \| `wind_dir` \| `temperature` \| `humidity` \| `pressure` \| `solar` \| `precipitation` \| `dew_point` \| `voltage` |
| `from` | ✅ | Start time (Unix ms) |
| `to` | ✅ | End time (Unix ms) |

**Response:**
```json
{
  "sensor": "temperature",
  "unit": "°C",
  "data": [
    { "timestampMs": 1736482800000, "min": 21.4, "max": 22.8, "avg": 22.1, "count": 58 }
  ]
}
```
Each item in `data` represents one 1-minute bucket.

---

#### `GET /v1/dashboard/nep/sessions?deviceId=&page=&limit=`
**Auth:** JWT Bearer required

**Response:**
```json
{
  "total": 14,
  "page": 1,
  "limit": 20,
  "sessions": [
    {
      "_id": "...",
      "id": "550e8400-...",
      "deviceName": "NEP-01",
      "startTimestamp": 1746057600000,
      "endTimestamp": 1746061200000,
      "sampleCount": 240,
      "turbidityAvg": 312.5,
      "probeRange": "R2"
    }
  ]
}
```

---

#### `GET /v1/dashboard/nep/latest?deviceId=`
**Auth:** JWT Bearer required

**Response:**
```json
{
  "session": {
    "id": "550e8400-...",
    "deviceName": "NEP-01",
    "startTimestamp": 1746057600000,
    "endTimestamp": 1746061200000,
    "sampleCount": 240,
    "turbidityAvg": 312.5,
    "turbidityMin": 198.0,
    "turbidityMax": 490.3,
    "temperatureAvg": 18.2,
    "probeRange": "R2",
    "hasTempData": true,
    "hasGpsData": true
  },
  "latestSample": {
    "timestamp": 1746061190000,
    "turbidityValue": 310.0,
    "temperatureValue": 18.1,
    "probeRange": "R2",
    "locationLat": -27.4698,
    "locationLng": 153.0251,
    "batteryLevel": 82
  }
}
```

---

#### `GET /v1/dashboard/nep/trend?sessionId=&field=turbidity`
**Auth:** JWT Bearer required
**Query:** `field` = `turbidity` (default) or `temperature`

**Response:**
```json
{
  "field": "turbidity",
  "data": [
    { "timestamp": 1746057601000, "value": 245.5 }
  ]
}
```
Downsampled to ≤500 points if session has more samples.

---

#### `GET /v1/dashboard/nep/map?sessionId=`
**Auth:** JWT Bearer required

**Response:**
```json
{
  "sessionId": "550e8400-...",
  "points": [
    {
      "timestamp": 1746057601000,
      "lat": -27.4698,
      "lng": 153.0251,
      "turbidityValue": 245.5,
      "probeRange": "R2"
    }
  ]
}
```
Only includes samples that have GPS coordinates. Downsampled to ≤300 points.

---

## Week 7 — Angular Dashboard Scaffold (Frontend — Hassan)

> **No backend work.** All tasks are Angular frontend, assigned to Hassan.

| Task | Who | Consumes |
|------|-----|----------|
| Angular project scaffold, routing, auth guard | Hassan | — |
| Login page + JWT auth service | Hassan | `POST /v1/auth/login` |
| Device overview page with online/offline status | Hassan | `GET /v1/dashboard/devices` |
| MET-LINK 8-tile sensor grid (30s poll) | Hassan | `GET /v1/dashboard/met/latest` |

---

## Week 8 — Angular Dashboard Charts (Frontend — Hassan)

> **No backend work.** All tasks are Angular frontend, assigned to Hassan.

| Task | Who | Consumes |
|------|-----|----------|
| Port wind rose canvas from `met-link-mob` | Hassan | `GET /v1/dashboard/met/windrose` |
| MET-LINK historical line charts + date range picker | Hassan | `GET /v1/dashboard/met/history` |
| NEP-LINK sessions table | Hassan | `GET /v1/dashboard/nep/sessions` |
| NEP-LINK session detail trend charts | Hassan | `GET /v1/dashboard/nep/trend` |

---

## Technical Notes

- **Caching:** All dashboard endpoints use a 30-second in-process TTL cache (Map-based). No external cache dependency needed.
- **Security:** All endpoints require `Authorization: Bearer <token>` (JWT, same as Month 1 auth).
- **isOnline logic:** A device is considered online if `lastSeenAt` is within 5 minutes of server time. The `Device` model stores this in the `isOnline` field (updated by the mobile app sync), but the dashboard also re-computes it at query time for accuracy.
- **Swagger:** All 9 dashboard endpoints are documented under the `Dashboard` tag at `GET /api`.
