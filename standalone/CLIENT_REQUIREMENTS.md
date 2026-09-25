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
- **Raised:** 10 September 2026, over WhatsApp; extended 21 September 2026;
  questions answered 22 September 2026
- **Status:** client has said **"Pls start the development now"**
- **How we build it:** see [`PLAN.md`](PLAN.md). The 10 Sep plan is kept for its
  reasoning in [`docs/history/PLAN-2026-09-10.md`](docs/history/PLAN-2026-09-10.md).

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

## 4. Questions

### Answered

| Question | Answer | When |
|---|---|---|
| Stored minute: mean or last reading? | **1-minute average.** We also store the WMO 3-second gust and 2/10-minute wind means, because the gust cannot be recovered once the per-second data is discarded | 21 Sep |
| Serial or network? | **TCP/IP** through a PoE serial converter; we **listen** on port **4000** | 10 Sep |
| Does the rain gauge feed the GMX551? | **Yes** — *"one string only as the GMX will combine the data from the rain gauge"* | 21 Sep |
| Fully standalone, or sync to the cloud? | **Standalone** — *"install on a standalone PC"* | 21 Sep |
| A real sample of the GMX551 output? | **Not available** — *"We don't have the sensor yet"*. We build from Gill's manual and our own simulator | 22 Sep |
| How does data reach the PC, and how often? | **TCP/IP, every second** (confirms 10 Sep) | 22 Sep |
| How long is data kept on the PC? | **Indefinitely** — *"cos this is their local pc"* | 22 Sep |
| How many stations? | **One per PC.** *"We have 2 confirmed projects. a) AB2C (to be setup as a cloud service for our clients) b) Standalone PC for the AWS (Gill GMX + Rain gauge)"* — the "multiple stations" of 16 Sep belongs to **AB2C, the cloud product**, not to this one | 23 Sep |
| Reachable from outside? | **No** — *"using local IP address. Not accessible by the outside world"* | 4 Sep |
| Windows or Linux? | **Windows** | 10 Sep |
| Which parameters to display? | **Everything the GMX + rain gauge send** | 21 Sep |
| Several people, from other PCs? | **Yes** — his own question: *"multiple users can access … by ip address (local)?"* | 14 Sep |
| Store 1-second data? | **No, by default** — a setting keeps it for a "special circumstance". Store 1-minute, plus the wind 2- and 10-minute averages | 14 Sep |
| Rain on the display? | **Hourly rain and the daily total**, the day's start configurable per station (default 00:00–23:59; BOM 9am–9am noted). Tipping bucket, **0.2 mm per tip**, digital — *"not likely to have analog inputs"* | 15 Sep |
| Clock? | **Current time and UTC** on the display | 15 Sep |
| Calculations? | **Follow WMO-No. 8** | 14 Sep |
| Will the PC have internet? | **No** — *"we can assume no internet for now as everything is to run in a local network"* | 23 Sep |
| Email alerts? | **Not needed** — *"just on screen alert. no need to have the ability to email"*. (The settings keep an optional LAN mail server; it stays off) | 23 Sep |
| Is a setup program (.exe) acceptable? | **Yes** — *"the installer can be an exe. However, for user to accept the application, it should be using a web browser"*. The product stays a web portal; only the installer is an exe | 23 Sep |
| Camera viewing (17 Sep)? | **No** — not part of the standalone PC | 23 Sep |
| Who supports and backs up on site? | **Later** — *"I don't see this standalone PC to have much support needed. Let's get it running first and we talk about support later."* Nightly backups are set up regardless | 23 Sep |
| A sample of the sensor's output? | **When the sensor arrives** — *"Yes, I will"* | 23 Sep |

### Conflicts found on review (22 Sep)

1. ~~**One station, or several at once?**~~ **Resolved 23 Sep:** they are two
   products. **AB2C** is the cloud service for their clients (several stations, the
   richer user management, the cameras); **this** is the standalone PC for one AWS
   (Gill GMX551 + rain gauge). The 16 Sep "multiple stations" and the 17 Sep camera
   request both belong to AB2C. One sensor connection is right here.
2. **Who connects to whom?** *"You should listen to that port"* (10 Sep), but the
   MOXA NPort he linked on 4 Sep *"will have an IP address and port number"* — which
   usually means the software connects to it. He also linked a different PoE
   converter on 10 Sep. **Mitigated:** the reader does both (`STREAM_MODE`).

### Still open (after the 23 Sep answers)

1. **Converter:** does it connect to our PC on port 4000, or do we connect to its IP
   and port? Which converter — the MOXA NPort or the PoE one? **Mitigated:** the
   reader does both (`STREAM_MODE=listen|connect`), so this decides a setting at
   install time, not the design.
2. **Users:** only an administrator adds people, or may they ask for an account and
   an administrator approves? **Mitigated:** both are built; asking for an account is
   **off** unless `STANDALONE_SELF_SIGNUP=true`. (The 23 Sep answer put "more complex
   user management" with AB2C, so simple is assumed here.)
3. **When a sensor arrives:** a few lines of its output including the header —
   confirms field order, framing, checksum, and whether `PRECIPT` is a running total.
   Client: *"Yes, I will"* (23 Sep).

Answered 23 Sep and closed: stations per PC, internet and email, the installer, the
camera, and who supports the PC (deferred by the client).

### Raised by building and testing it (25 September 2026)

None of these blocks the build — each has a working default, and each is a setting a
technician sets at install time. They are listed because the DEFAULT may not be what
the site wants, and two of them change the numbers on screen.

| # | Question | What we do if we hear nothing |
|---|---|---|
| 4 | **Where is the AWS, and what time zone?** It decides where a day starts, so it decides the daily rain total and every "today" figure | `Australia/Melbourne` |
| 5 | **Does the rain day start at midnight or 9am?** The Bureau's convention is 9am-to-9am, and the two give different daily totals for the same rain | Midnight |
| 6 | **Which wind unit should the portal show** — m/s, km/h, knots, mph or Beaufort? (Readings are stored in m/s either way; this is only the display) | m/s |
| 7 | **Does the GMX551 report a compass-corrected (magnetic) direction, and do you want TRUE north on screen?** If so we need the local magnetic declination, or the mast's alignment. Until it is set, the dial says "magnetic north — declination not set" | 0°, and the dial says so |
| 8 | **Where should the nightly backup be written?** On the PC's own disk it does not survive that disk failing; a second drive or a network share does | `C:\ObservatorData\backups`, keeping 14 |
| 9 | **What should the site and the station be called**, and which email is the first administrator? The installer asks for all three | "Weather Station" / "GMX551 Station" |
| 10 | **Is plain `http://` acceptable on the site network?** Most sites have no certificate authority; if this one does, we can serve the portal over HTTPS | Plain http |
| 11 | **Any alert rules to set up before handover** — a wind speed the site cares about, say? | None; the administrator adds them on screen |
| 12 | **Can we have a Windows PC (or a VM) for the first install?** The installer has never run on real Windows — everything else has been tested, that one step cannot be from here | We hand over the file and the guide |

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

### 21 September 2026, 7:44 AM — the standalone scope

> Just make the web version you have created and install on a standalone PC.

> And the parameters are what based on the GMX + rain gauge. The output is one
> string only as the GMX will combine the data from the rain gauge as one.

> Data will be streamed to you in real time

> You take them process to 1 min average. Log the 1 min average

> Send the output to the display. All parameters shold be updated o 1 minute
> basis except for the wind dial that should have real time update

> You have done most of the work Just need to fine tune them

> And give the user the flexibility to create their own user

> And a query screen allowing users to chose the paremeters they want and
> download as csv file. You can display the data also on screen in tabular format

### 4 September 2026 — how the standalone first came up

> I have another project. It is a standalone automatic weather station. It is
> effectively the same thing you are building for Dana. Only dfference, it is only 1
> station and to be installed on a local PC. You can use the portal that you build
> for Dana but to run on a single plc using local IP address. Not accessible by the
> outside world. Can you do it?

> *(a MOXA NPort 5150A serial device server)* this device will have an IP address and
> port number. Your program can listen to the port and receive the streaming data.

> For the local PC, data will be streamed directly to you in real time.

### 14–17 September 2026 — said while reviewing the cloud portal, applying here too

> Since it is on web architecture, multiple users can access the by ip address (local)?

> some sensors do not have the qc code

> In 99% cases, what we need to store is the 1-minute data. For wind, please also keep
> the 2-min and 10-min average in each record in the database. … We don't need to
> store the 1-s data … Put a flag on the configuration where in "special circumstance"
> the 1-s data can be stored some where (a file or inside the DB)

> Please check with your developers if they are following the guidelines/algorithms
> here on the respective calculations *(WMO-No. 8)*

> No current time on the display. Please put a current and UTC

> My suggestion on rain data: a) Hourly rain, b) Daily rain (total). -> make this
> configurable for each station (default to 00:00 to 23:59)

> Noted with your suggestion on the BOM 9 to 9 daily rain fall. … Rain fall can be
> tricky. For Gill, I think the data is by per pulse. 0.2mm per tip. I don't know how
> it is represented in Gill.

> For rain sensor, not likely to have analog inputs.

> *(16 Sep)* while you are building AB2C, please take into consideration that we can
> have multiple stations sending data at the same time. Your system mut be designed
> to support processing data concurrently without losing any data.

> *(17 Sep)* On our AB2C portal. If we have a camera on the station such as the above,
> can we provide a link in our portal that they can activate the camera and view it?
> … Just streaming without recording

### 22 September 2026 — answers to our questions

> *(Sample data string?)* We don't have the sensor yet so we can't give you the actual

> *(Serial or network, and how often?)* every second — network (TCP/IP)

> *(How long should data be kept on the PC?)* indefinitely cos this is their local pc

### 23 September 2026 — answers to the eight questions

> *(Is AB2C this standalone PC system — one station per PC, or several?)* We have 2
> confirmed projects.
> a) AB2C (to be setup as a cloud service for our clients)
> b) Standalone PC for the AWS (Gill GMX + Rain gauge).

> *(Will the PC have internet? Without it: on-screen alerts only, no email.)* For
> standalone, just on screen alert. no need to have the ability to email. we can
> assume no internet for now as everything is to run in a local netweork
>
> However, for AB2C, we do need more complex user management set up

> *(Is a normal setup program acceptable?)* For standalone PC, the installer can be
> an exe. However, for user to accept the application, it should be using a web browser

> *(Who installs, updates and backs up on site?)* I don't see this standalone PC to
> have much support needed. Let's get it running first and we talk about support later

> *(Does the camera viewing apply to the standalone PC?)* No

> *(A few lines of the sensor's output when it arrives?)* Yes, I will

**What the 23 Sep answers change:** the "several stations" and camera work belong to
**AB2C** (the cloud product), not here; this PC serves **one** AWS. No internet, so
**on-screen alerts only** (email stays optional and off). The installer may be an
**.exe**, while the product itself stays a web portal. Support and backup ownership
are deferred; nightly backups are set up anyway.

**What the 21 Sep messages add to the locked requirements:**

| # | Requirement |
|---|---|
| 15 | Display refreshes **every minute**, except the **wind dial, which is real time** |
| 16 | Users can **create their own users** |
| 17 | A **query screen**: choose parameters, view as a table, download as CSV |
| 18 | The GMX551 sends **one combined string** including the rain gauge |
| 19 | **Weather data is kept indefinitely** — nothing on the PC expires it (22 Sep) |
| 20 | **Hourly rain and daily rain totals**, the rain day's start configurable per station, default midnight (15 Sep) |
| 21 | **Current time and UTC** on the display (15 Sep) |
| 22 | **1-second data not stored** unless a setting says so (14 Sep) |

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
| **1 per minute (agreed)** | **~1.2 MB** | **~0.5 GB** |

*Revised 22 Sep: a minute record carries the gust and the 2- and 10-minute means, and
measures ~808 bytes, not the ~619 of a per-second row. Data is now kept indefinitely —
see `PLAN.md`, "Data retention".*

At the agreed one-per-minute rate storage is a non-issue on a local disk. The
512 MB pressure on the cloud system is the **Atlas free-tier ceiling** — a
pricing limit, not MongoDB being heavy.

> Do **not** quote "1 MB per day" as a description of the *current cloud system*.
> That is the per-minute figure; the cloud system logs per second at ~54 MB/day.
