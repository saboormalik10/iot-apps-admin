# Mobile App API Usage — Month 3

Month 3 is primarily the **admin dashboard** analytics/export/real-time layer (consumed by the Angular panel, built by Hassan). Only the endpoints below are **mobile-facing**.

---

## New mobile-facing endpoints

### 1. `PATCH /v1/sync/device-status` — device heartbeat ✅ NEW

Called by **both apps** on BLE connect and periodically while connected. Keeps the device's online status, battery, and firmware version fresh in the cloud (drives the dashboard's online/offline pill, battery indicators, fleet map, and firmware history).

**Auth:** `Authorization: Bearer <accessToken>`

**Body:**
```json
{
  "deviceId": "<Device ObjectId>",
  "batteryPct": 82,
  "batteryVoltage": 12.1,
  "batteryCharging": false,
  "firmwareVersion": "2.1.4",
  "appType": "MET-LINK"
}
```
All fields except `deviceId` are optional.

**Response:**
```json
{ "data": { "deviceId": "...", "lastSeenAt": "2026-06-23T...", "isOnline": true, "firmwareVersion": "2.1.4", "batteryPct": 82 } }
```

**Behaviour:**
- Sets `lastSeenAt = now`, `isOnline = true`, and updates battery fields if provided.
- If `firmwareVersion` differs from the stored value, a `firmwareHistory` entry is appended **before** the device is updated (powers the admin firmware timeline).
- Emits a real-time `device:status` (and `device:connected` if the device was previously offline) event to the dashboard.

**When to call:** on every successful BLE connect, then every ~60 s while connected (matches the spec heartbeat cadence).

---

### 2. `PATCH /v1/devices/:id/settings` — sync device settings ✅ NEW (also admin-facing)

Called by **MET-LINK** (and optionally NEP-LINK) when the user changes a setting, so preferences stay in sync across phones and are visible on the web dashboard's Device Settings page.

**Auth:** `Authorization: Bearer <accessToken>`

**Body (partial — send only changed keys):**
```json
{
  "qqEnabled": true,
  "qqGpsHeight": false,
  "qfeHeightM": 15,
  "qnhHeightM": 0,
  "dewPointEnabled": true,
  "windRoseUnit": "1",
  "windRosePeriod": "2",
  "windRoseOrient": "true",
  "colorScheme": 2,
  "unitWindSpeed": "km/h",
  "unitPressure": "hPa",
  "unitTemperature": "°C",
  "unitAltitude": "m",
  "sensorShowPrefs": [ /* EnShow array */ ],
  "sensorLogPrefs":  [ /* EnLog array */ ]
}
```

**Response:** `{ "data": { ...full DeviceSettings document... } }`

`GET /v1/devices/:id/settings` returns the current settings (creating defaults on first read).

---

## Everything else in Month 3 is admin-panel only

All `/v1/analytics/*`, the new `/v1/dashboard/*` (`met/stats`, `nep/analytics`, `org/device-map`), `/v1/dashboard-layouts/*`, `/v1/devices/:id/health`, `/v1/devices/:id/firmware-history`, and the WebSocket layer are consumed by the **Angular admin dashboard** — the mobile apps do not call them.

The mobile **upload/sync** APIs (`POST /v1/sync/upload`, `POST /v1/sessions/:id/samples`, `POST /v1/records/:id/measures`, etc.) are unchanged from Months 1–2 — refer to:
- [`deliveryreport-month1/MOBILE_API_USAGE.md`](../deliveryreport-month1/MOBILE_API_USAGE.md)
- [`deliveryreport-month2/MOBILE_API_USAGE-Month2.md`](../deliveryreport-month2/MOBILE_API_USAGE-Month2.md)

> Note: those upload endpoints now also emit real-time events to the dashboard (no mobile change required — the apps keep posting exactly as before).
