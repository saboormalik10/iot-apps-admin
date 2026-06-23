# Month 3 — Delivery Report

**Project:** ObservatorNepLink (MET-LINK + NEP-LINK IoT Platform)
**Month:** 3 (Weeks 9–12)
**Theme:** Historical data, GPS spatial map, multi-device, export — the **graphical analytics layer**
**Backend URL:** https://iot-apps-admin.onrender.com
**Branch:** Month-2 (working branch)
**Prepared by:** Saboor Malik — Backend Engineer

---

## Summary

Month 3 turns the backend from a data store into a **data platform**. It adds a full **Analytics module** (chart-ready aggregations for both apps), **bulk CSV/JSON export**, three new dashboard endpoints, **device health + firmware history**, per-device **settings** + configurable **dashboard layouts** (the two admin-panel pages that were previously unbacked), the mobile **heartbeat** route, and a **real-time WebSocket** push layer.

After this month **every admin-panel page for Months 1→3 is fully backed** for both MET-LINK and NEP-LINK. Org/Users/Profile/Audit remain scheduled for Month 4; Share-links/Public-view + Alert-rules/Notifications remain scheduled for Month 6.

### Status

| Area | Status |
|---|---|
| Analytics module — 19 endpoints (MET 7, NEP 6, Org 2, util 1, export 2, + 1) | ✅ Done |
| Dashboard additions — `met/stats`, `nep/analytics`, `org/device-map` | ✅ Done |
| Device health + firmware-history + GET/PATCH settings | ✅ Done |
| Dashboard Layouts module (8-tile config CRUD) | ✅ Done |
| Sync heartbeat `PATCH /sync/device-status` (+ firmware detection) | ✅ Done |
| Real-time WebSocket gateway (socket.io + event-emitter) | ✅ Done |
| Targeted compound indexes (gps-density, correlation) | ✅ Done |
| Demo time-series seed (MET measures + NEP R1/R2/R3 sessions) | ✅ Done |
| Jest integration suite — **12/12 passing** | ✅ Done |
| `nest build` clean (exit 0, TypeScript strict) | ✅ Done |

---

## What was built

### New module: `src/analytics/` — base path `/v1/analytics`

All endpoints are **JWT-protected, org-scoped, 30-second cached, and return raw chart-ready JSON** (no `{ data }` envelope — same convention as the existing `/dashboard/*` endpoints). All aggregation is computed **live** from `metMeasures` / `nepSamples` (no cron dependency). Every analytics endpoint accepts `?includeDemoMode=false` (default).

**MET-LINK (7)** — `wind-rose` (16-sector polar + 5 speed bands), `multi-sensor` (up to 5 sensors on one axis), `statistics` (mean/median/stdDev/percentiles/skewness + Beaufort breakdown), `wind-gust-history`, `comfort-indices` (heat index + wind chill), `fog-risk` (dew-point spread), `pressure-tendency`.

**NEP-LINK (6)** — `turbidity-distribution` (WHO/EPA bands), `session-comparison` (offset-from-start overlay), `water-quality-summary` (WHO/EPA badge), `probe-range-breakdown` (daily R1/R2/R3), `turbidity-temperature-correlation` (Pearson r + scatter), `session-events` (turbidity spikes), `gps-density` (**spatial heatmap — the headline feature**).

**Org + util (3)** — `org/device-comparison`, `org/fleet-health`, `unit-convert`.

**Bulk export (2)** — `met/export-bulk` & `nep/export-bulk` (`format=csv|json`, `Content-Disposition: attachment`).

### Dashboard additions — `src/dashboard/`
`met/stats` (lifetime aggregates), `nep/analytics` (cross-session daily turbidity), `org/device-map` (fleet last-known GPS).

### Devices — `src/devices/`
`:id/health`, `:id/firmware-history`, `GET/PATCH :id/settings` (backs the MET Device Settings page; also mobile-facing).

### Dashboard Layouts — `src/dashboard-layouts/`
Per-user-per-device 8-tile layout CRUD + `set-default`.

### Sync heartbeat — `src/sync/`
`PATCH /sync/device-status` updates `lastSeenAt`/battery/online, detects firmware changes (appends `firmwareHistory`), and fires a real-time `device:status` event.

### Real-time — `src/realtime/`
socket.io gateway at path `/v1/ws`, JWT-authenticated on connect, with device/org rooms. Services emit decoupled domain events via `@nestjs/event-emitter`; the gateway re-broadcasts to subscribers.

---

## Verification

- `npm run build` → exit 0, TypeScript clean.
- `npm run seed` → creates org/admin/devices **plus demo time-series** (one MET record with ~3 h of measures; three NEP sessions across R1/R2/R3 with GPS tracks) so every analytics endpoint returns real data.
- `npm test` → **12/12 integration tests pass**, covering: auth + JWT, guard 401, unit-convert, MET wind-rose (16 sectors), MET statistics percentiles, NEP gps-density, NEP turbidity↔temperature correlation, MET export-bulk CSV header, org device-map, device health shape, **sync upload idempotency** (no duplicate), and **cross-org isolation** (unknown id → 404).
- WebSocket gateway verified by build + route registration + code review; live socket test requires a stable long-running server (the client snippet is below for Hassan).

> Note: all dashboard/analytics responses are **raw JSON** (chart-ready, no envelope). CRUD/device/layout/sync responses keep the `{ data: ... }` envelope from Months 1–2.

---

# APIs for Hassan (admin-panel integration)

All require `Authorization: Bearer <accessToken>`. Base URL: `https://iot-apps-admin.onrender.com/v1`.
**Analytics + dashboard responses are raw JSON** (no `{ data }` wrapper). Time params are **Unix ms**.

### Analytics — MET-LINK

| Method | Path | Key query | Returns (shape) | Powers |
|---|---|---|---|---|
| GET | `/analytics/met/wind-rose` | `deviceId, from?, to?, period?, unit?` | `{ totalSamples, sectors:[{dir,label,count,pct,avgSpeed,maxSpeed,speedBuckets[]}×16] }` | Polar wind rose |
| GET | `/analytics/met/multi-sensor` | `deviceId, sensors[], from?, to?, interval?` | `{ timestamps[], series:[{sensor,unit,values[]}] }` | Multi-line overlay |
| GET | `/analytics/met/statistics` | `deviceId, sensor, from?, to?` | `{ count,mean,median,stdDev,p10..p99,min,max,skewness, beaufortBreakdown? }` | Stats card / histogram |
| GET | `/analytics/met/wind-gust-history` | `deviceId, interval?` | `{ data:[{ts,gustMs,gustKmh,gustKnots,dirDeg}] }` | Gust chart |
| GET | `/analytics/met/comfort-indices` | `deviceId, interval?` | `{ data:[{ts,tempC,heatIndexC,windChillC,effectiveTempC,comfortLabel}] }` | Comfort cards |
| GET | `/analytics/met/fog-risk` | `deviceId, interval?` | `{ data:[{ts,tempC,dewPointC,spread,fogRisk}] }` | Fog-risk cards |
| GET | `/analytics/met/pressure-tendency` | `deviceId, hours?` | `{ current,previous,deltaHpa,deltaPerHr,tendency,label }` | Pressure widget |

### Analytics — NEP-LINK

| Method | Path | Key query | Returns | Powers |
|---|---|---|---|---|
| GET | `/analytics/nep/turbidity-distribution` | `sessionId\|deviceId, from?, to?` | `{ probeRange,totalSamples, buckets:[{label,count,pct,waterQualityClass,color}] }` | Histogram |
| GET | `/analytics/nep/session-comparison` | `sessionIds[]` (≤5) | `{ sessions:[{id,label,color,probeRange}], timeSeries:[{offsetMs,values}] }` | Multi-session overlay |
| GET | `/analytics/nep/water-quality-summary` | `sessionId` | `{ avgNtu,maxNtu,minNtu,probeRange,who,epa,isoLabel,badgeColor }` | Quality badge |
| GET | `/analytics/nep/probe-range-breakdown` | `deviceId, from?, to?` | `{ data:[{date,r1Count,r2Count,r3Count,r1Pct,r2Pct,r3Pct,totalSamples}] }` | Stacked bar |
| GET | `/analytics/nep/turbidity-temperature-correlation` | `sessionId\|deviceId` | `{ pearsonR,rSquared,trend,significance,interpretation,scatterPoints[] }` | Scatter + card |
| GET | `/analytics/nep/session-events` | `sessionId, minNtu?, eventGapMin?` | `{ events:[{eventStart,eventEnd,durationMin,peakNtu,meanNtu,gpsCentroid}] }` | Event markers |
| GET | `/analytics/nep/gps-density` | `deviceId, resolution?` | `{ resolution,cellMeters, cells:[{lat,lng,avgTurbidity,maxTurbidity,sampleCount,dominantProbeRange}] }` | **Leaflet turbidity heatmap** |

### Analytics — Org / utility / export

| Method | Path | Key query | Returns / behaviour |
|---|---|---|---|
| GET | `/analytics/org/device-comparison` | `deviceIds[], sensor, interval?` | `{ sensor,unit,series:[{deviceId,deviceName,color,values:[{ts,value}]}] }` |
| GET | `/analytics/org/fleet-health` | — | `[{deviceId,deviceName,type,isOnline,batteryPct,totalRecords,totalSessions,storageEstimateMb}]` |
| GET | `/analytics/unit-convert` | `value, fromUnit, toUnit` | `{ input,fromUnit,result,toUnit,label? }` (Beaufort label when `toUnit=Bft`) |
| GET | `/analytics/met/export-bulk` | `deviceId, from?, to?, format?` | File download (CSV/JSON), max 90 days |
| GET | `/analytics/nep/export-bulk` | `deviceId, from?, to?, format?` | File download (CSV/JSON), max 30 days |

### Dashboard additions

| Method | Path | Key query | Returns |
|---|---|---|---|
| GET | `/dashboard/met/stats` | `deviceId` | `{ totalRecords,totalMeasures,totalLoggingHours,firstRecordAt,lastRecordAt,maxWindSpeedKmh,minTempC,maxTempC,... }` |
| GET | `/dashboard/nep/analytics` | `deviceId, from?, to?` | `{ data:[{date,avgTurbidity,maxTurbidity,minTurbidity,sessionCount,totalSamples}] }` |
| GET | `/dashboard/org/device-map` | — | `[{deviceId,deviceName,type,isOnline,lastGpsLat,lastGpsLng,lastWindSpeedKmh,lastTurbidityNtu,batteryPct}]` |

### Devices (admin panel — Device Settings page, Fleet health)

| Method | Path | Returns / body |
|---|---|---|
| GET | `/devices/:id/health` | `{ data:{ isOnline,lastSeenAt,batteryPct,firmwareVersion,firmwareAgeDays,lastSyncLagSeconds,alertCount24h } }` |
| GET | `/devices/:id/firmware-history` | `{ data:{ deviceId, history:[{previousVersion,newVersion,detectedAt,detectedByAppType}] } }` |
| GET | `/devices/:id/settings` | `{ data: DeviceSettings }` |
| PATCH | `/devices/:id/settings` | body = partial settings (QNH/QFE, wind unit/period/orient, colorScheme, sensorShowPrefs…) → `{ data: DeviceSettings }` |

### Dashboard Layouts (MET 8-tile grid)

| Method | Path | Body / behaviour |
|---|---|---|
| GET | `/dashboard-layouts?deviceId=` | list current user's layouts |
| POST | `/dashboard-layouts` | `{ deviceId, name?, tiles:[{index,nmea,type,unit,desc,label}×8], isDefault? }` |
| PATCH | `/dashboard-layouts/:id` | `{ name?, tiles? }` |
| DELETE | `/dashboard-layouts/:id` | hard delete (204) |
| PATCH | `/dashboard-layouts/:id/set-default` | set default, unset siblings |

### Real-time WebSocket

**Connect:** `io('https://iot-apps-admin.onrender.com', { path: '/v1/ws', query: { token: accessToken } })`
Invalid/expired token → `unauthorized` event + disconnect.

```ts
const socket = io(API_HOST, { path: '/v1/ws', query: { token } });
socket.emit('subscribe:device', { deviceId });   // join per-device room
socket.on('met:latest',  (snapshot) => { /* live MET sensor row */ });
socket.on('nep:sample',  (s) => { /* { sessionId, timestamp, turbidityValue, ... } */ });
socket.on('device:status', (d) => { /* { deviceId, isOnline, batteryPct } */ });
socket.emit('ping');                              // keep-alive → { pong }
```

| Server → client event | Fires after |
|---|---|
| `met:latest`, `met:windrose` | `POST /records/:id/measures` or `POST /sync/upload` (met_record) |
| `nep:sample` | `POST /sessions/:id/samples` or `POST /sync/upload` (nep_session) |
| `nep:session:created` | `POST /sessions` / first upload of a session |
| `device:status`, `device:connected` | `PATCH /sync/device-status` heartbeat |

> The 30-second polling from Month 2 still works — WebSocket is an additive push layer. Subscribe per device on the live page, `unsubscribe:device` / disconnect on teardown.

---

## Not in Month 3 (scheduled later, confirmed)

| Endpoint group | Page | Scheduled |
|---|---|---|
| Org/Users/Profile + Audit-log read | `/admin/users`, `/admin/settings`, `/profile`, `/admin/audit` | **Month 4** |
| Share links + `/public/:token` | `/public/:shareToken` | **Month 6** |
| Alert rules + Notifications | alert UI / push | **Month 6** |
