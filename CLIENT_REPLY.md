# Client Reply — Dashboard Scope & Weather Station Data

**To:** Dana Galbraith
**Re:** Clarification — dashboard scope and weather station data
**Date:** 2026-08-03
**Status:** Draft — review before sending

---

## The email

**Subject:** Re: Clarification — dashboard scope and weather station data

Hi Dana,

Thank you, that's clear and it's a helpful correction.

To confirm we're aligned:

- **NEP-LINK Classic, NEP-LINK BLE and MET-LINK** are standalone apps. We will not be routing their Bluetooth data into the data server. Their scope is maintenance only — keeping them compliant with current Android and iOS requirements.
- **The data server and dashboard** are for your integrated systems: water quality, weather stations, wind alarms and air quality monitors.
- We'll continue using app data purely as test input while we build, and nothing more.

The good news is that this doesn't set the dashboard back. The platform was built around weather and water-quality measurements rather than around the apps, so what already exists carries over directly:

- Storage and charting for wind speed and direction, temperature, humidity, pressure, solar radiation, precipitation and dew point
- Wind rose, wind gust history, comfort indices, fog risk, pressure tendency, and daily summaries
- Threshold-based alerting on any sensor, which should suit the wind alarm products
- Multi-organisation accounts with user roles — this is what makes the subscription model work, since each customer sees only their own systems
- Public share links so your customers can show a reading to a third party without giving them an account

What changes is how data gets in. Today it arrives over an HTTP API; your weather station will send it by FTP. That's a new ingestion component rather than a rebuild — we receive the files, parse the stream, and write it into the same storage the dashboard already reads.

To design that properly, could you send us:

1. **A sample data file** from the weather station — even one hour of output. Format and field layout are the main unknowns, and a real sample answers most of our questions at once.
2. **Push or pull** — will the station upload to an FTP location we provide, or should our system log in to yours and collect?
3. **How often** the data is sent — per reading, per minute, or batched hourly/daily?
4. Whether we should design the ingestion for **the weather station only for now**, or expect the water quality, wind alarm and air quality systems to follow. If their formats differ, we'd rather build it flexible from the start than retrofit later.
5. Any timing you have in mind for the **local PC version** — an offline install is a different deployment to the cloud one, so it's useful to know whether that's near-term or later.

The sample file is the main blocker. Once we have it we can give you a firm plan for getting the station's data on screen.

Best regards,
Hassan

