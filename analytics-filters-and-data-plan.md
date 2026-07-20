# Plan — Analytics filter-bar cleanup + guaranteed chart data

**Scope:** the two admin tabs
- `http://localhost:3001/analytics` → **MET Analytics** (`AnalyticsPage`)
- `http://localhost:3001/analytics/nep` → **NEP Analytics** (`NepAnalyticsPage`)
- plus their daily-summary sub-pages (`/analytics/met/daily-summary`, `/analytics/nep/daily-summary`)

**Author date:** 2026-07-20

---

## 1. Objective

1. **Clean up the top filter bar** on the analytics tabs: remove the `Scope`
   label, the `All types` device-type select, and the `Include demo data` toggle.
2. **Correct the remaining filters**: the device dropdown should list only devices
   of that tab's type (MET-LINK on `/analytics`, NEP-LINK on `/analytics/nep`).
3. **Guarantee every chart has data to render** — no empty panels on either tab.

---

## 2. What I found (evidence)

### 2.1 The filter bar is a single global component
`admin-web/components/scope/scope-bar.tsx` (`ScopeBar`) is rendered **once** in
`admin-web/components/app-shell/app-shell.tsx:64`, above `<main>`, for **every**
page in the `(dash)` group (dashboard, devices, sessions, records, map, alerts,
notifications, fleet, users, analytics…). It already hides itself on
`/org`, `/settings`, `/profile`, `/import` via `HIDDEN_PREFIXES`.

It renders: `Scope` label · device-type `Select` (`All types`) · `DeviceSelect`
· `DateRangePicker` · `Include demo data` `Switch` · `Reset to All`.

> Consequence: editing `ScopeBar` directly changes the bar on **all** pages.
> Per decision (see §3), the analytics tabs get a **separate reduced bar**; the
> global bar is left untouched everywhere else.

### 2.2 Why both tabs currently show no data (verified against the live DB)
The global scope defaults to a **24h** window (`DEFAULT_RANGE = '24h'` in
`admin-web/lib/hooks/use-scope.ts:30`). But the newest data on every device is
**~5.9 days old**:

| Device (org: Observator Instruments AU) | type | lastSeen | data | rows/sessions in last 24h |
|---|---|---|---|---|
| Dummy MET Test Station | MET-LINK | 2026-07-10 | 74 rows | **0** |
| MET-LINK-001 | MET-LINK | never | 1080 rows | **0** |
| **MET-LINK-M10-DEMO** | MET-LINK | 2026-07-14 | 39,364 rows | **0** |
| Dummy NEP Test Probe | NEP-LINK | 2026-07-10 | 3 samples | **0** |
| NEP-LINK-001 | NEP-LINK | never | 544 samples | 0 |
| **NEP-LINK-M10-DEMO** | NEP-LINK | 2026-07-14 | 9,027 samples | **0** |

Newest MET measure = `2026-07-14T07:49Z`, newest NEP session = `2026-07-14T07:10Z`
(both ~5.9 days before today). So the **default 24h window is empty on every
device** → every window-scoped chart is empty.

Two independent problems:
- **Window-scoped charts** (most): empty because the 24h window has no data.
  Fixed by *either* fresh data *or* a wider default window.
- **"Now"-anchored widgets** — MET **pressure-tendency** (`useMetPressureTendency`,
  default 3h, queries `Date.now() - hours`) and the live tiles — ignore the scope
  window entirely. **Only fresh data** makes these render; widening the range does
  nothing for them.

### 2.3 The demo toggle is already irrelevant to the seed data
Both seeders write real (non-demo) rows: `seed-met-demo-m10.ts` sets
`isDemoMode:false` on records **and** measures; `seed-nep-demo-m10.ts` sets
`isDemoMode:false` / `demoModeEnabled:false`. The analytics endpoints only filter
out `isDemoMode:true` when `includeDemo` is off — so the seeded demo devices show
**regardless** of the toggle. Removing the toggle changes nothing about what
renders. (`scope.includeDemo` simply stays `false`.)

### 2.4 The device dropdown is not type-aware on analytics
`ScopeBar` passes `type={scope.deviceType}` to `DeviceSelect`; with the type-select
gone that's `undefined`, so the dropdown lists **all** device types. On
`/analytics` (locked to `useScopedDevice('MET-LINK')`) picking a NEP device is
silently ignored — this is the "filter to correct" per §1.2.

### 2.5 Time & device filters — investigated (one REAL backend bug + two perceptual)
The user reported the **time** and **device** filters as not working, and a live
screenshot showed **All time** selected on the MET tab with device
`MET-LINK-M10-DEMO` (auto-selected) yet **every panel empty**. That is not
explained by stale data alone — 39,364 rows exist. Root cause found:

#### 🐞 REAL BUG — the "All time" preset returns nothing (`from` dropped → 24h)
- The frontend resolves `all` to a window with **`from = undefined`**
  (`rangeWindow('all')` → `{ to: now }`, `use-scope.ts:35`). The endpoint helper
  `analyticsQs` then **omits `from`** entirely when it's null
  (`endpoints.ts:256` — `if (w.from != null) …`).
- The backend `parseWindow` treats a **missing `from` as `to − 24h`**
  (`backend/src/analytics/analytics.service.ts:109`). So "All time" silently
  becomes **"last 24 hours"** — empty, because data is ~5.9 days old.
- Proven live against `MET-LINK-M10-DEMO` on `/analytics/met/wind-rose`:

  | request (as sent) | result |
  |---|---|
  | `to=now`, **no `from`** ← what "All time" sends | **`totalSamples=0`** |
  | `deviceId` only (no from/to) | `totalSamples=0` |
  | `from=0&to=now` ← true all-time | **`totalSamples=39364`** |

  This hits **every** `/analytics/*` endpoint (all share `parseWindow`), so on
  "All time" the whole MET/NEP suite goes blank. (Note: the mismatched query key
  already uses `from ?? 0` at `keys.ts`, but the actual request uses raw
  `window.from` → undefined — the key and the request disagree.)
- Exception: cross-session-trend hits `/dashboard/nep/analytics`
  (`getNepAnalytics`), which defaults missing `from` to **`to − 30d`**
  (`dashboard.service.ts:640`) — so that one panel survives "All time", the rest
  don't. This inconsistency is itself worth fixing.

**Immediate workaround (no code):** pick **"Last 30 days"** instead of "All time" —
that preset sends `from` explicitly, so `MET-LINK-M10-DEMO` populates now
(verified `totalSamples=31856` over 30d).

#### Verified working (the rest of the chain is fine)
- **Explicit windows work** — 30d (with `from` sent) → `31856` samples; only the
  *missing-`from`* case breaks.
- **BFF proxy forwards the query string** — `admin-web/lib/bff/proxy.ts:80` builds
  `path = backendPath + request.nextUrl.search`; params reach the backend intact.
- **Query keys include `deviceId, from, to`** (`keys.ts:39-71`) and refetch on
  change; `useSearchParams()` makes range/device changes reactive.

#### Perceptual issues (data/UX, not wiring)
- **Time filter, non-`all` presets:** default is 24h and data is ~5.9 days old
  (§2.2), so 24h/7d look empty/sparse. Re-seed (§4-B) + 30d default (§4-A4) fixes.
- **Device filter:** the dropdown lists **all** types (§2.4) — the screenshot shows
  `NEP-LINK-M10-DEMO` chosen while the MET tab auto-uses `MET-LINK-M10-DEMO`,
  because `useScopedDevice('MET-LINK')` silently discards the NEP pick. Type-filter
  (§4-A2) + clear-wrong-type (§4-A5) fixes.

**New fix for the All-time bug → see §4-A6.**

### 2.6 Daily summaries are stored collections
`MetDailySummary` / `NepDailySummary` are persisted and normally updated on ingest.
The seeders bypass ingest, so the daily-summary tables must be rebuilt with
`npm run backfill:daily-summary` (it recomputes **both** MET and NEP for every
`isDemoMode:false` device/day).

---

## 3. Decisions (confirmed with user)

| # | Decision | Choice |
|---|---|---|
| 1 | Where to remove Scope / All types / Include demo | **Analytics pages only** — reduced bar on analytics routes; global bar unchanged elsewhere |
| 2 | Device dropdown after removing type-select | **Pre-filter to the tab's device type** (MET-LINK / NEP-LINK) |
| 3 | How to make data appear | **Re-seed + widen the analytics default range** (30d) |
| 4 | Daily-summary sub-pages | **Include them** — same reduced bar |

---

## 4. Implementation plan

### Part A — Reduced, corrected filter bar on analytics only

**A1. Hide the global bar on analytics routes.**
`admin-web/components/scope/scope-bar.tsx` — add `'/analytics'` to
`HIDDEN_PREFIXES`. The global `ScopeBar` then renders on every other page exactly
as today, and disappears under `/analytics/**`.

**A2. New component `admin-web/components/scope/analytics-scope-bar.tsx`.**
Renders only **Device** (type-filtered) + **Date range** + **Reset**, no `Scope`
label, no type-select, no demo toggle. Type is derived from the path:
- pathname starts with `/analytics/nep` → `NEP-LINK`
- otherwise (`/analytics`, `/analytics/met/**`) → `MET-LINK`

```tsx
const type: DeviceType = pathname.startsWith('/analytics/nep') ? 'NEP-LINK' : 'MET-LINK';
// <DeviceSelect value={scope.deviceId} type={type} onChange={(deviceId) => setScope({ deviceId })} />
// <DateRangePicker value={scope.range} onChange={(range) => setScope({ range })} />
// {!isDefault && <Reset/>}
```
Reuses `useScope`, `DeviceSelect`, `DateRangePicker`, `Button` — same URL-synced
scope state, so device + range still work identically; only `deviceType` and
`includeDemo` are no longer surfaced (they stay at `undefined` / `false`).

**A3. New layout `admin-web/app/(dash)/analytics/layout.tsx`.**
Renders `<AnalyticsScopeBar />` above `{children}`, so it appears on all four
analytics routes (both tabs + both daily-summary pages) and nowhere else.

**A4. Widen the analytics default window to 30d (durability).**
The pages read `useScope().window`, which falls back to the global 24h default.
To widen **only** on analytics without touching the global default:
- In `AnalyticsScopeBar`, on mount, if the URL has **no** `range` param, call
  `setScope({ range: '30d' })` so the effective window becomes 30d.
- Edge case: `24h` equals the global default, so `useScope.write` strips it from
  the URL; a deliberate 24h choice could get re-expanded to 30d on the next
  analytics navigation. Mitigation: in `AnalyticsScopeBar` persist the range param
  explicitly for **every** preset (including 24h) via a tiny local setter, so a
  chosen 24h sticks and the "seed 30d when absent" effect never fights the user.

> After the re-seed (Part B) the 24h window already has data *today*; the 30d
> default keeps the window-scoped charts populated for ~30 days as the seed ages.
> Pressure-tendency + live tiles remain fresh only ~1 day (see §2.2) — re-seed to
> refresh those.

**A5. Clear a stale wrong-type `deviceId` so the device filter always works.**
`useScopedDevice` silently ignores a `deviceId` whose type ≠ the tab (§2.5), which
reads as a dead device filter. In `AnalyticsScopeBar`, when `scope.deviceId` is set
but the selected device's `type` ≠ the tab's type (e.g. a NEP id carried over onto
the MET tab), call `setScope({ deviceId: undefined })` so the tab falls back to a
clean auto-select of the correct type instead of leaving a mismatched pick in the
URL. This keeps the type-filtered dropdown (§4-A2) and the URL consistent.

**A6. Fix the "All time" preset returning nothing (the real bug, §2.5).**
Make a missing `from` mean "from the beginning", not "last 24h". Preferred
single-point **backend** fix in `parseWindow`
(`backend/src/analytics/analytics.service.ts:107-112`):

```ts
// before: const fromMs = from ? parseInt(from, 10) : toMs - 24 * 3600_000;
const fromMs = from ? parseInt(from, 10) : 0;   // no lower bound = all time
```

This fixes **every** `/analytics/*` endpoint at once (wind-rose, multi-sensor,
statistics, comfort, fog, wind-gust, turbidity, probe, correlation, gps). Belt-and-
braces (optional, keeps request ↔ query-key consistent): also send `from` from the
frontend — in `analyticsQs` (`admin-web/lib/api/endpoints.ts:256`) change
`if (w.from != null) p.set('from', String(w.from));` → `p.set('from', String(w.from ?? 0));`.
For parity, align cross-session-trend's default (`getNepAnalytics`,
`dashboard.service.ts:640`) to `0` as well so "All time" is truly all-time there too
(currently 30d).

> With A6, "All time" returns the full series (verified: `from=0&to=now` →
> `totalSamples=39364`). Without it, only presets that send an explicit `from`
> (1h/24h/7d/30d) work — hence the §2.5 workaround of using "Last 30 days".

**Files touched (Part A):**
- `admin-web/components/scope/scope-bar.tsx` (1 line: HIDDEN_PREFIXES)
- `admin-web/components/scope/analytics-scope-bar.tsx` (new — A2, A4, A5)
- `admin-web/app/(dash)/analytics/layout.tsx` (new)
- `backend/src/analytics/analytics.service.ts` (A6 — `parseWindow` 1 line)
- *(optional)* `admin-web/lib/api/endpoints.ts` + `backend/src/dashboard/dashboard.service.ts` (A6 parity)

The time/device controls are wired correctly end-to-end (§2.5); the only genuine
code bug is the missing-`from` window default (A6). The other changes fix the
*default window* and *device scoping* so the working filters visibly drive charts.

### Part B — Re-seed so every chart has data

Run from `backend/` (uses `MONGO_URI` from `backend/.env`):

```bash
npm run seed:demo:met          # MET-LINK-M10-DEMO: 30d of 1-min measures, ends "now"
npm run seed:demo:nep          # NEP-LINK-M10-DEMO: 30d of sessions/samples, last ends "now"
npm run backfill:daily-summary # rebuild MetDailySummary + NepDailySummary
```

Effects:
- Both demo devices get `lastSeenAt = now` → each is the most-recently-seen device
  of its type → `useScopedDevice` auto-selects it on the matching tab.
- 24h **and** 30d windows now contain data; pressure-tendency / live tiles get
  last-3h data.
- Daily-summary tables repopulated for both tabs.

These seeders are **isolated + idempotent** — they only touch their one dedicated
demo device (delete-and-regenerate on re-run); nothing else is modified.

### Part C — Per-chart data audit (verify "all things show up")

After Part B (fresh data) + 30d window, confirm each panel renders:

**MET `/analytics`:** wind rose · pressure tendency (needs fresh data ✓) ·
statistics panel · multi-sensor (all 15 sensors seeded) · wind gust · comfort
indices · fog risk.

**NEP `/analytics/nep`:** water-quality badge (latest session in window) ·
turbidity distribution · cross-session trend · probe-range breakdown ·
correlation scatter (seed correlates turbidity↔temp) · session comparison
(auto-selects 2 most-recent sessions).

**Daily summaries:** both render from the backfilled `*DailySummary` collections.

---

## 5. Verification

1. Re-run the three seed commands (Part B); confirm console summaries (records /
   sessions / day-summaries written).
2. Frontend hot-reloads; open both tabs:
   - Filter bar shows **only** Device (type-filtered) + Date range + Reset — no
     `Scope` label, no `All types`, no `Include demo data`.
   - MET device dropdown lists only MET-LINK devices; NEP lists only NEP-LINK.
   - Every panel in §4 Part C shows data (no EmptyState).
3. **Time filter works, incl. All time:** switch the range 30d → 24h → **All
   time**; the charts refetch and the visible series changes. After A6, "All time"
   must show the full series (not empty). Before A6, confirm the workaround:
   "Last 30 days" populates while "All time" is blank.
4. **Device filter works:** switch to another same-type device; charts refetch for
   that device. Confirm the dropdown no longer offers the other type, and that no
   stale wrong-type `deviceId` survives a tab switch (§4-A5).
5. Sanity-check an unrelated page (e.g. `/devices`) still shows the **full**
   global ScopeBar (analytics-only removal, no regression).
6. Optionally drive it with the `/run` or `/verify` skill.

---

## 6. Risks & notes

- **Analytics-only removal** avoids any change to dashboard/devices/sessions/etc.
- **Demo toggle removal is safe**: seed data is `isDemoMode:false`, so it renders
  with `includeDemo` permanently off.
- **"All time" is a real code bug** (§2.5 / §4-A6): the frontend drops `from` and
  the backend defaults it to `to − 24h`, so "All time" = last 24h = empty. Fixed by
  A6 (`parseWindow` missing `from` → `0`). The rest of the chain (BFF forwarding,
  query keys, explicit-`from` presets) is verified correct — only the missing-`from`
  default was wrong.
- **Stale wrong-type `deviceId` in URL**: handled by §4-A5 (clear it when it
  doesn't match the tab's type) so the device filter never looks dead after a tab
  switch.
- **Data durability**: window-scoped charts stay populated ~30d via the widened
  default; "now"-anchored widgets (pressure tendency, live tiles) need a re-seed
  after ~1 day. Re-run the three seed commands before a demo if data has aged.
- No backend/source changes are required for the data fix — only running the
  existing, isolated seed + backfill scripts. Temp diagnostic scripts used during
  investigation were already removed.

---

## 7. Change checklist

- [ ] `scope-bar.tsx`: add `/analytics` to `HIDDEN_PREFIXES`
- [ ] add `components/scope/analytics-scope-bar.tsx` (device[type-filtered] + range + reset; 30d default when range absent; clear wrong-type deviceId)
- [ ] add `app/(dash)/analytics/layout.tsx` rendering `<AnalyticsScopeBar/>`
- [ ] **A6 (real bug):** `analytics.service.ts` `parseWindow` — missing `from` → `0` (fixes "All time"); optional parity in `endpoints.ts` + `dashboard.service.ts`
- [ ] `npm run seed:demo:met`
- [ ] `npm run seed:demo:nep`
- [ ] `npm run backfill:daily-summary`
- [ ] verify both tabs: reduced bar + every panel populated
- [ ] verify **time** filter changes the charts (30d ↔ 24h ↔ All time)
- [ ] verify **device** filter switches devices + no wrong-type pick after tab switch
- [ ] verify a non-analytics page still shows the full global ScopeBar
- [x] **A7 (dashboard):** `met-graph-stack.tsx` — "All time" no longer truncated to 6h

---

## 8. Dashboard date filter — checked (§A7)

The user asked to check the dashboard's date filter too. The dashboard keeps the
**full** global ScopeBar (unchanged — analytics-only removal). Findings:

- **Only one date-windowed widget** on the dashboard: the MET per-sensor **graph
  stack** (`features/dashboard/met-graph-stack.tsx`). KPI row, live tiles, wind
  rose, status table, alerts are "latest"/count views — not range-filtered.
- **Same "All time" trap, different fallback:** it computed
  `from: window.from ?? window.to − 6h`, so **"All time" silently showed only the
  last 6 hours** (verified live: 6h → 349 pts / 0.2d; `from=0` → 39,196 pts /
  29.2d). The other presets (1h/24h/7d/30d) send `from` and work.
- **Fix (A7):** `from: window.from ?? 0` — "All time" now honours the picker and
  shows all history, identical to the "Last 30 days" preset (which already loads
  the full ~39k-point series, so this is no heavier than an option users already
  have). `metHistory` requires `from`, so 0 (not omit) is the right value.
- **Not affected:** sessions list, records list, fleet comparison, and all
  analytics endpoints already handle a missing `from` as "no lower bound"
  (`sessions.service.ts:194` guards on `if (from)`; fleet + analytics route through
  the A6-fixed `parseWindow`). No further changes needed there.

> Note: with fresh seed data the dashboard's default 24h view is populated. If data
> ages past a day, use a wider preset or re-seed (same durability note as §6).

### A8 — Graphs tab froze on wide ranges (uncapped history payload)
Clicking **Graphs** with a wide range (30d / All time) froze the browser. Cause:
`getMetHistory` (`dashboard.service.ts`) returned **every** 1-min bucket with no
cap — ~40k points per sensor, and the stack renders **8 sensor charts at once**
(~310k points). The A7 `?? 0` change surfaced it for "All time", but 30d already
had it.

- **Fix (A8):** cap each series with the existing `downsample(..., 1500)` util.
  Verified: All time 39,196 → 1,500; 7d 10,056 → 1,500; 24h 1,405 and 1h 25 stay
  full-resolution (under the cap). The range still changes the data; the browser no
  longer freezes (8 × 1,500 ≈ 12k points total).
- Decimation is fine for the overview; narrower ranges keep 1-min detail. `from=0`
  (all time) is handled correctly because we cap the *result array*, not re-bucket
  the 56-year `[0, now]` window.
- Live tab is unaffected (latest snapshot, not history). Requires a browser refresh
  to drop the frozen query's cached payload.

**Touched:** `backend/src/dashboard/dashboard.service.ts` (A7 metHistory cap is A8;
A7 frontend cap was `met-graph-stack.tsx`).
