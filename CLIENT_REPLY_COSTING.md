# Client Reply — Hosting & Database Costing

**To:** Dana Galbraith
**Re:** Costs for the weather and water level system quote
**Date:** 2026-08-19

---

**Subject:** Re: Dashboard and data server costs

Hi Dana,

Here are the numbers, and how the platform is put together, so you can quote with
confidence.

## One codebase, one database, many customers

We will build the platform to serve multiple customers from a single system. Each
customer will have their own account and will only ever see their own stations and
data. Once that is in place, taking on a further customer becomes a configuration
step rather than a new build.

Each customer's dashboard will carry their own logo, company details and colours, and
can have its own web address if wanted — for example `customername.observator.app`.
The software underneath stays identical for everyone. That matters to you
commercially: an improvement or fix we make is delivered to every customer at once,
rather than being paid for and applied ten times over.

## What this customer's data actually amounts to

We now have real measurements to work from. At one reading per second:

- 86,400 readings per day per station
- About 2.6 million readings per month per station
- Roughly 200 MB of stored data per station, held on a rolling 30-day basis

That figure is steady, not growing, because data older than 30 days is removed
automatically.

Ten stations across all your customers comes to about 2 GB. That fits comfortably in
a single database.

## Database cost

| | Monthly |
| --- | --- |
| Shared database, all customers | approx. US$60–70 total |
| Share per customer, at 10 customers | approx. US$6–7 |
| Dedicated database per customer | approx. US$60–70 each |

This is the important line. A dedicated database for one customer costs roughly ten
times its share of a shared one, and gives them nothing extra — each customer's data
will be private to their account either way. We'd only recommend it where a customer
contractually requires their data physically separated, which is worth offering as a
premium option precisely because you can charge for it.

### Which database tier we recommend

We'd use **MongoDB Atlas M10, hosted in Sydney** — the same region as your existing
AWS instance, so the data doesn't travel between regions.

That tier gives a three-server cluster with automatic failover, automated daily
backups and point-to-point recovery, and 10 GB of storage. At the volumes above that
leaves room for around 40 to 50 stations before any upgrade is needed, so it will
carry you well past the first year.

There are cheaper options. We don't recommend them for customers who are paying for
the service: the free tier has no backups and shuts down when idle, and the entry
paid tier has throughput limits and no guaranteed recovery. The step up to M10 is
what buys you the backups, and that matters the moment a customer's data has
commercial value.

If volumes grow beyond roughly 50 stations the next tier up is a straightforward
change with no downtime.

## Data ingestion server (AWS Lightsail)

This is the server your stations upload to — the one already running in Sydney.
It receives the files, and will run the component that reads them into the database.

One instance serves every station and every customer. You do not need one per
customer.

The workload is very light. Each station produces about 6 MB of files per day, so
even ten stations generate under 2 GB a month, and the files can be cleared once
they've been read into the database. The processing itself is a small job running
once a minute.

| | Monthly |
| --- | --- |
| Lightsail instance, all customers | approx. US$10–20 total |
| Share per customer, at 10 customers | approx. US$1–2 |

A smaller instance would cope with the current load, but we'd suggest keeping some
headroom for the wind alarm, water quality and air quality systems when they follow.

There is also the option of running the application on this same instance rather than
a separate one, which would remove the application hosting line below. We'd keep them
apart initially — the upload server is reachable from the internet for your stations,
and it's cleaner to keep the customer-facing dashboard on its own machine — but it is
a genuine saving if you'd prefer it.

## Application hosting — our recommendation

We'd recommend AWS, for three reasons:

The weather station data already arrives on your AWS instance in Sydney. Keeping the
application on AWS in the same region means no transfer charges between providers and
lower latency to your stations.

Namecheap's standard web hosting cannot run this system at all — it's built for
conventional websites, and our platform needs a live application server, a real-time
connection to browsers and a database. That's not a price difference, it's a
capability one.

Namecheap's VPS product could technically run it, at roughly US$7–20 per month against
US$10–20 for the equivalent AWS instance. The saving is marginal and it's unmanaged —
no automatic backups, no snapshots, and patching and uptime become our responsibility
rather than the provider's. For a system your customers pay for, we don't think that
trade is worth it.

## Total running cost

For the shared platform serving all customers:

| | Monthly |
| --- | --- |
| Data ingestion server (Lightsail, Sydney) | approx. US$10–20 |
| Application hosting (AWS, Sydney) | approx. US$10–20 |
| Database (Atlas M10, Sydney) | approx. US$60–70 |
| **Total** | **approx. US$80–110** |

And the same figures expressed per customer, assuming ten customers:

| | Monthly per customer |
| --- | --- |
| Data ingestion server | approx. US$1–2 |
| Application hosting | approx. US$1–2 |
| Database | approx. US$6–7 |
| **Total per customer** | **approx. US$8–11** |

That is infrastructure only, before support and your own margin. It also falls as you
add customers, since the same three components serve all of them.

## What I still need for firm figures

- How many stations for this customer, and is water level also once per second or
  less frequent?
- Do they need data kept longer than 30 days? Retention is the single biggest driver
  of the database cost
- Shared account or dedicated — I'd suggest shared unless they've asked otherwise

These figures are current list prices and I'll confirm them exactly once you tell me
the station count.

Best regards,
Hassan
