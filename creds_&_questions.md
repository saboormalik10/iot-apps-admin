# Weather Station — SFTP Details & Questions for Dana

**Updated:** 2026-08-17

---

## SFTP connection details

The server is ready. The weather station can start uploading with these:

```
Host:       3.104.89.123
Port:       22
Protocol:   SFTP
Username:   wxstation
Password:   (sent separately)
Directory:  /upload
```

The account can only write into `/upload`. It has no shell access and cannot see anything
else on the server.

> **Note for Dana:** the server is showing *"System restart required"*. Worth rebooting when
> convenient — it is your instance, so we have not done it.

---

## Questions

### 1. How does the station name its files?

Does it create a **new file** each time (for example `station_20260803_1400.csv`), or does it
keep **overwriting the same file**, or **add to the end** of one growing file?

*Why we ask:* this changes how we detect new readings. If we get it wrong we either import the
same data twice or miss readings. **This is the most important one.**

### 2. How will we know which station sent a file?

With one station it is obvious. With ten it is not. Is the station identified by:

- the **file name**, or
- a **serial number inside the file**, or
- would you prefer **a separate login per station**?

*Why we ask:* this is how each customer's data gets routed to their own dashboard. Much easier
to set up now than to change once units are in the field.

### 3. How often does the station upload?

You mentioned logging every 15 minutes (and 1 second for wind speed on wind alarms). We would
also like to know how often it **sends** — every reading, every 15 minutes, hourly, or once a
day?

### 4. Are the times in the file UTC or local time?

If local, does the file record the time zone anywhere?

*Why we ask:* we store everything in UTC. Without knowing this, readings could be shown hours
out.

### 5. Does the station delete the file after uploading it?

Or does it leave it in place on the station?

### 6. Does the station have a fixed public IP address?

If it does, we can lock the SFTP login to that address only. That is the single biggest
security improvement we can make here.

### 7. Will the other systems send data the same way?

Wind alarms, water quality and air quality — same SFTP route, and is the file format similar
or different for each?

*Why we ask:* if the formats differ we would rather design for that now than rebuild later.

---

## Already answered — no need to repeat

| | |
| --- | --- |
| Protocol | SFTP |
| Logging rate | 1 second for wind speed on wind alarms, 15 minutes for everything else |
| Stations, year 1 | Around 10 |
| Data retention | 30 days |
| Server | Provided on your AWS Lightsail instance, Sydney |

---

## What happens next

Once the station starts sending, the first file answers questions 1, 3, 4 and the file format
on its own. **Questions 2 and 6 are the ones we would like answered directly.**
