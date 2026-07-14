# Live-Dashboard Widget Gap Analysis — "Parklife Metro D&C" → admin-web

**Author:** Saboor Malik · **Date:** 2026-07-13 · **Status:** analysis only (no code yet)
**Source:** three screenshots of the existing **Parklife Metro D&C** MET-LINK live station dashboard
(the real product this admin panel is meant to surface).

---

## 0. TL;DR

The three screenshots are the **live MET-LINK station dashboard** of an existing customer
("Parklife Metro"). Our admin panel already renders the *same underlying data* — but as **plain
number tiles**. The real product renders it as **instrument widgets**: radial arc gauges,
thermometers, a battery-fill gauge, and a **brushable per-sensor graph stack**.

> **The gap is 100% front-end visualization. No backend change is needed** — every value in the
> screenshots is already returned by `GET /dashboard/met/latest` (incl. `precipRateMmHr`, verified
> at `backend/src/dashboard/dashboard.service.ts:267`) and `GET /dashboard/met/history`.

**What to add (6 items):** a **`Gauge`** (radial arc) primitive, a **`Thermometer`** primitive, a
**`BatteryGauge`** primitive, a **`Brush`/range-navigator** on time-series charts, a curated
**MET station "Live" view** that arranges these like Parklife, and a **per-sensor "Graphs" stack**
(small multiples). Details in §4–§5.

---

## 1. What the screenshots are

| # | Screenshot | What it shows |
|---|---|---|
| 1 | The station **overview grid** | A hero grid of **instrument widgets** for one MET station's latest reading — gauges, thermometers, a wind rose, a battery, a map, big-number tiles, and one time-series chart. |
| 2 | The **graph stack** (top half) | Full-width **time-series line charts, one per sensor** (wind speed → wind direction → temperature → humidity → pressure → dew point), stacked vertically, all on a shared time window. The top chart has a **brush/range navigator** (the grey draggable strip). |
| 3 | The **graph stack** (bottom half) | Continuation of the same stack, ending in **Battery Volts**. |

Branding ("Client" bar + Parklife logo) and dark theme are cosmetic; the **widget vocabulary** is
what matters. Legend token `speed (0094)` = the record/device id — our equivalent is the scoped device.

---

## 2. Widget-by-widget breakdown

### 2.1 Screenshot 1 — station overview grid

| Widget (label in image) | Value shown | Visual form | Backing field (`met/latest`) | Have it? |
|---|---|---|---|---|
| **WIND SPEED km/hr** | 1.700 | **Radial arc gauge** (semicircle, coloured arc, min→max scale) | `windSpeedKmh` | ❌ (plain tile) |
| **WIND ROSE** | — | Polar wind rose, 16 sectors × speed bands (0-25/25-50/50-75/75-100 km/h) | `met/windrose` | ✅ `wind-rose.tsx` |
| **TEMPERATURE** | 19.090 °C | **Thermometer** (bulb + stem fill, colour-coded) | `tempC` | ❌ (plain tile) |
| **PERCENT RELATIVE HUMIDITY** | — | **Radial arc gauge** (0–100 %) | `humidityPct` | ❌ (plain tile) |
| **BAROMETRIC PRESSURE hPa** | 1,009.000 | **Radial arc gauge** | `pressureHpa` | ❌ (plain tile) |
| **DEW POINT °C** | 6.620 | **Thermometer** | `dewPointC` | ❌ (plain tile) |
| **Map** | "No Data Found" | Map panel (GPS position) | `gpsLat/gpsLng` | ✅ `map-canvas.tsx` (needs a per-device latest-fix layer) |
| **DC VOLTAGE** | 13.100 | **Battery-fill gauge** (battery icon fills with level) | `voltageV` | ❌ (have `Meter` bar only) |
| **WIND DIRECTION DEGREES** | 195 | Big-number tile (+ ideally a compass arrow) | `windDirTrueDeg` | ✅ `stat-tile.tsx` (no compass) |
| **Total Precipitation** | 0.00 | Big-number tile | `precipMm` | ✅ tile |
| **Precipitation intensity** | 0.00 | Big-number tile (or gauge) | `precipRateMmHr` | ⚠️ field returned by API but **missing from the `MetLatest` type** |
| **WIND SPEED Km/Hr** (bottom) | trace | Time-series line chart | `met/history` | ✅ `time-series-chart.tsx` |

### 2.2 Screenshots 2 & 3 — per-sensor graph stack

A vertical **small-multiples** stack — one line chart per sensor, shared time axis, one series each:

| Panel | Field | Notes |
|---|---|---|
| WIND SPEED Km/Hr | `wind_speed` | **has a brush/range navigator** (grey draggable strip) to zoom/pan the long series |
| WIND DIRECTION | `wind_dir` | 0–360°; sudden 360↔0 wraps are visible (a directional series) |
| TEMPERATURE °C | `temperature` | |
| PERCENT RELATIVE HUMIDITY | `humidity` | |
| BAROMETRIC PRESSURE hPa | `pressure` | |
| DEW POINT °C | `dew_point` | |
| BATTERY VOLTS | `voltage` | |

All are single-series, **one axis each** (no dual-axis — matches our §4 rule), orange line on dark.
This is exactly `GET /dashboard/met/history?sensor=…` per panel, or one `met/multi-sensor` call
rendered as small multiples.

---

## 3. What the admin panel has today

Current live-dashboard surface (`admin-web/features/dashboard/`):

| Piece | File | Renders as |
|---|---|---|
| KPI row + sparklines | `features/dashboard/kpi-row.tsx` | number tiles |
| **MET live tiles** | `features/dashboard/met-live-tiles.tsx` | **plain number `StatTile`s** for wind/temp/humidity/pressure/solar/precip/dew/voltage |
| MET history | `features/dashboard/met-history-panel.tsx` | **single** line chart + a sensor **picker** (one sensor at a time, no stack, **no brush**) |
| Wind rose | `features/dashboard/wind-rose-panel.tsx` → `components/charts/wind-rose.tsx` | ✅ visx polar rose |
| Fleet map | `features/maps/fleet-map-panel.tsx` | ✅ MapLibre |
| Device status | `features/dashboard/device-status-table.tsx` | table |

Chart primitives we own (`admin-web/components/charts/`): `StatTile`, `Sparkline`,
`TimeSeriesChart`, `WindRose`, `Histogram`, `ScatterChart`, `StackedBar`, `RangeBandChart`,
`CalendarHeatmap`, `Meter` (horizontal bar), `StatusBadge`, `BeaufortScale`.

**Verdict:** we have the *data plumbing*, the *rose*, the *map*, the *line chart*, and *number tiles*.
We are missing the **instrument widgets** (gauge / thermometer / battery) and the **graph-stack + brush**
UX that make the Parklife dashboard read like a control panel rather than a spreadsheet.

---

## 4. The gap — what to add

All front-end. Priority is by how much of the screenshots each unlocks.

| # | Add | New file (proposed) | Replaces / powers | Data source | Effort | Priority |
|---|---|---|---|---|---|---|
| 1 | **`Gauge`** — radial arc gauge (semicircle), coloured arc on a min→max scale, value + unit label, optional threshold bands | `components/charts/gauge.tsx` | Wind speed, humidity, pressure, solar, precip-intensity live tiles | `met/latest` | M | **HIGH** |
| 2 | **`Thermometer`** — vertical bulb+stem fill, colour by temperature band | `components/charts/thermometer.tsx` | Temperature, dew-point live tiles | `met/latest` | S | **HIGH** |
| 3 | **`BatteryGauge`** — battery-icon fill by voltage/level (distinct from the `Meter` bar) | `components/charts/battery-gauge.tsx` | DC voltage / battery live tile | `met/latest` (`voltageV`, `batteryVoltageV`) | S | MED |
| 4 | **Brush / range navigator** on `TimeSeriesChart` (Recharts `<Brush>`) — zoom/pan a long series | extend `components/charts/time-series-chart.tsx` (opt-in `brush` prop) | The graph-stack top chart; any long history | `met/history` | S | MED |
| 5 | **MET "Live" station view** — a curated grid: gauges + thermometers + battery + wind rose + map + big-number tiles, mirroring screenshot 1 | `features/dashboard/met-station-live.tsx` | Upgrades `MetLiveTiles` into an instrument dashboard (plan §14 "fixed curated dashboard per device type") | `met/latest` + `met/windrose` + `org/device-map` | M | **HIGH** |
| 6 | **Per-sensor "Graphs" stack** — small multiples, one line chart per sensor, shared window, brush on the primary | `features/dashboard/met-graph-stack.tsx` | Screenshots 2–3 | `met/history` (×N) or `met/multi-sensor` | M | MED |
| 7 | **Compass arrow** on the wind-direction tile (a tick/arrow, not a 2nd axis) | small addition to `stat-tile.tsx` or a `CompassTile` | Wind direction tile | `met/latest` | XS | LOW |
| 8 | Add **`precipRateMmHr`** to the `MetLatest` type (field is already returned) | `lib/api/types.ts` | Precipitation-intensity tile | — | XS | LOW |

**Two ways to present items 5 & 6 (recommend a tabbed device view):**
- A **`Live | Graphs | Rose | Map`** tab set on the device / dashboard, exactly like the mobile app's
  "rose **or** graph" layout modes (plan §6.1). `Live` = screenshot 1, `Graphs` = screenshots 2–3.

---

## 5. Proposed implementation sketch

### 5.1 `Gauge` (the signature widget)

- **Form:** a 180–270° arc; a background track + a coloured **value arc** from min→value; a needle or a
  filled arc; centre shows `value` + `unit`; min/max labels at the arc ends.
- **Colour:** the arc uses a **sequential** design token (magnitude), **not** a rainbow. Optional
  **threshold bands** use the reserved **status** tokens (e.g. pressure low/normal/high) — never raw hex.
  (Follows §4 / §10.9; the Parklife arcs are yellow/blue/red — we map those *roles*, not those hexes.)
- **Range:** per-sensor min/max (see §6). Ideally sourced from device settings where available, else the
  defaults in §6.
- **A11y:** `role="meter"` with `aria-valuenow/min/max` + a visible numeric label (colour never alone) —
  same contract as our existing `Meter`.
- **Reuse:** SVG arc math is small; no new dependency. Sits beside `Meter` in `components/charts/`.

### 5.2 `Thermometer`

- Vertical rounded stem + bulb; fill height = `(value−min)/(max−min)`; fill colour by temperature band
  (cool→warm sequential, or the comfort/status token). Value + unit beside it. `role="meter"`.

### 5.3 `BatteryGauge`

- Battery outline + fill proportional to level (voltage mapped to a % of a nominal range, e.g. 10–15 V),
  colour by charge band (low = status-error … full = status-ok). Distinct from the horizontal `Meter`.

### 5.4 Brush on `TimeSeriesChart`

- Add an opt-in `brush` prop → render Recharts `<Brush>` under the chart (a range navigator). Keeps the
  single-axis, null-gap, table-view, and export contract intact.

### 5.5 Curated MET "Live" view (screenshot 1)

```
┌ Wind speed (gauge) ┐┌ Wind rose ┐┌ Temperature (thermo) ┐┌ Humidity (gauge) ┐
├ Pressure  (gauge)  ┤├ Dew point (thermo) ┤├ Map (device fix) ┤├ DC voltage (battery) ┤
└ Wind dir (compass) ┘└ Total precip (tile) ┘└ Precip intensity (tile/gauge) ┘
[ Wind speed — live line + brush ]
```

All fed by the existing `met/latest` push (`met:latest` socket event) — live, no polling.

### 5.6 Per-sensor "Graphs" stack (screenshots 2–3)

- Map over the 9 dashboard sensors; render one `TimeSeriesChart` each (single series, one axis),
  brush on the first, all sharing the Scope-Bar window. This is essentially `met-history-panel.tsx`
  promoted from a **picker** to a **stack**.

---

## 6. Data & scale reference (for the gauges/thermometers)

Everything below is already on `MetLatest` (`admin-web/lib/api/types.ts`) except where noted.

| Sensor | Field | Widget | Suggested range | Notes |
|---|---|---|---|---|
| Wind speed | `windSpeedKmh` | Gauge | 0 – 100 km/h | bands 0-25 / 25-50 / 50-75 / 75-100 (as in image) |
| Wind direction | `windDirTrueDeg` | Compass tile | 0 – 360° | arrow/tick, not a gauge |
| Temperature | `tempC` | Thermometer | −10 – 50 °C | |
| Dew point | `dewPointC` | Thermometer | −10 – 30 °C | |
| Humidity | `humidityPct` | Gauge | 0 – 100 % | |
| Pressure | `pressureHpa` | Gauge | 950 – 1050 hPa | tighter band reads better than 0–1100 |
| Solar | `solarWm2` | Gauge | 0 – 1200 W/m² | (not in these shots but same family) |
| Total precip | `precipMm` | Number tile | — | |
| Precip intensity | `precipRateMmHr` | Number tile / gauge | 0 – 50 mm/h | **add field to `MetLatest` type (API already returns it)** |
| DC voltage | `voltageV` | Battery gauge | 10 – 15 V | map to % for the fill |

Per-sensor **history** for the graph stack comes from `GET /dashboard/met/history?deviceId=&sensor=&from=&to=`
(1-min min/avg/max buckets) — one call per panel, keyed on the memoized Scope-Bar window (no loop).

---

## 7. Design-system & a11y rules for the new widgets

Non-negotiables carried over from `plan.md` §4 / §10.9 (so the new widgets match the rest of the app):

- **Colour by role, never raw hex.** Gauge/thermometer arcs use **sequential** tokens for magnitude and
  **reserved status** tokens for threshold bands — never the Parklife yellow/blue/red literally.
- **Colour never alone.** Every gauge/thermometer/battery ships a **visible numeric value + unit** and
  `role="meter"` with `aria-valuenow/min/max` (same as `Meter`).
- **One axis, ever.** The graph stack is **small multiples** (one metric per panel), not dual-axis.
- **Null = gap.** A missing reading shows `–` / an empty gauge, **never a fabricated 0** (§10.2).
- **Live via socket, refetch is truth.** `met:latest` updates the gauges; on reconnect, refetch.
- **Table-view + export** stay available on the chart-based pieces (graph stack), per the DoD.

---

## 8. Summary

| Screenshot element | Status | Action |
|---|---|---|
| Wind rose | ✅ have | reuse |
| Map | ✅ have | add per-device latest-fix layer |
| Time-series line charts | ✅ have | add **brush** + promote history to a **stack** |
| Big-number tiles (wind dir, precip) | ✅ have | add compass arrow; add `precipRateMmHr` to type |
| **Radial gauges** (wind speed, humidity, pressure) | ❌ **missing** | **build `Gauge`** |
| **Thermometers** (temp, dew point) | ❌ **missing** | **build `Thermometer`** |
| **Battery gauge** (DC voltage) | ❌ **missing** | **build `BatteryGauge`** |
| **Curated station "Live" grid** | ❌ **missing** | **build `met-station-live.tsx`** |
| **Per-sensor graph stack** | ⚠️ partial (picker only) | **build `met-graph-stack.tsx`** |

**Bottom line:** ~3 small primitives (`Gauge`, `Thermometer`, `BatteryGauge`) + a `Brush` prop + two
composition views turn our current "numbers" dashboard into the instrument dashboard the Parklife
screenshots show — with **no backend work**, reusing the live `met/latest` / `met/history` data we
already consume. Recommend building `Gauge`, `Thermometer`, and the curated **Live** view first
(highest visual payoff), then the graph stack + brush.
