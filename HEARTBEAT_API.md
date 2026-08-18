# Device Heartbeat — Integration Guide

**Endpoint:** `PATCH /v1/sync/device-status`
**For:** NEP-LINK and MET-LINK apps
**Why it exists:** it is the **only** thing that makes a device show **Online** in the admin panel.

---

## What it is

A small "I'm still alive" ping, sent every 60 seconds while an instrument is connected over
Bluetooth.

It is **not** part of a session or record upload. It runs on its own timer, independently, and
keeps running whether or not the user is logging anything.

```
probe connected ──► heartbeat every 60s ──► device.lastSeenAt = now
                                             │
                                             └──► admin panel shows Online + battery + firmware
```

**Without it, a device is Offline forever** — with no battery and no firmware version — no
matter how much session data you upload. Uploading data does not mark a device online.

---

## The request

```http
PATCH /v1/sync/device-status
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "deviceId": "6a69e9e51fed0bb16eed185e",
  "batteryPct": 88,
  "batteryVoltage": 3.9,
  "batteryCharging": false,
  "firmwareVersion": "2.1.0",
  "appType": "NEP-LINK"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `deviceId` | ✅ | The server `_id` from `POST /v1/devices`. **Not** the Bluetooth address |
| `batteryPct` | optional | 0–100 |
| `batteryVoltage` | optional | Volts. MET-LINK mainly |
| `batteryCharging` | optional | `true` / `false` |
| `firmwareVersion` | optional | Send it — see "Firmware history" below |
| `appType` | optional | `"NEP-LINK"` or `"MET-LINK"` |

Only `deviceId` is required. Send whatever else you have.

## The response

```json
{ "data": {
  "deviceId": "6a69e9e51fed0bb16eed185e",
  "lastSeenAt": "2026-07-30T08:21:07.936Z",
  "isOnline": true,
  "firmwareVersion": "2.1.0",
  "batteryPct": 88
}}
```

You can ignore it. Nothing in the app needs to act on it.

---

## How to wire it up

**1. Keep the latest battery in a ref**

Your app already parses this from the probe. NEP-LINK gets it from the `~,stats,85,1`
sentence — battery 85%, charging = yes. Just store it instead of discarding it:

```js
batteryRef.current = { batteryPct: batteryLevel, batteryCharging };
```

**2. On connect — send one immediately, then start a 60-second timer**

Send the first one straight away. If you wait for the timer, the device sits Offline for a
full minute after connecting and it looks broken.

```js
const startHeartbeat = (deviceId) => {
  const ping = () =>
    device_heartbeat({
      deviceId,                                  // server _id, not the MAC
      ...batteryRef.current,
      firmwareVersion: firmwareRef.current,
      appType: 'NEP-LINK',
    }).catch(() => {});                          // silent — always

  ping();                                        // immediately
  intervalRef.current = setInterval(ping, 60_000);
};
```

**3. On disconnect AND on unmount — clear the timer**

```js
const stopHeartbeat = () => {
  clearInterval(intervalRef.current);
  intervalRef.current = null;
};

useEffect(() => stopHeartbeat, []);              // cleanup on unmount
```

Miss this and you leak timers — old ones keep pinging for devices that are long gone.

---

## Three rules

**1. Always `.catch()`. Never surface an error.**
A heartbeat is disposable. No signal, server asleep, request timed out — nothing should
happen. It must never show a message, never retry aggressively, and never interrupt a logging
session. The next ping is 60 seconds away and that is soon enough.

**2. Use the server `deviceId`, not the Bluetooth address.**
Same id you use for uploads — the `_id` returned by `POST /v1/devices`. A MAC address is
rejected with `400 VALIDATION_ERROR`; a well-formed id from another organisation gets `404`.

**3. Store the interval in a ref, and always clear it.**
On disconnect, and on unmount. Both.

---

## Why 60 seconds

The server marks a device **Online if it was seen in the last 5 minutes**.

At 60-second intervals you can miss four pings in a row and still stay Online — which is what
you want on a patchy field connection. It is also cheap: one tiny request per minute.

Do not go below 30 seconds. There is no benefit and it drains battery.

---

## What the server does with it

Each heartbeat updates the device row:

- `lastSeenAt` → now  *(this is what drives Online/Offline)*
- `isOnline` → true
- `lastBatteryPct`, `lastBatteryVoltage`, `lastBatteryCharging`
- `lastSeenByUserId` → the logged-in user

It also emits a realtime event, so the admin dashboard updates **live** without a refresh.

### Firmware history

If `firmwareVersion` differs from what the server last saw, it writes a **firmware history
entry** (old version → new version, with a timestamp) and updates the device.

This is why it is worth sending on every heartbeat even though it rarely changes — it is how
the admin panel builds a firmware timeline per device, and how out-of-date firmware gets
flagged. Sending the same value repeatedly costs nothing; it only records an entry on change.

---

## Errors

| Status | Code | Cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `deviceId` is not a valid ObjectId — usually a Bluetooth address |
| 401 | `TOKEN_INVALID` | Access token expired. Refresh and let the next ping handle it |
| 404 | `NOT_FOUND` | The device does not exist in your organisation |

All of them: swallow and move on. Do not show the user anything.

---

## Testing it

1. Connect a probe
2. Within ~60 seconds the admin panel shows the device **Online** with a battery percentage
3. Disconnect and wait 5 minutes → it flips to **Offline** on its own

**No session upload needed.** That is the point — the heartbeat is independent. If a device
only goes Online after you sync a session, the heartbeat is not wired correctly.

To confirm in the database, the device row should have a recent `lastSeenAt`:

```
lastSeenAt: 2026-07-30T08:21:07.936Z    ← not null
lastBatteryPct: 88                       ← not null
isOnline: true
```

If `lastSeenAt` is `null`, no heartbeat has ever arrived.

---

## Checklist

- [ ] First ping sent **immediately** on connect, not after 60s
- [ ] Repeating every 60 seconds while connected
- [ ] `deviceId` is the server `_id`, not the Bluetooth address
- [ ] `clearInterval` on disconnect **and** on unmount
- [ ] Every call `.catch()`-wrapped — no errors ever reach the user
- [ ] `firmwareVersion` included so the firmware timeline works
- [ ] Verified: device goes Online without uploading any session
