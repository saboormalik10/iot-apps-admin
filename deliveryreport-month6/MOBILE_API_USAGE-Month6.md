# Mobile API Usage — Month 6 (NEP-LINK & MET-LINK apps)

Month 6 adds **one mobile-facing REST surface** (push-token registration) and no changes to the
existing sync/devices/files contract. Everything else this month is admin-dashboard or backend
scope. Base URL: `https://iot-apps-admin.onrender.com/v1`. Auth is the same as before — the static
mobile API key in `Authorization: Bearer obs_mob_…`.

These endpoints appear in the **📱 NEP-LINK App** and **📱 MET-LINK App** Swagger definitions
(top-right dropdown at `/api`).

---

## 1. Register a device push token

`POST /v1/notifications/token`

Call this once after the user grants notification permission (and again whenever the FCM/APNs
token rotates). Idempotent by `token`.

```jsonc
// Request body
{
  "platform": "android",          // "ios" | "android"
  "token": "fcm_or_apns_device_token",
  "appId": "com.observator.neplink",   // your bundle / package id
  "deviceModel": "Pixel 8"        // optional
}
```

```jsonc
// 201 Created
{ "data": { "_id": "…", "platform": "android", "appId": "com.observator.neplink", "expiresAt": "…" } }
```

> **Delivery today is WebSocket** (see below). The backend stores the token now so that real
> FCM/APNs push can be switched on later **without any app change** — keep sending it.

## 2. Unregister a device push token

`DELETE /v1/notifications/token` — body `{ "token": "…" }` → `204 No Content`. Call on logout /
permission revoke.

---

## What the apps do **not** need to change

- **Sync / upload / heartbeat** — unchanged. The backend now *reacts* to your existing
  `POST /v1/sync/upload` and `PATCH /v1/sync/device-status` calls:
  - a sample that breaches an alert rule → an alert notification,
  - a NEP session with an `endTimestamp` → a "session complete" notification,
  - a heartbeat reporting firmware older than the org target → a firmware notification.
  No new fields are required from the app.

---

## Optional: live notifications over WebSocket

The apps may connect to the realtime gateway to receive notifications live (same gateway used for
sensor pushes). Authenticate with a **user JWT** (the static API key is not accepted on the socket):

```js
const socket = io('https://iot-apps-admin.onrender.com', { path: '/v1/ws', auth: { token: accessToken } });
socket.on('notification:new', (n) => { /* { type, title, body, data, createdAt } */ });
socket.on('alert:triggered', (d) => { /* alert payload: ruleId, deviceId, sensor, sensorValue, threshold */ });
```

If the app has no per-user login, skip the socket — the registered push token is the path to real
push once it is enabled.
