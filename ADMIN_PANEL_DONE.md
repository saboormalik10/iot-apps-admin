# Admin Panel — What We Have Done (Months 7–9)

Simple summary of the admin panel work completed so far.

## Month 7 — Foundation
- Set up the Next.js admin panel project with the locked stack.
- Built the design system: colors, typography, chart color rules, dark/light theme.
- Built the app shell: sidebar, top bar, user menu, notifications bell.
- Built login, logout, forgot/reset password, and invite-accept screens.
- Added role-based access (admin / operator / viewer) across pages and nav.
- Added the settings and profile pages.
- Set up realtime (WebSocket) foundation with secure ticket auth.
- Added i18n (translations) and unit/date formatting basics.

## Month 8 — Live Dashboard & Fleet
- Built the dashboard home: KPI tiles with sparklines, live MET tiles, wind rose, NEP live tile.
- Built the fleet status table (online/offline, last seen, battery).
- Built the fleet map showing every device's last GPS position.
- Built the devices module: list, detail, health, settings, firmware history.
- Added the scope bar: device type, device, date range, and demo-data filters shared by all pages.
- Wired all live surfaces to realtime updates.
- Backend: enriched the summary endpoint with alert counts and sparklines (§10.8).

## Month 9 — MET Analytics, Records & Users
- Built the MET analytics suite: wind rose, multi-sensor overlay, statistics, wind gust, comfort, fog risk, pressure tendency, daily summary with completeness calendar.
- Built the records module: filterable table, record detail, measures view, CSV export.
- Backend: analytics sensor-map expansion (§10.5) and daily-summary rollups (§10.7).
- Fixed the API refetch loop (stable time windows in the scope hook).
- Added per-user mobile login/signup (removed the shared static API key).
- Saved the mobile user's id with everything the apps upload (records, sessions, files, pictures, devices).
- Added plain-word Swagger integration guides for every mobile API, including when to call refresh.
- Dashboard filters now come from the backend; KPI tiles and panels follow the selected type/device.
- Added the Users page: MET users and NEP users tabs with upload activity and devices touched.
