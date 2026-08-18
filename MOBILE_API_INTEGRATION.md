# Mobile API Integration Guide

**For:** NEP-LINK and MET-LINK app developers
**Base URL:** `https://iot-apps-admin.onrender.com`
**Full API docs:** `/api` (password-gated) · per-app specs at `/api/json/nep-link` and `/api/json/met-link`

---

## The one rule that matters

> **Never hard-code a `deviceId`.**

A device `_id` is only valid inside the organisation that owns it, and your organisation
comes from your login token. The same physical instrument has a **different `_id`** for a
different organisation.

Always register the device, save what comes back, and send that. An id copied from the docs
or from another environment will be rejected with **404 Device not found**.

---

## Step 1 — Log in

```http
POST /v1/auth/mobile/login
Content-Type: application/json

{ "email": "tech@example.com", "password": "..." }
```

**Response**

```json
{ "data": {
  "user": { "id": "...", "email": "...", "organizationId": "..." },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}}
```

Every call below needs:

```
Authorization: Bearer <accessToken>
```

**Access tokens expire in 15 minutes.** On `401 TOKEN_INVALID`, call
`POST /v1/auth/mobile/refresh` with `{ "refreshToken": "..." }`, then replay the request.
Do this in an HTTP interceptor so long uploads survive an expiry mid-transfer.

Other auth routes: `POST /v1/auth/mobile/signup`, `POST /v1/auth/mobile/logout`.

---

## Step 2 — Register the device (once per instrument)

Do this the first time the app pairs with an instrument over Bluetooth.

```http
POST /v1/devices

{ "bleId": "NEP-LINK-001", "name": "River Intake Probe", "type": "NEP-LINK" }
```

| Field | Notes |
| --- | --- |
| `bleId` | The instrument's Bluetooth address |
| `name` | Display name shown in the admin panel |
| `type` | `"NEP-LINK"` or `"MET-LINK"` |

**Response**

```json
{ "data": { "_id": "6a69e9e51fed0bb16eed185e", "bleId": "NEP-LINK-001", "type": "NEP-LINK" } }
```

**Save `data._id` locally against that Bluetooth address.** That is the `deviceId` every
upload, heartbeat and settings call needs.

- **201** = new device created
- **200** = it already existed, here it is again

Both are success. The endpoint is **idempotent on `(bleId, type)`**, so calling it on every
connect is safe and cheap — a reinstall or re-pair just works.

### Demo mode

Register `bleId: "demo"` to get the device demo data is uploaded against:

```json
{ "bleId": "demo", "name": "DEMO", "type": "NEP-LINK" }
```

Both apps send the same `bleId` — `type` keeps them separate, so each gets its own demo
device. Cache the returned `_id` **per organisation** (a different login means a different
organisation, and the old id will not work).

> Demo data is **hidden in the admin panel by default**. It appears only when the operator
> turns on **"Show demo devices"**, which shows demo data *instead of* real data — the two
> are never mixed. So a successful demo upload will look invisible until that toggle is on.
> That is expected, not a bug.

---

## Step 3 — Upload a session (NEP-LINK)

Call this when a measuring session finishes, or to sync one recorded offline.

```http
POST /v1/sessions

{
  "id": "f409f6e9-3633-4962-9632-2c9b6c8e116a",
  "deviceId": "6a69e9e51fed0bb16eed185e",
  "deviceName": "River Intake Probe",
  "startTimestamp": 1785399667936,
  "endTimestamp": 1785399680020,
  "timezoneName": "Asia/Karachi",
  "timezoneOffset": 5,
  "turbidityEnabled": true,
  "temperatureEnabled": true,
  "locationEnabled": true,
  "comment": "River sampling at intake",
  "isDemoMode": false
}
```

| Field | Requirement — these are the ones that get rejected |
| --- | --- |
| `id` | **UUID v4**, generated on the phone. It is the idempotency key |
| `deviceId` | The `_id` from Step 2. Not the Bluetooth address |
| `startTimestamp` | Unix **milliseconds**, integer |
| `timezoneOffset` | A **number, in hours** — `5`, not `"+05:00"` |
| `isDemoMode` | `true` only for demo sessions |

**Retrying is safe.** Send the same `id` again and nothing is duplicated. A re-sync also
**updates** the session: a changed `comment` is applied, and `endTimestamp` is filled in if
the first upload did not have it. Sample-derived stats are server-owned and never taken from
the payload.

---

## Step 4 — Upload the samples

```http
POST /v1/sessions/{id}/samples

{ "samples": [
  { "timestamp": 1785399668851,
    "turbidityValue": 2868.37,
    "temperatureValue": 17.9,
    "probeRange": "R2",
    "locationLat": 31.4418412,
    "locationLng": 74.2919754,
    "batteryLevel": 88,
    "batteryRawVoltage": 3.9,
    "batteryCharging": false,
    "demoModeEnabled": false }
] }
```

Only `timestamp` is required. Send everything the probe actually reports:

- **`probeRange`** — `R1` / `R2` / `R3`, exactly as the instrument reports it. This is a
  hardware setting the operator selected. If you omit it the server *guesses* from the
  turbidity value, and the guess is wrong whenever a reading falls outside the expected
  band — which silently files the session under the wrong range.
- **`locationLat` / `locationLng`** — these draw the session trail on the map **and** place
  the device on the fleet map.

**Limit: 7200 samples per call.** Over that returns `400 TOO_MANY_SAMPLES`. At ~1 sample per
second, a session longer than 2 hours **must** be split — use batches of ~5000.

**Retrying is safe.** Samples de-duplicate by `timestamp` within the session. The response
`{ "inserted": n }` tells you how many were actually new (`0` = it was all already there).

---

## Step 5 — Upload files

`multipart/form-data`, field name `file`:

```http
POST /v1/sessions/{id}/files

file:       <binary>
fileType:   photo | map | thumbnail
capturedAt: 2026-07-30T08:21:07.936Z   (optional)
```

Allowed: jpeg, png, webp, gif, csv, pdf. Upload **all three types** — the admin session page
has a slot for each, and missing ones show as empty placeholders.

---

## Step 6 — Heartbeat (independent of sessions)

This is what makes a device show **Online** in the admin panel. It has nothing to do with
sessions — it runs whenever a probe is connected.

```http
PATCH /v1/sync/device-status

{ "deviceId": "6a69e9e51fed0bb16eed185e",
  "batteryPct": 88,
  "batteryVoltage": 3.9,
  "batteryCharging": false,
  "firmwareVersion": "2.1.0",
  "appType": "NEP-LINK" }
```

**How to wire it:**

1. On connect — send one **immediately** (otherwise the device sits Offline for a minute)
2. Then every **60 seconds** while connected
3. On disconnect **and** on unmount — `clearInterval`
4. Wrap every call in `.catch(() => {})`

A heartbeat is disposable. If it fails, nothing should happen — no error, no interruption to
logging. The next one is 60 seconds away.

**The server marks a device Online if it was seen in the last 5 minutes.** No heartbeat means
Offline forever, with no battery and no firmware version, no matter how much data you upload.

---

## MET-LINK differences

Records instead of sessions.

```http
POST /v1/records
{ "deviceId": "...", "deviceName": "Weather Station Roof",
  "dateStart": "2026-05-01 14:32:00", "dateEnd": "2026-05-01 15:32:00",
  "localRecordId": 42, "comment": "", "isDemoMode": false }
```

Save the returned `_id`, then push readings:

```http
POST /v1/records/{id}/measures
{ "measures": [
  { "dataSentence": "Wind speed,Unit,Description,...,Latitude phone,Longitude phone", "timeStamp": "2026-05-01 14:32:00" },
  { "dataSentence": "12.5,m/s,relative,23.4,°C,TEMP,...,31.5204,74.3587",             "timeStamp": "2026-05-01 14:32:01" }
] }
```

Three MET-only traps:

- **The first row must be the header row**, and the **last two values of every data row are
  read as latitude,longitude** — always end the row with them.
- ⚠️ **Retrying is NOT safe.** Unlike NEP samples, measures do **not** de-duplicate. Every
  call appends, so re-sending after a timeout inserts the rows twice.
- ⚠️ **`localRecordId` is unique per ORGANISATION, not per device.** If two phones both
  number their local records from 1, phone B's record 42 is treated as a duplicate of phone
  A's and the server silently returns phone A's record. Derive the value from the device id,
  or omit the field.

---

## Timestamps

| Field | Format |
| --- | --- |
| NEP `startTimestamp`, `endTimestamp`, sample `timestamp` | Unix **milliseconds**, integer, **UTC** |
| MET `dateStart`, `dateEnd`, measure `timeStamp` | `"YYYY-MM-DD HH:mm:ss"` string |

⚠️ MET date strings are parsed with **no timezone**, so they are read in the **server's**
timezone (UTC in production). Append an offset — `2026-05-01 14:32:01+05:00` — if you are
sending phone-local time. An unparseable value does **not** error: it silently becomes the
time of upload, which puts the reading in the wrong place on every chart.

---

## Errors

Every error uses the same envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "Device not found in organisation" } }
```

| Status | Code | Usual cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Bad field — a MAC address in `deviceId`, `"+05:00"` in `timezoneOffset` |
| 400 | `TOO_MANY_SAMPLES` | More than 7200 samples in one call |
| 401 | `TOKEN_INVALID` | Access token expired — refresh and replay |
| 404 | `NOT_FOUND` | `deviceId` does not exist **in your organisation** |
| 409 | `SESSION_ID_CONFLICT` | That session UUID belongs to another organisation. Retrying will not help |

---

## Endpoint reference

| Purpose | Endpoint |
| --- | --- |
| Log in | `POST /v1/auth/mobile/login` |
| Refresh token | `POST /v1/auth/mobile/refresh` |
| Log out | `POST /v1/auth/mobile/logout` |
| Register device | `POST /v1/devices` |
| Heartbeat | `PATCH /v1/sync/device-status` |
| Create session (NEP) | `POST /v1/sessions` |
| Upload samples (NEP) | `POST /v1/sessions/{id}/samples` |
| Edit comment (NEP) | `PATCH /v1/sessions/{id}` |
| Delete session (NEP) | `DELETE /v1/sessions/{id}` |
| Upload file (NEP) | `POST /v1/sessions/{id}/files` |
| Create record (MET) | `POST /v1/records` |
| Upload measures (MET) | `POST /v1/records/{id}/measures` |
| Sync status | `GET /v1/sync/status` |
| Notification token | `POST` / `DELETE /v1/notifications/token` |

---

## Checklist before you call it done

- [ ] Device registered on connect, returned `_id` cached against the Bluetooth address
- [ ] `deviceId` sent is the server `_id` — never a Bluetooth address, never hard-coded
- [ ] `timezoneOffset` is a **number in hours**
- [ ] `probeRange` sent on every sample, straight from the instrument
- [ ] `locationLat` / `locationLng` sent whenever there is a GPS fix
- [ ] Samples split into batches of ≤ 7200
- [ ] `endTimestamp` written when logging stops
- [ ] Heartbeat every 60s while connected, cleared on disconnect, `.catch()`-wrapped
- [ ] All three file types uploaded (`photo`, `map`, `thumbnail`)
- [ ] 401 triggers a refresh + replay, not a logout
- [ ] Deleting a synced session also calls `DELETE /v1/sessions/{id}`
