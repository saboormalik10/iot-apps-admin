# Weather Station Portal — User Guide

For everyone who uses the portal. Open it in any browser on the site network at the
address your administrator gives you, for example `http://station-pc:3201`.

---

## 1. Signing in

Enter your email and password and select **Sign in**.

- **Forgot your password?** Ask an administrator of the site. They set a temporary
  password for you (Users → Reset password), and you choose your own the next time
  you sign in.
- **"Choose your own password"** appears when an administrator has just set your
  password. Enter the one they gave you, then your new one twice.
- **"Waiting for an administrator to approve it"** — you asked for an account and it
  has not been approved yet.
- **Too many attempts** — sign-in allows 10 tries a minute from each PC. Wait a
  minute.
- **Create an account** appears only if the site allows people to ask for one.
  An administrator must approve it before you can sign in.

You are signed out after 30 minutes without activity. A dashboard left open on a
screen keeps itself signed in, because it refreshes every minute.

---

## 2. Getting around

**The menu (left)** lists what your role allows — see [Who can do what](#12-who-can-do-what).

**The top bar**

| | |
|---|---|
| **Search** (Ctrl+K) | Jump to a screen, station or record by typing |
| **Clock** | The station's local time, with UTC beneath |
| **Live** | Green while live updates are arriving |
| **Metric / units** | The units readings are shown in |
| **Sun / moon** | Light or dark theme |
| **Bell** | Unread notifications |
| **Your initials** | Profile, and **Sign out** |

**The period** — under the top bar on the Dashboard and Records — sets how far back
those screens look. If a screen looks empty, widen it. (With one station, which is what
this PC has, there is nothing to choose between, so no station picker is shown.)

---

## 3. Dashboard

What the station is doing now.

- **Live station panel.** The **wind dial** moves **every second** with the sensor
  ("Live · every second"). If the sensor stops, it falls back to the last one-minute
  average and says so. Everything else — the speed, humidity and pressure gauges,
  temperature, dew point — updates **once a minute**, with the one-minute average.
- **Relative to mast · uncalibrated** under the dial means the mast's heading offset
  has not been entered, so directions are relative to the mast rather than true north
  (an administrator sets it on the station).
- **Rain**
  - **Rain today** — since the start of the rain day (midnight, or 09:00 if the station
    uses the Bureau of Meteorology rain day — shown on the tile).
  - **Rain last hour** — the last 60 minutes.
  - **Rain rate** — mm per hour over the last 10 minutes.
- **Graphs** — the same readings over the chosen range. The rain line shows rain
  accumulated since the start of the range.
- **Wind rose** — which directions the wind came from, and how strongly. **True /
  Relative** and **10 min / 2 min** averaging. The table icon shows the numbers; the
  download icon saves them.

---

## 4. Query — tables and CSV

The place to get the data out.

1. **Period** — From and To are in the **station's** time, whatever PC you are on.
   Or use *Last 24 hours / 7 days / 30 days*.
2. **One row for** — every minute (as stored), every hour, or every day. Hours and days
   are built from the minutes: averages, the wind direction as a proper vector average
   (350° and 10° average to north), the highest gust, and rain as a total. A day starts
   at the station's rain-day hour.
3. **Columns** — tick what you want. The 2- and 10-minute wind means make sense only
   for one-minute rows, so they are greyed out otherwise.
4. **Show** fills the table, a page at a time.
5. **Download CSV** saves the whole query — every page — with two time columns (station
   time and UTC) and units in the headers.

---

## 5. Records

A **record** is the station's data for one day. Open one for a chart of up to five
readings, the minute-by-minute table, and **Export**. In the table, **QC** marks a
reading that failed a quality check (hover for why); an asterisk on a 10-minute value
means fewer than 10 minutes went into it.

## 6. MET Analytics

Longer-range analysis for the station and range chosen at the top: wind rose, pressure
tendency (rising, falling, steady), statistics for any reading (mean, median, spread,
the value 90% and 95% of readings stayed under), time at each Beaufort force, the WMO
10-minute mean wind, peak gusts, comfort (heat index / wind chill), fog risk, and a
daily summary.

## 7. Alerts and notifications

An **alert rule** watches one reading and notifies when it crosses a threshold — for
example wind above 15 m/s. Rules can be paused. When one fires it appears under the
**bell** and in **Notifications**, in the portal — that is where alerts live, since
the station PC has no internet and sends no email.

## 8. Stations

The station, whether it is reporting, and when it was last heard from. Administrators
can edit it: its name, the **mast heading offset** (so directions are true north), and
**Rain day starts at** — 00:00, or 09:00 for the Bureau of Meteorology rain day.

## 9. System

Is everything working? Shown to everyone:

- **Sensor stream** — connected or not, the last reading, readings in the last minute
  (about 60 when healthy), and readings rejected for a bad checksum or an impossible
  rain value.
- **Backup** — when the last nightly backup ran, and whether it worked.
- **Disk** — free space. Readings are never deleted, so the disk is the limit.
- **This PC** — its clock, and the newest stored reading. Readings are time-stamped by
  this PC's clock.

Anything wrong is listed at the top. Tell whoever looks after the station PC.

## 10. People and roles *(administrators)*

**Users** lists everyone who can sign in.

- **Add person** — email, a password (the wand suggests one), and a role. They can sign
  in straight away; pass the password on yourself.
- **⋯ menu** on a person: change their role, **Reset password**, deactivate (blocks
  sign-in at once, keeps their history), or remove.
- **Awaiting approval** — someone asked for an account. **Approve** or **Reject** from
  the ⋯ menu. Approved accounts start as Viewers.
- Your own row has no menu: change your own details under **Settings → Profile**.

**Roles** — the built-in Viewer, Operator and Admin, and any you create with exactly the
permissions you choose. **Audit log** — every change made, by whom and when, including
sign-ins, password resets and approvals.

## 11. Settings

- **Profile** — your name and password.
- **Site** *(administrators)* — the site's name, contact and **time zone**. The time zone
  decides where each day starts; set it once, correctly.
- **Branding** *(administrators)* — the name, logo and accent colour shown in the portal.
- **Display units** *(administrators)* — wind (m/s, km/h, knots, mph, Beaufort), pressure,
  temperature. This changes only how readings are shown, for everyone.
- **Accessibility** — patterns on chart colours, for colour-blind readers and printing.

---

## 12. Who can do what

| | Viewer | Operator | Admin |
|---|:---:|:---:|:---:|
| Dashboard, Query, Records, Analytics | ✓ | ✓ | ✓ |
| Download CSV and exports | ✓ | ✓ | ✓ |
| System (the PC's own health) | — | ✓ | ✓ |
| Create and edit alert rules | — | ✓ | ✓ |
| Edit the station | — | — | ✓ |
| Users, roles, audit log | — | — | ✓ |
| Site settings, branding, units | — | — | ✓ |

## Common questions

**How far back does the data go?** To the day the station was installed. Nothing is
ever deleted.

**The wind dial says "1-minute average" instead of "Live".** No reading has arrived for
5 seconds. Check **System** (an administrator or operator can).

**Times look an hour out.** Times are the station's, not your PC's. If they are wrong,
the site's time zone (Settings → Site) or the station PC's clock needs checking.
