# Month 8 — Live Dashboard & Fleet (execution record)

## Context

Month 7 delivered the `admin-web/` foundation (BFF auth, RBAC, app shell, design tokens + validated
chart palette, realtime foundation, simulator, org/people/audit/profile). Month 8 (`plan.md` §"Month 8")
adds the first **live product surfaces** — the dashboard home, the fleet map, the devices module, and the
device-settings instrument editor — plus the entire **viz/data primitive layer** (charts, maps, tables,
the Scope Bar) that `plan.md` §14 scoped for "Month 7–8" but which did not exist yet.

Built on the `Month-8` branch, continuing PR numbering (PR8–PR14). All three sizing decisions were taken
at the **fullest scope**: the settings editor is in Month 8 (not deferred), the §10.8 backend change was
done, and Devices ships full admin CRUD.

## Part A — Backend change (§10.8 summary enrichment)

`backend/src/dashboard/dashboard.service.ts` → `getSummary()` now also returns:
- **`activeAlertRules`** — `AlertRule.countDocuments({ organizationId, isActive: true })`.
- **`sparklines`** — `{ records: number[], sessions: number[] }`, the last **14 daily counts** (a
  `$group`-by-day on `createdAt`, zero-filled oldest→newest) via a new `dailyCounts()` helper.

Additive, no migration, keeps the existing 30 s cache. Swagger `@ApiOkResponse` description updated; a
new `test/dashboard.e2e-spec.ts` asserts the shape (length-14 arrays + numeric alert count).

**Verified end-to-end** against a real DB (local Docker Mongo, seeded): the running server returns
`activeAlertRules: 1` and both 14-bucket sparklines with today's counts (1 record, 3 sessions) in the last
slot — confirmed both via the jest e2e and a live `GET /v1/dashboard/summary`, and through the browser path
(`GET /api/dashboard/summary` via the BFF proxy).

## Part B — `admin-web/` (PR8–PR14)

- **PR8 — Viz & data primitives.** Added deps `recharts`, `@visx/*`, `maplibre-gl` (`.yarnrc`
  `--ignore-engines` for a Node-22 build-time transitive on Node 20). New `components/charts/`
  (`StatTile`, `Sparkline`, `TimeSeriesChart`, `WindRose` (visx polar), `Meter`, `StatusBadge`,
  `BeaufortScale`, `ChartFrame` with the shared table-view + CSV/PNG export), `components/data/`
  (`DataTable`, `ConfirmDialog`, `DeviceSelect`, `DateRangePicker`), and **`lib/api/scales.ts`**
  (mirrors `analytics.util.ts` §10.9 — 5 wind bands, 13 Beaufort, 8 comfort, 5 tendency, 3 fog, 7 NTU
  classes, interval enum; NTU/status classes map onto validated palette tokens, never backend hex).
  `check_contract_drift.js` extended to diff `scales.ts` + the new endpoints.
- **PR9 — Global Scope Bar.** `lib/hooks/use-scope.ts` (URL-synced device / type / date-range / demo,
  All-default, one-click reset) + `components/scope/scope-bar.tsx`, mounted in the shell and self-hiding
  on non-data routes. Device-scoped panels auto-select a default device via `useScopedDevice`.
- **PR10 — Dashboard home.** KPI row (summary + §10.8 sparklines + armed-alerts deep-link tile), fleet
  status table (battery meter + status badges), live MET sensor tiles + NEP live tile, the signature wind
  rose (true/relative + 10-min/2-min), 1-min MET history, and an active-alerts panel. Live wiring in
  `use-dashboard-realtime.ts` (`met:latest`, debounced `met:windrose`, `nep:sample`, `device:status`,
  `alert:triggered`).
- **PR11 — Fleet map.** `components/maps/map-canvas.tsx` (MapLibre, inline free OSM raster tiles — CSP
  updated to allow the tile host; dynamically imported to avoid SSR) + `features/maps/fleet-map-panel.tsx`
  (status-coloured markers, live `device:status`). Compact on home + dedicated `/map` route + nav entry.
- **PR12 — Devices module.** List (`DataTable` + scope filter) + detail (live status, stats/health tiles,
  firmware-history timeline) + firmware-status table. Full admin CRUD (`manageDevices`): manual Add, edit,
  soft-delete (confirm-guarded), firmware-target set. Per-device room subscription on detail.
- **PR13 — Device Settings editor.** The full instrument config (QFE/QNH, dew-point, wind-rose, display
  units, graph prefs, and the per-sensor NMEA show/log grid). **Client Zod is the sole guard** (server DTO
  unvalidated); a **warning banner + confirm-guard** gate submits because writes reach the live device;
  audited server-side. Route is admin-gated server-side.
- **PR14 — Robustness, tests, docs.** Reused the Month-7 realtime hooks (`useDeviceSubscription`,
  `useOnReconnect`, `LiveIndicator`). Added unit tests (`scales`, `scope`), component tests
  (`chart-primitives`, `dashboard-kpi` via MSW), and Playwright specs (`dashboard-devices.spec.ts`);
  updated the Month-7 journey (welcome → dashboard). This record + the delivery report.

## Coverage map — every Month-8 roadmap deliverable → where it landed

| `plan.md` Month-8 deliverable | Landed in |
|---|---|
| Global Scope Bar (All-default, URL-synced) | PR9 |
| Dashboard home + KPI tiles + sparklines + armed-alerts tile (§10.8) | Part A + PR10 |
| Live MET/NEP tiles over WebSocket | PR10 |
| Wind rose (visx) reusable primitive | PR8 + PR10 |
| MET history multi-line chart | PR8 + PR10 |
| Fleet map (MapLibre) with live status | PR11 |
| Devices list + detail + stats/health/firmware timeline | PR12 |
| Device Settings — full instrument-config editor (guard + audit) | PR13 |
| Realtime robustness (indicator, per-device subscribe, refetch-on-reconnect) | PR10/PR12/PR14 |

## Definition of Done — status
TypeScript strict ✓ · ESLint/Prettier clean ✓ · `next build` (20 routes) ✓ · 31 unit/component tests ✓ ·
palette validator (light + dark) ✓ · contract-drift (ClientEvent + scales + endpoints) ✓ · four screen
states on new surfaces ✓ · RBAC honoured (device writes gated by `manageDevices`) ✓ · Playwright specs
authored (run in CI against seeded backend + simulator).

## Verification
1. **Backend §10.8** — `npm run build` + `test/dashboard.e2e-spec.ts` green; live server + BFF both return
   `activeAlertRules` + 14-length `sparklines` (verified against seeded Docker Mongo).
2. **Frontend gates** — `yarn typecheck && yarn lint && yarn test && yarn build`, `yarn validate-palette`,
   `yarn check-contract` all green.
3. **Full-stack smoke** — logged in through the BFF and fetched `/api/dashboard/summary` (§10.8 fields) and
   `/api/devices` (2 rows + pagination) through the browser→BFF→backend path.
4. **Live/E2E** — start backend + `admin-web` + `simulator/run.mjs` (seeded `MOBILE_ORG_ID`); the CI E2E job
   runs the Playwright/axe suites (`dashboard-devices.spec.ts`, updated `auth-journey.spec.ts`).

## Manual prerequisites (not code)
- No token needed for maps (free OSM/MapLibre raster tiles; the tile host is on the CSP allow-list).
- The simulator needs the seeded `MOBILE_API_KEY`/`MOBILE_ORG_ID` (same as Month 7). No new Vercel/Render
  env beyond Month 7, except redeploying the backend so the §10.8 change is live.
