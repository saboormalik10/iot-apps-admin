# MTS Sydney Metro M1 — portal design prototype (UI only)

## Context

Observator Instruments bid to **Metro Trains Sydney** for a weather monitoring and
alerting system on the Sydney Metro M1 line (`MTS-Proposal-31072026-1.pdf`, 52 pp,
ref `OBS-MTS-M1-WX-2026-01`). We (Veldora) proposed the software half — ingest,
server and portal — in `MTS_DEVELOPMENT_PROPOSAL_REV_B.md` (3 Sep 2026, the current
revision: 3 months, three releases, responsive web only, no SMS, no native app).

Nothing has been built. Before committing to the real build, the client wants to see
**the whole portal as a design** — every screen, looking finished, so both sides agree
on what is being built. This plan covers that prototype only.

**It is a design, not a product.** No backend, no database, no sensors, no alerts
leaving the browser. Every number on screen is demonstration data, exactly as the
client's own mockups are captioned.

**Why it matters that it looks right:** this is a safety-critical rail system. Its
alerts trigger front-of-train patrols, temporary speed restrictions and blocking the
line, and one screen supervises real flood pumps. The prototype has to read as
something an operations centre would trust at 2 a.m.

---

## What the client has already drawn

The PDF contains finished mockups — these are the design brief, not a starting point
to improvise on. Figures seen and to be reproduced faithfully:

| Figure | Page | Screen |
|---|---|---|
| 6 | 37 | Corridor map + station-status table |
| 7 | 37 | Trends — 2×2 charts with dashed thresholds |
| 8 | 38 | Flood event — level series, pumps, vicinity inset, event log |
| 9 | 38 | Responsive: 1 column phone → 2 tablet → 3–4 desktop |
| 12 | 20 | Marrickville pump station (desktop) |
| 13 | 39 | Marrickville pump station (phone) |
| 14 | 43 | User management |
| 15 | 35 | Alerts & notifications |
| 17 | 33 | Alert & warning rules + edit drawer |
| — | 34 | PTZ verification pop-up |

House style from those mockups: **navy header bar** carrying `OBSERVATOR | Weather
Monitoring Portal — Sydney Metro M1`, a live AEST clock and status chips; white cards
with thin borders on a pale blue-grey page; dense tables with a navy header row;
pill status badges with a leading dot; **green** normal/running, **amber** warning,
**red** alert/stop, **grey** offline, **blue** primary action and water.

---

## Decisions taken

| | |
|---|---|
| **Location** | `mts/` at the repo root, app in `mts/web/`, this plan copied to `mts/PLAN.md` |
| **Look** | A **fresh identity for MTS** — not a reuse of the Observator portal's appearance. Its *code conventions* are followed; its palette is not |
| **Interactivity** | Clickable demo with local state: acknowledge an alert, switch AUTO/MANUAL and confirm a pump start, run a query, edit a threshold, change station. Nothing persists; a reload restores the scenario |
| **Delivery** | Plain Next.js app, Vercel-ready. No static export step for now |
| **Scope** | Every screen in the PDF, plus the ones the documents promise in prose but never drew |

---

## Structure

```
mts/
  PLAN.md                     ← this document
  web/
    app/
      layout.tsx              ← tokens.css + globals.css, providers, no auth gate
      (auth)/                 login · mfa · accept-invite · forgot-password
      (portal)/
        layout.tsx            ← app shell: navy header, nav, alert ticker
        page.tsx              ← corridor map (home)
        trends/ flood/ health/ history/ alerts/ alerts/[id]/
        stations/[id]/        ← station detail (pump block when fitted)
        admin/ users/ roles/ rules/ recipients/ audit/
    components/
      ui/                     ← shadcn primitives (button, dialog, table, …)
      charts/                 ← chart-frame, threshold-line, series primitives
      corridor/               ← the schematic rail map
      status/                 ← severity pill, status dot, reading card
      screen-states.tsx       ← loading / empty / error / stale
    features/<domain>/        ← the real UI per screen, mirroring admin-web's split
    mocks/                    ← the entire data layer (see below)
    styles/tokens.css         ← the MTS palette
    scripts/validate_palette.js
```

Conventions copied from `admin-web` (they are settled and worth not re-litigating):
Next 15 App Router, React 19, TypeScript strict, **yarn**, path alias `@/* → ./*`,
Tailwind 3.4 with semantic HSL variables, shadcn/ui "new-york" + Radix + lucide,
thin route pages importing from `features/`, kebab-case filenames, Recharts for
cartesian charts and visx for polar, `cn()` in `lib/utils.ts`.

Deliberately **not** copied: the BFF (`app/api`, `lib/bff/*`), `iron-session`,
`middleware.ts` auth redirects, `lib/config/env.ts` (throws without a session
secret), realtime/socket.io, the RBAC guards, Sentry, maplibre.

---

## Design system

A fresh token set in `styles/tokens.css`, same technique as `admin-web` (HSL channel
triplets, semantic roles, light + `[data-theme=dark]` + a `prefers-color-scheme`
block) but an MTS palette drawn from the mockups:

- **Surfaces** — pale blue-grey page, white cards, **navy header** (`--header`,
  its own role: it is a brand surface, not `--card`).
- **Severity scale** — `alert` (red), `warning` (amber), `info` (blue), `normal`
  (green), `offline` (grey), `cleared` (muted green). Every one carries a
  `-foreground` and a `-tint` for badge backgrounds.
- **Operational states** — `running`, `ready`, `fault`, `manual` for pumps; these
  are not the same as severity and must not borrow its tokens.
- **Series palette** — `--chart-1..8` plus `--chart-surface`, validated by
  `scripts/validate_palette.js` (copied over: it reads `styles/tokens.css`
  relative to itself, so it works unchanged). Water level, rainfall, wind mean,
  wind gust, temperature and humidity get fixed roles so a series never changes
  colour between screens.
- **Threshold/annotation** — a dedicated `--threshold` (red dashed lines), and
  `--band-*` for the shaded "pumps running" event band.

Rules: no raw hex at a call site, no colour-only status (every pill has a dot and a
word), `–` for missing values rather than a fake `0`, and `yarn validate-palette`
must pass in both modes.

---

## Mock data

Three layers, so the real build can replace the bottom one and keep the rest:

1. **`mocks/fixtures/*`** — the world as static data, taken from the mockups so the
   client recognises it:
   - **7 locations / 8 loggers**: Marrickville · Marrickville–Dulwich Hill ·
     Canterbury · Campsie · Belmore triangle · Lady Game Drive (tunnel — two
     monitoring points, up and down, shown as one place) · Windsor Road SSC. Each
     with kilometrage (`MSW 6.480–6.690`), station ID (`MKV-01`), sensors fitted,
     and per-sensor logger IDs (`MKV-RIMCO-01`, `MKV-YGRD-01`, `BEL-RIMCO-01`).
   - **Power telemetry** per station — state of charge, PV input, charge/discharge,
     fault flags (400 W panel, 2 × 55 Ah LiFePO4), which §8.6 requires displayed
     live and alarmed as a leading indicator.
   - **Eight users** with the names in Figure 14 (S. Chen, J. Okoro, P. Nair,
     T. Reilly, A. Khan, D. Smith, M. Lee, E. Wilson), their role chips — P. Nair
     holds two, *Pump Controller* + *Operator* — station scope, status
     (Active / Suspended / Invited) and last login.
   - **The nine alert rules** of Figure 17, verbatim, including the disabled
     "Wind — extreme" row and the `rule set v7 · last change S.Chen` footer.
   - **A seeded event history** using the client's own alert wording, e.g.
     *"Water level +120 mm exceeded pump-start +100 mm — DUTY pumps started"* and
     *"Initiate CJC-T front-of-train patrol (Hurlstone Park–Bankstown)"*.
2. **`mocks/scenario.ts`** — the demo's *state*: which alerts are unacknowledged,
   pump mode and running state, rule edits. Held in a React store, mutated by the
   UI, reset on reload.
3. **`mocks/api.ts`** — functions shaped like a real API (`listAlerts(q)`,
   `getStation(id)`, `runQuery(q)`) returning promises, consumed through hooks with
   the same `{ data, isLoading, isError }` contract the real app uses. Swapping in
   a real client later is a change to this file only.

Time series are generated from seeded pseudo-random walks so every reload looks the
same — a demo that changes shape each time it is opened is not reviewable. The
header clock ticks and "updated N s ago" counts up, because a frozen clock makes a
live system look dead; the readings themselves do not drift on their own.

**The corridor map** is schematic, not geographic — the client's Figure 6 draws the
line as a stylised route, not a real basemap. It is therefore a hand-authored SVG
with the rail line as a path and station positions as data (`{ id, x, y }` in the
fixtures), so pins, status colours, blinking camera icons and reading cards are all
driven by the same state as the rest of the app and nothing is hard-coded twice. No
map library, no tiles, no network — and it stays crisp at any size.

---

## Architecture decisions

**One swap point.** `lib/api/endpoints.ts` is the only module the screens import for
data. Today it re-exports `lib/mock/api.ts`; in the real build it becomes HTTP calls
and `lib/mock/` is deleted whole. An eslint `no-restricted-imports` rule forbids
anything under `features/**` or `components/**` from importing `lib/mock/*`, so the
boundary cannot rot. The wire types live in `lib/api/types.ts`, on the real side of
the line — they are a deliverable of this prototype, since they are what both sides
are agreeing to.

**Readings are a pure function of time**, not stored values that get nudged:
`value(sensor, t)`. A tile's big number and the last point of its sparkline come from
the same call, so they always agree — which is most of the difference between a
prototype that feels real and one that feels assembled. History and "now" are the
same function over different windows, seeded so every reload is identical.

**One mutable store**, module-scope (not React state), holding only: acknowledged
events, injected events, pump runtime, rule overrides and enables, user edits,
notification prefs, the "view as" role. Client navigation keeps it; a reload clears
it. No localStorage — a demo that remembers yesterday starts in the wrong state. A
"Reset demo" action restores the opening scenario between stakeholders.

**Every threshold number lives in `mocks/seed/thresholds.ts`** — values and their
display strings. They appear on the corridor table, six chart reference lines, the
rules list, the rule drawer, the alert messages and the station cards; if any two
disagree the client stops trusting all of it. A `yarn check-thresholds` script greps
`features/` for stray numerals and fails.

**The corridor map** is a hand-authored spine polyline (~40 points) plus a pure
`chainageToPoint(km)` function, so adding a station to the fixtures places it
correctly with no drawing. The SVG carries the line, ticks and pins; the floating
reading cards are HTML positioned from the same geometry (text, badges and hover are
painful in SVG). Three variants, not one that shrinks: curved spine on desktop,
straightened rail on tablet, and a vertical list with a rail gutter on a phone —
nobody pinch-zooms a schematic at 2 a.m. Pins carry a shape as well as a colour.

**A demo dock**, hidden behind `?dev=1`: play/pause and speed the clock, jump to a
scenario (normal / rain warning / flood / comms loss), force loading, error and empty
states, and switch the viewing role. It is the presenter's remote control and the
way the four screen states are actually testable. The scripted alert timeline is
**off by default** — an alert arriving unbidden mid-sentence is noise, the same alert
on cue is the whole point.

**No next-intl.** Twelve screens of operational copy in a message catalogue triples
the cost of every wording change, and wording will change constantly in review.
Plain strings, but no concatenated sentences and all number/time/unit formatting
through `lib/format.ts`, so adding a catalogue later is mechanical. Recorded here so
the real build knows it was a decision.

**Charts** downsample at generation time to the requested interval and cap at ~750
rendered points; seven days of one-minute data is 10,080 points a series and would
stutter in front of the client.

## Saying it is a prototype

Non-negotiable, because a screenshot of this outlives the meeting it was shown in:

- A thin, permanent banner in the shell.
- A "synthetic" mark inside every chart frame, so a *cropped* screenshot still says so.
- Exported CSVs open with a `# SYNTHETIC DEMO DATA …` comment line.
- The pump confirm dialog carries the notice in its own body — "no command is sent to
  any plant" — and the result is phrased as simulated. The pump panel shows the
  supervisory chain the real system will have (command issued → acknowledged → contactor
  closed → flow confirmed) with the last three greyed as awaiting integration: that
  turns a fake into a specification, which is what the prototype is for.
- Kilometrages are shown as visible placeholders — Rev B §13 asks MTS to supply them,
  so inventing them silently would answer an open question on the client's behalf.
- SMS appears as a greyed channel with the reason "out of scope (Rev B §10)", rather
  than being silently absent: the client asked for it once and will ask again.

## Milestones

Each is independently reviewable in a browser.

0. **This plan into the repo** — written to `mts/PLAN.md` as the project's own
   document, so it lives beside the code rather than only in a chat.
1. **Foundation** — app scaffold (`yarn create next-app` shaped to the house
   conventions, plus its own `.gitignore`: the root one does not cover `.next/`),
   tokens + palette validator passing, shell (navy header, clock, status chips,
   alert ticker, nav), screen-states, the fixture set.
2. **Corridor map** — the schematic line, station pins with reading cards, legend,
   status table. The screen the client will judge first.
3. **Station detail + pump** — sensor cards with sparklines, thresholds chart,
   pump panel, condition tiles, AUTO/MANUAL, supervised START/STOP with
   confirmation, activity timeline. The riskiest screen; see below.
4. **Trends + flood event** — the chart language for the whole product: dashed
   thresholds with inline labels, "now" badges, over-threshold bars in red, the
   shaded pumps-running band, event log.
5. **Alerts, alert detail, PTZ modal** — KPI tiles, filters, acknowledge, the deep
   link target, the blinking-camera verification pop-up.
6. **History query** — multiselects, run, paged sortable table, CSV.
7. **Administration** — users with multi-role chips and station scope, the rules
   list + edit drawer, roles, recipients, audit.
8. **System health** and the undrawn screens — then a responsive pass at 375 /
   800 / 1440, a dark-mode pass, and an accessibility pass.

---

## Screens the documents never drew

These are promised in prose but have no mockup, so the prototype invents them. They
should be marked as proposals when the client reviews, not presented as settled:

**System health** (five conditions: inoperable, unresponsive, missing sensor data,
missing pump data, low battery, plus the solar/battery telemetry of §8.6) ·
**alert/event detail** — the target of the "direct hyperlink to the event" every
alert carries · **audit trail** · **roles / permission matrix** and custom-role
creation · **recipients and notification routing** · **per-user notification
preferences** · **add/edit user dialogs** · the **auth flows** (login, MFA
challenge, invitation accept, forgot/reset, lockout, inactivity warning) ·
**station detail for the non-pump locations**, including Lady Game Drive's two
monitoring points shown as one place · **pending / failed / timed-out** states for
a pump command · **stale-reading treatment** on every card (a station silent for
15 minutes is itself an alert condition).

## Where the risk is

- **The pump screen.** It implies control of real plant. Every control must make its
  non-functional status obvious in the prototype (a persistent "demonstration data"
  marker), and the confirmation dialog must show what the real one will: what is
  about to happen, to which pump, on whose authority. The real build also needs
  pending/failed/timed-out command states — the UI must never imply a command
  succeeded when it did not. Those states get designed here.
- **The corridor map** is schematic, not geographic, and must stay crisp and
  readable on a phone.
- **Screens the documents never drew** — system health, alert detail, audit, roles,
  recipients, notification preferences, the auth flows. These are invention, and
  should be flagged as such when the client reviews.
- **SMS.** The client's PDF promises SMS; our Rev B replaced it with web push. The
  UI should show Screen / Email / Web push and not imply SMS is being delivered.

---

## The screen list

Nav across the mockups is **Map · Trends · Flood · Station · History · Alerts ·
Admin**, with Health added.

| Route | Screen | Source |
|---|---|---|
| `/` | Corridor map + station status table | Fig 6 |
| `/trends` | Trends — wind mean/gust, rainfall, temperature, humidity, **level** | Fig 7 (+ Rev B adds level) |
| `/flood` | Flood event | Fig 8 |
| `/stations/[id]` | Station detail; pump block where fitted | Fig 12 / 13 |
| `/health` | System health | invented |
| `/alerts`, `/alerts/[id]` | Alerts & notifications; event detail | Fig 15; detail invented |
| `/history` | Historical query + CSV | Fig 10 |
| `/admin/users` | User management | Fig 14 |
| `/admin/rules` | Alert & warning rules + edit drawer | Fig 17 |
| `/admin/roles`, `/admin/recipients`, `/admin/audit` | Roles, recipients, audit | invented |
| `(auth)/*` | Login, MFA, accept invite, forgot/reset | invented |
| modal | PTZ verification pop-up | p.34 |

## Verification

- `yarn dev` and walk every route; `yarn build` clean.
- `yarn validate-palette` passes light and dark.
- Every screen at 375 px, 800 px and 1440 px with no sideways scroll, in both themes.
- The five demo journeys work end to end: acknowledge an alert → it moves to
  acknowledged with a name and time; switch to MANUAL → START PUMP → confirm → the
  pump panel and activity timeline update; run a history query → the table filters
  and paginates; edit a rule → the list reflects it; open the PTZ pop-up from a map
  pin.
- Screenshots of every screen for the client, as was done for the standalone guide.

## Not in this prototype

No backend, database, ingest, scheduler, authentication, email, web push or pump
command path — this is the design. No native mobile app (Rev B removed it; the phone
experience is this same app laid out for a phone). SMS is not shown as a delivery
channel, because Rev B replaced it with web push. Nothing here is a commitment to
the numbers on screen: every figure is demonstration data, and the prototype says so
on screen.

---

## QA record

Two independent review passes were run against the running prototype and both are
now closed.

**Round 1 — coverage against `MTS-Proposal-31072026-1.pdf`.** Checked every clause
of §7–§9 against a screen. It found that the screens disagreed with each other: the
flood log, the pump panel, the station page and the alerts feed each quoted their
own times and levels. The cause was hand-written event text carrying hard-coded
numbers, over a weather model whose peaks never actually reached the thresholds the
alerts claimed.

**Round 2 — visual and interaction quality.** 120 screenshots across 20 routes, 3
widths and both themes, plus keyboard and interaction passes. It found layout
breakage at 375 px, controls that did nothing, and counts that drifted between the
header and the page.

### What changed as a result

- **One timeline.** The storm is a single afternoon, generated in **Sydney** time
  (the model used to read the machine's clock, so on a UTC host the "14:32 storm"
  displayed at a different hour than the header). Every event time — duty pump
  start, high-high, rail foot, vigilance expiry, the PTZ request — is now read off
  the level and rainfall curves rather than written down, so the log, the chart, the
  pump panel and the history screen cannot disagree. Previous days get ordinary
  weather, which is what stopped the history screen showing a flood every day.
- **Levels that make sense.** The Marrickville peak was half a metre over the rail
  foot; it now peaks around +260 mm, crosses the rail foot at the top of the storm
  and recedes below the pump-stop level by evening.
- **Map geometry.** The pins were inside a square-fitted SVG while the cards were
  positioned as a percentage of a 2:1 frame, so a pin and its card could be three
  hundred pixels apart. The lines are now a stretched SVG and everything else is
  HTML on the same coordinates; pins carry their number at every width, and the
  numbers match the station list.
- **Controls that work.** Add / edit / remove / suspend users (with confirmations,
  and never on your own account), new rule, new role, alert date range and paging,
  history date pickers and sortable columns, working CSV exports, and pump START /
  STOP offered only when the pump is in the opposite state.
- **One source for every count.** The header chip, the bell badge and each page's
  own tiles read the same counter and move on the same frame.
- **Accessibility and contrast.** Skip link, one `h1` per page in outline order,
  labelled controls, Escape closes the mobile menu, and the banner, status chips and
  small text re-toned so nothing sits under 4.5:1 in either theme.

### Standing verification

`yarn build`, `npx tsc --noEmit` and `npx eslint .` are clean; `yarn validate-palette`
passes in both modes; 20 routes × 3 widths × 2 themes show no horizontal scroll and
no console errors.

### The one deliberate deviation

The client's PDF promises **SMS**. Rev B replaced it with web push, so the prototype
shows Screen / Email / Web push and marks SMS unavailable with the reason. This is a
decision to confirm with MTS, not an omission.

---

## Round 3 — charts, colour management, responsiveness, PDF re-check

### Colour management
- The series palette was replaced. Measured against the stricter standard (OKLab ΔE,
  Machado CVD simulation, normal-vision floor 15), the old one **failed in both
  modes** — two dark-mode greens 6 ΔE apart, red and yellow collapsing to 2.9 under
  deuteranopia. The in-repo checker had used a weaker metric and treated CVD as
  advisory, so it never caught it.
- New: a validated 8-slot categorical palette, plus a sequential ramp (heatmaps), an
  ordinal ramp (wind-rose speeds) and a diverging pair (rate of rise), all in
  `styles/tokens.css`. Which parameter wears which colour is decided once, in
  `lib/viz/roles.ts`; slot 8 (red) is held back because it reads as an alarm.
- `yarn validate-palette` now gates every ramp in both themes, plus status-text
  contrast (WCAG 4.5:1). `/design` runs the same checks live in the browser.

### New charts, and the job each one does
| Screen | Chart | Why |
|---|---|---|
| Corridor | Rainfall vigilance board (meters + countdown) | §7.2 tally board and 6/12/48 h countdown |
| Corridor | 24-hour threshold timeline, all locations | "what happened overnight?" in one picture |
| Trends | Wind rose | direction matters to the wind TSR rules |
| Trends | Rolling 1 h / 3 h totals vs 25 / 45 mm | what the rule engine actually compares |
| Trends | Compare locations (small multiples, shared scale) | the outlier is obvious on one scale |
| Flood | Sump gauge against every set point | "which lines are we above?" at a glance |
| Flood | Rate of rise (diverging) | §7.3 "trending down" is a sign, not a curve |
| Flood | Staged reinstatement tracker | §7.3 25 → 60 kph → unrestricted |
| Station | Local control logic, starts-per-hour meter, radar/float cross-check | §5.6 |
| Station | Pump run time per physical pump | lead/lag wear balance |
| Station | Power — 7-day state of charge, voltage, autonomy | §5.7 / §8.6 leading indicator |
| Alerts | Alerts per day by severity; delivery time vs the 5-min limit | §7.1 |
| History | Rainfall by hour × day, both gauges | the pattern a trend line hides |
| Health | Availability budget vs §9 limits; calibration; data quality | §9, §11.1, §8.2 |

### PDF gaps closed
Annotating alerts (§8.1) · per-channel delivery and retry (§8.2) · 48 h maintenance
notice (§8.1) · scheduled rules (§7.3) · mobile number and notification preferences
(§8.4) · the §7.4 fallback pairings as the PDF states them.

### Consistency fixes the new charts forced
Rainfall is now the rolling 1-hour total everywhere (the rule's own definition), so
the card, alert and vigilance board agree to the minute. The 3-hour and 3-day
alerts now exist and fire from their tallies. Pump cards, run-time chart and
activity feed read one simulation. The model no longer drizzles constantly. The
weather is generated in Sydney time. The header's alert counts are client-only
(the server's clock ran ahead and caused a hydration mismatch).

### Questions this round raises for MTS
- §7.4 names a wind fallback to "Marrickville station", which has no anemometer in §6.
- §7.4 names no wind alternate for Windsor Road.
- Stage timings after the track inspection in the reinstatement sequence.
- SMS (unchanged from before).

---

## Round 4 — deep audit against the PDF and the client's own figures

The PDF's mockup pages (Figures 6–17) were rendered and compared screen by screen,
§1–§15 were re-read in full, and every page was captured at desktop, tablet and phone
in both themes. What that found, and what changed:

### Station pages, rebuilt
- **Thresholds per location.** Pump set points (pump-start, high-high) appeared on
  every station; only Marrickville has pumps. Non-pump flood points are now judged on
  standing water (+80, PTZ check) and the rail foot (+200).
- **Lady Game Drive** showed two unlabelled "Water level" cards, drew both sparklines
  from the up-tunnel sensor, and charted only one tunnel. Each card now names its
  tunnel, each sparkline is its own sensor, and both tunnels are on the chart.
- **Every station charts what it measures.** Windsor Road had no chart at all. Now:
  rolling rainfall, wind (2-min mean / 3-s gust), wind rose, temperature, humidity
  and pressure, with a shared crosshair.
- **New detail from the PDF:** wind direction (§5.4), barometric pressure (§4, GMX300),
  10-min / 6 h / 24 h rain totals (§5.1), radar/float cross-check text (§5.2), staff-
  gauge field check (§5.2), telemetry and fast reporting (§4, §5.2), store-and-forward
  record (§8.5), equipment and OMC-048 terminal wiring (§4.3, §5, §5.7), immediate
  pump alarms (§5.6), pumped volume, maintenance mode (§8.4).
- On a phone the pump controls now follow the readings directly (Figure 13).

### The model, made honest
- Water-level status now follows the rules: standing water is an alert everywhere.
- Rate-of-rise (§5.2) and trending-down (§7.3) are real rules with real events.
- History entries quote the model's own peaks; five hand-written ones were wrong
  (a "91 km/h" gust that was 76; a "60 km/h mean" that peaked at 47).
- The audit trail is assembled from the alert log, sign-ins, pump exercises and this
  session's own actions; it had contradicted the alert log.
- Campsie's radar fault is real: no radar data from 10:58, float switch carries on.
- Dry-weather water levels lowered so fast reporting starts with the rain, not before.
- A millisecond error in the Sydney-midnight helper split days in two in the browser
  (the pump card read "0 starts" beside a running pump). Fixed in both helpers.

### Charts
- Latest-value dot and event markers on time series (Figures 7 and 12).
- A true time axis with clean ticks (on the hour, at midnight), and sampling on clean
  clock steps — no more "15:01" bar labels or "25 Sept 25 Sept".
- Crosshairs synchronised by time, not index.
- Map cards show value /threshold (Figure 6); the legend carries system fields.

### New screens
- `/health/pipeline` — Figure 11's five modules, counted, with a 24-hour message chart.
- `/coverage` — every portal requirement in the PDF, linked to the screen that answers it.
- `/locked` and an inactivity-timeout warning (§8.4).

### Verification
`tsc`, `eslint`, `yarn validate-palette` and `yarn build` clean. 29 routes × 6 widths ×
2 themes: no horizontal scroll, no console errors. Interaction checks: maintenance mode,
manual pump stop, audit recording, inactivity warning.

## Round 5 — the rest of the PDF, made visible

§1–§15 and Appendix A re-read against the code, figure by figure. Everything the PDF
says the portal *does* now has a screen, and everything it says about the *stations*
is drawn on them.

### The storm plays on
- **Demo time** (bottom right, marked as a prototype control): pause, ×1, ×10, ×60,
  and "jump to" each moment of the story — read from the event log, so it cannot
  drift: rise, duty pump, rain alert, standby, block the line, the Canterbury PTZ
  check, trending down, below rail foot, pumps stop, rain all-clear, and Campsie's
  repair the next morning. Every screen re-reads when time moves.
- **§7.5 PTZ, end to end.** The standing-water pop-up appears by itself when the alert
  is raised (only for alerts in the last 15 minutes), with snooze; the map's blinking
  camera and a station-header button open the same dialog; "View live PTZ feed" shows
  a simulated camera with pan/tilt/zoom, a "lowest point" preset, the live level on a
  staff gauge, and "water confirmed — acknowledge". The feed says it is simulated.

### Rules engine (§7.3, §5.4, §13)
- **Test against the last 24 hours.** The draft rule — not the saved one — is dry-run
  over stored readings at every location it covers, with the live engine's state
  machine: dwell, clear dwell, vigilance, reset on re-trigger, and the trending-down
  rule's "armed by a block". Drawn as reading vs threshold, in-force and vigilance
  bands, and "raised" markers; re-runs as you type.
- **Version history** v1 → v7 with field-level diffs (was / now), restore as a new
  version (history only grows), and each save in the session publishing v8, v9…
  The footer, the panel and the audit trail read one list.
- **CCB note:** rule edits are configuration, live on save; portal changes and
  non-like-for-like equipment go to the CCB (§13).
- **Gust-or-mean** selector on wind rules; an advisory when a warning is set at or
  above its own alert.
- **Locations without the sensor are greyed** in "Applies to". This found two seed
  errors: rain-intensity listed Canterbury (no gauge) and wind-extreme listed four
  sites with no anemometer. Both corrected.

### Stations (§5.6, §5.7, §6.2, §8.6, §5.1–5.4)
- **Site elevation, live** (Figure 2 / §6.2) for all seven: VM5F mast with the
  WindSonic at ~10 m (broken axis), GMX300 and RIMCO at 1.5–2 m, 2.5 m flood mast with
  radar, beam, float and staff gauge with set points, IP66 cabinet, 400 W panel —
  water drawn against the rail; Marrickville's wet well with both pumps; both tunnel
  units; Windsor Road's single-span crossing and its wind-channelling note.
- **Figure 5, live:** inputs → OMC-048 rules (each MET / ARMED / ALARM / standing by)
  → panel → duty / standby → outfall, with the alarm bar to the server. Debounce,
  run-dry inhibit and standby cut-in added to the protection facts.
- **Charge-controller report** (§8.6): battery V, signed charge/discharge current,
  and every fault flag, raised or clear — on Health and on each station.
- **Requirement vs provided** for each fitted instrument (§5.1–5.4), with the PDF's
  own "comply / to confirm / configurable / clarify" qualifiers.
- Rain note counts 0.2 mm tips; header says GPS is pending survey (§15).

### Health (§11.2, §9)
- **Work orders** against the §11.2 clocks — response ≤ 6 h, investigation ≤ 12 h,
  repair ≤ 24 h — drawn as a track with the three deadlines and each step where it
  happened. A low battery gets an order but no clock (nothing has failed).
- **Availability strip** now derived from the record. It had painted four amber cells
  "an hour ago" for a fault running since 10:58, and called 12 hours "24".

### One incident, one timeline
Campsie's radar fault was told on six screens with drifting times (the health finding
said "since 13:29"). It is now one record — `seed/incidents.ts` — read by the
generator, alert log, findings, strip, maintenance mode and work order: fails 10:58,
alert 11:04, on site 11:41, diagnosed 12:26, repaired 07:40, closed 07:52. Jumping to
07:52 closes the order, clears the finding, ends maintenance and restores the reading
— checked end to end. Lady Game Drive's battery dip is now a soiled panel the
controller flags as PV under-yield, cleaned in the overnight possession.

### Flood, corridor, history, pipeline
- **Figure 8 vicinity inset** — the stretch of line between the two Marrickville
  points, the wet section shaded, the pump station placed.
- **§7.2 vigilance timeline** — a Gantt per rule over the last day, Sydney-aligned.
- **§8.3 trend analysis** — after a query, one chart per parameter (never two axes),
  a line per location in its fixed colour, with lowest / mean / highest and time over
  the line from a 5-minute grid.
- **Pipeline:** the Blue2 framework mapped to the portal (§3.1), "other connected
  systems" as an output (§8.2), and a hosting panel (§8.1): cloud, failover, backups,
  48 h notice, 20 logins, region left to MTS.
- **Event page:** raised / acknowledged markers on the chart, and "Print incident
  report" (the shell hides itself on paper).
- **Coverage page:** a §3 row, the new rows above, §11.2 moved from "outside" to
  shown, and a §15 section — every confirmation sought from MTS and where it is flagged.

### Charts, everywhere
- Thresholded charts now get round axes (0–40, 0–250) instead of "0 60 120 230".
- Event markers near the right edge read leftwards instead of being cut off.

### Verification
`tsc`, `eslint`, `yarn validate-palette` and `yarn build` clean. 29 routes at 375,
768, 1024 and 1440 in both themes: no horizontal scroll, no console errors. Journeys
checked: dry run, save → v8, restore → v9, warning/alert advisory, PTZ pop-up from
a jump, Campsie repair at 07:52.
