# Lighthouse budget

Enforced in CI by the `e2e` job (`yarn lighthouse:auth`). It measures the
**authenticated** routes, not just `/login` — the pages with charts in them are
the ones worth a budget, and they are all behind auth.
`scripts/lighthouse-session.mjs` mints a real BFF session cookie and hands it to
Lighthouse via `extraHeaders`, which avoids scripting a browser login.

## Current state (desktop preset, measured against the live backend)

| Route | Perf | A11y | CLS | LCP | TBT |
| --- | :-: | :-: | :-: | :-: | :-: |
| `/login` | 1.00 | 1.00 | 0.000 | 599 ms | 12 ms |
| `/` (dashboard) | 0.87 | 1.00 | **0.154** ⚠ | 926 ms | 196 ms |
| `/devices` | 0.99 | 1.00 | 0.044 | 847 ms | 76 ms |
| `/records` | 1.00 | 1.00 | 0.000 | 812 ms | 55 ms |
| `/analytics` | 0.99 | 1.00 | 0.000 | 856 ms | 78 ms |
| `/map` | 0.98 | 1.00 | 0.000 | 849 ms | 45 ms |
| `/roles` | 0.99 | 1.00 | 0.000 | 989 ms | 8 ms |
| `/platform` | 1.00 | 1.00 | 0.000 | 809 ms | 10 ms |
| `/stream-types` | 1.00 | 1.00 | 0.000 | 806 ms | 5 ms |

**The route list was stale until M24 W2.** It gated `/sessions` — a page disabled
in M15 W4 and flag-gated out of the nav, so no user could reach it — while every
route built in M16–M23 had no budget at all. It now covers what actually ships.

## Budgets

Two groups (`assertMatrix`). LHCI applies **every** matching entry, so the strict
group's pattern deliberately excludes the bare root — otherwise it would override
the dashboard's carve-out.

| | every route except `/` | `/` (dashboard) |
| --- | :-: | :-: |
| Performance | ≥ 0.80 error | ≥ 0.70 error |
| Accessibility | ≥ 0.95 error | ≥ 0.95 error |
| LCP | ≤ 2500 ms error | ≤ 3000 ms error |
| TBT | ≤ 400 ms error | ≤ 800 ms error |
| CLS | ≤ 0.1 **error** | ≤ 0.1 **warn** |

The dashboard's looser numbers are not a grade — they are headroom over the
observed run-to-run spread. It renders charts, a WebGL map and a live socket.

## The one carve-out: dashboard CLS

`/` is the only route that misses a budget, so its CLS assertion is a `warn`
while every other route holds the 0.1 `error`. **This is a known gap, not a
passing grade.**

### What the previous write-up got wrong

It recorded CLS 0.12 and blamed `MetStationLive` and `NepLiveTile`. Re-measured
in M24 W2 with a `layout-shift` PerformanceObserver plus per-section height
sampling, both parts were wrong:

- the real baseline was **0.388 / 0.117 / 0.391** across three consecutive runs —
  0.12 was the lucky run, not the number;
- `NepLiveTile` had been switched off since M15, so it could not have contributed
  at all;
- there were **four** independent contributors, and the instrument grid the note
  named was not the largest.

Measured section heights during load, before the fix:

| | KPI row | station block | map + table |
| --- | :-: | :-: | :-: |
| 342 ms | 32 | 270 | 359 |
| 504 ms | 32 | 270 | **223** |
| 661 ms | 32 | **1158** | 223 |
| 802 ms | **98** | **781** | **359** |
| 1245 ms | 98 | **960** | 359 |

### What was fixed

1. **`KpiRow`** rendered `<TableSkeleton rows={1}>` — 32px against a loaded 98px,
   dropping the whole page 66px. Now renders the same `StatTile` grid with
   `text-transparent` text, so the line boxes are the real ones.
2. **`FleetMapPanel`** reserved `h-[320px]` on its loading and empty branches but
   **not on the `dynamic()` import's `loading:` fallback**, which is declared at
   module scope where the height is out of reach. While the maplibre chunk
   downloaded the panel collapsed and sprang back. The height moved to a wrapper.
3. **`MetStationLive`** swapped a spinner for a ~1000px grid. It now renders a
   tile-shaped skeleton built from the same catalogue and the same `show()`, so
   the loaded view arrives at the same height.
4. **`WindRosePanel`** grew ~236px when the rose landed. All of its states are now
   pinned to one measured `min-h-[454px]` — legitimate here, unlike the tile grid,
   because the rose is a fixed 320px SVG with a capped legend.

Result: **0.388 → 0.154.**

A first attempt at (3) made things *worse* (0.556). `show()` fails open, so before
the device list lands it reports every tile: the skeleton painted all eleven
(1158px) and then shrank. The skeleton now waits for `sensors.resolved` — a flag
added to `useDeviceSensors` for exactly this — so it only paints once the tile
count is known.

### What remains, and how to close it

One shift is left: the station block going from its spinner to its full height
when the reading and the sensor list arrive. The tile count depends on fetched
data, so **no reserved height can be correct at first paint** — reserving the
full grid overshoots a wind-only station by the same margin in the other
direction.

**To fix it:** prefetch the devices list in the `/` server component and hydrate
it into the query cache (`dehydrate` + `HydrationBoundary`), so `sensors.resolved`
is already true on first render and the skeleton paints at the final size. That
is a new data-loading pattern for this codebase, which is why it was not
introduced in the final month. Once it lands, flip the `/` CLS assertion back to
`error`.

## Accessibility

All nine routes score **1.00** with zero failing audits. Three real violations
were found and fixed in M24 W2, all invisible to the existing e2e axe gates
because no gate covered the shell or `/org`:

- **`label-content-name-mismatch`** (WCAG 2.5.3, all 8 authenticated routes) — the
  command-palette trigger's visible text was `Search ⌘K` while its accessible name
  was "Search devices, sessions and records", and the user-menu button showed the
  avatar's initials while being named "User menu". `aria-hidden` is **not** a fix
  here: the rule protects speech-input users, who say what they can see, so it
  counts visually rendered text regardless. The `⌘K` moved outside the button, and
  the user menu's name now leads with the initials.
- **`color-contrast`** (6 routes) — the customer accent's derived
  `--primary-strong` measured 2.77:1 in dark mode. `strongStepFor` only ever
  *darkened*, which is right on white and moves text towards its own background on
  a dark surface; and it derived against the page surface (`#0b0f17`) when the
  tinted nav item actually sits on the **card** (`#222220`). Both fixed, with the
  step now derived per surface and emitted for all three theme selectors —
  including the `prefers-color-scheme` block, which had been missing, so
  system-dark viewers were getting the light-surface value.
- **`button-name` + `label`** (both critical, `/org` audit tab) — four filter
  controls had adjacent `<label>` elements with no `htmlFor`, so a screen reader
  announced four unnamed fields.

`e2e/auth-journey.spec.ts` now gates the sign-in page and the authenticated shell,
which is where the first two lived.

## Running it locally

```bash
# needs a seeded backend and admin-web on :3001
BACKEND_URL=http://localhost:3100/v1 yarn lighthouse:auth   # enforces the budget
yarn lighthouse                                             # anonymous (only /login renders)
```

Reports land in `.lighthouseci/` (gitignored) and upload as a CI artifact.

Note for the e2e job: start the backend with `NODE_ENV=test`, or the login rate
limit added in M24 W1 fails every journey after the tenth. See
`backend/SECURITY.md`.
