# Admin Panel — 6-Month Frontend Plan (Months 7–12)

**Project:** ObservatorNepLink (MET-LINK + NEP-LINK IoT Platform)
**Deliverable:** `admin-web` — a Next.js (App Router, TypeScript) admin panel that surfaces
**every stat the mobile apps push into the backend** as a first-class, best-in-class analytics UI.
**Backend API:** `https://iot-apps-admin.onrender.com/v1` (NestJS + Mongoose, already shipped, Months 1–6)
**Frontend deploy:** Vercel · **Realtime:** WebSocket gateway at `/v1/ws`
**Prepared by:** Saboor Malik — Engineer
**Date:** 2026-07-04

---

## 0. What this is and why

The **MET-LINK** and **NEP-LINK** mobile apps are field data collectors. They stream sensor
readings, sessions, records, GPS, photos and heartbeats into the backend over `POST /v1/sync/upload`,
`PATCH /v1/sync/device-status`, and the files endpoints. Over six months the backend grew into a
**~90-endpoint API across 18 modules** — dashboards, deep analytics, fleet health, firmware tracking,
alerts, notifications, share links, import/export.

**None of that data has a face yet.** This plan builds that face: the web admin panel where an
organization's admins/operators watch their fleet live, explore the sensor analytics the API
computes, manage devices and firmware, respond to alerts, and share/export data.

> **The core deliverable is not "a CRUD panel." It is the _visualization_ of the mobile-app data.**
> The single most valuable thing this frontend does is turn the analytics endpoints into charts
> that are correct, legible, live, and accessible. Section 4 (Data-Viz Standards) and the
> per-endpoint chart mapping (Section 6) are therefore the heart of this document, not an appendix.

### The mobile → backend → admin story (one diagram)

```
 📱 MET-LINK / NEP-LINK apps         🖥️  admin-web (this plan)
        │  sync/upload                       ▲   TanStack Query (REST)
        │  device-status (heartbeat)         │   + socket.io (/v1/ws live)
        ▼                                     │
   ┌──────────────────────── NestJS backend ─┴───────────────────────┐
   │ ingest → aggregate → analytics → alerts → notifications → share  │
   │ /dashboard  /analytics  /devices  /sessions  /records  /alert-…  │
   └──────────────────────────────────────────────────────────────────┘
```

---

## 1. Locked decisions (from planning Q&A)

| # | Decision | Choice |
|---|---|---|
| 1 | Document structure | **6-month month-by-month roadmap** (Months 7–12), same delivery-report style as the backend |
| 2 | Framework | **Next.js 15 (App Router) + TypeScript** |
| 3 | UI kit | **shadcn/ui + Tailwind CSS** (owned, fully themeable components) |
| 4 | Server state | **TanStack Query** (caching, background refetch, mutation/invalidation) |
| 5 | Charts | **Recharts** for standard forms + **visx/D3** for the custom wind rose & polar/heatmap forms |
| 6 | Tables | **TanStack Table** (headless, virtualized, filter/sort/paginate) |
| 7 | Maps | **MapLibre GL JS** (open-source vector, no token/billing — trails, fleet map, heatmaps) |
| 8 | Realtime | **Headline feature from day one** — live tiles, streams, status dots, alert toasts |
| 9 | Location & deploy | **Monorepo folder `admin-web/` → Vercel** (preview deploy per PR); backend stays on Render |
| 10 | Design system | **No brand assets yet** → Month 7 defines tokens + a validated chart color system |
| 11 | Auth/session | **BFF proxy via Next route handlers** — httpOnly refresh cookie on the web origin, access token server-side |
| 12 | Quality bar | **Full pyramid** — Vitest unit + RTL component + Playwright E2E + axe a11y + chart visual regression; CI gates every PR |
| 13 | Device settings editor | **Full instrument-config editor** — writes reach the live field device (shared cloud config) → confirm-guard + audit entry |
| 14 | Live dashboard | **Fixed curated** dashboard per device type; the freeform tile-builder is *not* built (layout endpoints deferred/optional) |
| 15 | Units display | **Admin's global units toggle governs every view**; a device's own configured units appear only on its settings screen |
| 16 | Dev/demo data | Build a **device + WebSocket simulator** + seeded demo-data so dev/CI/demos are hardware-independent |
| 17 | Analytics scope | Device-based **Scope Bar** (*All devices → specific*) on **every data page**; per-operator analytics deferred (needs backend `userId` attribution) |

### Assumed defaults (stated so they can be corrected)

- The **public read-only share view** (`/v1/public/:token`) is in scope (Month 11).
- Full **RBAC gating** in the UI for `admin` / `operator` / `viewer` (Section 3.3).
- **Dark mode** + a **units toggle** (metric/imperial + Beaufort), backed by `/analytics/unit-convert`.
- **i18n scaffolded** (next-intl) but English-only strings for now.
- One user belongs to **one organization** (no cross-org switcher; org is a context, not a picker).
- The admin panel does **not** call the mobile-only endpoints (`sync/upload`, `sync/download`,
  `sync/device-status`, `notifications/token`) — it *consumes their effects*. It may read
  `GET /v1/sync/status` for a sync-health widget.

---

## 2. Repository & environments

```
iot-apps-admin/
  backend/                 # NestJS API (Render) — unchanged
  admin-web/               # ← NEW: Next.js admin panel (Vercel)
    app/                   # App Router (route groups: (auth), (dash), (public))
    app/api/               # BFF route handlers (proxy → backend, hold httpOnly cookie)
    components/            # shadcn/ui + app components
    components/charts/     # Recharts/visx chart primitives (the viz system)
    features/              # feature modules (dashboard, analytics, devices, …)
    lib/                   # api client, query hooks, socket client, rbac, units
    styles/                # tokens.css (design system), tailwind config
    test/ e2e/             # Vitest/RTL + Playwright
  met-link-mob/  observator-nep-link-ble/   # mobile apps — unchanged
```

| Env | Frontend | Backend | Notes |
|---|---|---|---|
| Local | `localhost:3000` | Render or local Nest | `.env.local` → `BACKEND_URL` |
| Preview | Vercel preview per PR | Render (prod) | Playwright + axe run against preview |
| Production | Vercel prod | Render (prod) | Sentry on both, monitored |

**CORS/auth note:** because auth is a **BFF proxy**, the browser only ever talks to the Next
origin. The backend's `CORS_ORIGIN` gets the Vercel domains; the httpOnly refresh cookie lives on
the web origin. No credentialed cross-origin calls from the browser.

---

## 3. Cross-cutting architecture (applies to every month)

### 3.1 Data layer
- **TanStack Query** for all reads: typed hooks per endpoint (`useSummary`, `useWindRose`, …),
  sensible `staleTime`, background refetch, and **query-key invalidation on realtime events**
  (a `nep:session:created` event invalidates the sessions list rather than hand-patching it).
- A single **typed API client** generated/derived from the backend Swagger (`/api`) so request/response
  types stay in lockstep with the API. Zod schemas validate responses at the boundary.
- **BFF route handlers** (`app/api/**`) attach the access token server-side and refresh transparently
  on 401 using the httpOnly cookie; the browser never sees a token.

### 3.2 Realtime layer (headline)
- One shared **socket.io client** (`/v1/ws`, JWT auth) with reconnect/backoff and a visible
  connection-status indicator.
- Hooks: `useDeviceSubscription(deviceId)` (`subscribe:device`/`unsubscribe:device`), `useOrgEvents()`.
- Event → UI map (**exact socket.io event names — verified against `realtime.events.ts`**):

  | Server event (exact name) | Consumer in the UI |
  |---|---|
  | `met:latest` | Live MET sensor tiles (all sensors) |
  | `met:windrose` (`{recordId, refresh:true}`) | Invalidate + redraw the wind rose — ⚠ fires alongside **every** `met:latest` batch, so **debounce** the redraw |
  | `nep:sample` | Live NEP turbidity/temp stream on the session view |
  | `nep:session:created` | Toast + invalidate sessions list |
  | `device:status` / `device:connected` | Online/offline dots, fleet-map markers |
  | `notification:new` | Notification bell + feed **and** query invalidation by type (see note) |
  | `alert:triggered` | Alert toast (status-colored) + feed + refetch that rule's `triggerHistory`; payload = the alert notification's `data` (`{ruleId, deviceId, sensor, sensorValue, threshold}`) |

> **The exact strings matter (this bit the first draft).** The gateway emits **`nep:session:created`** and
> **`notification:new`** — *not* `nep:session_created` / `notification`. Subscribing to the wrong string
> silently receives nothing, and there is no error. The frontend imports these from **one shared
> `ClientEvent` constants file** mirrored from the backend, never hand-typed at call sites.
>
> **Effect-bearing notifications must refetch, not just badge (the "refetch is truth" rule).** Two of the
> three notification types carry a real state change but have **no dedicated socket event** — they arrive
> only as `notification:new`, so the bell handler must also invalidate queries:
> - **`session_complete`** (`data:{sessionId, deviceId, sampleCount}`) → invalidate the **sessions list**
>   and that **session's detail** (its avg/min/max are only now final).
> - **`firmware`** (`data:{deviceId, current, target}`) → invalidate **firmware-status**, **fleet-health**,
>   and the **device detail** (the outdated flag may have just flipped).
>
> **Targeting:** notifications with `notifyUserIds` reach only those users' rooms (empty → org-wide), so the
> bell/feed shows notifications **targeted at the current user** (plus org-wide untargeted ones), not every
> org notification.

- **Correctness rule:** realtime *augments* server state; it never becomes the source of truth.
  On reconnect or a missed event, **refetch** — never trust a partial live stream for totals.

### 3.3 RBAC (roles: `admin` / `operator` / `viewer`)

A single capability matrix drives route guards, nav visibility, and disabled controls.

| Capability | viewer | operator | admin |
|---|:--:|:--:|:--:|
| View dashboards / analytics / maps | ✅ | ✅ | ✅ |
| Export CSV / ZIP, create share links | ✅ | ✅ | ✅ |
| Edit records/sessions comments, upload/delete files | — | ✅ | ✅ |
| Create/edit/toggle alert rules | — | ✅ | ✅ |
| Device CRUD, settings, firmware targets | — | — | ✅ |
| Org settings, users/invites/roles, audit log | — | — | ✅ |
| Import CSV, revoke others' share links | — | — | ✅ |

Guards enforced **both** client-side (UX) and by the fact that the backend re-checks roles
(the UI never assumes it's the only line of defense).

### 3.4 Units & i18n
- Units toggle wired to `/analytics/unit-convert` — the **same sets the mobile apps expose**: **wind**
  m/s · km/h · knots · mph (+ Beaufort), **pressure** hPa · mbar · inHg · mmHg, **temperature** °C · °F,
  **altitude** m · ft. The chosen system is a context all charts read from. The
  **admin's global toggle governs every chart and table** (for consistent cross-device comparison); a
  device's own configured units (`DeviceSettings.unit*`) surface **only on that device's settings
  screen** and never override the global display units.
- next-intl scaffold; all copy through message catalogs (English now).

### 3.5 State of every screen
Every data screen ships **four states**: loading (skeleton), empty (no data yet — common for a new
org/device), error (retry), and populated. This is a Definition-of-Done item, not a nice-to-have.

### 3.6 Global scope & filters — *All* by default, drill-down on demand
Every data page (dashboard, analytics, devices, records, sessions, maps, alerts) inherits one
persistent **Scope Bar**. It **defaults to the whole organization / entire fleet ("All")** — the admin
always lands on the aggregate first — and narrows only on demand:
- **Device** (All devices → one) and **device type** (All → MET-LINK / NEP-LINK),
- **Date range** (quick presets), **units** (§3.4), and, where the endpoint supports it, **sensor**.
- **Demo data** — an *Include demo data* toggle, **off by default** (matches the backend's
  `includeDemoMode` default, which every analytics endpoint accepts). `isDemoMode` sessions/records/
  samples are excluded from analytics unless toggled on, and are always **badged** in tables so real
  and demo data are never conflated.
- State is **URL-synced** (shareable/bookmarkable), preserved across navigation, and reset to "All"
  in one click. The Month 9 analytics filter bar is this same component, applied app-wide from Month 8.

> **Org-wide *All* vs device-scoped (important — verified against the API).** Most analytics/dashboard
> endpoints **hard-require a single `deviceId`** (`met/latest`, `met/windrose`, `met/history`, and the
> per-device analytics: wind-rose, multi-sensor, statistics, gust/comfort/fog/pressure, turbidity-
> distribution, probe-breakdown, GPS-density) or a `sessionId`. So *All* is the true default only on the
> **org-wide** surfaces — `summary` KPIs, the device table, **fleet map** (`org/device-map`), **fleet
> health**, **device comparison** (`deviceIds[]`), the records/sessions lists, and cross-session org
> trends. On device-scoped panels the Scope Bar **auto-selects a sensible default device**
> (most-recently-active / online) and the device picker is **mandatory**; choosing *All* there routes to
> the org-wide equivalent (device-comparison / fleet-health) rather than erroring. A genuine fleet-wide
> *aggregate* of a single-device chart (e.g. one wind rose across all devices) would need a backend
> change — see §17 Q12.

> **Scope is by *device*, not by user (decided).** The backend attributes data by **organization +
> device only** — sessions/records carry **no `userId`**, `syncUpload()` records no operator, and
> mobile sync uses a **shared org API key**. So the Scope Bar's "All → specific" axis is **device**.
> A per-**operator** (human-user) analytics axis is a **deferred future enhancement** gated on backend
> `userId` attribution (+ possibly per-user mobile auth) — see §16 / §17 Q10; it does not block this build.

---

## 4. Data-Viz Standards — "the best way to show these stats"

This is the differentiator. All charts follow one **design-system-agnostic method** (form → color →
validate → marks → interaction → a11y). Non-negotiables, applied everywhere:

- **Form first, color last.** Pick the chart type from the data's *job* (magnitude, identity,
  polarity, headline, change-over-time). Sometimes the answer is a **stat tile**, not a chart.
- **One axis, ever.** **No dual-axis charts.** When two measures have different scales/units
  (e.g. `met/multi-sensor`, comfort indices mixing units), use **small multiples** or a
  **normalized/indexed** common base — never two y-scales.
- **Categorical hues in fixed order, never cycled.** Color follows the *entity* (a device, a probe
  range), not its rank; a filter that drops a series must not repaint the survivors. A 9th series
  folds into "Other" or small multiples.
- **Sequential = one hue, light→dark** (turbidity heatmaps, GPS density). **Diverging = two hues +
  neutral gray midpoint** (anomaly/deviation). Never a rainbow.
- **Status colors are reserved** (good/warning/serious/critical for WHO/EPA water bands, online/offline,
  firmware status, alert severity) and always ship with **icon + label**, never color alone. The backend's
  classification scales are **richer than a 4-step status ramp** — WHO/EPA turbidity is **7 classes** and
  pressure tendency is **5 states**; the frontend maps those backend classes onto validated status/sequential
  tokens (**§10.9**) and never renders the backend's raw `NTU_CLASSES` hex.
- **Validate the palette with the script — don't eyeball it.**
  `node scripts/validate_palette.js "<hex,…>" --mode light` then `--mode dark`. CVD ΔE ≥ 12 target.
- **Every chart is interactive by default:** crosshair + tooltip on lines/areas, per-mark hover on
  bars/dots/cells, a filter row above the charts, a **table-view toggle**, and PNG/CSV export.
- **A11y pass:** legend present for ≥2 series (≤4 also direct-labeled), a table view exists, dark
  mode is *designed* (not auto-flipped), and a texture channel is available for CVD/print/forced-colors.

### Seed palette (Month 7 will re-validate against final brand surfaces)

Defined once as CSS custom properties in `styles/tokens.css`, referenced by **role** everywhere:

| Role | Light | Dark | Used for |
|---|---|---|---|
| Categorical 1–8 | `#2a78d6 #1baf7a #eda100 #008300 #4a3aa7 #e34948 #e87ba4 #eb6834` | stepped for dark surface | devices, probe ranges, sensors (fixed order) |
| Sequential (blue ramp) | `#cde2fb → #0d366b` | dark steps | turbidity heatmap, GPS density, magnitude |
| Diverging (blue↔red) | mid gray `#f0efec` | mid gray `#383835` | deviation from baseline / anomaly |
| Status good/warn/serious/critical | `#0ca30c #fab219 #ec835a #d03b3b` | same (all ≥3:1 on dark) | WHO/EPA water quality, online, firmware, alerts |
| Surfaces | `#fcfcfb` | `#1a1a19` | chart surface (what the validator checks against) |

Delivered as a **Storybook** chart library so every analytics screen composes vetted primitives.

---

## 5. Information architecture (sitemap)

```
(auth)   /login  /forgot-password  /reset-password  /accept-invite
(dash)   /                         Dashboard — live KPIs, fleet snapshot, alerts
         /devices                  Fleet list  → /devices/[id]  (detail, live, stats, health, firmware, settings)
         /analytics/met            Wind rose, multi-sensor, statistics, gust, comfort, fog, pressure
         /analytics/nep            Turbidity dist., comparison, water-quality, probe breakdown, correlation, events
         /map                      Fleet map + per-device trails + NEP GPS density heatmap
         /records                  MET records → /records/[id] (measures, CSV, photos)
         /sessions                 NEP sessions (filter/search) → /sessions/[id] (samples, trend, CSV, files)
         /alerts                   Alert rules (CRUD/toggle) + trigger history
         /notifications            Feed + push-token registry (admin)
         /share                    Share links (create/list/revoke)
         /import-export            CSV import wizard + batch ZIP export
         /org                      Org settings, users/invites/roles, audit log
         /settings                 Profile, password, theme, units
         /layouts                  (deferred) named dashboard presets — the fixed curated dashboard is the default
(public) /s/[token]                Unauthenticated read-only shared view (viewCount)
```

---

## 6. API → UI → Chart mapping (the reference table)

Every endpoint the panel consumes, the screen it lands on, and the **chosen visual form** (per the
Section 4 method). This table is the contract between backend and frontend.

### Dashboard (live overview) — `/dashboard/*`
| Endpoint | Screen | Visual form |
|---|---|---|
| `GET /dashboard/summary` (+ **§10.8** enrichment) | Home | **KPI stat-tile row** (devices, online, sessions, records, **active alert rules**) + **per-tile sparklines** — *headline numbers, not charts*. ⚠ The base endpoint returns **scalar counts only** (no alert count, no time series); the active-alert count and the sparkline series are supplied by the small **§10.8** summary enrichment. |
| `GET /dashboard/devices` | Home | **Status table**: online/offline dot (status color + icon), battery meter |
| `GET /dashboard/met/latest` | Home | **Live sensor tiles** — all available sensors (wind true/rel, temp, humidity, pressure, solar, precip, dew point, power), push via `met:latest` |
| `GET /dashboard/met/windrose` | Home | **Wind rose** — polar stacked bar, 16 sectors × 5 speed bands (visx); 10-min & 2-min |
| `GET /dashboard/met/history` | Home | **Multi-line time series** (1-min aggregated), one axis, crosshair |
| `GET /dashboard/met/stats` | Device detail | **Stat tiles** (lifetime min/max/avg) + Beaufort badge |
| `GET /dashboard/nep/sessions` | Sessions | **Filterable table** (date/device/probe/search) |
| `GET /dashboard/nep/latest` | Home | **Live session tile** + latest sample readout (`nep:sample`) |
| `GET /dashboard/nep/trend` | Session detail | **Line/area** (turbidity or temp), downsampled ≤500 pts |
| `GET /dashboard/nep/map` | Map / session | **MapLibre trail** colored by turbidity (sequential hue) |
| `GET /dashboard/nep/analytics` | Analytics NEP | **Cross-session daily turbidity trend** (line/bar) |
| `GET /dashboard/org/device-map` | Map | **MapLibre fleet map** — last-known GPS, status-colored markers, live |

### Analytics (deep dive) — `/analytics/*`
| Endpoint | Visual form | Color role |
|---|---|---|
| `GET /analytics/met/wind-rose` | Polar stacked bar (the signature chart) | sequential ordinal by speed band |
| `GET /analytics/met/multi-sensor` | Overlay ≤5 sensors — **small multiples or normalized index** (never dual-axis) | categorical per sensor |
| `GET /analytics/met/statistics` | **Distribution/box** + summary tiles + **Beaufort scale** | sequential + status |
| `GET /analytics/met/wind-gust-history` | **Line** (max per bucket), peaks direct-labeled; peak markers annotated with **gust direction** (`dirDeg` — a compass tick/arrow, not a 2nd axis) | single series |
| `GET /analytics/met/comfort-indices` | Heat-index + wind-chill (both °C → one axis OK), threshold band, **+ `comfortLabel` status badge** (comfortable→dangerous) per current point | categorical 2 + status |
| `GET /analytics/met/fog-risk` | **Area** — dew-point spread with risk-threshold band | sequential + status |
| `GET /analytics/met/pressure-tendency` | **Tendency widget** — **5-state** arrow (rising-rapidly → falling-rapidly, §10.9) + backend label + sparkline | status |
| `GET /analytics/nep/turbidity-distribution` | **Histogram** with the **7 WHO/EPA classes** (§10.9) as reference bands | status bands (7) |
| `GET /analytics/nep/session-comparison` | Multi-session **overlay** on offset-from-start axis | categorical per session |
| `GET /analytics/nep/water-quality-summary` | **Status badge tile** — the **7-tier** WHO/EPA scale (§10.9), drinking-compliant → extreme/flood | status (7) |
| `GET /analytics/nep/probe-range-breakdown` | **Stacked bar** daily by R1/R2/R3 | categorical 3 (fixed) |
| `GET /analytics/nep/turbidity-temperature-correlation` | **Scatter** + trend line + Pearson r annotation | single + status for r |
| `GET /analytics/nep/session-events` | **Annotated event timeline** on the turbidity line (spikes) | status markers |
| `GET /analytics/nep/gps-density` | **MapLibre heatmap** — grid-cell turbidity averages | sequential single hue |
| `GET /analytics/org/device-comparison` | Multi-device **overlay** for one sensor | categorical per device |
| `GET /analytics/org/fleet-health` | **Fleet-health table** (online/battery/usage/storage) with meters + status | status |
| `GET /analytics/met/daily-summary` (**§10.7**) | **Data-completeness calendar heatmap** + **prevailing-wind compass** (dir + calm %) + **Beaufort-distribution stacked bar** (daily) + per-sensor **min–max range band + mean line** (temp/pressure/humidity, small multiples) + **solar kWh/day** & **precip mm/day** bars | sequential (completeness/solar) · categorical (Beaufort bands, fixed) · status |
| `GET /analytics/nep/daily-summary` (**§10.7**) | Daily **turbidity min–max range band + mean line** + **completeness calendar heatmap** | sequential + status |
| `GET /analytics/unit-convert` | *(utility — powers the units toggle, no screen)* | — |
| `GET /analytics/{met,nep}/export-bulk` | Export menu (CSV/JSON), 90/30-day guard | — |

### Devices — `/devices/*`
Devices **auto-register on first pairing** (the mobile app calls `POST /devices`); the panel manages
them thereafter — view / edit / soft-delete, plus an optional manual **Add device**. Firmware is
**version-tracking only** (target version + outdated flag + history; no binaries hosted).
`GET /devices` (fleet list) · `POST /devices` · `GET /devices/:id` (+live) · `PATCH/DELETE :id` ·
`GET :id/stats` (stat tiles) · `GET :id/health` (health summary) · `GET :id/firmware-history`
(**version timeline**) · `GET/PATCH :id/settings` (**full instrument-config editor** — QFE/QNH heights,
wind-rose unit/period/orientation, graphical type, color scheme, page layout, device display units, and
the per-sensor **NMEA show/log prefs grid**; ⚠ writes reach the live device → confirm-guard + audit, and the
settings DTO is **unvalidated server-side** so **client Zod is the only guard** (§10.6)) ·
`PUT/GET /devices/firmware-target`
(admin) · `GET /devices/firmware-status` (**table flagging outdated firmware**, status-colored).

### Records (MET) & Sessions (NEP)
Tables + detail — each **mirrors (and betters) the corresponding mobile detail screen**.
- **MET record detail** (mobile `details-log`): a **multi-series time chart with a column picker** across
  the full measure set — Wind speed, Wind direction (**true/relative** toggle), Pressure, **Current**,
  Voltage, Humidity, Temperature, GPS height, **QFE**, **QNH**, Dew point — plus a **GPS-fix-quality**
  sub-panel (satellites / HDOP / quality / geoid), a **power** sub-panel (voltage / battery-voltage /
  current), a **GPS track map** (hardware + phone GPS), and a **raw NMEA (`dataSentence`) inspector**.
- **NEP session detail** (mobile `LoggingSessionView`): turbidity/temperature **line chart with a series
  toggle** (turbidity blue / temperature orange), **min/avg/max cards** (the session carries
  `turbidity{Avg,Min,Max}` and `temperature{Avg,Min,Max}`, not just the average), **battery-over-session**, and the GPS trail.
- Both: `GET :id/measures` / `:id/samples` (paginated → **virtualized table**), `GET :id/export.csv`,
  and photo/file **galleries** (`records/:id/pictures`, `sessions/:id/files`) with upload/delete.

### Alerts / Notifications / Share / Import-Export / Org
- **Alerts:** `GET/POST/PATCH/DELETE /alert-rules` → table + **rule builder**. A rule is scoped to
  **one device + one sensor**: `appType` (MET/NEP), `sensor`, `condition` (`gt`/`lt`/`gte`/`lte` →
  "> ≥ < ≤"), `threshold` + `unit`, `cooldownMinutes` (default 60), `notifyUserIds` (org-member
  multiselect), `isActive` toggle. Detail drawer shows **`triggerHistory`** (triggeredAt, sensorValue,
  notifiedCount) + `lastTriggeredAt`. Bulk-create helper fans one rule across several devices.
- **Notifications:** `GET /notifications` feed — **3 types** (`alert`, `session_complete`, `firmware`),
  each with its own icon/severity color and a **deep-link** derived from `data` → device/rule, session,
  or firmware view; `PATCH :id/read`, `POST read-all`, live bell. The feed response returns
  **`unreadCount`** (and supports `?unread=true`) → drives the **bell badge** directly. Feed is a rolling
  **90-day window** (server TTL) — surface that, don't imply infinite history. `GET /notifications/tokens` = admin push-token registry.
- **Share:** `POST/GET/DELETE /share` — shareable resources are **only** a `nepSession` or a `metRecord`
  (not dashboards/devices/analytics); expiry is **optional** (`expiresAt` nullable = no-expiry), with
  `viewCount` + revoke. Public `GET /public/:token` renders that one resource read-only, honoring expiry/revocation.
- **Import/Export:** `POST /import/{nep,met}` is **`multipart/form-data`** (`file` + `deviceId`), **not JSON**
  — the BFF route must stream multipart through. Fixed CSV headers (verified): **NEP** =
  `SessionId,Timestamp,Turbidity_NTU,Temperature_C,ProbeRange,Lat,Lng,Battery_%` (required **SessionId +
  Timestamp**; idempotent per `SessionId`, groups rows → sessions); **MET** = `Timestamp,Temp_C,Humidity_%,
  Pressure_hPa,WindSpeed_ms,WindSpeed_kmh,WindDir_deg,DewPoint_C,Precip_mm,Solar_Wm2,Voltage_V,Lat,Lng`
  (required **Timestamp**; one MetRecord per file). Both return **`{ inserted, upserted, skipped, errors[] }`**
  (errors capped ~50, `Row N: …`) → the wizard's result report. ⚠ **There is no server dry-run** — an import
  always commits (idempotent upsert). So the wizard's "dry-run" is **client-side**: parse + validate the CSV
  in the browser and preview row/error counts against the headers above, then submit. These import headers
  are exactly the **export** headers, so export→import **round-trips**. Export side: `GET /export/sessions.zip`
  (batch) + per-record/session `export.csv` + `analytics/{met,nep}/export-bulk` (CSV/JSON).
- **Org/RBAC/Audit:** `GET/PATCH /organizations/me`, users invite/role, `GET /audit`, `GET/PATCH
  /users/me`, `POST /organizations/accept-invite`, auth flows. The **audit log is comprehensive** — the
  backend already writes `AuditLog` entries on device CRUD/settings/firmware, alert-rule, share, user,
  org, auth, export, and record/session mutations — so the audit view is a real activity feed, and the
  device-settings "affects live device" action (decision #13) is audited server-side out of the box.
  **`GET /audit` supports server-side filters** (verified): `action` (create/update/delete/invite/revoke/
  export/login/logout), `resourceType` (device/user/session/record/alertRule/shareToken/org/settings),
  `userId`, `from`/`to`, `page`/`limit` → the audit screen ships a **filter bar** over those, not a flat
  list. Each entry carries a **`changes` before/after diff** plus **`ipAddress` / `userAgent`**, so rows
  expand into a **change-diff detail drawer** (what field went from X→Y, by whom, from where) — the
  "affects live device" settings edits (#13) are the highlight case.

### 6.1 Mobile-app → admin parity (the two apps are the source of truth for *what* to visualize)

Derived by reading `met-link-mob/` (Ionic/Angular, chart.js, NMEA) and `observator-nep-link-ble/`
(React Native, gifted-charts, react-native-maps). Every field screen has an admin home; nothing the
field user sees is dropped, and the admin adds a layer of cross-session/fleet analytics on top.

| Mobile screen | What the operator sees | Admin equivalent |
|---|---|---|
| MET `live-data/dashboard` (rose **or** graph, layouts, color schemes) | live NMEA tiles + wind rose / line graph | Dashboard live tiles + **wind rose** (true/rel) + MET history |
| MET `live-data/all-data` | every live sensor value | **Live sensor tiles — all sensors** |
| MET `live-data/location` (Google Maps) | live GPS | Fleet map + record **GPS track** (MapLibre) |
| MET `details-log` (chart.js, **11 series**) | record chart + column picker | **MET record detail** multi-series column-picker chart |
| MET `details-pictures` / `view-record` | record photos + summary | Record **photo gallery** + detail header/stats |
| MET `configuration` (QNH/QFE, wind-rose, layout, color) | device config | **Device Settings full editor** (decision #13) |
| MET `change-units` | wind/pressure/temp/altitude units | **Global units toggle** (§3.4) + device settings |
| MET `terminal` | raw NMEA stream | **Raw NMEA (`dataSentence`) inspector** on record detail |
| MET `dir-browser` | on-device log files | Exports (per-record CSV, batch ZIP) |
| NEP `LoggingSessionView` + `SessionLineChart` | session detail + turbidity/temp line (toggle) | **NEP session detail** — line chart w/ series toggle |
| NEP `DataAverages` (NTU / °C cards) | averages | Session **average cards** |
| NEP `ImageCarousel` / `Comment` | session photos + comment | Session **file gallery** + comment edit |
| NEP `Devices` + map (react-native-maps) | device list + GPS trail | Devices module + **GPS trail** (MapLibre) |

**Admin-only value-adds** (not in the apps — powered by the backend's analytics layer): WHO/EPA
**water-quality badge**, turbidity **distribution histogram**, **probe-range breakdown**,
**turbidity↔temp correlation**, **session events**, **GPS density heatmap**, comfort/fog/pressure-tendency,
**fleet health**, **device comparison**, alerts + notifications, share links, import/export, firmware tracking, audit.

> **Demo-mode parity:** both apps flag demo captures (`isDemoMode` / `demoModeEnabled`). The admin honors
> the backend's `includeDemoMode` default (**exclude**), exposes it as the Scope Bar toggle (§3.6), and
> **badges** demo rows — so a demo session never silently skews fleet analytics.

---

## 7. The 6-month roadmap

Each month ships a coherent, demoable slice with tests and a Vercel deploy. Realtime plumbing lands
in Month 7 so live features can appear from Month 8 onward.

### Month 7 — Foundation, Design System & Auth
**Theme:** stand up the app, the design/viz system, auth, RBAC, and the realtime + org/user base.

- **Scaffold:** Next.js 15 App Router + TS in `admin-web/`; Tailwind + shadcn/ui; TanStack Query +
  Table; ESLint/Prettier; Vitest + RTL + Playwright + axe; **Vercel** project with preview-per-PR;
  GitHub Actions CI gating typecheck/lint/test/build.
- **Design system:** `tokens.css` (light/dark), typography, spacing, logo placeholder; **chart color
  system** (categorical/sequential/diverging/status) **validated with the script**; Storybook baseline.
- **Auth (BFF):** route-handler proxy; login, logout, refresh (silent), forgot/reset password,
  accept-invite; session context; protected `(dash)` layout; **RBAC capability matrix** + route/element guards.
- **App shell:** responsive sidebar + topbar, org context, user menu, theme toggle, units toggle,
  notification-bell shell.
- **Realtime foundation:** socket.io client (JWT via the WS-ticket route — needs the **§11.1** backend
  endpoint; reconnect/backoff, status indicator); subscribe hooks; **bell wired live** to
  `notification:new`/`alert:triggered` — the feed's **`unreadCount`** drives the badge (first live feature).
- **Simulator & demo data:** a device/WebSocket **simulator** emitting `met:latest` / `nep:sample` /
  `device:status` / `alert:triggered`, plus a seeded demo org + devices — so realtime and every stat
  view can be built, tested (CI), and demoed **without hardware**.
- **Org & people:** org settings, users table, invite, role/active edit, profile + password, audit log.

| Deliverable | Status |
|---|:--:|
| App scaffold + CI + Vercel preview deploys | ⬜ |
| Design tokens + validated chart palette + Storybook | ⬜ |
| BFF auth (login/refresh/logout/reset/accept-invite) + RBAC guards | ⬜ |
| App shell (nav, theme, units, bell) | ⬜ |
| Socket client (BFF ticket) + live notification bell | ⬜ |
| Device/WebSocket simulator + seeded demo-data | ⬜ |
| Org / users / invites / roles / audit / profile | ⬜ |

### Month 8 — Live Dashboard & Fleet
**Theme:** the home screen and devices, live.

- **Global Scope Bar (§3.6):** the app-wide filter row — defaults to **All devices / whole org**, drills
  to device / device-type / date range / units, URL-synced. Shipped here and inherited by every later page.
- **Dashboard home:** KPI stat-tile row (`/dashboard/summary` **+ §10.8 enrichment** → per-tile
  sparklines + **active alert-rules** tile); device online table; active-alerts panel.
- **Live tiles:** MET latest (**all sensors** — wind true/rel, temp, humidity, pressure, solar, precip,
  dew point, power/voltage) + NEP latest streaming via `met:latest` / `nep:sample` / `device:status`.
- **Signature wind rose** (`/dashboard/met/windrose`, 10-min & 2-min) as a reusable **visx polar**
  component — with a **true/relative orientation** toggle and period selection (mirrors the device's
  `windRoseOrient` / `windRosePeriod`).
- **MET 1-min history** multi-line chart.
- **Fleet map** (`/dashboard/org/device-map`) in MapLibre — status-colored markers, live `device:status`.
- **Devices module:** list, detail + live status, stats tiles, health summary, **firmware-history timeline**
  (devices **auto-register on first pairing**; panel = view/edit/soft-delete + optional manual Add).
- **Device Settings — full instrument-config editor** (`GET/PATCH :id/settings`): QFE/QNH heights,
  dew-point, wind-rose unit/period/orientation, graphical type, color scheme, page layout, device
  display units, and the **per-sensor NMEA show/log prefs grid**. The heaviest single form in the app;
  **writes reach the live field device** (shared cloud config), so it ships with a confirm-guard + an
  audit-log entry. *May flex to early Month 9 if M8 runs tight.*
- **Realtime robustness:** connection indicator, per-device subscribe on detail, refetch-on-reconnect.

| Deliverable | Status |
|---|:--:|
| Global Scope Bar (All-default + drill-down, URL-synced) | ⬜ |
| Dashboard home + KPI tiles + sparklines + active-alert tile (§10.8 enrichment) | ⬜ |
| Live MET/NEP tiles over WebSocket | ⬜ |
| Wind rose (visx) reusable primitive | ⬜ |
| MET history multi-line chart | ⬜ |
| Fleet map (MapLibre) with live status | ⬜ |
| Devices list + detail + stats/health/firmware timeline | ⬜ |
| Device Settings — full instrument-config editor (guard + audit) | ⬜ |

### Month 9 — MET Analytics Suite
**Theme:** the MET deep-dive analytics and MET records.

- **Analytics shell** built on the global **Scope Bar** (§3.6) — same *All*-default + drill-down
  (device / device-type / date range / sensor / units).
- Charts: **wind rose (rich)**, **multi-sensor** (small-multiples / normalized — *no dual axis*),
  **statistics** (distribution + Beaufort), **wind-gust-history** (peak markers + gust direction),
  **comfort-indices** (+ comfort-label badge), **fog-risk**, **pressure-tendency** widget.
- **MET daily-summary suite** (`/analytics/met/daily-summary` — **§10.7** backend prereq): **data-completeness
  calendar heatmap**, **prevailing-wind compass** + calm-% meter, **Beaufort-distribution stacked bar**,
  per-sensor **min–max range bands + mean** (small multiples), **solar-kWh/day** & **precip-mm/day** bars.
- **Records (MET) module:** table + **detail = multi-series column-picker chart** over the full measure
  set (incl. **Current, QFE/QNH, GPS height, true/relative wind, dew point**) + **GPS-quality** & **power**
  sub-panels + **GPS track map** + **raw-NMEA inspector**; paginated measures (virtualized); CSV export; **photo gallery**.
- **Chart interaction layer:** crosshair tooltips, hover, direct labels, **table-view toggle**,
  PNG/CSV export; `met/export-bulk` menu.

| Deliverable | Status |
|---|:--:|
| Analytics shell + filter bar + units integration | ⬜ |
| 7 MET analytics charts (per Section 6) | ⬜ |
| MET daily-summary suite (completeness calendar, prevailing-wind, Beaufort dist., min–max bands, solar/precip) — §10.7 prereq | ⬜ |
| Aggregate sensor picker 12→15 (+QNH/QFE/GPS-alt via §10.5 backend prereq) | ⬜ |
| Records module (table/detail/measures/CSV/photos) | ⬜ |
| Shared chart interaction + export + table-view | ⬜ |

### Month 10 — NEP Analytics & Maps
**Theme:** the NEP deep-dive, GPS/heatmaps, and NEP sessions.

- **NEP analytics:** turbidity-distribution histogram (WHO/EPA bands), session-comparison overlay,
  **water-quality badge**, probe-range-breakdown stacked bar, **turbidity↔temp correlation scatter**
  (+Pearson r), session-events timeline; cross-session daily trend.
- **NEP daily-summary** (`/analytics/nep/daily-summary` — **§10.7** backend prereq): daily **turbidity
  min–max range bands + mean line** + **data-completeness calendar heatmap**.
- **Maps:** **GPS density heatmap** (MapLibre sequential) + per-session GPS trail colored by turbidity.
- **Sessions (NEP) module:** filterable table (date/device/probe/search); **detail = turbidity/temperature
  line chart w/ series toggle** + **average cards** (avg NTU / avg °C) + **battery-over-session** + GPS
  trail; paginated samples (virtualized); CSV export; **file gallery**; `nep/export-bulk`.
- **Org rollups:** device-comparison overlay + **fleet-health dashboard** (table with meters/status).

| Deliverable | Status |
|---|:--:|
| 6 NEP analytics charts (per Section 6) | ✅ |
| NEP daily-summary (turbidity min–max bands + completeness calendar) — §10.7 prereq | ✅ |
| GPS density heatmap + turbidity-colored trails | ✅ |
| Sessions module (table/detail/samples/CSV/files) | ✅ |
| Org device-comparison + fleet-health dashboard | ✅ |

### Month 11 — Alerts, Notifications, Share & Realtime Polish
**Theme:** close the alert→notify→share loop; harden live.

- **Alert rules:** CRUD table + **rule builder** (per device + sensor; `gt/lt/gte/lte` + threshold/unit;
  cooldown; notify-users), toggle `isActive`, **trigger-history** drawer.
- **Notifications:** full feed page (filters, mark read/read-all), bell finalized, push-token
  registry table (admin). **`alert:triggered` → status-colored toast** + feed + rule history reconcile.
- **Share:** create (session/record, expiry), list, revoke table; **public read-only view**
  (`/s/[token]`) — curated **static-snapshot** dashboard + view counter, unauthenticated, `noindex`.
- **Dashboard presets (deferred/optional):** the admin ships a **fixed curated** live dashboard per
  device type (built in M8), so a freeform tile-builder is *not* built. If time allows, the
  `dashboard-layouts` endpoints back **1–2 saved named presets** (load / set-default) — otherwise deferred.
- **Realtime hardening:** backoff, missed-event catch-up via refetch, across all live surfaces.

| Deliverable | Status |
|---|:--:|
| Alert rules CRUD + rule builder + trigger history | ✅ |
| Notifications feed + live toasts + token registry | ✅ |
| Share links + public read-only view | ✅ |
| Dashboard presets (optional; fixed curated is the default) | ✅ |
| Realtime hardening pass | ✅ |

### Month 12 — Import/Export, Hardening, A11y & Launch
**Theme:** finish the data lifecycle, make it bulletproof, ship it.

- **Import wizard:** **multipart** CSV upload (`import/nep`, `import/met`; `file` + `deviceId`) with
  **client-side** validation + a **client-side dry-run preview** (no server dry-run exists) against the fixed
  NEP/MET headers (§6), progress, and a `{inserted,upserted,skipped,errors[]}` result report. **Batch ZIP
  export** (`export/sessions.zip`) + consolidated CSV export UX.
- **Accessibility:** axe-clean, keyboard/focus, reduced-motion, **chart texture channel** for
  CVD/print/forced-colors; finalize i18n extraction; empty/loading/error states everywhere.
- **Performance:** code-split, virtualization, query prefetch/caching, chart perf, Lighthouse budget.
- **Quality:** finalize **chart visual-regression** suite + **E2E across critical journeys**; docs + runbook.
- **Launch:** production Vercel, Sentry monitoring, handover, and a **Month-12 delivery report**
  mirroring the backend delivery-report format.

| Deliverable | Status |
|---|:--:|
| Import wizard (validate/dry-run/report) + ZIP export | ✅ |
| Full a11y pass (axe, keyboard, texture channel) | ✅ |
| Performance + Lighthouse budget met | ✅ ¹ |
| Visual-regression + E2E journeys green in CI | ⚠ ² |
| Production launch + monitoring + delivery report | ✅ ³ |
| Global command palette + search (§13) | ✅ |

¹ Enforced on the *authenticated* routes. One documented carve-out: dashboard CLS is a `warn` (0.12 vs 0.1)
  — cause measured and follow-up written up in `admin-web/LIGHTHOUSE.md`.
² **E2E journeys green (11/11, incl. axe)**. **Visual regression not delivered** — the Storybook build is
  broken on the current dependency set (`@storybook/nextjs` + webpack 5.108); pre-existing and latent, since
  CI never built Storybook. Follow-up: move Storybook to the Vite builder. See the Month-12 delivery report.
³ Deploy-ready + runbook (§17 scope); the production `vercel --prod` is an account-owner action.

**Two corrective backend changes** were required this month — both pre-existing production bugs that made
MET CSV import unusable, found by driving the real endpoints against Atlas: the export→import timestamp
round-trip silently restamped every row to `Date.now()` *and reported success*; and a `unique + sparse`
index on `MetRecord` allowed only one null-`localRecordId` record per org, so every MET import after the
first died with `E11000`. Both fixed, migrated (`npm run migrate:metrecord-index`), regression-tested and
verified live. Details in `deliveryreport-month12/MONTH_12_DELIVERY_REPORT.md`.

---

## 8. Definition of Done (every month)

A month is "done" only when: TypeScript strict passes; ESLint/Prettier clean; **unit + component +
Playwright E2E** for the month's surfaces are green in CI; **axe** shows no critical violations on new
screens; charts have a **table-view** and pass the **palette validator**; all four screen states
(loading/empty/error/populated) exist; the Vercel preview is demoable; and the RBAC matrix is honored.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Realtime complexity leaks bugs into every screen | Realtime *augments* server state; refetch is truth. Centralize in hooks; test reconnect paths. |
| Chart quality drifts to "eyeball it" | The dataviz method + **script validator in CI**; Storybook + visual regression lock the look. |
| Dual-axis temptation on multi-sensor/comfort views | Enforced rule: small multiples / normalized index only. Reviewed in code review. |
| API/type drift as backend evolves | Types derived from Swagger + Zod boundary validation; contract table (Section 6) is the source of truth. |
| Map/token/billing surprises | MapLibre + free tiles (no token); self-host style if needed. |
| Big-payload analytics (history/samples) | Backend already downsamples (≤500/≤300 pts); virtualize tables; prefetch + cache. |
| Scope creep in a fixed 6-month window | Month DoD + status tables gate each month; layouts/import are late so they can flex. |

---

## 10. Engineering conventions (the data contract)

The first draft said "paginated" and "timestamps" loosely. Grounded in the actual models, here are
the binding conventions every feature must follow.

### 10.1 Time & timezones
- Sensor payloads carry **epoch-milliseconds as plain numbers**: `MetMeasure.timestampMs`,
  `MetRecord.dateStartMs` / `dateEndMs`, `NepSample.timestamp`, session `startTimestamp` /
  `endTimestamp`. Metadata carries ISO **Dates** (`createdAt` / `updatedAt`, `syncedAt`,
  `expiresAt`). **Never mix the two** — one `lib/time.ts` layer converts both to a common instant.
- **Timezone policy:** compute/compare in UTC ms; **display in the viewer's local timezone by
  default**, with a per-view toggle for **UTC** and **device-local** (field data is often read against
  the site's clock). The active zone is a context every axis, tick, and table cell reads from.
- Charts label the zone explicitly (e.g. `14:20 (UTC+2)`); CSV/PNG exports embed the zone used.

### 10.2 Missing / null sensor values (a correctness rule, not a style choice)
- Almost every sensor field is `default: null` (`turbidityValue`, `temperatureValue`, `windSpeedMs`,
  `tempC`, `pressureHpa`, `batteryLevel`, GPS lat/lng…). A `null` means **no reading**, not zero.
- Time-series render nulls as **gaps** (broken line / no marker), **never interpolated through and
  never plotted as 0**. Tables show `—`. Aggregates state their coverage ("312/360 samples").
- Map layers **drop** points with null lat/lng rather than plotting `(0,0)` in the Gulf of Guinea.

### 10.3 Pagination & data fetching
- List endpoints are **offset-based `?page=&limit=`** (share, alert-rules, devices,
  dashboard/nep/sessions, sessions, records, notifications, audit, measures, samples). One
  `usePaginatedQuery` hook owns page state, keeps previous page while fetching, and prefetches next.
- **Tables** use server pagination (page controls); **long detail streams** (measures/samples) use
  virtualized infinite scroll over the same `page`/`limit`. Never fetch-all.
- Downsampled analytics (`nep/trend` ≤500, `nep/map` ≤300) are consumed as-is — no client re-sampling.
- **Envelopes are inconsistent across the API (verified) — normalize once at the client.** Two shapes
  ship today: `{ data, meta: { page, limit, total, `**`pages`**` } }` (records, sessions, devices) and
  `{ …, pagination: { page, limit, total, `**`totalPages`**` } }` (alert-rules, audit, notifications),
  plus extras (`meta.downsampled` / `originalCount` on samples; `meta.outdated` on firmware-status).
  The typed api client applies **one response adapter** that maps every list into a single internal
  `{ rows, page, limit, total, pageCount }` — so `usePaginatedQuery` and `DataTable` never see the
  divergence. **Frontend-only** (no backend change); a future backend normalization is optional, not required.
- **Errors are consistent:** every failure is `{ error: { code, message } }` (HTTP + service-layer).
  The client maps `error.code` → toast/inline copy and `HTTP_401` → silent refresh (§3.1). Validation
  errors are the one exception — see §10.6.

### 10.4 Units, rounding, sensors, enums
- All physical values flow through the **units context** (`/analytics/unit-convert`): wind
  m/s·km/h·knots·mph·Beaufort, pressure hPa·mbar·inHg·mmHg, temp °C·°F, altitude m·ft. Per-sensor
  significant figures are fixed in one `format.ts` (e.g. turbidity 1 dp NTU, pressure 1 dp hPa, temp 1 dp).
- **Two MET sensor tiers — with two *different* backend maps (my earlier draft conflated them):**
  - **Aggregate-analytics sensors** — `MET_SENSOR_FIELD` in `analytics.util.ts`, **12 keys today**: the
    dashboard's 9 (`wind_speed, wind_dir, temperature, humidity, pressure, solar, precipitation,
    dew_point, voltage`) **+ `precip_rate`, `battery_voltage`, `current`**. These are the **only** keys
    the aggregate endpoints accept (multi-sensor ≤5, statistics, device-comparison, gust, comfort) — an
    unknown key returns `Unknown sensor`. **After the §10.5 enhancement → 15** (adds `qnh`, `qfe`,
    `gps_altitude`). *(Aside: dashboard `met/history` & `met/stats` use a separate 9-key
    `SENSOR_FIELD_MAP` in `dashboard.service.ts`.)* **NEP:** `turbidity`, `temperature`.
  - **Full per-measure fields — ~25** (`records/:id/measures` + CSV, returned unprojected): everything
    above **plus** GPS quality (`gpsSatellites`, `gpsHorDilution`, `gpsGeoidalSepM`, `gpsQuality`),
    true/relative wind (`windSpeed{True,Rel}Ms`, `windDir{Rel}Deg`), `phoneLat/Lng`, and the raw
    `dataSentence`. All **chartable at record detail** client-side (mirroring the mobile `details-log`
    11-series graph).
- Shared enum maps: probe range `R1/R2/R3`; roles `admin/operator/viewer`; platform `ios/android`;
  firmware status `current/outdated/unknown`; alert `condition` `gt/lt/gte/lte`; notification `type`
  `alert/session_complete/firmware`; share `resourceType` `nepSession/metRecord`. Defined once, imported everywhere.

### 10.5 Backend prerequisite — expand the aggregate analytics sensor map (small, additive)

**Decision (resolves §17 Q11): yes** — make **QNH, QFE, and GPS-altitude** comparable across
devices/sessions, not just chartable per-record. (`current` needs nothing — it is already in the map.)
The change is tiny, additive, and needs **no migration**: the fields already exist on `MetMeasure` and
are populated by sync.

**One file — `backend/src/analytics/analytics.util.ts`** — add three keys to each map:

```ts
// MET_SENSOR_FIELD                     // MET_SENSOR_UNIT
qnh:          'qnhHpa',                 qnh:          'hPa',
qfe:          'qfeHpa',                 qfe:          'hPa',
gps_altitude: 'gpsAltM',               gps_altitude: 'm',
```

That is the whole enhancement. Because `multiSensor`, `metStatistics`, and `orgDeviceComparison` all
resolve through `MET_SENSOR_FIELD[sensor]`, and `metMeasures()` already projects arbitrary fields via
`.select(['timestampMs', ...fields])`, the three new sensors light up **immediately** in the
multi-sensor overlay, statistics, and device-comparison — no per-endpoint code.

**Also:** (a) add `qnh | qfe | gps_altitude` to the `sensor` enum in the analytics controller's Swagger
`@ApiQuery`; (b) extend the analytics e2e/unit fixtures that enumerate sensors; (c) all three are plain
scalars, so mean / percentile / stdDev logic is unaffected (Beaufort stays wind-only).

**Optional later** (same one-line pattern, not required by this decision): `wind_speed_true` →
`windSpeedTrueMs`, `wind_speed_rel` → `windSpeedRelMs`, `wind_dir_rel` → `windDirRelDeg`.

**Effort:** ~1 hour incl. tests · **Owner:** backend · **Blocks:** the Month 9 aggregate sensor picker
listing these three (frontend just adds them to the allow-list once shipped).

### 10.6 Form validation & error handling (client Zod is the PRIMARY guard — verified against the DTOs)

**The backend DTOs are mostly Swagger-documentation shells, not validators** (verified by reading every
`dto.ts`). So client validation is not a nicety that mirrors the server — it is frequently the **sole** line
of defense, and must be treated as the contract:
- **`UpdateDeviceSettingsDto` has *zero* validation decorators** — and it is the highest-risk form in the app:
  its writes reach the **live field device** (decision #13). The server accepts `qfeHeightM`, `colorScheme`,
  `unitWindSpeed`, `windRoseOrient`, and the `sensorShowPrefs`/`sensorLogPrefs` arrays **unchecked**. The
  client Zod is therefore **authoritative and strict** here: enum the unit strings (§10.9), bound the QFE/QNH
  heights, constrain the enumerated selects, and validate the NMEA-prefs grid shape — the backend will not.
- **Auth DTOs (`auth/dto.ts`) carry no class-validator at all** — login / forgot / reset are **not**
  server-validated; email format and password length are **client-enforced** (server `MinLength(8)` exists
  only on accept-invite and change-password).
- **Alert-rules *do* validate enums** (`appType`; `condition` ∈ gt/lt/gte/lte; `deviceId` / `notifyUserIds`
  as Mongo ids) — but **`sensor` is a free string** (not enum'd) and **`threshold` / `cooldownMinutes` have
  no range** (no `@Min(0)`). The rule builder's Zod must add `sensor` ∈ the known-sensor enum (§10.9),
  `cooldownMinutes ≥ 0`, and sane threshold bounds — none guaranteed by the API.
- **Endpoints that *do* validate** (org-invite `email`/`role`, share `resourceType`/`expiresAt`,
  firmware-target `deviceType`/`version`) still get the server fallback below.

Every form pairs a **strict client Zod schema** (instant inline field errors on blur/submit) with a
**server-error fallback** — when the `ValidationPipe` *does* fire, it returns an **array of human-readable
strings** in `message` (no per-field map), so the API's `error.message` (string **or** array) renders as a
**form-level list** and the submit re-enables. Zod schemas live beside the api client next to the response
schemas (§3.1). **No backend change** — treat client Zod as the source of truth, not a duplicate of it.
*(If authoritative per-field server errors are ever wanted, a backend `exceptionFactory` returning
`{ field, message }[]` would be the upgrade — not planned.)*

### 10.7 Backend prerequisite — expose the daily-summary rollups (populator + read endpoints)

**Decision (resolves §17 Q20): yes — wire the daily-summary layer** (the *largest* of the four backend
prerequisites; the others are near-trivial). The models **`MetDailySummary`** and **`NepDailySummary`**
are already fully designed but are currently **dead code** — verified: no service, controller, endpoint,
writer, or seed touches them (`grep -rln DailySummary src` returns only the two model files). They hold
premium daily analytics that **nothing else in the API computes**, so exposing them is the single biggest
"best-analytics" win available:
- **MET:** `windDirPrevailing`, `windCalmPct`, `beaufortDistribution[]`, per-sensor daily
  **min/max/avg** (temp, humidity, pressure), `pressureTendency` (+ hPa/hr), `precipTotalMm`,
  `precipRate{Max,Avg}MmHr`, `solar{Max,Avg}Wm2`, **`solarDailyKwhM2`**, `dewPointAvgC`,
  `dewPointSpreadAvg`, and **`completenessPercent`** (`sampleCount`/`expectedSamples`).
- **NEP:** daily `turbidity{Avg,Min,Max}`, `temperature{Avg,Min,Max}`, sample counts / completeness.

**Two pieces of backend work (this is why it's the heaviest prereq — it needs a *populator*, not just a map edit):**
1. **A populator.** An idempotent per-`(deviceId, date)` **upsert** that computes a day's summary from
   `MetMeasure` / `NepSample`. Run it **incrementally on session/record close** (or a nightly cron for
   the prior day), plus a **one-off backfill script** for existing history. `expectedSamples` derives
   from the device's logging cadence; `completenessPercent = sampleCount / expectedSamples`.
2. **Two read endpoints** (org-scoped, JWT, follow the existing `{ data }` / analytics conventions):
   - `GET /analytics/met/daily-summary?deviceId=&from=&to=` → `MetDailySummary[]`
   - `GET /analytics/nep/daily-summary?deviceId=&from=&to=` → `NepDailySummary[]`
   Both **require `deviceId`** like the other analytics endpoints (§3.6 rules apply: device-scoped
   panels auto-select a default device); a future org-wide aggregate is out of scope (§17 Q12).

**UI (Month 9 MET / Month 10 NEP):** a **data-completeness calendar heatmap** (the headline data-quality
view — sequential single hue), a **prevailing-wind compass** (+ calm-% meter), a **Beaufort-distribution
stacked bar** per day (categorical ordinal, fixed), per-sensor **min–max range bands with a mean line**
(small multiples — *no dual axis*), and **solar-kWh/day** & **precip-mm/day** bars. Add the two endpoints
to the Swagger doc + e2e fixtures.

**Effort:** ~0.5–1 day (populator + backfill + 2 endpoints + tests) · **Owner:** backend · **Blocks:** the
Month 9/10 daily-analytics screens (record/session detail and per-device charts work without it).

### 10.8 Backend prerequisite — enrich `/dashboard/summary` (active-alert count + sparklines)

**Decision (resolves §17 Q21): yes, a tiny additive change.** The Home KPI row (§6, Month 8) promises an
**active-alerts** tile and **per-tile sparklines**, but `dashboardSummary()` today returns **scalar counts
only** (`totalDevices, onlineDevices, offlineDevices, metLinkDevices, nepLinkDevices, totalMetRecords,
totalNepSessions, serverTime`) — verified in `dashboard.service.ts`. There is **no "currently-firing
alerts" concept anywhere** in `dashboard`/`analytics`, and no time series to back a sparkline. Rather than
fake it client-side, extend the one endpoint:
- **`activeAlertRules`** — `countDocuments({ organizationId, isActive: true })` on `AlertRule` (the tile
  reads "N armed alert rules"; deep-links to `/alerts`). *(Distinct from "firing now," which the system
  doesn't track; recent alert **activity** is still available via the notifications feed / `alert:triggered`.)*
- **`sparklines`** — a small `{ records: number[], sessions: number[], … }` of the last ~14 daily counts
  (cheap `$group`-by-day), so each KPI tile shows a trend, not just a number.

Additive, no migration, cache-friendly (the summary is already cached). **Effort:** ~1 h · **Owner:**
backend · **Blocks:** the Month 8 KPI-tile sparklines + active-alert tile (the rest of the dashboard is
unaffected).

### 10.9 Reference scales, bands & status semantics (mirror `analytics.util.ts` — never reinvent)

The backend owns a set of **authoritative classification scales** in `analytics/analytics.util.ts`. Every
label, threshold, band boundary, and legend in the UI **reproduces these verbatim** — a chart that invents
its own Beaufort ranges or turbidity bands would silently disagree with the numbers the API returns. They
live in **one frontend `scales.ts`**, mirrored from the backend and **drift-checked in CI** like the Swagger types:

- **Wind-speed bands — 5, "Smithtek-aligned"** (the wind-rose stack + legend): `Calm` 0–0.5 · `Light`
  0.5–3.3 · `Gentle` 3.3–7.9 · `Moderate` 7.9–13.8 · `Strong` ≥13.8 m/s. (§6's "16 sectors × 5 bands" = these five.)
- **Beaufort — 13 forces (0–12)**, each with `label` + `description` + m/s range. The `BeaufortScale`
  primitive and the statistics Beaufort badge use the backend strings verbatim; the descriptions
  ("Whole trees in motion") become the badge tooltips.
- **Comfort — 8 labels** off effective temperature: Very Hot ≥40 · Hot ≥32 · Warm ≥27 · Comfortable ≥16 ·
  Cool ≥5 · Cold ≥−10 · Very Cold ≥−28 · Dangerously Cold. (Drives the comfort-index badge added in §6.)
- **Fog risk — 3 levels** off dew-point spread (°C): `HIGH` <2 · `MODERATE` ≤4 · `LOW` >4.
- **Pressure tendency — 5 states** (normalised to hPa/3h), **not 3**: `rising_rapidly` >6 · `rising` >1.6 ·
  `steady` ≥−1.6 · `falling` ≥−6 · `falling_rapidly` <−6 — each with a backend label string. The
  `TendencyWidget` therefore needs **five** arrows/labels (rapid-rise and rapid-fall included), not up/steady/down.
- **Turbidity / water-quality — 7 WHO/EPA classes** (`NTU_CLASSES`), **not 4**: `0–1` WHO-drinking-compliant ·
  `1–10` EPA-recreational-safe · `10–50` slightly turbid · `50–100` moderately · `100–500` turbid ·
  `500–1000` highly · `>1000` extreme/flood. These are the histogram reference bands (§6 turbidity-distribution)
  and the water-quality-badge tiers.
- **Probe range** derives at NTU thresholds `R1` <10 · `R2` ≤1000 · `R3` >1000.
- **Interval enum** for every time-bucketed endpoint (history, gust, comfort, fog, multi-sensor): exactly
  `1min | 5min | 1h | 4h | 1d` — the date-range/interval picker offers **these five keys only**.
- **Units** (`/analytics/unit-convert`): wind `m/s` · `km/h` · `kt`≡`knots` · `mph` · **`bft`** (Beaufort as a
  unit) — confirms the §3.4 toggle set includes Beaufort; `kt` and `knots` are both accepted spellings.

> **Colour-source rule (resolves a conflict).** `NTU_CLASSES` ships a raw `color` hex per class
> (`#ffeb3b`, `#f44336`, …), and this is the **one place the backend dictates colour**. Treat those hexes as
> **advisory only** — they are *not* validated against the §4 dark-mode surfaces or the CVD ΔE target. The
> frontend maps the NTU **class (by index/label)** onto its **own validated 7-step sequential+status ramp**
> (§4), and likewise maps the 5 tendency / 3 fog / 8 comfort states onto the reserved status tokens — the
> backend `color` is **never rendered directly**. This keeps the palette-validator authoritative and
> dark-mode/CVD-safe while the *class boundaries* stay backend-owned. (Frontend-only; no backend change.)

---

## 11. Security & privacy

The BFF-cookie model and the unauthenticated share view make this a first-class concern, not a Month-12 afterthought.

- **CSRF:** the httpOnly refresh cookie is `SameSite=Lax`, `Secure`, `HttpOnly`. State-changing BFF
  route handlers additionally enforce an **origin/`sec-fetch-site` check** (and a double-submit token
  for any cross-site form) so a cookie alone can't drive a mutation.
- **WebSocket auth (BFF).** The gateway authenticates the handshake with a **real access token**
  (`handshake.auth.token` → `verifyAccessToken`) — but under BFF that token is server-side, and there
  is **no ticket endpoint today** (backend gap → **§11.1** specs the fix). The browser gets a
  **short-lived socket token** from a BFF route (`/api/ws-ticket`) and passes it as `socket.auth.token`;
  the long-lived access token stays server-side. The socket connects **directly** to the backend
  (`wss://…/v1/ws`), so CSP `connect-src` allows that origin.
- **Content-Security-Policy** (Next middleware, nonce-based scripts):
  `default-src 'self'`; `img-src 'self' https://res.cloudinary.com data:` (photos/files are Cloudinary
  `secure_url`s); `connect-src 'self' <backend-origin> wss://<backend-origin>` (WS + BFF);
  `style-src 'self' 'nonce-…'`; MapLibre tile/style host added to `connect-src`/`img-src` as needed;
  `frame-ancestors 'none'`. No inline event handlers.
- **XSS:** free-text reaches the UI via device `name`/`serialNo`, record/session **comments**, org
  name, notification bodies. React escaping covers JSX; anything built as HTML (MapLibre popups,
  tooltips, chart labels via `innerHTML`) is escaped or run through **DOMPurify**. No `dangerouslySetInnerHTML` without sanitization.
- **Public share view is the highest-risk surface** (unauthenticated, linkable): strict CSP, `robots:
  noindex`, no auth UI, only the single shared resource's data as a **static snapshot (no WebSocket)**,
  honor `expiresAt`/revocation, and rate-limit lookups. It reuses read-only chart primitives with zero mutation paths.
- **Rate limits (targeted, NOT global — corrected).** `ThrottlerGuard` is **not** registered globally;
  it applies only to **auth login (10 req/60 s)** and the **public share view (30 req/60 s)**. So the
  analytics dashboard's many chart requests are **not** rate-limited. The client still handles **429**
  gracefully on the login and public-share flows (backoff + jitter, respect `Retry-After`); realtime +
  sane `staleTime` + query dedupe keep total volume low regardless.
- **Secrets & headers:** no token or secret in the client bundle; `Strict-Transport-Security`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` set; **Dependabot + `npm audit`
  gate CI**; idle-session timeout + "log out everywhere" (revoke refresh token).

### 11.1 Backend prerequisite — WebSocket auth ticket (small, additive)

**Why:** the realtime gateway (`verifyAccessToken` on the handshake) needs an access token, but the BFF
keeps the access token server-side. There is no endpoint that hands the browser a token for the socket,
so **realtime cannot connect under the pure-BFF model without this.**

**Decided — Option A (tiny backend add, §17 #13):** a JWT-guarded `POST /v1/auth/ws-ticket` that mints a
**short-lived (~60 s) access token** (reuse the existing `signAccessToken` with a short `expiresIn`).
The gateway already accepts any valid access token, so **no gateway change** is needed. The BFF calls
this with the server-held access token and returns the ticket to the browser for `socket.auth.token`.
*Effort ~1 h · Owner: backend · Blocks: Month 7 realtime foundation.*

**Fallback (Option B — zero backend):** the BFF route `/api/ws-ticket` returns the **current
server-held access token** to the browser for the handshake only. Works today, but the (short-lived)
access token is briefly in browser memory — a small, common relaxation of the "token never leaves the
server" ideal. Use this if the backend add can't be scheduled before Month 7.

---

## 12. Observability & quality gates (client)

- **Errors/perf:** Sentry (errors + tracing + release health, source maps uploaded on deploy);
  optional session replay behind consent. Global error boundary per route group.
- **Web Vitals budget** (LCP/CLS/INP) enforced in CI via Lighthouse; regressions block merge.
- **Structured client logging** (levels, no PII) and a lightweight, privacy-respecting product-analytics
  hook (page/feature events) — off by default, env-gated.
- **Accessibility target: WCAG 2.1 AA.** axe in CI on new screens; keyboard/focus/reduced-motion; the
  chart **texture channel** covers CVD/print/forced-colors.
- **Contract safety:** response types derived from the backend Swagger + Zod boundary validation; a CI
  check flags drift between the Swagger doc and the typed client so §6 stays true.
- **Chart visual regression:** Storybook stories snapshotted (Playwright/Chromatic-style) so the
  validated palette and marks can't silently regress.

---

## 13. UX system & platform support

- **Shared UX pieces:** toast/notification center, **global command palette + search** (jump to
  device/session/record), first-run **empty-org onboarding** (invite teammates, connect first device),
  bulk table actions, destructive-action confirms, optimistic mutations **with rollback**, and a unified
  skeleton system. Every list has an empty state that teaches the next action.
- **Responsive strategy:** desktop-first (dense analytics), **fully usable on tablet**; phone gets a
  responsive-but-reduced view (dashboard, alerts, feed) rather than the full analytics grid. Charts and
  wide tables live in `overflow-x:auto` containers; the page body never scrolls sideways.
- **Browser support:** evergreen **Chrome, Edge, Firefox, Safari** (last 2 versions). No IE. MapLibre/WebGL
  requires GPU — a graceful fallback message where WebGL is unavailable.

---

## 14. Shared component & hook inventory (Storybook)

The viz + UI primitives every feature composes (built in Month 7–8, extended thereafter):

- **Charts:** `StatTile`, `Sparkline`, `TimeSeriesChart`, `WindRose` (visx polar), `Histogram`,
  `ScatterChart` (+ trend/annotation), `StackedBar`, `RangeBandChart` (min–max + mean), `CalendarHeatmap`
  (data-completeness / daily magnitude), `Compass` (prevailing wind), `TendencyWidget`, `StatusBadge`,
  `Meter`, `BeaufortScale`. All share crosshair/tooltip, table-view toggle, PNG/CSV export, null-gap handling.
- **Maps:** `MapCanvas` with `FleetLayer` (status markers), `TrailLayer` (turbidity-colored), `HeatmapLayer` (GPS density).
- **Data/UI:** `DataTable` (virtualized, server-paginated), `FilterBar`, `DateRangePicker`, `DeviceSelect`,
  `UnitToggle`, `ScopeBar` (global *All*→drill-down, URL-synced), `ExportMenu`, `LiveIndicator`,
  `Toast`, `EmptyState`/`ErrorState`, `Skeletons`,
  `RuleBuilder` (alerts), `FileGallery` (Cloudinary), `Pagination`, `ConfirmDialog`,
  `AuditLogView` (filter bar + row-expand `DiffViewer` over `changes`), `DiffViewer` (before/after field diff).
- **Realtime constants:** a shared **`ClientEvent`** map (mirrored from the backend `realtime.events.ts`)
  is the *only* place socket event-name strings live — no hand-typed `'notification'` / `'nep:session_created'` at call sites.
- **Scale constants:** a shared **`scales.ts`** (mirrored from `analytics.util.ts`, drift-checked in CI) is the
  single source for the 5 wind-speed bands, 13 Beaufort forces, 8 comfort labels, 5 tendency states, 3 fog
  levels, 7 WHO/EPA turbidity classes, and the interval enum (**§10.9**) — `BeaufortScale`, `StatusBadge`,
  `TendencyWidget`, and `Histogram` bands all read from it, so labels/thresholds can't drift from the API.
- **Hooks:** typed query hooks per endpoint (`useSummary`, `useWindRose`, …), `usePaginatedQuery`,
  `useSocket` / `useDeviceSubscription` / `useOrgEvents`, `useUnits`, `useTimezone`, `useRbac`, `useExport`.

---

## 15. Delivery mechanics & acceptance

- **Team/effort assumption (state so the 6 months has a basis):** planned for **1–2 frontend engineers**;
  each month is a ~4-week slice sized to that. Months 7–12 are a **sizing/sequence estimate with a
  flexible start — not fixed calendar dates** (§17 #14). More hands compress the calendar; the
  *sequence* (deps below) is what matters.
- **Critical path / dependencies:** Month 7 (shell + auth + design system + socket + component base) unblocks
  everything. Charts primitives (M8) precede the analytics suites (M9–M10). Realtime plumbing (M7) precedes
  live tiles (M8) and alert toasts (M11). Import/layouts (M11–M12) are last so they can flex under pressure.
- **Backend prerequisites (four — all additive, backend-owned; three near-trivial, one ~half-day):**
  1. **§11.1 WS-auth ticket** (`POST /v1/auth/ws-ticket`, ~1 h) — **blocks Month 7 realtime**; without it
     the socket can't authenticate under BFF (Option B is a zero-backend fallback).
  2. **§10.5 analytics-map expansion** (3 keys, ~1 h) — **blocks the Month 9** aggregate sensor picker
     covering QNH/QFE/GPS-altitude. Not on the critical path; record-detail charting works without it.
  3. **§10.8 summary enrichment** (active-alert count + sparklines, ~1 h) — **blocks the Month 8** KPI-tile
     sparklines + active-alert tile. Additive to `/dashboard/summary`; the rest of the dashboard is unaffected.
  4. **§10.7 daily-summary rollups** (populator + backfill + 2 read endpoints, ~0.5–1 day — the *only*
     non-trivial one) — **blocks the Month 9/10** daily-analytics screens (calendar heatmap, prevailing-wind,
     Beaufort distribution, min–max bands). Record/session detail works without it; wires up two otherwise-dead models.
  Everything else is frontend-only against the API as-shipped. Each should be scheduled before its gated month.
- **Branch/PR flow:** feature branches → PR → CI (typecheck/lint/unit/component/e2e/axe/Lighthouse) → Vercel
  preview → review → merge. **Feature flags** gate half-built surfaces; staged enable in prod.
- **Per-month acceptance = a demo script**, e.g. M8: "log in → dashboard shows live KPIs → a simulated
  `met:latest` updates a tile without refresh → wind rose renders 10-/2-min → fleet map shows a device going
  offline live." Each month's status table is signed off only when its demo passes on the Vercel preview.

---

## 16. Non-goals (explicitly out of scope)

Native mobile apps (they exist); offline/PWA; billing/subscriptions; multi-organization switching
(single-org assumed); changing the backend API (**except** four additive backend prerequisites the
admin panel needs: the analytics-map expansion §10.5, the WS-auth ticket endpoint §11.1, the
`/dashboard/summary` enrichment §10.8, and the daily-summary rollups §10.7); real FCM/APNs push (backend seam exists — delivery is
WebSocket for now); white-labeling beyond the theme tokens; a public marketing site; a **freeform
per-user tile-builder dashboard** (a fixed curated dashboard ships instead — layout endpoints deferred);
**per-operator (human-user) analytics attribution** (the Scope Bar operates on device — adding a `userId`
axis is a future backend enhancement); **mobile-access / API-key management in the panel** (the mobile
key is a server-side env secret — rotation is an ops/deploy task); **firmware binary hosting** (version
tracking only — no file upload/distribution).

---

## 17. Resolved decisions (was: open questions)

All are now **decided** (multiple rounds of Q&A, plus a final backend-gap audit that added #20–#21).
This section is the record; the rest of the plan reflects them.

| # | Question | Decision |
|---|---|---|
| 1 | `POST /auth/register` — public sign-up or invite-only? | **Invite-only** — admin invite → accept-invite; `register` is seed-time |
| 2 | One user = one org, or cross-org access? | **Single org, no switcher** (org id still threaded through routes/keys) |
| 3 | Default timezone? | **Viewer-local** default + UTC / device-session toggle (§10.1) |
| 4 | Public share view — indexable? live? | **`noindex`, link-only, static snapshot** (no realtime); honors expiry/revoke |
| 5 | Expected fleet size & data volume? | **Small — tens of devices**; standard virtualization + backend downsampling suffice |
| 6 | MapLibre tile/style source? | **Free OSM / MapLibre demo tiles** (no token); swap the style URL later if needed |
| 7 | Import/export roles? | **Export: all roles · Import: admin-only** (per §3.3) |
| 8 | Brand assets, or design-system defines them? | **Design system defines** tokens/palette/logo; swap when assets land |
| 9 | "All users analytics" — device or human operator? | **Device** — Scope Bar (§3.6) |
| 10 | Backend per-user attribution now? | **Deferred** — device scope ships now; operator axis is a future backend item |
| 11 | Expand aggregate analytics (QNH/QFE/GPS-alt)? | **Yes** — §10.5 (3 keys, ~1h backend, no migration) |
| 12 | Make `deviceId` optional for fleet-wide aggregate charts? | **No** — default-device + comparison/fleet-health cover org views (§3.6); no backend aggregate |
| 13 | WebSocket auth ticket — backend endpoint or BFF-only? | **Backend `POST /v1/auth/ws-ticket`** (Option A, §11.1) |
| 14 | Is the 6-month window firm or an estimate? | **Sizing/sequence estimate, flexible start** — Months 7–12 are effort slices, not fixed dates |
| 15 | Localization scope? | **English-only now, next-intl scaffolded** for later translation |
| 16 | Manage mobile-app access (API key) in the panel? | **No** — the mobile key is a server-side env secret (`MOBILE_API_KEY`/`MOBILE_ORG_ID`); rotation is an ops task, not a panel feature |
| 17 | Device onboarding — manual provisioning or auto-register? | **Auto-register on first pairing** (app calls `POST /devices`); panel = view/edit/soft-delete **+ optional manual Add** |
| 18 | Firmware — file hosting or version tracking? | **Version tracking only** (target version + outdated-status + history); no binary hosting; updates are out-of-band |
| 19 | Form validation UX (backend returns unstructured `message[]`)? | **Client Zod + server fallback** (§10.6) — inline field errors client-side, server messages as a form-level fallback; no backend change |
| 20 | Expose the unwired daily-summary rollups (prevailing wind, calm %, Beaufort dist., completeness %, solar kWh/day)? | **Yes — the heaviest backend prereq** (§10.7): populator + backfill + 2 read endpoints; wires up two otherwise-dead models into a daily-analytics suite |
| 21 | `/dashboard/summary` lacks the active-alert count + sparkline series its KPI tiles promise? | **Tiny backend addition** (§10.8) — add `activeAlertRules` count + last-14-day sparkline counts; not faked client-side |

---

## 18. Appendix — full endpoint inventory (consumed by the panel)

**Auth:** register*, login, refresh, logout, forgot-password, reset-password ·
**Org:** accept-invite, me (GET/PATCH), me/users (list/invite/PATCH) ·
**Users:** me (GET/PATCH) · **Audit:** list ·
**Dashboard:** summary (**+ §10.8** enrichment: activeAlertRules + sparklines), devices, met/latest,
met/windrose, met/history, met/stats, nep/sessions,
nep/latest, nep/trend, nep/map, nep/analytics, org/device-map ·
**Analytics:** met/{wind-rose,multi-sensor,statistics,wind-gust-history,comfort-indices,fog-risk,
pressure-tendency,**daily-summary** (§10.7),export-bulk}, nep/{turbidity-distribution,session-comparison,water-quality-summary,
probe-range-breakdown,turbidity-temperature-correlation,session-events,gps-density,**daily-summary** (§10.7),export-bulk},
org/{device-comparison,fleet-health}, unit-convert ·
**Devices:** list, create, :id (GET/PATCH/DELETE), :id/{stats,health,firmware-history,settings},
firmware-target (GET/PUT), firmware-status ·
**Records:** list, create, :id (GET/PATCH/DELETE), :id/measures, :id/export.csv, :id/pictures (GET/POST/DELETE) ·
**Sessions:** list, create, :id (GET/PATCH/DELETE), :id/samples, :id/export.csv, :id/files (GET/POST/DELETE) ·
**Alert-rules:** list, create, :id (GET/PATCH/DELETE) ·
**Notifications:** list, :id/read, read-all, tokens (admin) · *(token register/unregister are mobile-only)* ·
**Share:** create, list, :id delete · **Public:** :token · **Export:** sessions.zip ·
**Import:** nep, met · **Sync:** status *(read-only health widget)* · **System:** health, version ·
**Dashboard-layouts:** list, create, :id (PATCH/DELETE), :id/set-default ·
**Realtime `/v1/ws`:** subscribe/unsubscribe:device (+ `ping`); server events **`met:latest`**,
**`met:windrose`**, **`nep:sample`**, **`nep:session:created`**, **`device:status`**, **`device:connected`**,
**`notification:new`**, **`alert:triggered`** *(exact names — see §3.2; `nep:session:created` and
`notification:new` are colon-cased, not the underscored forms)*.

\* `register` is typically admin/seed-time; the panel primarily uses invite → accept-invite.

---

*End of plan. Section 4 (Data-Viz Standards) and Section 6 (API → Chart mapping) are the contract for
"the best way to show these stats"; everything else exists to deliver them, live and accessible.*
