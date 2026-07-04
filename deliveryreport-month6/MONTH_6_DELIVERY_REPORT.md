# Month 6 — Delivery Report

**Project:** ObservatorNepLink (MET-LINK + NEP-LINK IoT Platform)
**Month:** 6 (Weeks 21–24) — the final month
**Theme:** Buffer, Extras & Post-Launch — share links, alerts/notifications, firmware
tracking, batch export/import, and CI/CD
**Backend URL:** https://iot-apps-admin.onrender.com
**Branch:** Month-6
**Prepared by:** Saboor Malik — Backend Engineer

---

## Summary

Month 6 ships the remaining backend feature set. Five new modules wire up the three
pre-scaffolded models plus two new ones, all documented in the same **audience-aware
Swagger** style established in Month 5 (no change to the Swagger machinery — new endpoints
appear automatically in the **All / 🖥️ Admin** specs, and the mobile token endpoints in the
**📱 NEP-LINK / 📱 MET-LINK** specs).

- **Public share links** — create an unauthenticated, read-only link to a NEP session or MET
  record (`/v1/public/:token`), 30-day default expiry, view counter, revoke.
- **Alert rules + auto-evaluation** — CRUD alert rules that are **evaluated on ingest**: a
  threshold breach records `triggerHistory`, respects `cooldownMinutes`, and pushes a live
  alert to the targeted users over WebSocket.
- **Notifications** — a persisted **feed** (list / mark-read) so alerts survive offline, plus
  device **push-token** registration (mobile). Delivery is WebSocket today; a `PushService`
  seam (env-gated, no-op) is ready for real FCM/APNs later with no API change.
- **Session-complete & firmware notifications** — a "session complete" notification when a NEP
  session finishes, and a firmware alert when a device reports a version older than the org's
  configured target.
- **Firmware version tracking** — per-org firmware targets (admin) + a `firmware-status`
  endpoint flagging outdated devices.
- **Batch ZIP export** — all NEP sessions for a device as a ZIP (one CSV per session + a
  `manifest.json` of photo URLs).
- **CSV import / backfill** — admin upload of historical NEP/MET CSVs (round-trips the export
  format).
- **NEP session filtering/search** — `dashboard/nep/sessions` now filters by date range, probe
  range and text search.
- **CI/CD + tests** — GitHub Actions (build + seed + test on a MongoDB service) and new e2e
  specs plus a unit test for the alert comparator.

Delivery is over the existing WebSocket layer (`RealtimeModule` / `EventEmitter2`) — **no
external FCM/APNs/OneSignal dependency** this month.

### Status

| Area | Status |
|---|---|
| Share links — `POST/GET/DELETE /v1/share` + public `GET /v1/public/:token` (30-day default, viewCount, revoke) | ✅ Done |
| Public route hardened — no JWT (same-origin SPA), `ThrottlerGuard` applied locally | ✅ Done |
| Alert rules — CRUD `/v1/alert-rules` (+ toggle `isActive`, `notifyUserIds` org-validated) | ✅ Done |
| Alert **auto-evaluation on ingest** — cooldown + `triggerHistory` + WebSocket + feed | ✅ Done |
| Notification **feed** — `GET /v1/notifications`, `PATCH /:id/read`, `POST /read-all` | ✅ Done |
| Device **push-token** register/unregister (mobile, `@Consumers`) | ✅ Done |
| **Per-user WebSocket rooms** — `notifyUserIds` targets the right people (org fallback) | ✅ Done |
| **Session-complete** notification (NEP `endTimestamp` transition) | ✅ Done |
| **Firmware tracking** — per-org target (admin) + `firmware-status` + heartbeat alert | ✅ Done |
| **Batch ZIP export** — `GET /v1/export/sessions.zip` (CSVs + `manifest.json`) | ✅ Done |
| **CSV import** — `POST /v1/import/nep`, `POST /v1/import/met` (admin, magic-byte validated) | ✅ Done |
| NEP session **filtering/search** — `from`/`to`/`probeRange`/`search` on `dashboard/nep/sessions` | ✅ Done |
| **CI/CD** — GitHub Actions (lint · build · seed · test) with a `mongo:6` service | ✅ Done |
| **Tests** — new `share` / `alert-rules` / `notifications` e2e specs + `evaluate()` unit test | ✅ Done (49/49 pass) |
| PushService (real FCM/APNs) | ⏳ Deferred — env-gated seam ready; delivery is WebSocket for now |
| `nest build` clean (exit 0, TypeScript strict) | ✅ Done |
| Lint gate | ⚠️ Non-blocking in CI — repo's `.eslintrc.json` predates ESLint v10 (pre-existing) |

Already shipped earlier (timeline lists under M6, **not** re-built): `GET /dashboard/nep/analytics`,
`GET /analytics/nep/turbidity-temperature-correlation`, `GET /analytics/nep/session-events`.

---

## What was built

### New modules (established module pattern: model → service → controller + dto → module)
- `src/share/` — `ShareController` (admin CRUD) + `PublicController` (unauthenticated, throttled) +
  `ShareService` + `PublicService` (builds the read-only snapshot directly from `NepSession` /
  `NepSampleDownsampled` / `NepFile` / `MetRecord` / `MetPicture`, since `DashboardModule` does not
  export its service).
- `src/alert-rules/` — CRUD + `AlertEvaluationService` (`@OnEvent(NEP_SAMPLE|MET_MEASURES)`) +
  pure `evaluate()` comparator. Ingest only emits the *last* reading per upload, so evaluation runs
  once per upload, not per sample.
- `src/notifications/` — feed + token CRUD + `NotificationsService.notify()` (the single delivery
  seam: persist feed → WebSocket → env-gated `PushService`) + `NotificationsEventsService`
  (`@OnEvent` session-complete & firmware).
- `src/export/` — `archiver`-streamed ZIP.
- `src/import/` — multipart CSV upload reusing the `files` upload pattern + magic-byte validation,
  routing NEP rows through the existing idempotent sync upsert.

### New models
- `src/models/Notification.ts` — feed entry (`type`, `title`, `body`, `data`, `readAt`), 90-day TTL.
- `src/models/FirmwareTarget.ts` — per-org latest firmware per device type (unique on org+type).
- `src/models/NotificationToken.ts` — `userId` relaxed to optional (mobile clients are
  API-key/anonymous; device tokens are org/device-scoped).

### Realtime
- `realtime.events.ts` / `events.gateway.ts` — added `roomForUser`, per-user room join on connect,
  `NOTIFICATION` / `ALERT_TRIGGERED` events, and the `@OnEvent(NOTIFICATION)` broadcaster.

### Ingest hooks (decoupled — sync just emits events)
- `sync.service.ts` — emits `NEP_SESSION_COMPLETED` on the `endTimestamp` null→value transition and
  `DEVICE_FIRMWARE_REPORTED` on the heartbeat.

---

## Verification

- `npm run build` → **exit 0**, TypeScript strict clean.
- `npm run seed` → creates the org/users/devices plus Month-6 demo data (an alert rule, firmware
  targets, a share link).
- `npm test` → **49/49 pass across 10 suites** (adds `share`, `alert-rules`, `notifications` e2e +
  `evaluate` unit).
- Runtime end-to-end (throwaway Mongo):
  - **Firmware:** `GET /v1/devices/firmware-status` → both seed devices flagged `outdated` vs target.
  - **Alerts:** a breaching `POST /v1/sync/upload` sample → unread notifications `0 → 2` (an
    `alert` **and** a `session_complete`), alert payload carries `sensorValue`/`threshold`.
  - **Share:** create → `GET /v1/public/:token` returns the snapshot **without a Bearer token**;
    revoke → 404.
  - **Export:** `GET /v1/export/sessions.zip` → `200 application/zip`, valid ZIP.
  - **Import:** `POST /v1/import/nep` with a CSV → `201 { inserted: 1 }`.

---

## APIs for Hassan (Admin dashboard)

| Method & path | Purpose |
|---|---|
| `POST /v1/share` | Create a public share link (`{ resourceType, resourceId, expiresAt? }`) |
| `GET /v1/share` · `DELETE /v1/share/:id` | List / revoke share links |
| `GET /v1/public/:token` | **No auth** — read-only shared session/record snapshot |
| `POST/GET/GET :id/PATCH :id/DELETE :id /v1/alert-rules` | Alert-rule CRUD (PATCH toggles `isActive`) |
| `GET /v1/notifications?unread=&page=&limit=` | Notification feed (`{ data, pagination, unreadCount }`) |
| `PATCH /v1/notifications/:id/read` · `POST /v1/notifications/read-all` | Mark read |
| `GET /v1/notifications/tokens` | Registered device tokens |
| `PUT /v1/devices/firmware-target` · `GET /v1/devices/firmware-target` | Set / list per-type firmware targets (PUT is admin) |
| `GET /v1/devices/firmware-status?type=` | Per-device firmware + `outdated` flag |
| `GET /v1/export/sessions.zip?deviceId=&from=&to=` | ZIP of session CSVs + `manifest.json` |
| `POST /v1/import/nep` · `POST /v1/import/met` | Admin CSV backfill (multipart `file` + `deviceId`) |
| `GET /v1/dashboard/nep/sessions?from=&to=&probeRange=&search=` | Now filterable/searchable |

**WebSocket (dashboard):** connect `io(host, { path: '/v1/ws', auth: { token } })`; new client events
`notification:new` (all types) and `alert:triggered` (alerts), delivered to the user's room.

---

## New environment variables

Added to `backend/.env.example` and `render.yaml` (all optional):
- `PUBLIC_SHARE_BASE_URL` — base URL used to build `/public/:token` links.
- `PUSH_ONESIGNAL_APP_ID`, `PUSH_ONESIGNAL_API_KEY` — enable real push later (WebSocket works
  without them). Firmware targets are DB-backed (no env var).

---

## Not in Month 6 — Mobile-team / follow-up scope

| Item | Where |
|---|---|
| Real FCM/APNs/OneSignal push dispatch | `PushService` seam ready; needs provider creds |
| App Store / Play Store submission, app icons, TestFlight | `met-link-mob` / `observator-nep-link-ble` |
| Probe-range display, threshold-alert UI, session filter UI (frontend) | Hassan / mobile app repos |
| ESLint v10 flat-config migration | Repo-wide follow-up (lint currently non-blocking) |
