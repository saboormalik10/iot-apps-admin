# AWS Hosting Cost

**Standalone weather monitoring system — hosted by Veldora Studio**

Sydney region (`ap-southeast-2`) · approximate monthly · excluding GST

---

## Monthly cost

| | Self-hosted database | Managed database |
|---|---|---|
| Application server (EC2, 4 GB) | US$25 | US$25 |
| Database | included on same server | **US$57** |
| SFTP ingest server | US$12 | US$12 |
| Storage, backups, data transfer | US$20 | US$10 |
| **Total** | **≈ US$57 / month** | **≈ US$104 / month** |

### The database line

| Tier | Storage | Cost | Includes |
|---|---|---|---|
| **MongoDB Atlas M10** | 10 GB | ~US$57 / month | Dedicated instance, automated backups, point-in-time restore, monitoring |

The difference between the two columns is what a managed database buys: automated
backups, monitoring and failover. For a safety-critical system we recommend the
managed option. For a single weather station, self-hosted is sufficient.

---

## Storage — the main variable

Measured on the live station:

| Sampling rate | Data per station | Notes |
|---|---|---|
| 1 second | ~1 GB / month | M10's 10 GB covers several months of retention |
| 1 minute | ~15 MB / month | Sixty times less — M10 would last years |

The sampling rate affects the bill more than the server size does. Retention
length should be agreed before go-live, as it is the single largest cost driver.

---

## Notes

- Infrastructure costs only — excludes development, support and GST.
- The **SFTP ingest server** applies only if the station delivers data as files.
  If it streams live over TCP instead, this line is removed and the application
  server receives the stream directly.
- A **standalone station installed on a local PC**, not accessible from outside,
  requires no AWS hosting at all — the application and database both run on that
  PC. Monthly cloud cost is **US$0**.
- The free MongoDB tier (512 MB) is not viable in production. It is sufficient
  for roughly two weeks of one station at 1-second sampling, after which writes
  are blocked.
