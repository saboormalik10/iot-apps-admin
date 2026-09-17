# Live Camera View — What We Need

**Project:** AB2C portal
**Date:** 17 September 2026

---

## What it does

A camera at the weather station. People open the portal, click a button, and watch
live video of the site — next to the weather readings.

- Live view only. **Nothing is recorded or stored.**
- The video only runs while someone is watching.

---

## How it works

```
Camera at station  →  4G router  →  Video server  →  Portal (browser)
```

The camera speaks a language browsers can't play. The video server translates it so
the portal can show it.

---

## What we need

### 1. Camera settings

Your TP-Link VIGI C540 works. Two settings:

- **Video format: H.264** — browsers can play it directly, so the server doesn't have
  to convert the video. This keeps the server small and cheap.
- **Use the sub-stream** — a lighter version of the video. Plenty for a live view,
  and uses far less 4G data.

### 2. A secure connection from the station

4G connections don't have a fixed public address, so the station connects **out** to
our server over a secure VPN. The camera is never exposed to the internet.

### 3. One extra server — the video server

| | |
|---|---|
| Server | AWS Lightsail, Sydney |
| Size | 2 CPU, 2 GB memory |
| Data included | 1.5 TB per month |
| Cost | **US$12 per month** |

We keep it **separate** from the server that receives weather data, so a lot of people
watching video can never slow down or interrupt the weather data coming in.

---

## Cost

```
Current hosting    US$104 / month
+ Video server      US$12 / month
                   ──────────────
New total          US$116 / month
```

**Still under your US$120 budget.**

The US$12 covers normal use. As a guide, 20 people each watching 2 hours a day stays
within the included data.

---

## Not included in hosting

- **4G data at the station** — this is the SIM plan, paid separately. The station
  sends one video stream no matter how many people are watching.

---

## Access

Only logged-in portal users can watch. Each viewing link is temporary and expires.
