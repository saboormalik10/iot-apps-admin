# Graph-data contract

Every chart on the admin panel gets its data **pre-aggregated from the API**. The
browser must never pull raw per-sample rows and bucket/aggregate them itself — that
was the cause of slow dashboard loads (large payloads + tens of thousands of plotted
points). This contract keeps graphs fast and consistent.

## Rules

A graph endpoint MUST:

1. **Aggregate server-side.** Bucketing, min/avg/max, histograms, sector counts,
   correlations — all computed in the API (MongoDB `$group`/`$facet` or in the
   service), never in the React component.
2. **Return display-sized data.** Cap each series to **≤ ~500 points**. A line chart
   has fewer pixels than that across its width, so more points only cost payload and
   render time without adding visible detail.
3. **Downsample peak-preserving.** When a series must be reduced, use
   `downsampleEnvelope` (min-of-mins / max-of-maxes / count-weighted avg) from
   `backend/src/utils/cache.util.ts` — **not** naive decimation, which silently drops
   spikes. Plain `downsample` (even-spaced) is only acceptable for scatter/map points
   where a dropped point is not a lost extreme.
4. **Scale bucket size to the window.** Pick the bucket from the *data span* so the
   point count stays bounded whatever range the user selects (see `pickBucketMs` /
   `metBucketMs` in `backend/src/dashboard/dashboard.service.ts`). Never bucket at a
   fixed fine resolution and then throw most of it away.

A chart component MUST NOT:

- fetch a raw-sample list and `for`-loop it into buckets/matrices, or
- request more points than it can display.

The `WindRose` primitive keeps a `samples` prop for the analytics/legacy path, but new
dashboard usage passes a pre-computed `matrix` (see `wind-rose-panel.tsx`).

## Audit (current state)

| Graph | Endpoint | Aggregation | Cap |
|---|---|---|---|
| MET sensor stack (8 charts) | `GET /dashboard/met/history-multi` | `$facet` per sensor, adaptive bucket | ≤500 pts/sensor, one request |
| MET single-sensor history | `GET /dashboard/met/history` | `$group`, adaptive bucket | ≤500 pts (`downsampleEnvelope`) |
| Wind rose (dashboard) | `GET /dashboard/met/windrose` | server-binned 16×band matrices (true/rel × 10m/2m) | matrix, no raw samples |
| KPI sparklines | `GET /dashboard/summary` | `$group` 14-day daily counts | 14 pts |
| NEP session trend | `GET /dashboard/nep/trend` | server, `downsample` | ≤500 pts |
| NEP map | `GET /dashboard/nep/map` | server, `downsample` | ≤300 pts |
| Analytics MET/NEP charts | `GET /analytics/*` | interval-bucketed / histogram / stats in service | bounded per endpoint |

## Adding a new graph

1. Aggregate in the service; return `{ …, data: [...] }` already bucketed and capped.
2. Add the typed endpoint to `lib/api/endpoints.ts` and a key to `lib/query/keys.ts`.
3. Feed the result straight into a primitive under `components/charts/` — no client-side
   aggregation.
