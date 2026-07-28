# IMPLEMENTATION.md — NEP-LINK Mobile ↔ Backend

**Project:** IOT-APPS-ADMIN
**Mobile app:** `observator-nep-link-ble` (React Native)
**Backend:** `backend` (NestJS + MongoDB), API prefix `/v1`
**Updated:** 2026-07-28

---

## The problem in one line

The app sends the **Bluetooth address** as `deviceId`. The backend expects the **Device `_id`**
that `POST /v1/devices` gives back. The app never calls that endpoint — so it never has the
right id, and every upload from a real probe fails.

Almost every task below follows from that one gap.

---

## How the system works today

```
NEP-LINK probe
   │  Bluetooth Classic — sends text lines:
   │    "R2,245.50,18.40"   → range, turbidity, temperature
   │    "~,stats,85,1"      → battery %, charging
   ▼
Mobile app  →  saves to local SQLite (app.db)
   │
   │  user taps the ☁ button on a session
   ▼
Backend /v1  →  MongoDB  →  Admin panel (Next.js)
```

**Important:** despite the folder name `...-ble`, the working connection is Bluetooth
**Classic (SPP)**, not BLE. `bleId` on the backend just means "the Bluetooth address".

---

## Status summary

| Area | Tasks | Status |
|---|---|---|
| Mobile — core integration | 1 – 14 | ⬜ **Not started** |
| Mobile — additional gaps (2nd review) | 21 – 23, 26 | ⬜ **Not started** |

**Scope:** this document covers only the app↔API integration — the calls the app should be
making and isn't, and the places the two sides disagree about the contract. Backend-side work
is finished and tracked separately; tasks that were purely local to the app (with no API
consequence) have been dropped. Task numbers are unchanged from the original review, so the
gaps at 15–20, 24 and 25 are expected.

⚠️ **Task 21 is urgent and easy to miss.** The backend now rejects the fake device id the app
sends for demo sessions, so demo sessions can no longer sync at all. Someone has to decide
what should happen to them — see Task 21.

---

# PART A — MOBILE APP TASKS

---

## Task 1 — Add the missing columns to the local database

**File:** `src/utils/db.js` → `createTables()`

**What we have now**
The local SQLite database cannot store several things the backend accepts:

| Table | Missing columns |
|---|---|
| `knownDevices` | `serverId` |
| `loggingSessions` | `serverDeviceId`, `endTimestamp`, `locationEnabled`, `isDemoMode` |
| `loggingSessionSamples` | `probeRange`, `batteryCharging`, `demoModeEnabled` |

**What we need**
Add these columns using the existing `columnExists()` + `ALTER TABLE` pattern already used
for `update_status`, so phones with the app installed upgrade without losing data.

**Why we need it**
This is the foundation. Tasks 2–8 all need somewhere to put their data. Nothing else can be
fixed until this is done.

---

## Task 2 — Register the device on the server when it connects

**Files:** `src/actions/DeviceActions.ts` (new function), `src/features/Devices/index.tsx`

**What we have now**
When a probe connects over Bluetooth, **no API call happens at all**. The function
`create_device()` exists in `src/api/apiService.ts` but is never called from anywhere.

**What we need**
A new action `registerDeviceOnServer(device)` that runs the moment a device connects:

1. Look in `knownDevices.serverId` for this Bluetooth address — if found, use it.
2. If not found, call `POST /v1/devices` with `{ bleId, name, type: 'NEP-LINK' }`.
3. Save the returned `_id` into `knownDevices.serverId`.

Call it from the connect-success handler in `src/features/Devices/index.tsx` (around line 868).

**Why we need it**
This is the missing exchange: **Bluetooth address in → real `deviceId` out**. Without it the
app has no valid id to send, so every upload fails. The endpoint is safe to call every time —
if the device is already registered it just returns the existing one.

---

## Task 3 — Save the session end time when logging stops

**Files:** `src/actions/LoggingActions.ts` (new function), `src/features/Devices/DeviceView.tsx`

**What we have now**
`stopLoggingHandler()` (line 529) captures a map image and shows the photo prompt, but
**never records when the session ended**. There is no end-time column and no code writing one.

**What we need**
A new action `finishLoggingSession(sessionId)` that writes `endTimestamp = Date.now()` to the
session row. Replace both `dispatch(stopLogging())` calls (lines 543 and 550) with it.

**Why we need it**
- The admin dashboard cannot show how long a session lasted.
- The backend fires its "session complete" notification only when `endTimestamp` first
  becomes non-null. Today that notification can never fire.

---

## Task 4 — Fix the timezone offset (it is a string, and becomes NaN)

**Files:** `src/features/Devices/DeviceView.tsx` (line 509), new `src/utils/time.ts`

**What we have now**
```js
const timezoneOffset = DateTime.now().toFormat('Z');   // → "+05:00" — a STRING
```
It is declared as a number, stored as text in SQLite, then converted with
`Number("+05:00")` → **`NaN`** → sent as `null`. The backend requires a number.

**What we need**
Convert `"+05:00"` to the number `5` before saving. A correct parser already exists in the
app — `parseTimezoneOffsetToHours` in `src/api/sessionSync.ts` (line 21). Move it to a new
`src/utils/time.ts` and use it.

**Why we need it**
The backend now rejects a non-number offset with a clear `400` error. Until this is fixed,
uploads will fail validation.

---

## Task 5 — Send the correct deviceId when uploading (and delete the fake one)

**File:** `src/features/LoggingSessions/IndexList.tsx` → `handleSyncPress()`, lines 139–150

**What we have now**
```js
deviceId: sessionRow.deviceId != 'demo'
  ? sessionRow.deviceId                        // ❌ a Bluetooth MAC address
  : '664a1f2e3c4d5e6f7a8b9c0f'                 // ❌ a fake id copied from Swagger docs
```
Also missing from the payload: `endTimestamp`, `locationEnabled`, `isDemoMode`.

**What we need**
- Send `sessionRow.serverDeviceId` (from Task 2).
- Show a clear error if it is missing ("Connect the probe once, then retry").
- **Delete the hard-coded `'664a1f2e3c4d5e6f7a8b9c0f'`.**
- Add the three missing fields to the payload.

**Why we need it**
- The MAC address is not a valid Mongo id → the request fails.
- The fake id is a **real, well-formed id that points at a device which does not exist**. It
  is the only reason demo uploads currently appear to work, and it writes broken records.
  The backend now rejects it with `404`.

---

## Task 6 — Save and send probe range + charging status

**Files:** `src/features/Devices/index.tsx` (line 655), `src/actions/LoggingActions.ts`,
`src/features/LoggingSessions/IndexList.tsx` (lines 121–134)

**What we have now**
The probe reports its range (`R1`/`R2`/`R3`) and charging state on **every** reading. The app
parses both (lines 616 and 683), shows them on screen — then throws them away. Neither is
saved to SQLite, so neither is uploaded.

**What we need**
- Add `probeRange` and `batteryCharging` to the sample object in `onDataReceived()`.
- Add them to the INSERT in `addDataToLoggingSession()`.
- Add them to the upload payload in `IndexList.tsx`.

**Why we need it**
The range is a **hardware setting the operator chose**. Without it the backend has to guess
the range from the turbidity number, and the guess is wrong whenever a reading falls outside
the expected band. The backend already uses the reported value when it is present — it just
needs the app to send it.

---

## Task 7 — Fix the sample timestamp shift

**File:** `src/features/Devices/index.tsx`, lines 629–632 (and the demo generator at 1041)

**What we have now**
```js
const tzOffsetMs = parseInt(tzOffsetStr) * 1000 * 60 * 60;
const dataObjTimestamp = parseInt(sampleDateObj.toFormat('x')) - tzOffsetMs;
```
`toFormat('x')` **already returns UTC milliseconds**. Subtracting the offset again shifts
every sample — by 5 hours in Pakistan.

**What we need**
```js
const dataObjTimestamp = sampleDateObj.toMillis();
```

**Why we need it**
Every chart, the 24-hour dashboard window, and any comparison between devices is currently
off by the local UTC offset.

> **Decide before shipping:** samples already uploaded are also shifted. Either backfill them
> (`timestamp += offset × 3600000` for sessions synced before the fix) or document the cutover
> date. Do not leave this undecided.

---

## Task 8 — Upload samples in chunks

**File:** `src/features/LoggingSessions/IndexList.tsx`, line 165

**What we have now**
All samples are sent in a single request.

**What we need**
Loop and send **max 5000 samples per call**.

**Why we need it**
The backend rejects more than 7200 per request. At roughly 1 sample per second, **any session
longer than about 2 hours cannot be uploaded at all** right now. Retrying is safe — the
backend ignores samples whose timestamp it already has.

---

## Task 9 — Send the device heartbeat

**File:** `src/features/Devices/index.tsx`

**What we have now**
`device_heartbeat()` exists in `src/api/apiService.ts` and is **never called**.

**What we need**
While a device is connected, call `PATCH /v1/sync/device-status` immediately on connect and
then every 60 seconds, sending `deviceId`, `batteryPct`, `batteryVoltage`, `batteryCharging`,
`appType: 'NEP-LINK'`. Clear the interval on disconnect and on unmount. Wrap in `.catch()`.

**Why we need it**
The backend marks a device online only if it was seen in the last 5 minutes. Because nothing
ever reports in, **every NEP-LINK device shows permanently Offline** in the admin panel, with
no battery and no firmware version.

Failures must be ignored silently — a heartbeat must never interrupt field logging.

---

## Task 10 — Upload the map screenshot and thumbnail

**File:** `src/features/LoggingSessions/IndexList.tsx`, after line 230

**What we have now**
Only photos are uploaded, hard-coded as `fileType: 'photo'` (line 207). Map images are
skipped on purpose (see the comment at line 173).

**What we need**
Also upload:
- the map screenshot → `fileType: 'map'`
- the session thumbnail → `fileType: 'thumbnail'`

Check the actual saved filenames against `takeMapImageCapture()` in `DeviceView.tsx` first.

**Why we need it**
The backend already accepts all three types and the admin session page has slots for them —
they currently show empty placeholders.

---

## Task 11 — Make comment edits reach the server

**File:** `src/features/LoggingSessions/IndexList.tsx`

**What we have now**
Editing a comment calls `PATCH /v1/sessions/:id`. If the session has not been uploaded yet
this returns 404, the error is caught and logged, and the comment stays only on the phone.

**What we need**
After `create_session()` succeeds during sync, also call
`update_session_comment(id, comment)`.

**Why we need it**
Guarantees the comment arrives regardless of the order the user does things in.

> **Note:** the backend now applies a changed comment on re-sync, so this is belt-and-braces.
> Still worth doing — it removes the dependency on the user re-syncing at all.

---

## Task 12 — Delete the dead API code

**Files:** delete `src/api/sessionSync.ts`; trim `src/api/apiService.ts` and `src/api/endPoints.ts`

**What we have now**
The app contains **two complete but different upload implementations**. `sessionSync.ts`
implements the one-shot `POST /v1/sync/upload` flow and is never used. These functions are
also never called: `sync_upload`, `sync_download`, `get_sync_status`, `update_device_settings`.

**What we need**
- Move `parseTimezoneOffsetToHours` to `src/utils/time.ts` **first** (Task 4 needs it).
- Delete `sessionSync.ts` and the four unused functions.
- **Keep `create_device` and `device_heartbeat`** — Tasks 2 and 9 use them.

**Why we need it**
Two upload paths for one job means the next developer cannot tell which one is real. The one
useful piece of `sessionSync.ts` is exactly the timezone parser the live path is missing.

---

## Task 13 — Use one server URL

**Files:** `src/api/endPoints.ts` (lines 3–4), `src/api/apiConfig.ts`

**What we have now**
```js
export const BASE_URL = 'https://iot-apps-admin.onrender.com/';
export const BASE_URL_PASSWORD_RESET = 'https://iot-apps-backend.vercel.app/';
```
Password reset goes to a **different deployment** than everything else.

**What we need**
Route all three password-reset endpoints through `BASE_URL`, and merge
`serverAuthForgetPasswordApi` into `serverAuthApi`.

**Why we need it**
Reset codes are written to whichever database that deployment uses. If the two deployments
point at different databases, a valid code fails verification.

> **Check first:** confirm with the backend team that both deployments share one `MONGO_URI`.
> If the split is intentional, keep it and write down why.

---

## Task 14 — Fix the TypeScript types

**File:** `src/types/types.ts`

**What we have now**
`SyncStatusResult` does not match what the server returns — it is missing
`metRecords.lastRecord`, and `deviceId` is typed `string | undefined` where the server sends
`null`. Local session interfaces have no `serverDeviceId`.

**What we need**
Update the types to match the real responses and add the new local fields.

**Why we need it**
So TypeScript catches mismatches instead of hiding them.

---

# PART C — ADDITIONAL GAPS (found in second review)

These are integration gaps between the app and the backend that are **not** caused by the
`deviceId` problem. They were missed in the first pass.

---

## Task 21 — 🔴 Decide what happens to demo sessions

**File:** `src/features/LoggingSessions/IndexList.tsx`, `src/features/Devices/DeviceView.tsx` (line 505)

**What we have now**
When no probe is connected, the app uses `deviceId = 'demo'` and the sync code swaps it for the
fake id `'664a1f2e3c4d5e6f7a8b9c0f'`. **The backend now rejects that with 404** — a well-formed
id for a device that does not exist — so **demo sessions can no longer sync at all**.

**What we need**
Pick one:
- **(a) Block it** — hide the ☁ button for demo sessions. Simplest, and probably correct.
- **(b) Support it** — register one real device named "DEMO" via `POST /v1/devices` and use its
  `_id`, sending `isDemoMode: true` so analytics can exclude it.

**Why we need it**
This is a **direct consequence of the backend change**. If nobody decides, demo sessions will
start failing with a confusing "Device not found" error. Option (a) takes ten minutes.

---

## Task 22 — 🔴 Allow a session to be re-synced

**File:** `src/features/LoggingSessions/IndexList.tsx`, lines 275–287

**What we have now**
Once `update_status = 1`, the ☁ button is replaced by a green tick with **no press handler**:
```jsx
{isSynced ? <Pressable>✓</Pressable>            // no onPress — permanently unclickable
          : <Pressable onPress={handleSyncPress}>☁</Pressable>}
```
The flag is set on first successful sync and **never reset**.

**What we need**
- Reset `update_status = 0` whenever the session changes after a sync — a new photo, an edited
  comment, or the end time being written.
- Let the user tap the tick to re-sync manually.

**Why we need it**
Today, if a user adds a photo *after* syncing, **that photo can never be uploaded** — there is
no way to trigger sync again. Re-syncing is already safe on the backend: samples are deduped by
timestamp and the session is upserted by id.

---

## Task 23 — 🟠 Deleting a session on the phone leaves it on the server

**File:** `src/actions/LoggingActions.ts` → `deleteLoggingSession()` (line 222)

**What we have now**
The function deletes the SQLite rows and the local image files. **It makes no API call.**
There is no `delete_session` helper in `apiService.ts` at all.

**What we need**
If the session was already synced (`update_status = 1`), also call `DELETE /v1/sessions/:id`.
The endpoint exists and works with the mobile user's token; it cascade-deletes the samples.

**Why we need it**
A user who deletes a bad session on the phone still sees it in the admin panel forever, with
no way to tell it was withdrawn. The two databases silently drift apart.

---

## Task 26 — 🟢 OPTIONAL — No way to restore data after reinstall

**What we have now**
If the app is reinstalled, all local sessions are gone. `GET /v1/sync/download` exists on the
backend and is never called.

**What we need**
On first launch after install, offer to pull previous sessions with
`GET /v1/sync/download?deviceId=&since=`.

**Why we need it**
Only if you want reinstall recovery. Not required for correctness — synced data is already safe
on the server and visible in the admin panel.

---

## Checked and found correct — no action needed

These were reviewed in the second pass and are working as intended:

| Area | Result |
|---|---|
| Login / signup / refresh / logout | ✅ Correct. Org comes from the server, never from the app |
| Token refresh on expiry | ✅ Correct. Interceptor catches `TOKEN_INVALID`, refreshes once, replays the request — and queues parallel requests while refreshing |
| 15-minute access token vs. long uploads | ✅ Safe. Each chunk and each image is its own request, and any one of them can trigger the refresh |
| Retry / idempotency | ✅ Correct. Session upserts by UUID, samples dedupe by timestamp — a retried upload cannot duplicate data |
| File upload (`multipart/form-data`) | ✅ Correct, including the Android `file://` prefix fix |
| Password reset flow (3 steps) | ✅ Logic correct — only the base URL is in question (Task 13) |
| Guards on every endpoint the app calls | ✅ All accept a mobile `operator` token. No permission changes needed |
| `update_device_settings` | ✅ Correctly unused — those settings are MET-LINK specific |
| Realtime WebSocket gateway | ✅ Not needed by the app. Admin-panel only |

---

# PART D — ORDER OF WORK

Do the mobile tasks in this order. Each one depends on the ones before it.

| Step | Tasks | What it achieves |
|---|---|---|
| 1 | Task 1 | Database can hold the data — nothing works before this |
| 2 | Task 2 | App gets a real `deviceId` |
| 3 | Tasks 3, 4 | Session start/stop data is captured correctly |
| 4 | Tasks 6, 7 | Sample data is captured correctly |
| 5 | Tasks 5, 8, 11, **21** | **Upload actually works** (21 stops demo sessions erroring) |
| 6 | Tasks 10, **22** | Images complete, and re-syncing is possible |
| 7 | Task 9 | Devices show Online |
| 8 | Tasks 12, 13, 14, **23** | Cleanup + delete reaches the server |
| 9 | Task **26** | Optional / product decision |

**Steps 1–5 make sync work. Step 7 makes the admin dashboard show live devices.**

Two ordering notes that are easy to trip over:
- **Task 12 must come after Task 4** — Task 4 needs the timezone parser that lives inside the
  file Task 12 deletes. Move the function out first.
- **Task 21 must ship with Task 5** — otherwise demo sessions start failing with a confusing
  "Device not found".

---

# PART E — HOW TO TEST

| # | Test | Expected result |
|---|---|---|
| 1 | Connect a probe | Appears in admin panel within 60 s, marked **Online**, battery shown |
| 2 | Log → stop → sync | Session appears with correct **start, end and duration** |
| 3 | Check the range | `probeRange` matches the R-value shown on the device |
| 4 | Run a 3-hour session | Uploads successfully (proves chunking works) |
| 5 | Airplane mode mid-sync, then retry | No duplicate samples |
| 6 | Sync the same session twice | Sample count does not change |
| 7 | Edit a comment after syncing | Comment appears in the admin panel |
| 8 | Compare sample times | Match real clock time — not shifted by 5 hours |
| 9 | Run a demo session | Flagged as demo, excluded from fleet analytics |
| 10 | Open a synced session in admin | Photos, map and thumbnail all visible |
| 11 | Let the token expire mid-sync | Refreshes and continues with no user action |
| 12 | Add a photo to an already-synced session | Can sync again; the new photo reaches the server |
| 13 | Delete a synced session on the phone | It disappears from the admin panel too |
| 14 | Sync a demo session | Behaves as decided in Task 21 — never a confusing error |
