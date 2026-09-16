# Hosting Capacity & Running Cost

**Date:** 16 September 2026
**Subject:** Storage at 2-year retention, processing capacity, and concurrent ingestion

---

## 1. Storage at 2-year retention — all tables

Measured against the live system rather than estimated. A stored reading is
808 bytes including indexes, and the system writes one record per station per
minute.

| Table | Per doc | Docs/day per station | Kept | 2 years, per station |
|---|---|---|---|---|
| Readings (1/min) | 808 B | 1,440 | 730 d | **810 MB** |
| Day records | — | 1 | 730 d | 18 MB |
| Ingest ledger (de-duplication) | 566 B | 2,880 | 23 d | 36 MB |
| Daily rollups (permanent) | 5.6 KB | 1 | forever | 4 MB |
| Everything else (users, roles, settings) | — | — | — | 11 MB fixed |
| | | | **Total** | **867 MB per station** |

### What that costs

| Stations | 2 years, all tables | Database cost / month |
|---|---|---|
| 10 | 8.5 GB | US$57 — within the included 10 GB |
| 20 | 17.0 GB | ~US$58 |
| 50 | 42.4 GB | ~US$60 |
| 100 | 84.7 GB | ~US$64 |

Additional storage is approximately US$0.10/GB/month. Even 100 stations holding
two years of full 1-minute history adds only about US$7/month.

**Total running cost remains in the US$104–111/month range.**

### Two points worth knowing

**Not every table needs a two-year life.** The ingest ledger records every file
received so that the same file can never be counted twice. It grows *twice as
fast* as the readings themselves — 2,880 files a day per station against 1,440
records — but it only needs to outlive a retry, so we keep it for 23 days. Held
for two years it would roughly double total storage for no benefit.

**Daily summaries are kept permanently**, at roughly 2 MB per station per year.
Long-term trends and reports therefore survive whatever detailed retention is
chosen. If full minute-by-minute detail is only needed for recent months, the
detailed window can be shortened without losing any historical reporting.

---

## 2. Processing capacity and scaling

The quoted configuration is a 2 vCPU / 4 GB application server with a managed
database.

Actual load is lighter than the station count suggests. Because readings are
aggregated to one record per minute, **each station writes to the database once
per minute**. One hundred stations is under two writes per second, comfortably
inside this tier.

This improved substantially in September 2026. Readings were previously stored
once per second — about 86,400 writes per station per day. The current design is
roughly **60× lighter**, which is why a modest tier now goes a long way.

### Scaling path

- **Application server** — stateless, so it scales horizontally behind a load
  balancer as traffic grows.
- **Database** — scales by tier: M10 (current) → M20 ≈ US$190 → M30 ≈ US$388,
  the last with dedicated CPU.

Only the constrained component needs to move. In practice the trigger is
concurrent users and query load, not the volume of history retained.

---

## 3. Concurrent ingestion from many stations

**Yes — the current architecture already supports many stations ingesting at the
same time.** This is enforced by design rather than assumed:

- **Independent agents.** Each station runs its own ingest agent, so one station
  stalling cannot hold up any other.
- **Every file is fingerprinted** (SHA-256). The same file can never be ingested
  twice, even if the agent retries after a dropped connection.
- **Records are protected by a unique key.** If two files covering the same
  minute arrive simultaneously, they *merge* into a single record rather than
  creating duplicates.
- **A single bad row cannot abort its batch.** The remaining readings still land.
- **Nothing is ever deleted from the SFTP server.** Anything rejected is
  quarantined and can be replayed later.

A burst of simultaneous uploads is normal operation, not a risk.

---

## Summary

- Two-year retention costs approximately **US$7/month extra at 100 stations**.
- Storage is not the cost driver. Concurrent traffic and query load are what
  eventually require a larger tier.
- Concurrent ingestion from many stations is already supported, with
  de-duplication and no-data-loss guarantees built in.

---

*Figures measured against the live deployment on 16 September 2026. Reproduce
with `yarn capacity-report` in the backend.*
