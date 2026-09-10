# NEW PRODUCT — Local (on-premise) weather station software

> **This is NOT the cloud web portal currently under development.**
>
> It is a **second, separate product**: the same web application running on a
> Windows PC at the customer's site, reading a live TCP stream from the sensor
> instead of collecting CSV files over SFTP.
>
> Scope, timeline and commercials to be handled separately from the existing
> project.

- **Client:** Observator Instruments (Hassan)
- **Raised:** 10 September 2026, over WhatsApp
- **Status:** client has said **"Pls start the development now"**

---

## 1. What it is

A **local web app** — not a desktop application. The client was explicit:
*"I don't want exe"*, *"should be on web architecture"*.

MongoDB, the backend and the web portal all install on one Windows PC at the
site. Anyone on that network opens a browser at a local address and gets the
full portal. Nothing installed on their machine, no internet required.

The same model as a router's settings page: you type an address in a browser,
you do not install router software.

## 2. Architecture (client's own words, confirmed)

```
Sensor (GMX551 + rain gauge)
  → RS422
  → serial-to-Ethernet converter (PoE)
  → TCP/IP over the network
  → our server software listening on port 4000
  → process / log / visualise
```

**The PC never touches a COM port.** The converter does the RS422 conversion
before the data reaches the PC, so the PC only ever receives TCP/IP packets.
The client confirmed this twice: *"The data is not through com port"*,
*"Is tcpip packets"*.

Converter the client linked:
`https://www.amazon.com.au/RS232-485-422-POE-Bi-Directional/dp/B0F6LPPJ5H`

## 3. Confirmed requirements — LOCKED

| # | Requirement | Client's words |
| --- | --- | --- |
| 1 | **Web app, not a desktop app. No .exe.** | *"I don't want exe"* / *"Local desktop but should be on web architecture"* |
| 2 | **Windows** | *"Windows platform"* |
| 3 | **We LISTEN on the port** — the converter connects in to us | *"You should listen to that port"* |
| 4 | **Port 4000** (supersedes the earlier 400) — client will set it | *"I think is 4000 (I will set it)"* |
| 5 | **Port must be configurable in a file**, read on startup so a restart picks it up | *"U should make the port number configurable in a file"* / *"So that if the server is restarted, it can grab from a file"* |
| 6 | **Data arrives every 1 second** | *"The data is coming in at every 1s"* |
| 7 | **Store one row per minute in the database** | *"You just store the every 1 minute data in the db"* |
| 8 | **Parameters:** wind speed, direction, temperature, RH, barometer, rain | *"(wind speed, direction, temp, RH, barometer, rain)"* |
| 9 | **Sensor:** Gill GMX551 + rain gauge | *"The sensor is GMX551 + rain gauge"* |
| 10 | **CSV format over TCP** | *"streamed over tcp/ip (csv format)"* |
| 11 | **Web alerts required** | *"Please consider the web alert also"* |
| 12 | **No real data yet — we generate test data** | *"We domt have the data yet. You can ask ai to generate test data"* |
| 13 | **Design approved** | *"Looks like u have got the design right"* |
| 14 | **Start development now** | *"Pls start the development now"* |

## 4. Open questions

**Asked, awaiting answer:**

1. For the stored minute — **mean, or last reading?** Our recommendation sent:
   mean **plus maximum wind speed** so gusts are not lost, rainfall summed,
   direction vector-averaged.

**Not yet asked / not yet answered:**

2. Which output format is the GMX551 configured for? (Gill units support
   several; field names matter for parsing.)
3. Does the rain gauge feed into the GMX551, or arrive separately?
4. Fully standalone, or also sync to the cloud portal when a connection exists?
5. One weather station per PC, or more than one?
6. Who installs and updates the software on site?
7. Who is responsible for backups?

---

## 5. Full client message log (verbatim)

### 10:16 – 10:49 AM — the request

> At meanwhile, we need the web version of display and logging for AWS (wind
> speed, direction, temp, RH, barometer, rain). The data will be streamed over
> tcp/ip (csv format) to the computer.

> Please consider the web alert also

> The sensor is GMX551 + rain gauge.

> NOw, I want to use this same software but run it off from a PC for local access.

> Sensor -> streaming data over tcp/ip -> server software -> process/log/visualise

> Ok. We need to install everything in a small PC.

> Is MongoDB resource hungry?

> https://www.amazon.com.au/RS232-485-422-POE-Bi-Directional/dp/B0F6LPPJ5H
> The sensor will connect to this device. so is RS422 to TCP/IP

*(Note: "AWS" here means **Automatic Weather Station**, not Amazon Web Services.)*

### 2:16 – 2:17 PM — heading off two wrong assumptions

> Local desktop but should be on web architecture

> The data is not through com port

> I don't want exe

> Is tcpip packets

### 3:19 – 3:28 PM — decisions

> Looks like u have got the design right

> The port number we can fix it at 400

> We domt have the data yet. You can ask ai to generate test data

> U should make the port number configurable in a file

> So that if the server is restarted, it can grab from a file
> You just store the every 1 minute data in the db

> Pls start the development now

> Windows platform

### 3:46 – 3:47 PM — port and direction of connection

> The data is coming in at every 1s

> I think is 4000 (I will set it)

> You should listen to that port

---

## 6. Internal notes — NOT for the client

### What is reused vs new

| Area | Status |
| --- | --- |
| Dashboard, charts, wind rose, records, analytics | Reused unchanged |
| Alerts (rules, triggers, notifications) | Reused unchanged |
| Wind speed / direction, temperature, humidity, pressure | Already in the column spec |
| Rainfall | Already in the model as `precipMm` |
| Per-minute aggregation from many samples | **Pattern already built** for the Environmental parser |
| **TCP listener on port 4000** | **New** |
| **Windows service packaging / installer** | **New** |
| **Single-site mode** | **New** — see below |

### The stream reader is not a small change

Current parsers take a whole file that represents one complete minute, and the
file boundary is what says "this record is finished". A TCP stream has no such
boundary — lines arrive continuously and the reader must decide for itself
where a record ends, handle partial lines, and reconnect when the link drops.

### Wind direction CANNOT be averaged arithmetically

350° and 10° are both nearly north; their arithmetic mean is **180°, due
south** — exactly backwards. Direction must be **vector-averaged** (mean of the
unit vectors, then back to an angle).

The current cloud system avoids this by storing every second and never
averaging. The moment we aggregate to one minute, we own this problem. Getting
it wrong produces wind roses that look plausible and are wrong.

### Rain must be SUMMED, not averaged

Rainfall accumulates. An averaged rainfall figure is meaningless.

### Store the maximum wind speed, not just the mean

The gust exists only in the per-second data. Once the other 59 readings are
discarded it is gone permanently and cannot be recovered from history. Two
extra numbers per row is ~7% more storage — nothing — and it removes the risk
of a rebuild if gusts are requested later. Mean + gust is also standard
meteorological practice, which matters for a client who sells instruments.

### Everything must survive a reboot

The PC will be switched off and on with nobody logged in. MongoDB, the backend
and the stream reader all have to start automatically — on Windows that means
installing them as **services**. Plan for it now, not at handover.

### Backups

Atlas backs up automatically; a local PC does not. If that drive fails the data
is gone. A scheduled `mongodump` to a second drive or network folder covers it.
Worth raising as a small ongoing-support item.

### Multi-tenancy does not apply here

Customer switching, SFTP accounts, station provisioning and the platform admin
screen all assume many customers on one internet server. A single PC watching
one station needs none of them. Decide whether they are hidden or stripped.

### Build the parser against the column-spec registry

There is no real data yet, so the live format **will** differ from our test data
in some detail. Using the registry makes adapting one entry rather than a
rewrite — the same thing that made the Environmental format cheap to add.

**Schedule risk:** the first real sensor connection is where surprises land, and
the timing of it is outside our control.

### Storage at the agreed rate

Measured on the live cloud database, 10 September 2026: ~619 bytes billed per
row (data + indexes).

| Logging rate | Per day | Per year |
| --- | --- | --- |
| 1 per second | ~54 MB | ~20 GB |
| **1 per minute (agreed)** | **~0.9 MB** | **~0.3 GB** |

At the agreed one-per-minute rate storage is a non-issue on a local disk. The
512 MB pressure on the cloud system is the **Atlas free-tier ceiling** — a
pricing limit, not MongoDB being heavy.

> Do **not** quote "1 MB per day" as a description of the *current cloud system*.
> That is the per-minute figure; the cloud system logs per second at ~54 MB/day.
