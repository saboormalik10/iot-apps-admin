# Month 8 — Delivery Report

**Project:** ObservatorNepLink Admin Panel (`admin-web`)
**Month:** 8 (Weeks 29–32)
**Theme:** Live Dashboard & Fleet — the first live product surfaces
**Frontend:** Next.js 15 admin panel (`admin-web/`, deploys to Vercel)
**Backend:** https://iot-apps-admin.onrender.com (one small additive change this month)
**Branch:** Month-8
**Prepared by:** Saboor Malik

---

## Summary

Month 8 turns the panel from "an authenticated shell" (Month 7) into the **live operations screen**. It
ships the whole **viz/data primitive layer** (charts, maps, tables, the global Scope Bar) and four live
surfaces built on it: the **dashboard home**, the **fleet map**, the **devices module**, and the **device
settings instrument editor** — all streaming over the Month-7 WebSocket foundation.

One small, additive **backend** change was required (§10.8): `/dashboard/summary` now also returns the
armed alert-rule count and last-14-day sparkline series, which back the home KPI tiles. Everything else is
frontend.

### Status

| Deliverable | Status |
|---|:--:|
| §10.8 backend: `/dashboard/summary` + `activeAlertRules` + 14-day sparklines | ✅ |
| Global Scope Bar (All-default, URL-synced, drill-down) | ✅ |
| Dashboard home + KPI tiles + sparklines + armed-alerts tile | ✅ |
| Live MET/NEP tiles over WebSocket | ✅ |
| Wind rose (visx polar) reusable primitive | ✅ |
| MET 1-min history multi-line chart | ✅ |
| Fleet map (MapLibre) with live status markers | ✅ |
| Devices module: list + detail + stats/health/firmware timeline | ✅ |
| Devices full admin CRUD (Add / edit / soft-delete / firmware-target) | ✅ |
| Device Settings — full instrument-config editor (Zod guard + confirm + audit) | ✅ |
| Realtime robustness (indicator, per-device subscribe, refetch-on-reconnect) | ✅ |

---

## What was built

### Backend (one additive change — §10.8)
`dashboard.service.ts` `getSummary()` gains `activeAlertRules` (count of armed `AlertRule`s) and
`sparklines: { records[], sessions[] }` (14 daily counts, `$group`-by-day on `createdAt`, zero-filled).
No migration, cache preserved, Swagger + a new `dashboard.e2e-spec.ts` updated. **This is the only backend
touch in Month 8** — redeploy the backend for the home KPI sparklines to light up.

### Frontend primitive layer (reused by every later month)
- **Charts** (`components/charts/`): `StatTile`, `Sparkline`, `TimeSeriesChart`, `WindRose` (visx polar),
  `Meter`, `StatusBadge`, `BeaufortScale`, and a shared `ChartFrame` (table-view toggle + CSV/PNG export —
  every chart carries a table view per the DoD).
- **Data/UI** (`components/data/`): `DataTable` (TanStack Table, server-paginated), `ConfirmDialog`,
  `DeviceSelect`, `DateRangePicker`.
- **Maps** (`components/maps/`): `MapCanvas` (MapLibre, free OSM raster tiles, no token).
- **Scales** (`lib/api/scales.ts`): the §10.9 classification scales mirrored from the backend and
  drift-checked in CI. Turbidity/status classes map onto validated palette tokens — the backend hex is
  never rendered.

### Live surfaces
- **Dashboard home** (`/`): KPI row, fleet-status table, live MET/NEP tiles, the signature wind rose
  (true/relative + 10-/2-min), 1-min history, active-alerts panel — all wired to the socket.
- **Fleet map** (`/map` + a compact home panel): status-coloured markers, live `device:status`.
- **Devices** (`/devices`, `/devices/[id]`): list/detail/stats/health/firmware-history + full admin CRUD +
  firmware-status table.
- **Device settings** (`/devices/[id]/settings`): the heaviest form; client-Zod-guarded, confirm-gated
  (writes reach the live device), audited, admin-only.

---

## Verification

- **Gates (all green):** `yarn typecheck`, `yarn lint`, `yarn test` (31 unit/component tests),
  `yarn build` (20 routes), `yarn validate-palette` (light + dark), `yarn check-contract`
  (ClientEvent + scales + endpoints).
- **Backend §10.8 end-to-end:** verified against a seeded local Mongo — the live server + the BFF proxy
  both return `activeAlertRules` and both 14-length sparklines with today's counts in the last bucket.
- **Full-stack smoke:** logged in via the BFF and fetched `/api/dashboard/summary` and `/api/devices`
  through the browser→BFF→backend path.
- **E2E:** Playwright specs (`dashboard-devices.spec.ts` + updated `auth-journey.spec.ts`) run in the CI
  E2E job against the seeded backend + simulator, with axe on the new screens.

---

## New environment / deploy notes

- **Backend:** redeploy so the §10.8 summary fields are live (no new env vars).
- **Frontend:** no new env beyond Month 7. Maps need no token (free OSM tiles); the CSP already allows the
  tile host. `admin-web/.yarnrc` sets `--ignore-engines` for a Node-22 build-time transitive of
  `maplibre-gl` on the Node-20 toolchain.

## Not in Month 8 — follow-up scope
The MET analytics suite (Month 9), NEP analytics & maps (Month 10), alerts/share/realtime polish
(Month 11), and import/export + launch hardening (Month 12) remain flagged off. The daily-summary (§10.7)
and analytics-map (§10.5) backend prerequisites are scheduled with those months.
